"""Reading and updating the reasons a maker/checker returned a self-service application for.

The maker/checker app writes `vendor_rejection` (one row per return) and `vendor_rejection_item` (one row per
flagged field). The portal only reads them and records the vendor's progress on them:

  fixed_at       - set when the vendor edits a flagged field (or confirms it is already correct)
  resubmitted_at - set on the return when the vendor resubmits (a return with it set is part of the correction history)

Flagged fields use the form's own keys (e.g. pan, ifsc_code) and doc_<type> for supporting documents.
"""
from datetime import datetime

from db import get_connection


def _iso(value):
    return value.isoformat() if isinstance(value, datetime) else value


def get_open_rejection(vendor_id):
    """The latest return the vendor has not resubmitted yet, with its flagged items, or None."""
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT rejection_id, round_no, rejected_by_role, overall_remark, rejected_at "
            "FROM vendor_rejection WHERE vendor_id = %s AND resubmitted_at IS NULL "
            "ORDER BY rejected_at DESC, rejection_id DESC LIMIT 1",
            (vendor_id,),
        )
        rejection = cursor.fetchone()
        if rejection is None:
            return None
        cursor.execute(
            "SELECT item_id, reason_code, field_key, field_label, reason_label, remark, fixed_at "
            "FROM vendor_rejection_item WHERE rejection_id = %s ORDER BY item_id",
            (rejection["rejection_id"],),
        )
        rejection["items"] = [
            {**item, "fixed_at": _iso(item["fixed_at"]), "fixed": item["fixed_at"] is not None}
            for item in cursor.fetchall()
        ]
        rejection["rejected_at"] = _iso(rejection["rejected_at"])
        return rejection
    finally:
        conn.close()


def mark_fixed(vendor_id, field_keys, cursor=None):
    """Record that the vendor dealt with these flagged fields on their open return. With `cursor`, inside the caller's
    transaction, which commits it."""
    field_keys = [key for key in field_keys if key]
    if not field_keys:
        return
    placeholders = ", ".join(["%s"] * len(field_keys))
    sql = (
        "UPDATE vendor_rejection_item i JOIN vendor_rejection r ON r.rejection_id = i.rejection_id "
        "SET i.fixed_at = NOW() "
        f"WHERE r.vendor_id = %s AND r.resubmitted_at IS NULL AND i.fixed_at IS NULL "
        f"AND i.field_key IN ({placeholders})"
    )
    if cursor is not None:
        cursor.execute(sql, [vendor_id, *field_keys])
        return
    conn = get_connection()
    try:
        conn.cursor().execute(sql, [vendor_id, *field_keys])
        conn.commit()
    finally:
        conn.close()


def mark_resubmitted(vendor_id, cursor=None):
    """Close the open return(s). With `cursor`, inside the caller's transaction (the submit), which commits it."""
    sql = "UPDATE vendor_rejection SET resubmitted_at = NOW() WHERE vendor_id = %s AND resubmitted_at IS NULL"
    if cursor is not None:
        cursor.execute(sql, (vendor_id,))
        return
    conn = get_connection()
    try:
        conn.cursor().execute(sql, (vendor_id,))
        conn.commit()
    finally:
        conn.close()


def correction_history(vendor_id):
    """The returns the customer has already corrected and resubmitted, newest first, in the customer's words: the reviewer's
    role only (never who it was), each flagged field and whether the customer dealt with it. The open return is `rejection`."""
    conn = get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT rejection_id, round_no, rejected_by_role, overall_remark, rejected_at, resubmitted_at "
            "FROM vendor_rejection WHERE vendor_id = %s AND resubmitted_at IS NOT NULL "
            "ORDER BY rejected_at DESC, rejection_id DESC",
            (vendor_id,),
        )
        returns = cursor.fetchall()
        items = {}
        if returns:
            ids = [r["rejection_id"] for r in returns]
            cursor.execute(
                "SELECT rejection_id, field_key, field_label, reason_label, remark, fixed_at FROM vendor_rejection_item "
                f"WHERE rejection_id IN ({', '.join(['%s'] * len(ids))}) ORDER BY item_id",
                ids,
            )
            for item in cursor.fetchall():
                items.setdefault(item["rejection_id"], []).append({
                    "field_key": item["field_key"], "field_label": item["field_label"], "reason_label": item["reason_label"],
                    "remark": item["remark"], "fixed": item["fixed_at"] is not None,
                })
    finally:
        conn.close()
    roles = ("maker", "checker")
    return [{
        "round_no": r["round_no"],
        "rejected_by_role": str(r["rejected_by_role"] or "").lower() if str(r["rejected_by_role"] or "").lower() in roles else None,
        "overall_remark": r["overall_remark"],
        "rejected_at": _iso(r["rejected_at"]),
        "resubmitted_at": _iso(r["resubmitted_at"]),
        "items": items.get(r["rejection_id"], []),
    } for r in returns]
