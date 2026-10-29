"""The portal's own Support request email (support_email.py) over a stand-in SMTP server: who it goes to, that the
customer can be replied to, that nothing a customer types can break the HTML or the headers, and that a refused login or
an unreachable server is reported as not sent (and the Support endpoint then never says it was)."""
import smtplib

import pytest

import support_email
import support_requests
from tests.test_support_requests import BODY, env  # noqa: F401 - the Support endpoint fixture

PARAMS = {
    "request_id": "SUP-85-20261028180000", "customer_id": "85", "customer_name": "Aditya Birla Capital Limited",
    "customer_email": "n@x.test", "contact_no": "9876543210", "topic": "Invoices", "reference": "INV-1",
    "message": "Line one <script>alert(1)</script>\nLine two & more", "submitted_at": "28 Oct 2026, 06:00 PM IST",
}


class FakeSmtp:
    instances = []
    fail_login = False
    fail_connect = False

    def __init__(self, host, port, timeout=None, context=None):
        if FakeSmtp.fail_connect:
            raise OSError("connection refused")
        self.host, self.port, self.messages, self.tls, self.logged_in = host, port, [], False, None
        FakeSmtp.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        self.tls = True

    def login(self, user, password):
        if FakeSmtp.fail_login:
            raise smtplib.SMTPAuthenticationError(535, b"bad credentials")
        self.logged_in = (user, password)

    def send_message(self, msg):
        self.messages.append(msg)
        return {}


@pytest.fixture
def smtp(monkeypatch):
    FakeSmtp.instances, FakeSmtp.fail_login, FakeSmtp.fail_connect = [], False, False
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSmtp)
    monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
    for name, value in {"SMTP_HOST": "smtp.test", "SMTP_PORT": "465", "SMTP_SECURE": "true",
                        "SMTP_USER": "mailer@bank.test", "SMTP_PASS": "app-password"}.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("SMTP_FROM_NAME", raising=False)
    return FakeSmtp


def test_render_escapes_the_customers_text_and_keeps_line_breaks():
    subject, text, html = support_email.render(PARAMS)
    assert subject == "Support request SUP-85-20261028180000 - Aditya Birla Capital Limited: Invoices"
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "Line one &lt;script&gt;alert(1)&lt;/script&gt;<br>Line two &amp; more" in html
    assert "Message:\nLine one <script>alert(1)</script>\nLine two & more" in text
    for value in ("85", "n@x.test", "9876543210", "INV-1", "28 Oct 2026, 06:00 PM IST"):
        assert value in html and value in text


def test_render_leaves_out_empty_rows_and_keeps_newlines_out_of_the_subject():
    subject, text, html = support_email.render({**PARAMS, "reference": "", "contact_no": "", "customer_name": "Evil\r\nBcc: x@y.z"})
    assert "\n" not in subject and "\r" not in subject
    assert "Reference" not in text and "Phone" not in html


def test_sent_over_tls_to_the_recipients_with_the_customer_as_reply_to(smtp):
    assert support_email.send(["first@bank.test", "second@bank.test"], PARAMS) is True
    [server] = smtp.instances
    assert (server.host, server.port, server.logged_in) == ("smtp.test", 465, ("mailer@bank.test", "app-password"))
    [msg] = server.messages
    assert msg["To"] == "first@bank.test" and msg["Cc"] == "second@bank.test"
    assert msg["From"] == "Customer Central <mailer@bank.test>"
    assert msg["Reply-To"] == "Aditya Birla Capital Limited <n@x.test>"
    assert [part.get_content_type() for part in msg.iter_parts()] == ["text/plain", "text/html"]


def test_starttls_when_not_secure(smtp, monkeypatch):
    monkeypatch.setenv("SMTP_SECURE", "false")
    monkeypatch.setenv("SMTP_PORT", "587")
    assert support_email.send(["first@bank.test"], PARAMS) is True
    assert smtp.instances[0].tls is True and smtp.instances[0].messages[0]["Cc"] is None


@pytest.mark.parametrize("failure", ["fail_login", "fail_connect"])
def test_a_refused_login_or_unreachable_server_is_not_sent(smtp, failure):
    setattr(smtp, failure, True)
    assert support_email.send(["first@bank.test"], PARAMS) is False


def test_configured_needs_host_user_and_password(smtp, monkeypatch):
    assert support_email.configured() is True
    monkeypatch.setenv("SMTP_PASS", " ")
    assert support_email.configured() is False


def test_the_endpoint_uses_smtp_when_set_and_says_sent_only_when_it_was(env, smtp, monkeypatch):  # noqa: F811
    monkeypatch.delenv("SUPPORT_REQUEST_TEMPLATE")  # SMTP alone is enough
    env.group = []
    monkeypatch.setenv("SUPPORT_REQUEST_RECIPIENTS", "neekhat.a@bank.test,om.a@bank.test")
    r = env.post()
    assert r.status_code == 200 and r.get_json()["sent"] is True
    [msg] = smtp.instances[0].messages
    assert (msg["To"], msg["Cc"]) == ("neekhat.a@bank.test", "om.a@bank.test")
    assert r.get_json()["request_id"] in msg["Subject"] and BODY["message"] in msg.get_body(("plain",)).get_content()
    assert env.sent == []  # the shared email service was not used

    smtp.fail_login = True
    r = env.post({**BODY, "message": "A different question about invoices."})
    assert r.status_code == 502 and "sent" not in r.get_json()
