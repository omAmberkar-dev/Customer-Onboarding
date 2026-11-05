"""Home and Activity: what the portal itself holds about the signed-in customer, counted and worded for them.

    GET /vendors/me/home        invoice, agreement and change-request summary
    GET /vendors/me/activity    the customer's own recent events, newest first

Only the portal's own records are read here. Loans come from LAS through GET /vendors/me/loans (customer_journey.py), which
the page asks for separately so a slow SAP read never holds up the rest of Home.

Home reads each section on its own: a section whose query fails is null and named in `unavailable`, so the page can tell
"could not be loaded" from a real zero. Activity shows only the events a customer should see, in their words: never who on
the staff side acted, internal routing (maker, checker, authoriser, thresholds), SAP synchronisation or before/after values.
"""
import json
import logging
from datetime import date, datetime

from flask import Blueprint, g, jsonify, request
from mysql.connector import Error as MySQLError

import auth
import update_requests
from db import get_connection

log = logging.getLogger(__name__)

bp = Blueprint("customer_home", __name__)

# invoice_ids(cursor, vendor_id) -> the vendor's invoice ids, as GET /invoices lists them (set by app.configure).
deps = {}


def configure(**kwargs):
    deps.update(kwargs)


# invoices.status (as the review app writes it, compared case-insensitively) -> the group the customer sees.
INVOICE_GROUPS = {
    "pending": "in_review",
    "pending approval": "in_review",
    "pending authorization": "in_review",
    "sent for approval": "in_review",
    "approved": "approved",
    "returned to vendor": "returned",
    "rejected": "rejected",
}
INVOICE_GROUP_NAMES = ("in_review", "approved", "returned", "rejected", "other")

# The customer-facing events of audit_log, by entity type and action. Everything else (staff steps, SAP sync, holds)
# stays internal. Agreements and change requests are read from their own tables, so their audit rows are not used.
VENDOR_EVENTS = {
    "submitted": ("onboarding", "Application submitted"),
    "resubmitted": ("onboarding", "Corrected application resubmitted for review"),
    "approval_recorded": ("onboarding", "Application approved"),  # only the final approval (APPROVED_STATUSES); the steps are internal
    "documents_uploaded": ("onboarding", "Documents uploaded"),
    "returned": ("onboarding", "Application returned to you for correction"),
    "returned_for_correction": ("onboarding", "Application returned to you for correction"),
    "corrected": ("onboarding", "Corrected application submitted"),
    "rejected": ("onboarding", "Application not approved"),
    "sap_business_partner_created": ("onboarding", "Customer account set up"),
    "support_request_sent": ("support", "Support message sent"),
}
APPROVED_STATUSES = ("active", "approved", "02")
INVOICE_EVENTS = {
    "returned": "Invoice returned to you for correction",
    "rejected": "Invoice not approved",
    "replaced": "Corrected invoice submitted",
}
AGREEMENT_EVENTS = {
    "issued": "Agreement issued for your signature",
    "signed": "Agreement signed",
    "declined": "Agreement declined",
    "withdrawn": "Agreement withdrawn",
    "change_request_cancelled": "Change request on the agreement cancelled",
}
ACTIVITY_LIMIT_DEFAULT = 50
ACTIVITY_LIMIT_MAX = 200


def _iso(value):
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    return str(value) if value else None


def _json(value):
    if isinstance(value, (bytes, str)):
        try:
            return json.loads(value)
        except ValueError:
            return None
    return value


def _read(section, reader):
    """Runs one section's query on its own connection: (value, ok)."""
    conn = cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        return reader(cursor), True
    except MySQLError as err:
        log.warning("CUSTOMER_HOME_SECTION_FAILED vendor=%s %s: %s", g.vendor["vendor_id"], section, err)
        return None, False
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


