"""The return-for-correction lifecycle, end to end through the real endpoints on a throwaway SQLite database built by
import_sqlite.py from a MySQL-style dump (the shape of the portal's tables), not a fake: the customer signs up and submits, the
LAS maker returns it with a remark and flagged fields, the customer sees the return and corrects and resubmits (same application,
round 2, round 1 kept), it is back in the maker's queue, the checker sends it back to the maker (same round), and it is approved.
Every step is checked in the database (status, rounds, returns, snapshots, audit rows), the customer signs in again between
steps, and what the customer sees never names a reviewer. Only the outside services (email, email / phone / PAN verification,
document storage) are stubbed."""
import json
import sqlite3

import pytest

import app as portal
import customer_finance
import import_sqlite
import notifications_feed
import phone_verification
import sqlite_db
import verification

KEY = "lifecycle-las-key"
MAKER, CHECKER = "Maker Mia", "Checker Chandra"  # LAS usernames: internal, never shown to the customer

# The portal tables the lifecycle touches, as a MySQL dump has them (import_sqlite.py turns this into SQLite and adds the demat
# columns). vendor_submission is vendor_submission.sql in dump form.
DUMP = """CREATE TABLE `vendor` (
  `vendor_id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(10) DEFAULT NULL,
  `name` varchar(200) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `contact_no` varchar(20) DEFAULT NULL,
  `vendor_legal_name` varchar(200) DEFAULT NULL,
  `vendor_type` varchar(50) DEFAULT NULL,
  `year_established` varchar(4) DEFAULT NULL,
  `currency` varchar(3) DEFAULT NULL,
  `registration_number` varchar(50) DEFAULT NULL,
  `msme_status` varchar(30) DEFAULT NULL,
  `udyam_number` varchar(30) DEFAULT NULL,
  `assigned_rm` varchar(100) DEFAULT NULL,
  `gstin` varchar(15) DEFAULT NULL,
  `pan` varchar(10) DEFAULT NULL,
  `aadhaar_no` varchar(12) DEFAULT NULL,
  `cin` varchar(21) DEFAULT NULL,
  `street` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `district` varchar(100) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `postal_code` varchar(10) DEFAULT NULL,
  `account_holder_name` varchar(200) DEFAULT NULL,
  `bank_name` varchar(200) DEFAULT NULL,
  `branch_name` varchar(200) DEFAULT NULL,
  `bank_account_no` varchar(18) DEFAULT NULL,
  `ifsc_code` varchar(11) DEFAULT NULL,
  `status` varchar(30) DEFAULT 'Pending',
  `password` varchar(64) DEFAULT NULL,
  `source` varchar(20) DEFAULT NULL,
  `is_draft` tinyint(1) NOT NULL DEFAULT '0',
  `submission_round` int NOT NULL DEFAULT '0',
  `submitted_at` datetime DEFAULT NULL,
  `returned_at` datetime DEFAULT NULL,
  `registered_at` datetime DEFAULT NULL,
  `correction_fields` text,
  `sap_vendor` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`vendor_id`)
) ENGINE=InnoDB;
CREATE TABLE `rejection_reason` (
  `reason_id` int NOT NULL AUTO_INCREMENT,
  `reason_code` varchar(40) NOT NULL,
  `section` varchar(40) NOT NULL,
  `field_key` varchar(40) DEFAULT NULL,
  `field_label` varchar(100) NOT NULL,
  `reason_label` varchar(200) NOT NULL,
  `locked_by_gstin` tinyint(1) DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `sort_order` int DEFAULT '0',
  PRIMARY KEY (`reason_id`)
) ENGINE=InnoDB;
CREATE TABLE `vendor_rejection` (
  `rejection_id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `round_no` int NOT NULL,
  `rejected_by_role` varchar(20) NOT NULL,
  `rejected_by` varchar(100) DEFAULT NULL,
  `overall_remark` text,
  `bulk_batch_id` varchar(40) DEFAULT NULL,
  `rejected_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resubmitted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`rejection_id`)
) ENGINE=InnoDB;
CREATE TABLE `vendor_rejection_item` (
  `item_id` int NOT NULL AUTO_INCREMENT,
  `rejection_id` int NOT NULL,
  `reason_code` varchar(40) NOT NULL,
  `field_key` varchar(40) DEFAULT NULL,
  `field_label` varchar(100) NOT NULL,
  `reason_label` varchar(200) NOT NULL,
  `remark` text,
  `fixed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`item_id`)
) ENGINE=InnoDB;
CREATE TABLE `audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entity_type` varchar(30) NOT NULL,
  `entity_id` varchar(40) NOT NULL,
  `action` varchar(60) NOT NULL,
  `actor` varchar(100) DEFAULT NULL,
  `before_value` text,
  `after_value` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
CREATE TABLE `vendor_submission` (
  `submission_id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `round_no` int NOT NULL,
  `details_json` longtext NOT NULL,
  `documents_json` longtext,
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`submission_id`),
  UNIQUE KEY `uq_vendor_submission_round` (`vendor_id`,`round_no`)
) ENGINE=InnoDB;
CREATE TABLE `vendor_agreement` (
  `agreement_id` int NOT NULL AUTO_INCREMENT,
  `agreement_no` varchar(30) NOT NULL,
  `vendor_id` int NOT NULL,
  `version` int NOT NULL,
  `status` varchar(20) NOT NULL,
  `terms_json` longtext,
  `unsigned_pdf_path` varchar(255) DEFAULT NULL,
  `unsigned_pdf_sha256` varchar(64) DEFAULT NULL,
  `signed_pdf_path` varchar(255) DEFAULT NULL,
  `signed_pdf_sha256` varchar(64) DEFAULT NULL,
  `issued_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `first_viewed_at` datetime DEFAULT NULL,
  `signed_at` datetime DEFAULT NULL,
  `signer_name` varchar(200) DEFAULT NULL,
  `declined_at` datetime DEFAULT NULL,
  `decline_reason` text,
  PRIMARY KEY (`agreement_id`)
) ENGINE=InnoDB;
CREATE TABLE `agreement_event` (
  `event_id` int NOT NULL AUTO_INCREMENT,
  `agreement_id` int NOT NULL,
  `event_type` varchar(40) NOT NULL,
  `actor` varchar(100) DEFAULT NULL,
  `detail` text,
  `ip` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`)
) ENGINE=InnoDB;
CREATE TABLE `customer_notification_read` (
  `vendor_id` int NOT NULL,
  `notification_id` varchar(120) NOT NULL,
  `read_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vendor_id`,`notification_id`)
) ENGINE=InnoDB;
CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` varchar(20) DEFAULT NULL,
  `vendor_tax_id` varchar(20) DEFAULT NULL,
  `invoice_number` varchar(50) DEFAULT NULL,
  `status` varchar(30) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
CREATE TABLE `vendor_update_request` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `status` varchar(30) NOT NULL,
  `requested_at` datetime DEFAULT NULL,
  `maker_actioned_at` datetime DEFAULT NULL,
  `checker_actioned_at` datetime DEFAULT NULL,
  PRIMARY KEY (`request_id`)
) ENGINE=InnoDB;
INSERT INTO `rejection_reason` (`reason_id`, `reason_code`, `section`, `field_key`, `field_label`, `reason_label`, `sort_order`) VALUES
(1, 'PAN_INVALID', 'Vendor', 'pan', 'PAN', 'PAN invalid or does not match GSTIN', 1),
(2, 'BANK_PROOF_UNCLEAR', 'Bank', 'doc_bank', 'Bank account proof', 'Document unclear or unreadable', 2);
"""

