"""Who sees which invoice (app._vendor_invoice_ids, behind GET /invoices, Home and Activity), on a real SQLite database.

A customer sees what they uploaded, plus what a Relationship Manager uploaded for their GSTIN, but only when no other
active account has that GSTIN: an upload whose customer cannot be told apart is shown to nobody, never to everyone."""
import sqlite3

import pytest

import app as portal
import auth
import customer_home
import sqlite_db

SCHEMA = """
    CREATE TABLE vendor (vendor_id INTEGER PRIMARY KEY, email TEXT, status TEXT, submission_round INTEGER, gstin TEXT);
    CREATE TABLE invoices (id INTEGER PRIMARY KEY, vendor_id TEXT, vendor_tax_id TEXT, status TEXT, invoice_number TEXT,
                           created_at DATETIME, submission_round INTEGER);
    CREATE TABLE invoice_tax_details (id INTEGER PRIMARY KEY, invoice_id INTEGER);
    CREATE TABLE invoice_line_items (id INTEGER PRIMARY KEY, invoice_id INTEGER, line_number INTEGER);
    CREATE TABLE vendor_agreement (agreement_id INTEGER PRIMARY KEY, vendor_id INTEGER, version INTEGER, status TEXT,
                                   agreement_no TEXT, terms_json TEXT, expires_at DATETIME, signed_at DATETIME, declined_at DATETIME);
    CREATE TABLE vendor_update_request (request_id INTEGER PRIMARY KEY, vendor_id INTEGER, status TEXT);
"""
UNIQUE, SHARED = "27UNIQ1111A1Z1", "27SHAR2222B1Z2"


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "inv.db"
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO vendor VALUES (?, ?, ?, ?, ?)", [
        (10, "a@x.test", "active", 1, UNIQUE),
        (11, "b@x.test", "active", 1, f" {SHARED.lower()} "),  # stored with spaces and in lower case
        (12, "c@x.test", "Active", 1, SHARED),     # a second active account with the same GSTIN
        (13, "d@x.test", "Rejected", 1, UNIQUE),   # not active: does not make 10's GSTIN shared
        (14, "e@x.test", "registered", 0, UNIQUE),  # nor does a sign-up that never got further
    ])
    db.executemany("INSERT INTO invoices (id, vendor_id, vendor_tax_id, status, invoice_number) VALUES (?, ?, ?, ?, ?)", [
        (1, "10", None, "pending", "OWN-10"),
        (2, "maker", f" {UNIQUE.lower()} ", "Approved", "RM-UNIQ"),   # RM upload for 10, GSTIN with spaces and case
        (3, "11", None, "Rejected", "OWN-11"),
        (4, "maker", SHARED, "Returned to Vendor", "RM-SHARED"),     # RM upload for 11 or 12: cannot tell
        (5, "12", None, "Approved", "OWN-12"),
        (6, "maker", "27OTHR3333C1Z3", "Approved", "RM-OTHER"),      # nobody's
    ])
    db.commit()
    db.close()
    connect = lambda: sqlite_db.Connection(path)  # noqa: E731
    for module in (auth, portal, customer_home):
        monkeypatch.setattr(module, "get_connection", connect)
    return portal.app.test_client()


def numbers(client, vendor_id, as_vendor=None):
    h = {"Authorization": f"Bearer {auth.issue_token(as_vendor or vendor_id, 'x@x.test')}"}
    r = client.get(f"/invoices?vendor_id={vendor_id}", headers=h)
    return r.status_code, sorted(i["invoice_number"] for i in (r.get_json() if r.status_code == 200 else []))


def test_own_uploads_and_the_rm_upload_for_a_gstin_only_this_account_has(client):
    assert numbers(client, 10) == (200, ["OWN-10", "RM-UNIQ"])
    body = client.get("/invoices?vendor_id=10", headers={"Authorization": f"Bearer {auth.issue_token(10, 'x')}"}).get_json()
    assert {i["invoice_number"]: i["uploaded_by_type"] for i in body} == {"OWN-10": "vendor", "RM-UNIQ": "maker"}


def test_an_rm_upload_for_a_gstin_two_active_accounts_share_is_shown_to_neither(client):
    assert numbers(client, 11) == (200, ["OWN-11"])
    assert numbers(client, 12) == (200, ["OWN-12"])


def test_another_customers_invoices_cannot_be_asked_for(client):
    assert numbers(client, 11, as_vendor=10) == (403, [])
    assert numbers(client, 10, as_vendor=12)[0] == 403


def test_home_counts_the_same_invoices_as_the_list(client):
    h = lambda v: {"Authorization": f"Bearer {auth.issue_token(v, 'x')}"}  # noqa: E731
    assert client.get("/vendors/me/home", headers=h(10)).get_json()["invoices"]["total"] == 2
    assert client.get("/vendors/me/home", headers=h(11)).get_json()["invoices"]["total"] == 1
