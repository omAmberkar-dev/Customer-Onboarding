"""Support messages from the signed-in customer, emailed to the support team.

    POST /vendors/me/support-request   { topic, reference?, message }

Recipients are the SUPPORT email group (the enterprise app's Configure Emails screen); while it has no members, the
addresses in the SUPPORT_REQUEST_RECIPIENTS setting (comma separated); else SUPPORT_EMAIL.

The email is the portal's own (support_email.py), sent over SMTP when SMTP_* is set; otherwise a shared-service template
named in SUPPORT_REQUEST_TEMPLATE (that service sends only templates built into it, and has none for this). With
neither, the request is refused with 503 and nothing is reported as sent.

Success is answered only when the mail server (or the email service) accepted the email. The customer is identified from their sign-in, never
from the request. Identical messages sent again within DUPLICATE_WINDOW_SECONDS and more than RATE_LIMIT messages in
RATE_WINDOW_SECONDS are refused. The message itself is never logged.
"""
import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from flask import Blueprint, g, jsonify, request
from mysql.connector import Error as MySQLError

import auth
import support_email
from db import get_connection

log = logging.getLogger(__name__)

bp = Blueprint("support_requests", __name__)

# send_email(to, subject, template, params, cc=None) -> bool; group_emails(code, fallback) -> [emails];
# support_email -> the configured fallback address. Set by app.configure.
deps = {}


def configure(**kwargs):
    deps.update(kwargs)


SUPPORT_GROUP = "SUPPORT"
TEMPLATE_SETTING = "SUPPORT_REQUEST_TEMPLATE"
RECIPIENTS_SETTING = "SUPPORT_REQUEST_RECIPIENTS"
_EMAIL = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")
TOPICS = {
    "general": "General question",
    "invoice": "Invoices",
    "loan": "Loans, sanctions and drawdowns",
    "change_request": "Changing my details",
    "account": "My account and sign-in",
}
MESSAGE_MIN, MESSAGE_MAX = 10, 2000
REFERENCE_MAX = 60
_REFERENCE = re.compile(r"^[\w ./:#-]*$")
DUPLICATE_WINDOW_SECONDS = 120
RATE_LIMIT, RATE_WINDOW_SECONDS = 5, 15 * 60
IST = timezone(timedelta(hours=5, minutes=30))

NOT_CONFIGURED = "Support messages can't be sent from the portal yet. Please try again later."
SEND_FAILED = "Your message could not be sent. Please try again in a few minutes."

_lock = threading.Lock()
_recent = {}  # vendor_id -> [(sent_at, message_hash)], in-memory per process, like the login throttle


def _too_soon(vendor_id, message_hash, now):
    """A refusal message when this send would be a duplicate or over the rate limit, else None (and records it)."""
    with _lock:
        sent = [(at, h) for at, h in _recent.get(vendor_id, []) if now - at < RATE_WINDOW_SECONDS]
        if any(h == message_hash and now - at < DUPLICATE_WINDOW_SECONDS for at, h in sent):
            return "This message was just sent. We'll get back to you soon."
        if len(sent) >= RATE_LIMIT:
            return "You've sent several messages in a short time. Please wait a few minutes before sending another."
        sent.append((now, message_hash))
        _recent[vendor_id] = sent
        return None


def recipients():
    """Who receives a support message: the SUPPORT group's members, else SUPPORT_REQUEST_RECIPIENTS, else SUPPORT_EMAIL."""
    group = [e for e in deps["group_emails"](SUPPORT_GROUP, None) if e]
    if group:
        return group
    configured = [e.strip() for e in (os.getenv(RECIPIENTS_SETTING) or "").split(",") if e.strip()]
    invalid = [e for e in configured if not _EMAIL.match(e)]
    if invalid:
        log.warning("SUPPORT_REQUEST_RECIPIENTS has %d invalid address(es); they are skipped", len(invalid))
    configured = [e for e in configured if _EMAIL.match(e)]
    return configured or [e for e in [deps.get("support_email")] if e]


def _forget(vendor_id, message_hash):
    """A send that failed does not count against the customer."""
    with _lock:
        _recent[vendor_id] = [(at, h) for at, h in _recent.get(vendor_id, []) if h != message_hash]


def _customer(vendor_id):
    conn = cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT vendor_legal_name, name, email, contact_no FROM vendor WHERE vendor_id = %s", (vendor_id,))
        return cursor.fetchone() or {}
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


