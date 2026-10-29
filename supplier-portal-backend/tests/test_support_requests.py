"""Support messages (support_requests.py): sent through the shared email service to the SUPPORT group (else the configured
support address), only once the template is configured; success only when the service accepted the email; the customer
named from their sign-in; duplicates and floods refused; nothing reported as sent that was not."""
import json
import sqlite3

import pytest

import app as portal
import auth
import support_requests
import sqlite_db

SCHEMA = """
    CREATE TABLE vendor (vendor_id INTEGER PRIMARY KEY, email TEXT, status TEXT, submission_round INTEGER,
                         vendor_legal_name TEXT, name TEXT, contact_no TEXT);
    CREATE TABLE audit_log (id INTEGER PRIMARY KEY, entity_type TEXT, entity_id TEXT, action TEXT, actor TEXT,
                            before_value TEXT, after_value TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
"""
BODY = {"topic": "invoice", "reference": "INV-2026/0043", "message": "My invoice was returned but I cannot see why."}


@pytest.fixture
def env(tmp_path, monkeypatch):
    path = tmp_path / "support.db"
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO vendor VALUES (?, ?, ?, ?, ?, ?, ?)", [
        (85, "n@x.test", "active", 1, "Aditya Birla Capital Limited", "Neekhat A", "9876543210"),
        (90, "p@x.test", "pending", 1, "Pending Co", None, None),
    ])
    db.commit()
    db.close()
    connect = lambda: sqlite_db.Connection(path)  # noqa: E731
    monkeypatch.setattr(auth, "get_connection", connect)
    monkeypatch.setattr(support_requests, "get_connection", connect)
    monkeypatch.setenv("SUPPORT_REQUEST_TEMPLATE", "t_support")
    for name in ("SUPPORT_REQUEST_RECIPIENTS", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_NAME"):
        monkeypatch.delenv(name, raising=False)  # never the developer's .env
    support_requests._recent.clear()

    class Env:
        sent = []
        group = ["help1@bank.test", "help2@bank.test"]
        accept = True
    e = Env()
    e.sent = []

    def send(to, subject, template, params, cc=None):
        e.sent.append({"to": to, "cc": cc, "subject": subject, "template": template, "params": params})
        return e.accept

    def groups(code, fallback):
        e.asked_group = code
        return e.group or [fallback]
    monkeypatch.setitem(support_requests.deps, "send_email", send)
    monkeypatch.setitem(support_requests.deps, "group_emails", groups)
    monkeypatch.setitem(support_requests.deps, "support_email", "support@fourthsignal.com")
    e.client = portal.app.test_client()
    e.path = path
    e.post = lambda body=BODY, vendor=85: e.client.post("/vendors/me/support-request", json=body,
                                                        headers={"Authorization": f"Bearer {auth.issue_token(vendor, 'x')}"})
    return e


def audit_rows(path):
    db = sqlite3.connect(path)
    rows = db.execute("SELECT entity_id, action, after_value FROM audit_log").fetchall()
    db.close()
    return rows


def test_sent_to_the_support_group_with_the_signed_in_customers_details(env):
    r = env.post()
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["sent"] is True and body["request_id"].startswith("SUP-85-")
    assert env.asked_group == "SUPPORT"
    [mail] = env.sent
    assert mail["to"] == "help1@bank.test" and mail["cc"] == ["help2@bank.test"] and mail["template"] == "t_support"
    p = mail["params"]
    assert (p["customer_id"], p["customer_name"], p["customer_email"], p["contact_no"]) == ("85", "Aditya Birla Capital Limited", "n@x.test", "9876543210")
    assert (p["topic"], p["reference"], p["message"]) == ("Invoices", "INV-2026/0043", BODY["message"])
    assert p["request_id"] == body["request_id"] and body["request_id"] in mail["subject"]
    # The audit trail keeps that it was sent, never the message.
    [(entity, action, after)] = audit_rows(env.path)
    assert (entity, action) == ("85", "support_request_sent")
    assert json.loads(after) == {"request_id": body["request_id"], "topic": "invoice", "reference": "INV-2026/0043"}
    assert BODY["message"] not in after


def test_with_an_empty_support_group_it_goes_to_the_configured_recipients(env, monkeypatch):
    env.group = []
    monkeypatch.setenv("SUPPORT_REQUEST_RECIPIENTS", " first@bank.test , not-an-email,second@bank.test,, ")
    assert env.post().status_code == 200
    assert (env.sent[0]["to"], env.sent[0]["cc"]) == ("first@bank.test", ["second@bank.test"])


def test_the_support_group_takes_over_from_the_setting_once_it_has_members(env, monkeypatch):
    monkeypatch.setenv("SUPPORT_REQUEST_RECIPIENTS", "first@bank.test")
    assert env.post().status_code == 200
    assert env.sent[0]["to"] == "help1@bank.test"


def test_with_no_group_and_no_setting_it_goes_to_the_support_address(env):
    env.group = []
    assert env.post().status_code == 200
    assert env.sent[0]["to"] == "support@fourthsignal.com" and env.sent[0]["cc"] is None


def test_a_customer_id_in_the_request_is_ignored_or_refused(env):
    assert env.post({**BODY, "vendor_id": 90}).status_code == 403
    assert env.sent == []


def test_not_configured_is_refused_and_nothing_is_sent(env, monkeypatch):
    monkeypatch.delenv("SUPPORT_REQUEST_TEMPLATE")
    r = env.post()
    assert r.status_code == 503 and r.get_json()["code"] == "not_configured"
    assert env.sent == [] and audit_rows(env.path) == []


def test_a_failed_send_is_reported_as_failed_and_can_be_retried(env):
    env.accept = False
    r = env.post()
    assert r.status_code == 502 and r.get_json()["code"] == "send_failed" and "sent" not in r.get_json()
    assert audit_rows(env.path) == []
    env.accept = True
    assert env.post().status_code == 200  # the failure did not count as a duplicate


def test_the_same_message_twice_is_sent_once(env):
    assert env.post().status_code == 200
    r = env.post()
    assert r.status_code == 429 and r.get_json()["code"] == "too_soon"
    assert len(env.sent) == 1


def test_too_many_messages_are_refused(env):
    for n in range(support_requests.RATE_LIMIT):
        assert env.post({**BODY, "message": f"Question number {n} about my invoices."}).status_code == 200
    assert env.post({**BODY, "message": "One more question about my invoices."}).status_code == 429
    assert len(env.sent) == support_requests.RATE_LIMIT


@pytest.mark.parametrize("change, field", [
    ({"topic": "agreement"}, "topic"),
    ({"topic": ""}, "topic"),
    ({"message": "short"}, "message"),
    ({"message": "x" * 2001}, "message"),
    ({"reference": "<script>"}, "reference"),
    ({"reference": "A" * 61}, "reference"),
])
def test_invalid_input_is_refused_before_anything_is_sent(env, change, field):
    r = env.post({**BODY, **change})
    assert r.status_code == 400 and field in r.get_json()["fields"]
    assert env.sent == []


def test_only_signed_in_active_customers_can_send(env):
    assert env.client.post("/vendors/me/support-request", json=BODY).status_code == 401
    assert env.post(vendor=90).status_code == 403
    assert env.sent == []
