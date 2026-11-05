"""The LAS maker / checker API (las_integration.py), run against a throwaway SQLite database through sqlite_db."""
import sqlite3

import pytest

import app as portal
import las_integration
import sqlite_db

KEY = "test-las-key"
SCHEMA = """
CREATE TABLE vendor (vendor_id INTEGER PRIMARY KEY, email TEXT, vendor_legal_name TEXT, pan TEXT, gstin TEXT, demat_id TEXT,
  status TEXT, submission_round INTEGER, submitted_at DATETIME, source TEXT, is_draft INTEGER, returned_at DATETIME);
CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT, entity_id TEXT, action TEXT, actor TEXT, before_value TEXT,
  after_value TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE vendor_rejection (rejection_id INTEGER PRIMARY KEY AUTOINCREMENT, vendor_id INTEGER NOT NULL, round_no INTEGER NOT NULL,
  rejected_by_role TEXT NOT NULL, rejected_by TEXT, overall_remark TEXT, bulk_batch_id TEXT,
  rejected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, resubmitted_at TIMESTAMP);
CREATE TABLE vendor_rejection_item (item_id INTEGER PRIMARY KEY AUTOINCREMENT, rejection_id INTEGER NOT NULL, reason_code TEXT NOT NULL,
  field_key TEXT, field_label TEXT NOT NULL, reason_label TEXT NOT NULL, remark TEXT, fixed_at TIMESTAMP);
CREATE TABLE rejection_reason (reason_id INTEGER PRIMARY KEY, reason_code TEXT NOT NULL, section TEXT NOT NULL, field_key TEXT,
  field_label TEXT NOT NULL, reason_label TEXT NOT NULL, locked_by_gstin INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0);
INSERT INTO rejection_reason (reason_id, reason_code, section, field_key, field_label, reason_label) VALUES
  (1, 'PAN_INVALID', 'Vendor', 'pan', 'PAN', 'PAN invalid or does not match GSTIN');
INSERT INTO vendor VALUES
  (84, 'c@x.test', 'Osprey', 'ABCDE1234F', NULL, '12081600', 'Pending', 1, '2026-10-27 14:53:45', 'self_service', 0, NULL),
  (85, 'd@x.test', 'Kestrel', 'ABCDE1234G', NULL, NULL, '01', 1, '2026-10-26 10:00:00', 'self_service', 0, NULL),
  (86, 'e@x.test', 'Maker-made', 'ABCDE1234H', NULL, NULL, 'Pending', 0, NULL, NULL, 0, NULL),
  (87, 'f@x.test', 'Draft', 'ABCDE1234J', NULL, NULL, 'registered', 0, NULL, 'self_service', 0, NULL);
"""


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "las.db"
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    db.close()
    monkeypatch.setattr(las_integration, "get_connection", lambda: sqlite_db.Connection(path))
    monkeypatch.setitem(las_integration.deps, "profile_fields", lambda: ["vendor_id", "email", "vendor_legal_name", "pan", "gstin", "demat_id", "status", "submission_round", "submitted_at"])
    monkeypatch.setitem(las_integration.deps, "documents", lambda vendor_id: [{"type": "pan", "blob_name": f"vendor_{vendor_id}/pan.pdf"}])
    monkeypatch.setenv("LAS_INTEGRATION_KEY", KEY)
    c = portal.app.test_client()
    c.path = path
    return c


def call(client, method, url, **kwargs):
    return getattr(client, method)(url, headers={"X-LAS-Key": KEY}, **kwargs)


def status_of(client, vendor_id):
    return sqlite3.connect(client.path).execute("SELECT status FROM vendor WHERE vendor_id = ?", (vendor_id,)).fetchone()[0]


def test_key_is_required(client, monkeypatch):
    assert client.get("/las/applications").status_code == 401
    assert client.get("/las/applications", headers={"X-LAS-Key": "wrong"}).status_code == 401
    monkeypatch.delenv("LAS_INTEGRATION_KEY")
    assert call(client, "get", "/las/applications").status_code == 503


def test_queues_list_only_submitted_portal_applications(client):
    assert [a["id"] for a in call(client, "get", "/las/applications").get_json()] == [84]
    assert [a["id"] for a in call(client, "get", "/las/applications?queue=checker").get_json()] == [85]
    assert {a["id"] for a in call(client, "get", "/las/applications?queue=all").get_json()} == {84, 85}


def test_application_details_include_demat_and_documents(client):
    body = call(client, "get", "/las/applications/84").get_json()
    assert body["queue"] == "maker" and body["details"]["demat_id"] == "12081600"
    assert body["documents"] == [{"type": "pan", "blob_name": "vendor_84/pan.pdf"}]
    assert call(client, "get", "/las/applications/86").status_code == 404  # not a portal application


def test_maker_submits_then_checker_approves(client):
    r = call(client, "post", "/las/applications/84/actions", json={"role": "maker", "action": "submit", "by": "maker"})
    assert r.status_code == 200 and r.get_json()["queue"] == "checker" and status_of(client, 84) == "01"
    r = call(client, "post", "/las/applications/84/actions", json={"role": "checker", "action": "approve", "by": "checker"})
    assert r.status_code == 200 and r.get_json()["stage"] == "active" and status_of(client, 84) == "active"


def test_acting_out_of_turn_is_refused(client):
    r = call(client, "post", "/las/applications/84/actions", json={"role": "checker", "action": "approve"})
    assert r.status_code == 409 and status_of(client, 84) == "Pending"


def test_return_to_customer_records_the_flagged_fields(client):
    r = call(client, "post", "/las/applications/84/actions", json={
        "role": "maker", "action": "return", "by": "maker", "remark": "Please fix",
        "items": [{"reason_code": "PAN_INVALID", "remark": "Typo"}, {"field_key": "demat_id", "remark": "Wrong Demat ID"}],
    })
    assert r.status_code == 200 and status_of(client, 84) == "returned"
    db = sqlite3.connect(client.path)
    assert db.execute("SELECT rejected_by_role, rejected_by, overall_remark FROM vendor_rejection").fetchall() == [("maker", "maker", "Please fix")]
    assert db.execute("SELECT reason_code, field_key, field_label, remark FROM vendor_rejection_item ORDER BY item_id").fetchall() == [
        ("PAN_INVALID", "pan", "PAN", "Typo"), ("OTHER", "demat_id", "Demat ID", "Wrong Demat ID")]


@pytest.mark.parametrize("items, error", [([{"reason_code": "NOPE"}], "Unknown reason_code"), ([{"field_key": "demat_id"}], "remark is needed"),
                                          ([{"field_key": "password", "remark": "x"}], "Unknown field_key")])
def test_bad_return_items_change_nothing(client, items, error):
    r = call(client, "post", "/las/applications/84/actions", json={"role": "maker", "action": "return", "items": items})
    assert r.status_code == 400 and error in r.get_json()["error"] and status_of(client, 84) == "Pending"


def test_checker_returns_to_maker_and_rejects_with_remark_only(client):
    assert call(client, "post", "/las/applications/85/actions", json={"role": "checker", "action": "return", "to": "maker"}).status_code == 200
    assert status_of(client, 85) == "Pending"
    assert call(client, "post", "/las/applications/85/actions", json={"role": "maker", "action": "reject"}).status_code == 400
    assert call(client, "post", "/las/applications/85/actions", json={"role": "maker", "action": "reject", "remark": "Fraud"}).status_code == 200
    assert status_of(client, 85) == "Rejected"


def test_return_reasons(client):
    assert call(client, "get", "/las/return-reasons").get_json()[0]["reason_code"] == "PAN_INVALID"
