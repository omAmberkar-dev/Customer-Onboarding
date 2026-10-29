"""The Support request email: the portal's own template, sent over SMTP.

The shared email service only sends templates built into it and has none for support messages, so the portal renders this
one itself (HTML, with a plain-text copy) and sends it through the mailbox in SMTP_* (the same settings LAS's mailer
reads). Reply-To is the customer, so the support team answers them directly.

    SMTP_HOST, SMTP_PORT (465), SMTP_SECURE (true: TLS from the start; false: STARTTLS), SMTP_USER, SMTP_PASS,
    SMTP_FROM_NAME (Customer Central)

Every value from the customer is escaped in the HTML and kept out of headers except as plain text without line breaks.
"""
import html
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 20


def configured():
    return all((os.getenv(name) or "").strip() for name in ("SMTP_HOST", "SMTP_USER", "SMTP_PASS"))


def _one_line(value):
    return " ".join(str(value or "").split())


def render(params):
    """(subject, text, html) of the Support request email for the support_requests params."""
    p = {k: str(v or "") for k, v in params.items()}
    subject = _one_line(f"Support request {p['request_id']} - {p['customer_name']}: {p['topic']}")[:200]
    rows = [
        ("Request ID", p["request_id"]),
        ("Customer ID", p["customer_id"]),
        ("Customer", p["customer_name"]),
        ("Email", p["customer_email"]),
        ("Phone", p["contact_no"]),
        ("Topic", p["topic"]),
        ("Reference", p["reference"]),
        ("Sent", p["submitted_at"]),
    ]
    rows = [(label, value) for label, value in rows if value]
    text = "\n".join([
        "New support request from Customer Central",
        "",
        *[f"{label}: {value}" for label, value in rows],
        "",
        "Message:",
        p["message"],
        "",
        "Reply to this email to answer the customer directly.",
    ])
    esc = html.escape
    table = "\n".join(
        f'<tr><td style="padding:9px 14px;width:34%;color:#6b7280;{"border-top:1px solid #eef0f3;" if i else ""}">{esc(label)}</td>'
        f'<td style="padding:9px 14px;font-weight:bold;color:#111827;{"border-top:1px solid #eef0f3;" if i else ""}">{esc(value)}</td></tr>'
        for i, (label, value) in enumerate(rows)
    )
    message_html = esc(p["message"]).replace("\n", "<br>")
    body = f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
  <tr><td style="padding:18px 28px;border-bottom:3px solid #0046dc;font-size:18px;font-weight:bold;color:#111827;">Customer Central</td></tr>
  <tr><td style="padding:24px 28px 6px;">
    <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#111827;">New support request</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;">A customer sent this from the Support page of the Customer Central portal.</p>
  </td></tr>
  <tr><td style="padding:12px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;border:1px solid #e5e7eb;">
{table}
    </table>
  </td></tr>
  <tr><td style="padding:8px 28px 4px;">
    <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#374151;">Message</p>
    <div style="padding:12px 14px;background:#f7f9fc;border-left:3px solid #0046dc;font-size:14px;line-height:1.6;white-space:normal;">{message_html}</div>
  </td></tr>
  <tr><td style="padding:16px 28px 24px;font-size:13px;line-height:1.6;color:#374151;">Reply to this email to answer the customer directly.</td></tr>
  <tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 8px 8px;font-size:11px;color:#6b7280;">Automated message from Customer Central.</td></tr>
</table>
</td></tr></table>
</body></html>"""
    return subject, text, body


def send(to, params):
    """Sends the email to `to` (the first as To, the rest as Cc). True once the server accepted it for at least one
    recipient; False (and logged, without the message) otherwise. Never raises."""
    subject, text, body = render(params)
    user = os.getenv("SMTP_USER", "").strip()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((_one_line(os.getenv("SMTP_FROM_NAME") or "Customer Central"), user))
    msg["To"] = to[0]
    if to[1:]:
        msg["Cc"] = ", ".join(to[1:])
    customer_email = _one_line(params.get("customer_email"))
    if customer_email and "@" in customer_email:
        msg["Reply-To"] = formataddr((_one_line(params.get("customer_name")), customer_email))
    msg.set_content(text)
    msg.add_alternative(body, subtype="html")

    host = os.getenv("SMTP_HOST", "").strip()
    secure = (os.getenv("SMTP_SECURE", "true").strip().lower() != "false")
    port = int(os.getenv("SMTP_PORT") or (465 if secure else 587))
    context = ssl.create_default_context()
    try:
        if secure:
            server = smtplib.SMTP_SSL(host, port, timeout=TIMEOUT_SECONDS, context=context)
        else:
            server = smtplib.SMTP(host, port, timeout=TIMEOUT_SECONDS)
        with server:
            if not secure:
                server.starttls(context=context)
            server.login(user, os.getenv("SMTP_PASS", ""))
            refused = server.send_message(msg)
    except (smtplib.SMTPException, OSError) as err:
        log.warning("SUPPORT_EMAIL_SMTP_FAILED request=%s: %s", params.get("request_id"), type(err).__name__)
        return False
    if refused:
        log.warning("SUPPORT_EMAIL_SMTP_PARTLY_REFUSED request=%s refused=%d", params.get("request_id"), len(refused))
    return True
