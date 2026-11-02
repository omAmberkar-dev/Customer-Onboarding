"""Money with LAS (customer_finance.py): the signed-in customer's finance and statements, read from a stand-in for LAS's
customer finance API. The portal id sent is always the token's, the key never reaches the browser, nothing is asked of
LAS before onboarding is approved, LAS's failures are plain words, and a statement lists exactly the filtered rows."""
import io
import json
import sqlite3
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pytest

import app as portal
import auth
import customer_finance
import sqlite_db

KEY = "test-finance-key"
FINANCE = {
    "onboarded": True, "customerNo": "100440", "customerName": "Osprey Security Solutions",
    "facilities": [{"sanctionNo": "100411", "sanctionedAmount": 5000000, "utilised": 1000000, "available": 1000000}],
    "drawdowns": [{"applicationNo": "501", "disbursementNo": "23000068", "status": "disbursed"}],
    "transactions": [
        {"id": "disb-23000068", "date": "2026-09-01", "reference": "23000068", "disbursementNo": "23000068", "type": "disbursement",
         "description": "Loan amount paid out to you", "inflow": 1000000, "outflow": 0, "currency": "INR", "status": "posted", "paymentReference": ""},
        {"id": "pay-1", "date": "2026-10-05", "reference": "7001", "disbursementNo": "23000068", "type": "interest_payment",
         "description": "Interest for 2026-09-30", "inflow": 0, "outflow": 7602.74, "currency": "INR", "status": "posted", "paymentReference": "UTR7001"},
        {"id": "pay-2", "date": "2026-10-28", "reference": "7002", "disbursementNo": "", "type": "payment",
         "description": "Payment being verified", "inflow": 0, "outflow": 5000, "currency": "INR", "status": "pending", "paymentReference": "UTR7002"},
    ],
    "schedule": [{"disbursementNo": "23000068", "instalment": 1, "dueDate": "2026-10-31", "kind": "interest", "description": "Interest",
                  "amount": 7857.53, "paid": 3000, "outstanding": 4857.53, "status": "overdue"}],
    "payments": [{"receiptNo": "7001", "paymentDate": "2026-10-05", "reference": "UTR7001", "amount": 12000, "status": "confirmed"}],
    "summary": {"disbursed": 1000000, "outstanding": 1004857.53},
    "available": {"flows": True, "schedule": True, "payments": True, "allocations": True},
}


