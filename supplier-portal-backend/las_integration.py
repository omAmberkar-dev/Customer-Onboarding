"""The API Loans-Against-Securities (LAS) uses to review the applications customers submit on this portal.

A submitted application waits for the LAS maker, who checks it and submits it for approval (or returns it to the customer, or
rejects it); the LAS checker then approves it (or returns it to the customer or to the maker, or rejects it). Each action moves
vendor.status, so the customer's portal shows where the application stands:

    Pending   --maker submit-->   01   --checker approve-->   active
    Pending / 01   --return-->   returned  (with the reasons; the customer corrects and resubmits, back to Pending)
    01   --checker return to maker-->   Pending
    Pending / 01   --reject-->   Rejected

Called server to server: every request carries the shared key from LAS_INTEGRATION_KEY in the X-LAS-Key header.

    GET  /las/applications?queue=maker|checker|all      submitted portal applications (summaries)
    GET  /las/applications/<id>                          one application: every detail, demat included, its documents and its
                                                         history (each round's submission, the returns with their reasons, the
                                                         audit trail: application_history.las_history)
    GET  /las/applications/<id>/documents/content?blob_name=...   one document's file
    GET  /las/return-reasons                             the reasons a field can be returned for
    POST /las/applications/<id>/actions                  {"role", "action", "by", "remark", "items", "to"}

Every action writes an audit_log row in the same transaction as the status change (application_history.py), with the role as the
actor and the LAS user in after_value. A resubmitted application is the same vendor_id, back in the maker's queue with its round
raised; a checker's return to the maker keeps the round.
"""
import hmac
import os
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request
from mysql.connector import Error as MySQLError

import application_history
import auth
import demat
from db import get_connection

bp = Blueprint("las_integration", __name__, url_prefix="/las")
deps = {}

SOURCE = "self_service"
QUEUES = {"maker": ("pending",), "checker": ("01",)}
NEXT_STATUS = {  # (role, action) -> new vendor.status
    ("maker", "submit"): "01",
    ("checker", "approve"): "active",
    ("maker", "reject"): "Rejected",
    ("checker", "reject"): "Rejected",
}
# (role, action, to) -> the audit_log action recorded for it (application_history.py).
AUDIT_ACTIONS = {
    ("maker", "submit"): "approval_recorded",
    ("checker", "approve"): "approval_recorded",
    ("maker", "reject"): "rejected",
    ("checker", "reject"): "rejected",
    ("maker", "return"): "returned_for_correction",
    ("checker", "return"): "returned_for_correction",
}
DEMAT_LABELS = {"demat_id": "Demat ID", "dp_id": "DP ID", "bo_id": "BO ID", "depository": "Depository"}


def configure(**kwargs):
    """profile_fields() -> the vendor columns to return; documents(vendor_id) -> the documents list;
    document_response(vendor_id, blob_name) -> one document's response."""
    deps.update(kwargs)


@bp.before_request
def _require_key():
    expected = os.getenv("LAS_INTEGRATION_KEY", "")
    if not expected:
        return jsonify({"error": "The LAS integration is not set up: LAS_INTEGRATION_KEY is missing."}), 503
    if not hmac.compare_digest(request.headers.get("X-LAS-Key", ""), expected):
        return jsonify({"error": "Invalid or missing X-LAS-Key."}), 401
    return None


