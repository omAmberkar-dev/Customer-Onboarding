"""My loans (customer_journey.py): the signed-in customer's journey and PDFs, read from a stand-in for LAS's customer
journey API. The key goes in X-Portal-Key and never to the browser, the portal id is always the signed-in customer's,
nothing is asked of LAS before onboarding is approved, PDFs stream through, and LAS's failures reach the customer only
as plain words."""
import json
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pytest

import app as portal
import auth
import customer_journey
import sqlite_db

KEY = "test-journey-key"
PDF = b"%PDF-1.4\n" + b"x" * 200_000 + b"\n%%EOF"
JOURNEY = {"onboarded": True, "customerNo": "100440", "steps": [{"key": "onboarding", "state": "done"}],
           "sanctions": [{"id": "1000-11", "statusLabel": "Approved", "hasDocument": True}], "drawdowns": [], "invoices": [],
           "invoicesAvailable": True}


class FakeLas(BaseHTTPRequestHandler):
    calls = []
    answer = None  # (status, content_type, body) overriding the default reply

    def do_GET(self):  # noqa: N802 - http.server's name
        url = urlparse(self.path)
        FakeLas.calls.append({"path": url.path, "query": parse_qs(url.query), "key": self.headers.get("X-Portal-Key")})
        if self.headers.get("X-Portal-Key") != KEY:
            return self._send(401, "application/json", json.dumps({"error": "Invalid or missing X-Portal-Key."}).encode())
        if FakeLas.answer:
            return self._send(*FakeLas.answer)
        portal_id = parse_qs(url.query).get("portalId", [""])[0]
        if url.path == "/api/customer-portal/journey":
            return self._send(200, "application/json", json.dumps(JOURNEY).encode())
        if url.path == "/api/customer-portal/documents/sanction/1000-11" and portal_id == "84":
            return self._send(200, "application/pdf", PDF, {"Content-Disposition": 'inline; filename="Sanction_Memo_100411.pdf"'})
        return self._send(404, "application/json", json.dumps({"error": "Document not found."}).encode())

    def _send(self, status, content_type, body, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def las():
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeLas)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture
def client(tmp_path, monkeypatch, las):
    path = tmp_path / "journey.db"
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE vendor (vendor_id INTEGER PRIMARY KEY, email TEXT, status TEXT, submission_round INTEGER);
        INSERT INTO vendor VALUES (84, 'c@x.test', 'active', 1), (85, 'd@x.test', 'Pending', 1);
    """)
    db.close()
    monkeypatch.setattr(auth, "get_connection", lambda: sqlite_db.Connection(path))
    monkeypatch.setenv("LAS_API_URL", las + "/")
    monkeypatch.setenv("PORTAL_JOURNEY_KEY", KEY)
    FakeLas.calls.clear()
    FakeLas.answer = None
    return portal.app.test_client()


def signed_in(vendor_id):
    return {"Authorization": f"Bearer {auth.issue_token(vendor_id, 'c@x.test')}"}


def test_sign_in_is_required(client):
    assert client.get("/vendors/me/loans").status_code == 401
    assert client.get("/vendors/me/loans/documents/sanction/1000-11").status_code == 401
    assert FakeLas.calls == []


def test_journey_is_the_signed_in_customers_with_the_key_server_side(client):
    r = client.get("/vendors/me/loans", headers=signed_in(84))
    assert r.status_code == 200
    assert r.get_json()["sanctions"][0]["statusLabel"] == "Approved" and r.get_json()["stage"] == "active"
    assert FakeLas.calls == [{"path": "/api/customer-portal/journey", "query": {"portalId": ["84"]}, "key": KEY}]
    assert KEY not in r.get_data(as_text=True)


def test_another_vendor_id_in_the_request_is_refused(client):
    # The portal id sent to LAS is the token's, never one the browser names.
    assert client.get("/vendors/me/loans?vendor_id=85", headers=signed_in(84)).status_code == 403
    assert FakeLas.calls == []


def test_before_onboarding_is_approved_there_is_an_empty_journey_and_no_call(client):
    r = client.get("/vendors/me/loans", headers=signed_in(85))
    assert r.status_code == 200
    assert r.get_json()["onboarded"] is False and r.get_json()["stage"] == "maker_review"
    assert client.get("/vendors/me/loans/documents/sanction/1000-11", headers=signed_in(85)).status_code == 403
    assert FakeLas.calls == []


def test_a_pdf_streams_through(client):
    r = client.get("/vendors/me/loans/documents/sanction/1000-11", headers=signed_in(84))
    assert r.status_code == 200 and r.mimetype == "application/pdf"
    assert r.headers["Content-Disposition"] == 'inline; filename="Sanction_Memo_100411.pdf"'
    assert r.headers["Cache-Control"] == "private, no-store"
    assert r.get_data() == PDF
    assert FakeLas.calls[-1]["query"] == {"portalId": ["84"]}


@pytest.mark.parametrize("path", ["/documents/sanction/1000-21", "/documents/receipt/1000-11", "/documents/sanction/..%2Fjourney"])
def test_a_document_that_is_not_theirs_is_not_found(client, path):
    r = client.get("/vendors/me/loans" + path, headers=signed_in(84))
    assert r.status_code == 404
    # A path that is not a document at all never reaches LAS; one that is, LAS refuses (not this customer's).
    assert all(call["path"].startswith("/api/customer-portal/documents/sanction/1000-21") for call in FakeLas.calls)


@pytest.mark.parametrize("setup", ["wrong_key", "no_url", "las_down", "las_failed", "not_a_pdf"])
def test_failures_reach_the_customer_in_plain_words(client, monkeypatch, setup):
    if setup == "wrong_key":
        monkeypatch.setenv("PORTAL_JOURNEY_KEY", "something-else")
    elif setup == "no_url":
        monkeypatch.delenv("LAS_API_URL")
    elif setup == "las_down":
        monkeypatch.setenv("LAS_API_URL", "http://127.0.0.1:9")
    elif setup == "las_failed":
        FakeLas.answer = (503, "application/json", json.dumps({"error": "SAP said: ZFS_LAS_WEB_T001 dump"}).encode())
    else:
        FakeLas.answer = (200, "text/html", b"<html>login</html>")
    for path in ("/vendors/me/loans", "/vendors/me/loans/documents/sanction/1000-11"):
        r = client.get(path, headers=signed_in(84))
        assert r.status_code == 503, (setup, path)
        assert r.get_json() == {"error": customer_journey.UNAVAILABLE}