DETAILS = {
    "vendor_legal_name": "Osprey Securities Pvt Ltd", "vendor_type": "Organization", "currency": "INR", "year_established": "2011",
    "registration_number": "REG-2011-0042", "msme_status": "Registered", "udyam_number": "UDYAM-MH-01-0000042",
    "assigned_rm": "Priya Nair", "pan": "ABCDE1234F", "street": "4 Harbour Road", "city": "Mumbai", "district": "Mumbai",
    "region": "Maharashtra", "postal_code": "400001", "account_holder_name": "Osprey Securities Pvt Ltd", "bank_name": "Axis Bank",
    "branch_name": "Fort", "bank_account_no": "123456789012", "ifsc_code": "UTIB0000004", "demat_id": "12081600",
    "depository": "CDSL",
}


def build_database(path, dump_path):
    dump_path.write_text(DUMP, encoding="utf-8")
    import_sqlite.build(dump_path, path)


class Life:
    """The test client plus the database file, the emails "sent" and helpers for the customer and LAS calls."""

    def __init__(self, client, path, emails):
        self.client, self.path, self.emails = client, path, emails

    def db(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def one(self, sql, params=()):
        with self.db() as conn:
            row = conn.execute(sql, params).fetchone()
            return dict(row) if row else None

    def all(self, sql, params=()):
        with self.db() as conn:
            return [dict(r) for r in conn.execute(sql, params).fetchall()]

    def signup(self, email):
        r = self.client.post("/vendors/signup", json={"email": email, "contact_no": "+91 9876543210", "verification_id": "ev-1",
                                                      "phone_verification_id": "pv-1"})
        assert r.status_code == 201, r.get_json()
        return r.get_json()["vendor_id"]

    def login(self, email):
        """A fresh sign-in (a new token) with the password the signup email carried."""
        password = next(params["password"] for to, _, _, params in reversed(self.emails) if to == email and "password" in params)
        r = self.client.post("/vendors/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.get_json()
        return {"Authorization": f"Bearer {r.get_json()['token']}"}

    def las(self, method, url, key=KEY, **kwargs):
        headers = {"X-LAS-Key": key} if key is not None else {}
        return getattr(self.client, method)(url, headers=headers, **kwargs)

    def act(self, vendor_id, **body):
        return self.las("post", f"/las/applications/{vendor_id}/actions", json=body)


@pytest.fixture
def life(tmp_path, monkeypatch):
    path = tmp_path / "lifecycle.db"
    build_database(path, tmp_path / "dump.sql")
    monkeypatch.setenv("DB_ENGINE", "sqlite")
    monkeypatch.setattr(sqlite_db, "DB_PATH", path)
    monkeypatch.setattr(portal, "_demat_columns", None)  # worked out again from this database (it has the demat columns)
    monkeypatch.setenv("LAS_INTEGRATION_KEY", KEY)
    emails = []
    # The outside services only: email, the email / phone / PAN checks and document storage.
    monkeypatch.setattr(portal, "_send_email", lambda to, subject, template, params, cc=None: emails.append((to, subject, template, params)) or True)
    monkeypatch.setattr(portal, "_verified_email_error", lambda verification_id, email: None)
    monkeypatch.setattr(phone_verification, "verified_phone_error", lambda verification_id, phone: None)
    monkeypatch.setattr(verification, "enforce_on_submit", lambda values: None)
    monkeypatch.setattr(portal, "_docs_container", lambda: None)
    # An approved customer's bell also asks LAS; not part of this lifecycle.
    monkeypatch.setattr(notifications_feed, "_journey", lambda vendor_id: None)
    monkeypatch.setattr(customer_finance, "_finance", lambda: ({"error": "not connected"}, 503))
    portal.app.config["TESTING"] = True
    return Life(portal.app.test_client(), path, emails)


def submit(life, headers, **changes):
    return life.client.post("/vendors/me/submit", headers=headers, json={"details": {**DETAILS, **changes}})


def audit_rows(life, vendor_id):
    return life.all("SELECT action, actor, before_value, after_value FROM audit_log WHERE entity_type = 'vendor' AND entity_id = ? ORDER BY id",
                    (str(vendor_id),))


def bell(life, headers):
    r = life.client.get("/vendors/me/notifications", headers=headers)
    assert r.status_code == 200, r.get_json()
    return r.get_json()["items"]


def test_return_for_correction_and_resubmission_end_to_end(life):
    email = "osprey@example.test"
    vid = life.signup(email)
    headers = life.login(email)
    me = life.client.get("/vendors/me", headers=headers).get_json()
    assert (me["stage"], me["correction_history"], me["rejection"]) == ("draft", [], None)

    # 1. The customer submits: Pending, round 1, round 1 kept, audited.
    r = submit(life, headers)
    assert r.status_code == 200, r.get_json()
    assert (r.get_json()["stage"], r.get_json()["submission_round"]) == ("maker_review", 1)
    assert life.one("SELECT status, submission_round FROM vendor WHERE vendor_id = ?", (vid,)) == {"status": "Pending", "submission_round": 1}
    snap1 = life.one("SELECT round_no, details_json FROM vendor_submission WHERE vendor_id = ?", (vid,))
    assert snap1["round_no"] == 1 and json.loads(snap1["details_json"])["pan"] == "ABCDE1234F"
    assert [(a["action"], a["actor"]) for a in audit_rows(life, vid)] == [("submitted", "vendor")]

    # 2. It is in the LAS maker's queue; the maker returns it with a remark and flagged fields.
    assert [a["id"] for a in life.las("get", "/las/applications?queue=maker").get_json()] == [vid]
    r = life.act(vid, role="maker", action="return", by=MAKER, remark="Please correct the PAN and the Demat ID.",
                 items=[{"reason_code": "PAN_INVALID", "remark": "Does not match the PAN card"}, {"field_key": "demat_id", "remark": "Not found at CDSL"}])
    assert r.status_code == 200, r.get_json()
    row = life.one("SELECT status, submission_round, returned_at FROM vendor WHERE vendor_id = ?", (vid,))
    assert (row["status"], row["submission_round"]) == ("returned", 1) and row["returned_at"]
    assert life.all("SELECT round_no, rejected_by_role, rejected_by, overall_remark, resubmitted_at FROM vendor_rejection WHERE vendor_id = ?", (vid,)) == [
        {"round_no": 1, "rejected_by_role": "maker", "rejected_by": MAKER, "overall_remark": "Please correct the PAN and the Demat ID.", "resubmitted_at": None}]
    returned = audit_rows(life, vid)[-1]
    assert (returned["action"], returned["actor"]) == ("returned_for_correction", "maker")
    assert json.loads(returned["after_value"])["by"] == MAKER and json.loads(returned["before_value"]) == {"status": "Pending"}

    # A second return while this one is open is refused; nothing more is written.
    again = life.act(vid, role="maker", action="return", by=MAKER, remark="Again")
    assert again.status_code == 409
    assert life.one("SELECT COUNT(*) AS n FROM vendor_rejection WHERE vendor_id = ?", (vid,))["n"] == 1

    # 3. The customer signs in again and sees the return, its remark and flagged fields; no reviewer is named.
    headers = life.login(email)
    me = life.client.get("/vendors/me", headers=headers).get_json()
    assert me["stage"] == "returned" and me["vendor_id"] == vid
    assert me["rejection"]["overall_remark"] == "Please correct the PAN and the Demat ID."
    assert [(i["field_key"], i["fixed"]) for i in me["rejection"]["items"]] == [("pan", False), ("demat_id", False)]
    assert me["correction_history"] == []  # the open return is `rejection`; the history is what was already corrected
    assert MAKER not in json.dumps(me)
    items = bell(life, headers)
    ask = next(i for i in items if i["kind"] == "action")
    assert (ask["title"], ask["to"], ask["detail"]) == ("Corrections required", "/request-vendor",
                                                        ["Please correct the PAN and the Demat ID.", "By the maker", "Round 1"])
    assert MAKER not in json.dumps(items)
    activity = life.client.get("/vendors/me/activity", headers=headers).get_json()["events"]
    # (Every step here happens within a second, so the order of events is not checked, only what each says.)
    assert {e["title"] for e in activity} == {"Application returned to you for correction", "Application submitted"}
    assert MAKER not in json.dumps(activity)

    # LAS sees the round, the return with its reasons and who made it.
    history = life.las("get", f"/las/applications/{vid}").get_json()["history"]
    assert history["resubmitted"] is False and [r["round_no"] for r in history["rounds"]] == [1]
    assert history["rounds"][0]["returns"][0]["by"] == MAKER and history["rounds"][0]["details"]["pan"] == "ABCDE1234F"

    # 4. The customer corrects and resubmits: the same application, round 2, round 1 kept, the return closed, audited.
    r = submit(life, headers, pan="ABCDE1234K", demat_id="12081601")
    assert r.status_code == 200, r.get_json()
    assert (r.get_json()["vendor_id"], r.get_json()["stage"], r.get_json()["submission_round"]) == (vid, "maker_review", 2)
    assert life.one("SELECT COUNT(*) AS n FROM vendor WHERE LOWER(email) = ?", (email,))["n"] == 1
    assert [(s["round_no"], json.loads(s["details_json"])["pan"]) for s in life.all(
        "SELECT round_no, details_json FROM vendor_submission WHERE vendor_id = ? ORDER BY round_no", (vid,))] == [(1, "ABCDE1234F"), (2, "ABCDE1234K")]
    assert life.one("SELECT resubmitted_at FROM vendor_rejection WHERE vendor_id = ?", (vid,))["resubmitted_at"]
    assert [i["fixed_at"] is not None for i in life.all("SELECT fixed_at FROM vendor_rejection_item ORDER BY item_id")] == [True, True]
    resubmitted = audit_rows(life, vid)[-1]
    assert (resubmitted["action"], resubmitted["actor"], json.loads(resubmitted["after_value"])) == (
        "resubmitted", "vendor", {"status": "Pending", "round": 2, "snapshot": True})
    # No second submit while it is with the maker.
    assert submit(life, headers).status_code == 403
    assert life.one("SELECT submission_round FROM vendor WHERE vendor_id = ?", (vid,))["submission_round"] == 2

    # 5. Signed in again: in review, round 2, and the correction history in the customer's words.
    headers = life.login(email)
    me = life.client.get("/vendors/me", headers=headers).get_json()
    assert (me["stage"], me["submission_round"], me["rejection"]) == ("maker_review", 2, None)
    assert len(me["correction_history"]) == 1
    past = me["correction_history"][0]
    assert set(past) == {"round_no", "rejected_by_role", "overall_remark", "rejected_at", "resubmitted_at", "items"}
    assert (past["round_no"], past["rejected_by_role"], past["overall_remark"]) == (1, "maker", "Please correct the PAN and the Demat ID.")
    assert past["rejected_at"] and past["resubmitted_at"]
    assert past["items"] == [
        {"field_key": "pan", "field_label": "PAN", "reason_label": "PAN invalid or does not match GSTIN", "remark": "Does not match the PAN card", "fixed": True},
        {"field_key": "demat_id", "field_label": "Demat ID", "reason_label": "Needs correction", "remark": "Not found at CDSL", "fixed": True},
    ]
    assert MAKER not in json.dumps(me)
    items = {i["id"]: i for i in bell(life, headers)}
    assert items["onb-submitted-r2"]["title"] == "Resubmitted for review, round 2"
    assert not [i for i in items.values() if i["kind"] == "action"]  # nothing left to correct
    assert next(i for i in items.values() if i["stage"] == "returned")["title"] == "Your application was returned to you for correction"
    activity = life.client.get("/vendors/me/activity", headers=headers).get_json()["events"]
    assert ("Corrected application resubmitted for review", "Round 2") in {(e["title"], e["reference"]) for e in activity}

    # 6. Back in the maker's queue with its own id; LAS sees "resubmitted, round 2" and the earlier return.
    queue = life.las("get", "/las/applications?queue=maker").get_json()
    assert [(a["id"], a["submission_round"]) for a in queue] == [(vid, 2)]
    history = life.las("get", f"/las/applications/{vid}").get_json()["history"]
    assert history["resubmitted"] is True and history["current_round"] == 2
    assert [(r["round_no"], len(r["returns"]), (r["details"] or {}).get("pan")) for r in history["rounds"]] == [(1, 1, "ABCDE1234F"), (2, 0, "ABCDE1234K")]
    assert history["returns"][0]["resubmitted_at"] and history["returns"][0]["items"][0]["fixed"] is True

    # 7. Maker submits, the checker sends it back to the maker (same round, no customer return), maker submits, checker approves.
    assert life.act(vid, role="maker", action="submit", by=MAKER).status_code == 200
    assert life.one("SELECT status FROM vendor WHERE vendor_id = ?", (vid,))["status"] == "01"
    r = life.act(vid, role="checker", action="return", to="maker", by=CHECKER, remark="Check the bank proof")
    assert r.status_code == 200, r.get_json()
    assert life.one("SELECT status, submission_round FROM vendor WHERE vendor_id = ?", (vid,)) == {"status": "Pending", "submission_round": 2}
    assert life.one("SELECT COUNT(*) AS n FROM vendor_rejection WHERE vendor_id = ?", (vid,))["n"] == 1
    assert [a["id"] for a in life.las("get", "/las/applications?queue=maker").get_json()] == [vid]
    assert life.act(vid, role="maker", action="submit", by=MAKER).status_code == 200
    assert life.act(vid, role="checker", action="approve", by=CHECKER).status_code == 200
    assert life.one("SELECT status, submission_round FROM vendor WHERE vendor_id = ?", (vid,)) == {"status": "active", "submission_round": 2}
    assert [(a["action"], a["actor"], json.loads(a["after_value"])["status"]) for a in audit_rows(life, vid)] == [
        ("submitted", "vendor", "Pending"), ("returned_for_correction", "maker", "returned"), ("resubmitted", "vendor", "Pending"),
        ("approval_recorded", "maker", "01"), ("returned_to_maker", "checker", "Pending"), ("approval_recorded", "maker", "01"),
        ("approval_recorded", "checker", "active"),
    ]
    events = life.las("get", f"/las/applications/{vid}").get_json()["history"]["events"]
    assert events[4] == {"action": "returned_to_maker", "role": "checker", "by": CHECKER, "status": "Pending", "round_no": 2,
                         "remark": "Check the bank proof", "to": "maker", "at": events[4]["at"]}

    # 8. The approved customer, signed in again: the approval in their words, still no reviewer named.
    headers = life.login(email)
    activity = life.client.get("/vendors/me/activity", headers=headers).get_json()["events"]
    assert [e["title"] for e in activity].count("Application approved") == 1  # the maker's step to the checker stays internal
    feed = json.dumps(bell(life, headers)) + json.dumps(life.client.get("/vendors/me", headers=headers).get_json()) + json.dumps(activity)
    assert MAKER not in feed and CHECKER not in feed and "Check the bank proof" not in feed


def test_a_checker_return_to_the_customer_is_its_round_and_the_next_submit_the_next(life):
    vid = life.signup("kestrel@example.test")
    headers = life.login("kestrel@example.test")
    assert submit(life, headers).status_code == 200
    assert life.act(vid, role="maker", action="submit", by=MAKER).status_code == 200
    r = life.act(vid, role="checker", action="return", to="customer", by=CHECKER, items=[{"reason_code": "BANK_PROOF_UNCLEAR"}])
    assert r.status_code == 200, r.get_json()
    assert life.one("SELECT round_no, rejected_by_role FROM vendor_rejection WHERE vendor_id = ?", (vid,)) == {"round_no": 1, "rejected_by_role": "checker"}
    headers = life.login("kestrel@example.test")
    me = life.client.get("/vendors/me", headers=headers).get_json()
    assert me["stage"] == "returned" and me["rejection"]["rejected_by_role"] == "checker"
    assert submit(life, headers, confirmed_fields=["doc_bank"]).status_code == 200
    me = life.client.get("/vendors/me", headers=headers).get_json()
    assert me["submission_round"] == 2 and me["correction_history"][0]["rejected_by_role"] == "checker"
    assert me["correction_history"][0]["items"] == [{"field_key": "doc_bank", "field_label": "Bank account proof",
                                                     "reason_label": "Document unclear or unreadable", "remark": None, "fixed": False}]
    assert [a["id"] for a in life.las("get", "/las/applications?queue=maker").get_json()] == [vid]


def test_a_customer_sees_only_their_own_history_and_las_needs_its_key(life):
    a = life.signup("a@example.test")
    b = life.signup("b@example.test")
    ha, hb = life.login("a@example.test"), life.login("b@example.test")
    assert submit(life, ha).status_code == 200
    assert life.act(a, role="maker", action="return", by=MAKER, remark="Private remark for A").status_code == 200
    assert submit(life, ha).status_code == 200  # resubmitted: A now has a correction history
    me_b = life.client.get("/vendors/me", headers=hb).get_json()
    assert me_b["vendor_id"] == b and me_b["correction_history"] == [] and "Private remark for A" not in json.dumps(me_b)
    assert "Private remark for A" not in json.dumps(bell(life, hb))
    assert life.client.get(f"/vendors/me?vendor_id={a}", headers=hb).status_code == 403
    assert life.client.get("/vendors/me").status_code == 401
    assert life.client.get("/vendors/me", headers={"Authorization": "Bearer forged"}).status_code == 401
    # B cannot submit or act on A's application through the customer endpoints either.
    assert life.client.post("/vendors/me/submit", headers=hb, json={"vendor_id": a, "details": DETAILS}).status_code == 403

    # /las/* without the key, or with a wrong one (a customer's token is not a key), changes and shows nothing.
    for key in (None, "wrong-key"):
        assert life.las("get", f"/las/applications/{a}", key=key).status_code == 401
        assert life.las("get", "/las/applications?queue=maker", key=key).status_code == 401
        assert life.las("post", f"/las/applications/{a}/actions", key=key, json={"role": "maker", "action": "submit"}).status_code == 401
    assert life.client.get(f"/las/applications/{a}", headers=ha).status_code == 401
    assert life.one("SELECT status FROM vendor WHERE vendor_id = ?", (a,))["status"] == "Pending"


def test_submit_works_without_the_snapshot_table_and_says_so(life):
    with life.db() as conn:
        conn.execute("DROP TABLE vendor_submission")
    vid = life.signup("nosnap@example.test")
    headers = life.login("nosnap@example.test")
    r = submit(life, headers)
    assert r.status_code == 200 and r.get_json()["submission_round"] == 1
    assert json.loads(audit_rows(life, vid)[-1]["after_value"]) == {"status": "Pending", "round": 1, "snapshot": False}
    history = life.las("get", f"/las/applications/{vid}").get_json()["history"]
    assert history["unavailable"] == ["snapshots"] and history["rounds"] == [
        {"round_no": 1, "submitted_at": None, "details": None, "documents": None, "returns": []}]


def test_a_submit_that_loses_a_race_saves_nothing(life, monkeypatch):
    vid = life.signup("race@example.test")
    headers = life.login("race@example.test")
    assert submit(life, headers).status_code == 200
    assert life.act(vid, role="maker", action="return", by=MAKER, remark="Fix it").status_code == 200

    def other_submit_first(values):
        # Another submit of the same application commits while this one is between the guard and its write.
        with life.db() as conn:
            conn.execute("UPDATE vendor SET status = 'Pending', submission_round = 2 WHERE vendor_id = ?", (vid,))
        return None

    monkeypatch.setattr(verification, "enforce_on_submit", other_submit_first)
    r = submit(life, headers, pan="ZZZZZ9999Z")
    assert r.status_code == 409
    row = life.one("SELECT pan, submission_round FROM vendor WHERE vendor_id = ?", (vid,))
    assert (row["pan"], row["submission_round"]) == ("ABCDE1234F", 2)  # not saved, no third round
    assert life.one("SELECT COUNT(*) AS n FROM vendor_submission WHERE vendor_id = ?", (vid,))["n"] == 1
    assert life.one("SELECT resubmitted_at FROM vendor_rejection WHERE vendor_id = ?", (vid,))["resubmitted_at"] is None
    assert [a["action"] for a in audit_rows(life, vid)] == ["submitted", "returned_for_correction"]