class FakeLas(BaseHTTPRequestHandler):
    calls = []
    answer = None

    def do_GET(self):  # noqa: N802 - http.server's name
        url = urlparse(self.path)
        FakeLas.calls.append({"path": url.path, "query": parse_qs(url.query), "key": self.headers.get("X-Portal-Key")})
        if self.headers.get("X-Portal-Key") != KEY:
            return self._send(401, {"error": "Invalid or missing X-Portal-Key."})
        if FakeLas.answer:
            return self._send(*FakeLas.answer)
        if url.path == "/api/customer-portal/finance":
            return self._send(200, FINANCE)
        return self._send(404, {"error": "Not found."})

    def _send(self, status, body):
        data = json.dumps(body).encode() if not isinstance(body, bytes) else body
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

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
    path = tmp_path / "finance.db"
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE vendor (vendor_id INTEGER PRIMARY KEY, email TEXT, status TEXT, submission_round INTEGER);
        INSERT INTO vendor VALUES (84, 'c@x.test', 'active', 1), (85, 'd@x.test', 'Pending', 1);
    """)
    db.close()
    monkeypatch.setattr(auth, "get_connection", lambda: sqlite_db.Connection(path))
    monkeypatch.setenv("LAS_API_URL", las)
    monkeypatch.setenv("PORTAL_JOURNEY_KEY", KEY)
    FakeLas.calls.clear()
    FakeLas.answer = None
    return portal.app.test_client()


def signed_in(vendor_id):
    return {"Authorization": f"Bearer {auth.issue_token(vendor_id, 'c@x.test')}"}


def test_sign_in_is_required(client):
    assert client.get("/vendors/me/finance").status_code == 401
    assert client.get("/vendors/me/finance/statement?section=transactions&format=pdf").status_code == 401
    assert FakeLas.calls == []


def test_finance_is_the_signed_in_customers_with_the_key_server_side(client):
    r = client.get("/vendors/me/finance", headers=signed_in(84))
    assert r.status_code == 200
    assert r.get_json()["summary"]["outstanding"] == 1004857.53 and r.get_json()["stage"] == "active"
    assert FakeLas.calls == [{"path": "/api/customer-portal/finance", "query": {"portalId": ["84"]}, "key": KEY}]
    assert KEY not in r.get_data(as_text=True)


def test_another_customers_id_in_the_request_is_refused(client):
    assert client.get("/vendors/me/finance?vendor_id=85", headers=signed_in(84)).status_code == 403
    assert client.get("/vendors/me/finance?portalId=85", headers=signed_in(84)).get_json()["customerNo"] == "100440"
    # Whatever the browser adds, LAS is asked about the token's customer only.
    assert all(call["query"]["portalId"] == ["84"] for call in FakeLas.calls)


def test_before_onboarding_is_approved_there_is_nothing_and_no_call(client):
    r = client.get("/vendors/me/finance", headers=signed_in(85))
    assert r.status_code == 200 and r.get_json() == {"onboarded": False, "stage": "maker_review"}
    assert client.get("/vendors/me/finance/statement?section=transactions&format=pdf", headers=signed_in(85)).status_code == 403
    assert FakeLas.calls == []


@pytest.mark.parametrize("setup", ["wrong_key", "no_url", "las_down", "las_failed", "not_json"])
def test_failures_reach_the_customer_in_plain_words(client, monkeypatch, setup):
    if setup == "wrong_key":
        monkeypatch.setenv("PORTAL_JOURNEY_KEY", "something-else")
    elif setup == "no_url":
        monkeypatch.delenv("LAS_API_URL")
    elif setup == "las_down":
        monkeypatch.setenv("LAS_API_URL", "http://127.0.0.1:9")
    elif setup == "las_failed":
        FakeLas.answer = (503, {"error": "SAP said: ZFS_LAS_WEB_T008 dump"})
    else:
        FakeLas.answer = (200, b"<html>not json</html>")
    r = client.get("/vendors/me/finance", headers=signed_in(84))
    assert r.status_code == 503
    text = r.get_data(as_text=True)
    assert "ZFS_" not in text and "SAP" not in text and KEY not in text


def test_the_excel_statement_lists_exactly_the_filtered_rows(client):
    r = client.get("/vendors/me/finance/statement?section=transactions&format=xlsx&from=2026-10-01&status=posted", headers=signed_in(84))
    assert r.status_code == 200
    assert r.mimetype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert r.headers["Content-Disposition"].startswith('attachment; filename="Transactions_Statement_')
    with zipfile.ZipFile(io.BytesIO(r.get_data())) as book:
        assert book.testzip() is None
        sheet = book.read("xl/worksheets/sheet1.xml").decode()
    # The posted interest payment of October only: not September's disbursement, not the pending payment.
    assert "UTR7001" in sheet and "Interest payment" in sheet and "<v>7602.74</v>" in sheet
    assert "Loan disbursement" not in sheet and "UTR7002" not in sheet


def test_the_pdf_statement_is_a_pdf(client):
    r = client.get("/vendors/me/finance/statement?section=schedule&format=pdf", headers=signed_in(84))
    assert r.status_code == 200 and r.mimetype == "application/pdf"
    assert r.get_data()[:5] == b"%PDF-"


@pytest.mark.parametrize("query", [
    "section=ledger&format=pdf", "section=transactions&format=csv", "section=transactions&format=pdf&from=01-10-2026",
    "section=transactions&format=pdf&from=2026-10-02&to=2026-10-01", "section=transactions&format=pdf&type=x'%20or%201=1",
])
def test_a_bad_selection_is_refused(client, query):
    assert client.get(f"/vendors/me/finance/statement?{query}", headers=signed_in(84)).status_code == 400


def test_a_section_las_could_not_read_has_no_statement(client):
    FakeLas.answer = (200, {**FINANCE, "schedule": None, "available": {**FINANCE["available"], "schedule": False}})
    r = client.get("/vendors/me/finance/statement?section=schedule&format=xlsx", headers=signed_in(84))
    assert r.status_code == 409


def test_filters_match_the_screen():
    rows = FINANCE["transactions"]
    assert [r["id"] for r in customer_finance.filtered(rows, "transactions", {"type": "disbursement"})] == ["disb-23000068"]
    assert [r["id"] for r in customer_finance.filtered(rows, "transactions", {"disbursement": "23000068", "to": "2026-09-30"})] == ["disb-23000068"]
    assert customer_finance.filtered(None, "payments", {}) == []
    assert customer_finance._money_text(1234567.8) == "12,34,567.80"
    assert customer_finance._money_text(567) == "567.00"
