"""The history of a self-service application across its rounds, kept so a resubmission never overwrites what came before.

    record_submission(cursor, ...)   what the customer submitted in a round (vendor_submission.sql), in the submit's transaction
    audit(cursor, ...)               one audit_log row (entity_type 'vendor'), in the transaction of the change it records
    las_history(vendor_id)           the rounds, each return with its reasons, and the audit trail, for LAS's maker and checker

The audit_log actions written for an application (the readers are customer_home.py and notifications_feed.py):

    submitted / resubmitted     the customer submitted round N (actor "vendor")
    approval_recorded           the LAS maker submitted it for approval (status 01) or the checker approved it (status active)
    returned_for_correction     returned to the customer (vendor_rejection holds the reasons)
    returned_to_maker           the checker sent it back to the maker (status Pending, same round)
    rejected                    rejected for good

`actor` is the role (vendor, maker, checker), never a person, so the customer's bell can say "By the maker"; the LAS username and
the remark go in after_value, which no customer-facing reader returns.
"""
import json
import logging
from datetime import date, datetime
from decimal import Decimal

from mysql.connector import Error as MySQLError

from db import get_connection

log = logging.getLogger(__name__)

ACTIONS = ("submitted", "resubmitted", "approval_recorded", "returned_for_correction", "returned_to_maker", "rejected")
_MISSING_TABLE = 1146  # ER_NO_SUCH_TABLE


def _plain(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _json(value):
    if isinstance(value, (bytes, str)):
        try:
            return json.loads(value)
        except ValueError:
            return None
    return value


def _dumps(value):
    return None if value is None else json.dumps(value, default=_plain)


def audit(cursor, vendor_id, action, actor, before=None, after=None):
    cursor.execute(
        "INSERT INTO audit_log (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('vendor', %s, %s, %s, %s, %s)",
        (str(vendor_id), action, actor, _dumps(before), _dumps(after)),
    )


def record_submission(cursor, vendor_id, round_no, details, documents):
    """Keep what was submitted in this round. Returns False (and logs) instead of failing the submit when the row cannot be
    written, e.g. while vendor_submission.sql has not been run on this database."""
    try:
        cursor.execute(
            "INSERT INTO vendor_submission (vendor_id, round_no, details_json, documents_json, submitted_at) VALUES (%s, %s, %s, %s, NOW())",
            (vendor_id, round_no, _dumps(details), _dumps(documents)),
        )
        return True
    except MySQLError as err:
        log.warning("SUBMISSION_SNAPSHOT_NOT_KEPT vendor=%s round=%s: %s", vendor_id, round_no, err)
        return False


def _rows(cursor, sql, params):
    cursor.execute(sql, params)
    return cursor.fetchall()


def _optional(cursor, sql, params, name, unavailable):
    """Rows of a table that may not exist yet on this database (None, named in `unavailable`, when it does not)."""
    try:
        return _rows(cursor, sql, params)
    except MySQLError as err:
        if getattr(err, "errno", None) != _MISSING_TABLE:
            raise
        unavailable.append(name)
        return None


def las_history(vendor_id, current_round):
    """Every round of the application: what was submitted (when kept), the returns made on it with their reasons, and the
    audit trail. `unavailable` names what this database cannot tell yet (snapshots, events)."""
    unavailable = []
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        snapshots = _optional(
            cursor, "SELECT round_no, details_json, documents_json, submitted_at FROM vendor_submission WHERE vendor_id = %s ORDER BY round_no",
            (vendor_id,), "snapshots", unavailable,
        )
        returns = _rows(
            cursor,
            "SELECT rejection_id, round_no, rejected_by_role, rejected_by, overall_remark, rejected_at, resubmitted_at "
            "FROM vendor_rejection WHERE vendor_id = %s ORDER BY rejected_at, rejection_id",
            (vendor_id,),
        )
        items = {}
        if returns:
            ids = [r["rejection_id"] for r in returns]
            for item in _rows(
                cursor,
                "SELECT rejection_id, reason_code, field_key, field_label, reason_label, remark, fixed_at FROM vendor_rejection_item "
                f"WHERE rejection_id IN ({', '.join(['%s'] * len(ids))}) ORDER BY item_id",
                ids,
            ):
                items.setdefault(item["rejection_id"], []).append({
                    "reason_code": item["reason_code"], "field_key": item["field_key"], "field_label": item["field_label"],
                    "reason_label": item["reason_label"], "remark": item["remark"], "fixed": item["fixed_at"] is not None,
                })
        events = _optional(
            cursor,
            "SELECT id, action, actor, before_value, after_value, created_at FROM audit_log WHERE entity_type = 'vendor' AND entity_id = %s "
            f"AND action IN ({', '.join(['%s'] * len(ACTIONS))}) ORDER BY created_at, id",
            (str(vendor_id), *ACTIONS), "events", unavailable,
        )
    finally:
        conn.close()

    returns = [{
        "round_no": r["round_no"], "role": r["rejected_by_role"], "by": r["rejected_by"], "remark": r["overall_remark"],
        "rejected_at": _plain(r["rejected_at"]), "resubmitted_at": _plain(r["resubmitted_at"]), "items": items.get(r["rejection_id"], []),
    } for r in returns]
    kept = {s["round_no"]: s for s in snapshots or []}
    numbers = sorted({*range(1, (current_round or 0) + 1), *kept, *(r["round_no"] for r in returns)})
    rounds = [{
        "round_no": n,
        "submitted_at": _plain(kept[n]["submitted_at"]) if n in kept else None,
        "details": _json(kept[n]["details_json"]) if n in kept else None,
        "documents": _json(kept[n]["documents_json"]) if n in kept else None,
        "returns": [r for r in returns if r["round_no"] == n],
    } for n in numbers]
    trail = None
    if events is not None:
        trail = []
        for e in events:
            after = _json(e["after_value"]) or {}
            trail.append({
                "action": e["action"], "role": e["actor"], "by": after.get("by"), "status": after.get("status"),
                "round_no": after.get("round"), "remark": after.get("remark"), "to": after.get("to"), "at": _plain(e["created_at"]),
            })
    return {"current_round": current_round or 0, "resubmitted": (current_round or 0) > 1, "rounds": rounds, "returns": returns,
            "events": trail, "unavailable": unavailable}