def _plain(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _query(sql, params=(), one=False):
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        return rows[0] if one and rows else (None if one else rows)
    finally:
        conn.close()


def _queue_of(status):
    return {auth.STAGE_MAKER_REVIEW: "maker", auth.STAGE_CHECKER_REVIEW: "checker"}.get(auth.stage_for(status))


def _summary(row):
    return {
        "id": row["vendor_id"],
        "legal_name": row["vendor_legal_name"],
        "email": row["email"],
        "pan": row["pan"],
        "gstin": row["gstin"],
        "status": row["status"],
        "stage": auth.stage_for(row["status"], row["submission_round"]),
        "queue": _queue_of(row["status"]),
        "submission_round": row["submission_round"],
        "submitted_at": _plain(row["submitted_at"]),
    }


def _application(vendor_id):
    return _query(
        f"SELECT {', '.join(deps['profile_fields']())} FROM vendor WHERE vendor_id = %s AND source = %s AND is_draft = 0",
        (vendor_id, SOURCE), one=True,
    )


@bp.get("/applications")
def list_applications():
    queue = (request.args.get("queue") or "maker").lower()
    if queue not in (*QUEUES, "all"):
        return jsonify({"error": "queue must be maker, checker or all"}), 400
    rows = _query(
        "SELECT vendor_id, vendor_legal_name, email, pan, gstin, status, submission_round, submitted_at FROM vendor "
        "WHERE source = %s AND is_draft = 0 AND LOWER(status) <> 'registered' ORDER BY submitted_at DESC, vendor_id DESC",
        (SOURCE,),
    )
    if queue != "all":
        rows = [row for row in rows if _queue_of(row["status"]) == queue]
    return jsonify([_summary(row) for row in rows]), 200


@bp.get("/applications/<int:vendor_id>")
def get_application(vendor_id):
    row = _application(vendor_id)
    if row is None:
        return jsonify({"error": "Application not found."}), 404
    try:
        documents = deps["documents"](vendor_id)
    except Exception:  # noqa: BLE001 - storage being unreachable must not hide the application itself
        documents = None
    details = {key: _plain(value) for key, value in row.items() if key not in ("password", "correction_fields")}
    try:
        history = application_history.las_history(vendor_id, row["submission_round"])
    except MySQLError as err:  # the application itself still shows; the history says why it is missing
        history = {"error": str(err)}
    return jsonify({**_summary(row), "details": details, "documents": documents, "history": history}), 200


@bp.get("/applications/<int:vendor_id>/documents/content")
def document_content(vendor_id):
    if _application(vendor_id) is None:
        return jsonify({"error": "Application not found."}), 404
    return deps["document_response"](vendor_id, (request.args.get("blob_name") or "").strip())


@bp.get("/return-reasons")
def return_reasons():
    rows = _query(
        "SELECT reason_code, section, field_key, field_label, reason_label FROM rejection_reason "
        "WHERE is_active = 1 ORDER BY sort_order, reason_id"
    )
    return jsonify(rows), 200


def _return_items(items):
    """The flagged items of a return as rows for vendor_rejection_item, or an error message.

    An item is {"reason_code": "<code from /las/return-reasons>", "remark"?} or, for a field the reason list does not cover
    (the demat fields), {"field_key": "<column>", "remark": "<what to correct>"}.
    """
    if not isinstance(items, list):
        return None, "items must be a list"
    reasons = {row["reason_code"]: row for row in _query("SELECT reason_code, field_key, field_label, reason_label FROM rejection_reason WHERE is_active = 1")}
    labels = {row["field_key"]: row["field_label"] for row in reasons.values() if row["field_key"]}
    labels.update(DEMAT_LABELS)
    rows = []
    for item in items:
        if not isinstance(item, dict):
            return None, "each item must be an object"
        remark = str(item.get("remark") or "").strip() or None
        if item.get("reason_code"):
            reason = reasons.get(item["reason_code"])
            if reason is None:
                return None, f"Unknown reason_code {item['reason_code']!r}"
            rows.append((reason["reason_code"], reason["field_key"], reason["field_label"], reason["reason_label"], remark))
        elif item.get("field_key") in labels:
            if not remark:
                return None, f"A remark is needed for {item['field_key']} (no reason_code given)"
            rows.append(("OTHER", item["field_key"], labels[item["field_key"]], "Needs correction", remark))
        else:
            return None, f"Unknown field_key {item.get('field_key')!r}"
    return rows, None


@bp.post("/applications/<int:vendor_id>/actions")
def act(vendor_id):
    """{"role": "maker" | "checker", "action": "submit" | "approve" | "return" | "reject", "by": "<LAS user>",
    "remark": "...", "items": [...] (return only), "to": "customer" | "maker" (checker return; default customer)}"""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be JSON"}), 400
    role, action = str(data.get("role") or "").lower(), str(data.get("action") or "").lower()
    by = str(data.get("by") or "").strip() or f"LAS {role}"
    remark = str(data.get("remark") or "").strip() or None
    to = str(data.get("to") or "customer").lower()
    allowed = {("maker", "submit"), ("maker", "return"), ("maker", "reject"), ("checker", "approve"), ("checker", "return"), ("checker", "reject")}
    if (role, action) not in allowed:
        return jsonify({"error": "Allowed: maker submit / return / reject, checker approve / return / reject"}), 400
    if action == "reject" and not remark:
        return jsonify({"error": "A remark is required to reject."}), 400

    row = _application(vendor_id)
    if row is None:
        return jsonify({"error": "Application not found."}), 404
    if _queue_of(row["status"]) != role:
        return jsonify({"error": f"The application is not with the {role} (status {row['status']}).", "status": row["status"]}), 409

    items = []
    if action == "return":
        if role == "checker" and to == "maker":
            new_status = "Pending"
        elif to == "customer":
            items, error = _return_items(data.get("items") or [])
            if error:
                return jsonify({"error": error}), 400
            if not items and not remark:
                return jsonify({"error": "Give a remark or at least one item to return the application."}), 400
            new_status = "returned"
        else:
            return jsonify({"error": "to must be customer (or maker, for the checker)"}), 400
    else:
        new_status = NEXT_STATUS[(role, action)]

    conn = get_connection()
    try:
        cursor = conn.cursor()
        # Only from the status it was read in, so two people acting at once cannot both move it.
        returned_at = ", returned_at = NOW()" if new_status == "returned" else ""
        cursor.execute(f"UPDATE vendor SET status = %s{returned_at} WHERE vendor_id = %s AND status = %s", (new_status, vendor_id, row["status"]))
        if cursor.rowcount != 1:
            conn.rollback()
            return jsonify({"error": "The application changed meanwhile; reload it."}), 409
        rejection_id = None
        if new_status == "returned":
            cursor.execute(
                "INSERT INTO vendor_rejection (vendor_id, round_no, rejected_by_role, rejected_by, overall_remark, rejected_at) "
                "VALUES (%s, %s, %s, %s, %s, NOW())",
                (vendor_id, row["submission_round"] or 1, role, by, remark),
            )
            rejection_id = cursor.lastrowid
            for reason_code, field_key, field_label, reason_label, item_remark in items:
                cursor.execute(
                    "INSERT INTO vendor_rejection_item (rejection_id, reason_code, field_key, field_label, reason_label, remark) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (rejection_id, reason_code, field_key, field_label, reason_label, item_remark),
                )
        audit_action = "returned_to_maker" if new_status == "Pending" else AUDIT_ACTIONS[(role, action)]
        application_history.audit(cursor, vendor_id, audit_action, role, {"status": row["status"]}, {
            "status": new_status, "round": row["submission_round"] or 1, "by": by, "remark": remark,
            **({"to": to} if action == "return" else {}),
            **({"rejection_id": rejection_id, "items": len(items)} if rejection_id else {}),
        })
        conn.commit()
    except MySQLError as err:
        conn.rollback()
        return jsonify({"error": str(err)}), 500
    finally:
        conn.close()
    return jsonify(_summary({**row, "status": new_status})), 200