def _audit(vendor_id, detail):
    """Records that a message was sent (never its text). A failure here does not undo the email."""
    conn = cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO audit_log (entity_type, entity_id, action, actor, before_value, after_value) "
            "VALUES ('vendor', %s, 'support_request_sent', 'vendor', NULL, %s)",
            (str(vendor_id), json.dumps(detail)),
        )
        conn.commit()
    except MySQLError as err:
        log.warning("SUPPORT_REQUEST_AUDIT_FAILED vendor=%s: %s", vendor_id, err)
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


@bp.post("/vendors/me/support-request")
@auth.vendor_required(auth.STAGE_ACTIVE)
def send_support_request():
    body = request.get_json(silent=True) or {}
    topic = str(body.get("topic") or "").strip()
    reference = str(body.get("reference") or "").strip()
    message = str(body.get("message") or "").strip()
    errors = {}
    if topic not in TOPICS:
        errors["topic"] = "Choose what your message is about."
    if len(reference) > REFERENCE_MAX or not _REFERENCE.match(reference):
        errors["reference"] = f"Use up to {REFERENCE_MAX} letters, numbers and / . - # : characters."
    if not MESSAGE_MIN <= len(message) <= MESSAGE_MAX:
        errors["message"] = f"Write between {MESSAGE_MIN} and {MESSAGE_MAX} characters."
    if errors:
        return jsonify({"error": "Please check the highlighted fields.", "fields": errors}), 400

    # The portal's own email over SMTP when its mailbox is set up; else a shared-service template when one is named.
    template = (os.getenv(TEMPLATE_SETTING) or "").strip()
    use_smtp = support_email.configured()
    if not use_smtp and not template:
        log.warning("SUPPORT_REQUEST_NOT_CONFIGURED: neither SMTP_* nor %s is set", TEMPLATE_SETTING)
        return jsonify({"error": NOT_CONFIGURED, "code": "not_configured"}), 503
    to = recipients()
    if not to:
        log.warning("SUPPORT_REQUEST_NO_RECIPIENT: the SUPPORT group is empty and no support address is configured")
        return jsonify({"error": NOT_CONFIGURED, "code": "no_recipient"}), 503

    vendor_id = g.vendor["vendor_id"]
    message_hash = sha256(f"{topic}|{reference}|{message}".encode()).hexdigest()
    refusal = _too_soon(vendor_id, message_hash, time.monotonic())
    if refusal:
        return jsonify({"error": refusal, "code": "too_soon"}), 429

    try:
        customer = _customer(vendor_id)
    except MySQLError as err:
        _forget(vendor_id, message_hash)
        log.warning("SUPPORT_REQUEST_CUSTOMER_READ_FAILED vendor=%s: %s", vendor_id, err)
        return jsonify({"error": SEND_FAILED}), 503
    now = datetime.now(IST)
    request_id = f"SUP-{vendor_id}-{now.strftime('%Y%m%d%H%M%S')}"
    name = customer.get("vendor_legal_name") or customer.get("name") or customer.get("email") or f"Customer {vendor_id}"
    params = {
        "request_id": request_id,
        "customer_id": str(vendor_id),
        "customer_name": name,
        "customer_email": customer.get("email") or g.vendor.get("email") or "",
        "contact_no": customer.get("contact_no") or "",
        "topic": TOPICS[topic],
        "reference": reference,
        "message": message,
        "submitted_at": now.strftime("%d %b %Y, %I:%M %p IST"),
    }
    subject = f"Support request {request_id} - {name}: {TOPICS[topic]}"
    sent = support_email.send(to, params) if use_smtp else deps["send_email"](to[0], subject, template, params, cc=to[1:] or None)
    if not sent:
        _forget(vendor_id, message_hash)
        log.warning("SUPPORT_REQUEST_SEND_FAILED vendor=%s request=%s", vendor_id, request_id)
        return jsonify({"error": SEND_FAILED, "code": "send_failed"}), 502

    log.info("SUPPORT_REQUEST_SENT vendor=%s request=%s recipients=%d", vendor_id, request_id, len(to))
    _audit(vendor_id, {"request_id": request_id, "topic": topic, "reference": reference})
    return jsonify({"sent": True, "request_id": request_id, "submitted_at": params["submitted_at"]}), 200
