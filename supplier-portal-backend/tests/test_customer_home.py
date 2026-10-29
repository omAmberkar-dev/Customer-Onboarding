"""Home and Activity (customer_home.py) on a real SQLite database: each customer sees only their own invoices (including
those a maker uploaded for their GSTIN), agreements and change requests; statuses are grouped the way the customer reads
them; a section that cannot be read is reported as unavailable, never as zero; and Activity shows only customer-facing
events, without staff names, internal routing or SAP synchronisation."""
import json
import sqlite3

import pytest

import app as portal
import auth
import customer_home
import sqlite_db

SCHEMA = """
    CREATE TABLE vendor (vendor_id INTEGER PRIMARY KEY, email TEXT, status TEXT, submission_round INTEGER, gstin TEXT);
    CREATE TABLE invoices (id INTEGER PRIMARY KEY, vendor_id TEXT, vendor_tax_id TEXT, status TEXT, invoice_number TEXT,
                           created_at DATETIME);
    CREATE TABLE audit_log (id INTEGER PRIMARY KEY, entity_type TEXT, entity_id TEXT, action TEXT, actor TEXT,
                            before_value TEXT, after_value TEXT, created_at DATETIME);
    CREATE TABLE vendor_agreement (agreement_id INTEGER PRIMARY KEY, agreement_no TEXT, vendor_id INTEGER, version INTEGER,
                                   status TEXT, terms_json TEXT, expires_at DATETIME, signed_at DATETIME, declined_at DATETIME);
    CREATE TABLE agreement_event (event_id INTEGER PRIMARY KEY, agreement_id INTEGER, event_type TEXT, actor TEXT, detail TEXT,
                                  ip TEXT, created_at DATETIME);
    CREATE TABLE vendor_update_request (request_id INTEGER PRIMARY KEY, vendor_id INTEGER, status TEXT, requested_at DATETIME,
                                        checker_actioned_at DATETIME);
"""
TERMS = json.dumps({"start_iso": "2026-10-01", "end_iso": "2027-09-30"})


def seed(db):
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO vendor VALUES (?, ?, ?, ?, ?)", [
        (84, "a@x.test", "active", 1, "27AAAAA1111A1Z1"),
        (86, "b@x.test", "active", 1, "27BBBBB2222B1Z2"),
        (85, "c@x.test", "pending", 1, None),
    ])
    db.executemany("INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?)", [
        (1, "84", None, "Pending Approval", "INV-A1", "2026-10-01 09:00:00"),
        (2, "84", None, "Approved", "INV-A2", "2026-10-02 09:00:00"),
        (3, "84", None, "Returned to Vendor", "INV-A3", "2026-10-03 09:00:00"),
        (4, "84", None, "Something New", "INV-A4", "2026-10-04 09:00:00"),
        (5, "maker", " 27aaaaa1111a1z1 ", "Sent for Approval", "INV-A5", "2026-10-05 09:00:00"),  # for 84, by GSTIN
        (6, "86", None, "Rejected", "INV-B1", "2026-10-06 09:00:00"),
        (7, "maker", "27BBBBB2222B1Z2", "Approved", "INV-B2", "2026-10-07 09:00:00"),  # for 86
    ])
    db.executemany("INSERT INTO audit_log (entity_type, entity_id, action, actor, before_value, after_value, created_at) "
                   "VALUES (?, ?, ?, ?, ?, ?, ?)", [
        ("invoice", "2", "status_changed", "checker", '{"status": "Sent for Approval"}',
         '{"status": "Pending Authorization", "routed_to": "authorizer", "threshold": 100000.0}', "2026-10-08 10:00:00"),
        ("invoice", "2", "status_changed", "authorizer", '{"status": "Pending Authorization"}', '{"status": "Approved"}',
         "2026-10-09 10:00:00"),
        ("invoice", "2", "gl_account_assigned", "maker", None, '{"gl": "400100"}', "2026-10-08 09:00:00"),
        ("invoice", "2", "sap_sync_failed", "system", None, '{"error": "ZFS dump"}', "2026-10-09 11:00:00"),
        ("invoice", "3", "returned", "checker", None, None, "2026-10-10 10:00:00"),
        ("invoice", "6", "rejected", "checker", None, None, "2026-10-11 10:00:00"),  # 86's
        ("vendor", "84", "sap_business_partner_created", "checker", None, '{"partner": "100440"}', "2026-09-20 10:00:00"),
        ("vendor", "84", "approval_recorded", "checker-jane", None, None, "2026-09-20 09:00:00"),
        ("vendor", "84", "action_refused_on_hold", "system", None, None, "2026-09-21 09:00:00"),
        ("vendor", "86", "returned", "maker", None, None, "2026-09-22 09:00:00"),
    ])
    db.executemany("INSERT INTO vendor_agreement VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        (1, "AGR-1", 84, 1, "declined", TERMS, "2026-09-30 00:00:00", None, "2026-09-25 10:00:00"),
        (2, "AGR-2", 84, 2, "signed", TERMS, "2026-10-15 00:00:00", "2026-09-28 10:00:00", None),
        (3, "AGR-3", 86, 1, "sent", TERMS, "2999-01-01 00:00:00", None, None),
    ])
    db.executemany("INSERT INTO agreement_event (agreement_id, event_type, actor, created_at) VALUES (?, ?, ?, ?)", [
        (2, "issued", "checker", "2026-09-26 10:00:00"),
        (2, "viewed", "vendor", "2026-09-27 10:00:00"),
        (2, "signed", "vendor", "2026-09-28 10:00:00"),
        (3, "issued", "checker", "2026-09-29 10:00:00"),
    ])
    db.executemany("INSERT INTO vendor_update_request VALUES (?, ?, ?, ?, ?)", [
        (11, 84, "approved", "2026-10-12 10:00:00", "2026-10-13 10:00:00"),
        (12, 84, "sent for approval", "2026-10-14 10:00:00", None),
        (13, 86, "update requested", "2026-10-15 10:00:00", None),
    ])


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "home.db"
    db = sqlite3.connect(path)
    seed(db)
    db.commit()
    db.close()
    connect = lambda: sqlite_db.Connection(path)  # noqa: E731
    monkeypatch.setattr(auth, "get_connection", connect)
    monkeypatch.setattr(customer_home, "get_connection", connect)
    client = portal.app.test_client()
    client.db_path = path
    return client