def _invoice_summary(cursor):
    counts = dict.fromkeys(INVOICE_GROUP_NAMES, 0)
    ids = deps["invoice_ids"](cursor, g.vendor["vendor_id"])
    for start in range(0, len(ids), 200):
        chunk = ids[start:start + 200]
        cursor.execute(f"SELECT status FROM invoices WHERE id IN ({', '.join(['%s'] * len(chunk))})", chunk)
        for row in cursor.fetchall():
            counts[INVOICE_GROUPS.get(str(row["status"] or "").strip().lower(), "other")] += 1
    return {"total": len(ids), **counts}


def _agreement_summary(cursor):
    """The latest agreement, or None when none was ever issued."""
    cursor.execute(
        "SELECT agreement_no, version, status, terms_json, expires_at, signed_at, declined_at, "
        "(expires_at IS NULL OR expires_at >= NOW()) AS live "
        "FROM vendor_agreement WHERE vendor_id = %s ORDER BY version DESC LIMIT 1",
        (g.vendor["vendor_id"],),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    terms = _json(row["terms_json"]) or {}
    status = row["status"]
    awaiting = status == "sent" and bool(row["live"])
    return {
        "agreement_no": row["agreement_no"],
        "version": row["version"],
        "status": status,
        "awaiting_signature": awaiting,
        "signing_link_expired": status == "sent" and not awaiting,
        "valid_from": terms.get("start_iso"),
        "valid_until": terms.get("end_iso"),
        "signing_link_expires_at": _iso(row["expires_at"]) if status == "sent" else None,
        "signed_at": _iso(row["signed_at"]),
    }


def _change_request_summary(cursor):
    cursor.execute(
        "SELECT status, COUNT(*) AS n FROM vendor_update_request WHERE vendor_id = %s GROUP BY status",
        (g.vendor["vendor_id"],),
    )
    rows = cursor.fetchall()
    return {
        "open": sum(r["n"] for r in rows if r["status"] in update_requests.OPEN_STATUSES),
        "total": sum(r["n"] for r in rows),
    }


@bp.get("/vendors/me/home")
@auth.vendor_required()
def my_home():
    stage = g.vendor["stage"]
    body = {"stage": stage, "invoices": None, "agreement": None, "change_requests": None, "unavailable": []}
    # Before onboarding is approved there are no invoices or change requests; the agreement may already be issued.
    readers = {"agreement": _agreement_summary}
    if stage == auth.STAGE_ACTIVE:
        readers.update(invoices=_invoice_summary, change_requests=_change_request_summary)
    for key, reader in readers.items():
        value, ok = _read(key, reader)
        body[key] = value
        if not ok:
            body["unavailable"].append(key)
    return jsonify(body), 200


def _vendor_events(cursor, vendor_id):
    actions = list(VENDOR_EVENTS)
    cursor.execute(
        f"SELECT action, after_value, created_at FROM audit_log WHERE entity_type = 'vendor' AND entity_id = %s "
        f"AND action IN ({', '.join(['%s'] * len(actions))})",
        (str(vendor_id), *actions),
    )
    # Only a support message's request id and a resubmission's round are references the customer knows; nothing else of
    # after_value leaves (it also holds the LAS user and remarks of a review step).
    events = []
    for r in cursor.fetchall():
        after = _json(r["after_value"])
        after = after if isinstance(after, dict) else {}
        if r["action"] == "approval_recorded" and str(after.get("status") or "").strip().lower() not in APPROVED_STATUSES:
            continue
        reference = None
        if r["action"] == "support_request_sent":
            reference = after.get("request_id")
        elif r["action"] == "resubmitted" and isinstance(after.get("round"), int):
            reference = f"Round {after['round']}"
        events.append({"at": r["created_at"], "category": VENDOR_EVENTS[r["action"]][0], "title": VENDOR_EVENTS[r["action"]][1],
                       "reference": reference})
    return events


def _invoice_events(cursor, vendor_id):
    ids = deps["invoice_ids"](cursor, vendor_id)
    events = []
    actions = [*INVOICE_EVENTS, "status_changed"]
    for start in range(0, len(ids), 200):
        chunk = ids[start:start + 200]
        marks = ", ".join(["%s"] * len(chunk))
        cursor.execute(f"SELECT id, invoice_number, created_at FROM invoices WHERE id IN ({marks})", chunk)
        numbers = {}
        for r in cursor.fetchall():
            numbers[str(r["id"])] = r["invoice_number"]
            events.append({"at": r["created_at"], "category": "invoice", "title": "Invoice uploaded", "reference": r["invoice_number"]})
        cursor.execute(
            f"SELECT entity_id, action, after_value, created_at FROM audit_log WHERE entity_type = 'invoice' "
            f"AND entity_id IN ({marks}) AND action IN ({', '.join(['%s'] * len(actions))})",
            (*[str(i) for i in chunk], *actions),
        )
        for r in cursor.fetchall():
            if r["action"] == "status_changed":
                # Only the outcome the customer waits for; the steps between reviewers are internal.
                if str((_json(r["after_value"]) or {}).get("status", "")).strip().lower() != "approved":
                    continue
                title = "Invoice approved"
            else:
                title = INVOICE_EVENTS[r["action"]]
            events.append({"at": r["created_at"], "category": "invoice", "title": title, "reference": numbers.get(str(r["entity_id"]))})
    return events


def _agreement_events(cursor, vendor_id):
    kinds = list(AGREEMENT_EVENTS)
    cursor.execute(
        f"SELECT e.event_type, e.created_at, a.agreement_no FROM agreement_event e "
        f"JOIN vendor_agreement a ON a.agreement_id = e.agreement_id "
        f"WHERE a.vendor_id = %s AND e.event_type IN ({', '.join(['%s'] * len(kinds))})",
        (vendor_id, *kinds),
    )
    return [{"at": r["created_at"], "category": "agreement", "title": AGREEMENT_EVENTS[r["event_type"]], "reference": r["agreement_no"]}
            for r in cursor.fetchall()]


def _change_request_events(cursor, vendor_id):
    cursor.execute(
        "SELECT request_id, status, requested_at, checker_actioned_at FROM vendor_update_request WHERE vendor_id = %s",
        (vendor_id,),
    )
    events = []
    for r in cursor.fetchall():
        reference = f"CR-{r['request_id']}"
        events.append({"at": r["requested_at"], "category": "change_request", "title": "Change request submitted", "reference": reference})
        decided = {update_requests.STATUS_APPROVED: "Change request approved", update_requests.STATUS_REJECTED: "Change request not approved"}
        if r["status"] in decided and r["checker_actioned_at"]:
            events.append({"at": r["checker_actioned_at"], "category": "change_request", "title": decided[r["status"]], "reference": reference})
    return events


@bp.get("/vendors/me/activity")
@auth.vendor_required()
def my_activity():
    try:
        limit = int(request.args.get("limit", ACTIVITY_LIMIT_DEFAULT))
    except ValueError:
        return jsonify({"error": "limit must be a whole number."}), 400
    limit = max(1, min(limit, ACTIVITY_LIMIT_MAX))
    vendor_id = g.vendor["vendor_id"]
    readers = [("onboarding", _vendor_events), ("agreement", _agreement_events)]
    if g.vendor["stage"] == auth.STAGE_ACTIVE:
        readers += [("invoice", _invoice_events), ("change_request", _change_request_events)]
    events, unavailable = [], []
    for category, reader in readers:
        found, ok = _read(category, lambda cursor, reader=reader: reader(cursor, vendor_id))
        if ok:
            events.extend(e for e in found if e["at"])
        else:
            unavailable.append(category)
    events.sort(key=lambda e: _iso(e["at"]), reverse=True)
    return jsonify({"events": [{**e, "at": _iso(e["at"])} for e in events[:limit]], "unavailable": unavailable}), 200