def signed_in(vendor_id):
    return {"Authorization": f"Bearer {auth.issue_token(vendor_id, 'x@x.test')}"}


def test_sign_in_is_required(client):
    assert client.get("/vendors/me/home").status_code == 401
    assert client.get("/vendors/me/activity").status_code == 401


def test_another_customers_id_is_refused(client):
    assert client.get("/vendors/me/home?vendor_id=86", headers=signed_in(84)).status_code == 403
    assert client.get("/vendors/me/activity?vendor_id=86", headers=signed_in(84)).status_code == 403


def test_home_counts_only_the_customers_own_records(client):
    body = client.get("/vendors/me/home", headers=signed_in(84)).get_json()
    assert body["stage"] == "active" and body["unavailable"] == []
    # 4 uploaded by 84, plus the maker's upload for 84's GSTIN; none of 86's.
    assert body["invoices"] == {"total": 5, "in_review": 2, "approved": 1, "returned": 1, "rejected": 0, "other": 1}
    assert body["agreement"] == {
        "agreement_no": "AGR-2", "version": 2, "status": "signed", "awaiting_signature": False, "signing_link_expired": False,
        "valid_from": "2026-10-01", "valid_until": "2027-09-30", "signing_link_expires_at": None,
        "signed_at": "2026-09-28T10:00:00",
    }
    assert body["change_requests"] == {"open": 1, "total": 2}

    other = client.get("/vendors/me/home", headers=signed_in(86)).get_json()
    assert other["invoices"] == {"total": 2, "in_review": 0, "approved": 1, "returned": 0, "rejected": 1, "other": 0}
    assert other["agreement"]["awaiting_signature"] is True and other["agreement"]["signing_link_expires_at"]
    assert other["change_requests"] == {"open": 1, "total": 1}


def test_before_onboarding_is_approved_only_the_agreement_section_is_read(client):
    body = client.get("/vendors/me/home", headers=signed_in(85)).get_json()
    assert body == {"stage": "maker_review", "invoices": None, "agreement": None, "change_requests": None, "unavailable": []}


def test_a_section_that_cannot_be_read_is_unavailable_not_zero(client):
    db = sqlite3.connect(client.db_path)
    db.execute("DROP TABLE vendor_update_request")
    db.commit()
    db.close()
    body = client.get("/vendors/me/home", headers=signed_in(84)).get_json()
    assert body["change_requests"] is None and body["unavailable"] == ["change_requests"]
    assert body["invoices"]["total"] == 5 and body["agreement"]["agreement_no"] == "AGR-2"
    activity = client.get("/vendors/me/activity", headers=signed_in(84)).get_json()
    assert activity["unavailable"] == ["change_request"] and activity["events"]


def test_activity_is_the_customers_own_events_newest_first_in_their_words(client):
    r = client.get("/vendors/me/activity", headers=signed_in(84))
    assert r.status_code == 200
    events = r.get_json()["events"]
    assert [e["at"] for e in events] == sorted((e["at"] for e in events), reverse=True)
    titles = [(e["title"], e["reference"]) for e in events]
    assert titles[:4] == [
        ("Change request submitted", "CR-12"),
        ("Change request approved", "CR-11"),
        ("Change request submitted", "CR-11"),
        ("Invoice returned to you for correction", "INV-A3"),
    ]
    assert ("Invoice approved", "INV-A2") in titles
    assert ("Agreement signed", "AGR-2") in titles and ("Agreement issued for your signature", "AGR-2") in titles
    assert ("Customer account set up", None) in titles
    assert ("Invoice uploaded", "INV-A5") in titles  # the maker's upload for this customer
    # Internal steps, other customers and staff details never appear.
    text = r.get_data(as_text=True)
    for hidden in ("INV-B", "AGR-3", "CR-13", "authorizer", "threshold", "checker", "400100", "ZFS", "100440", "viewed", "hold"):
        assert hidden not in text, hidden
    assert len([t for t, _ in titles if t == "Invoice approved"]) == 1


def test_activity_limit(client):
    assert len(client.get("/vendors/me/activity?limit=2", headers=signed_in(84)).get_json()["events"]) == 2
    assert client.get("/vendors/me/activity?limit=abc", headers=signed_in(84)).status_code == 400


def test_activity_before_onboarding_is_approved_has_no_invoice_or_change_request_events(client):
    body = client.get("/vendors/me/activity", headers=signed_in(85)).get_json()
    assert body == {"events": [], "unavailable": []}
