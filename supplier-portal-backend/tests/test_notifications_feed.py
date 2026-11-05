"""The header bell (notifications_feed.py): a notification for every stage of every workflow, worked out from the records
(the application, its agreement, invoices, change requests, and LAS's journey and finance answers), what needs the customer
on top, read marks kept per customer under ids that stay with each stage, LAS asked only once the customer is active, and
nothing invented when a source cannot be read or has no record."""
import json
import sqlite3
from datetime import date, timedelta

import pytest

import app as portal
import auth
import customer_finance
import customer_home
import notifications_feed
import sqlite_db

TODAY = date(2026, 11, 2)
FINANCE = {
    "onboarded": True,
    "facilities": [{"sanctionNo": "100411", "sanctionedAmount": 5000000, "sanctionDate": "2026-10-20"},
                   {"sanctionNo": "100300", "sanctionedAmount": 100, "sanctionDate": "2026-01-01"}],
    "drawdowns": [{"applicationNo": "501", "requestedAmount": 1000000, "disbursementNo": "23000068", "status": "disbursed",
                   "approvedOn": "2026-10-21", "disbursedOn": "2026-10-22", "disbursedAmount": 1000000},
                  {"applicationNo": "502", "requestedAmount": 5, "disbursementNo": "", "status": "pending_approval", "approvedOn": ""}],
    "payments": [{"receiptNo": "7001", "amount": 12000, "status": "confirmed", "paymentDate": "2026-10-28", "reference": "UTR1",
                  "allocations": [{"appliedOn": "2026-10-29"}]},
                 {"receiptNo": "7002", "amount": 5000, "status": "pending", "paymentDate": "2026-10-30", "reference": "UTR2"},
                 {"receiptNo": "7003", "amount": 900, "status": "rejected", "paymentDate": "2026-10-15", "reference": ""},
                 {"receiptNo": "7000", "amount": 1, "status": "confirmed", "paymentDate": "2026-06-01", "reference": ""}],
    "schedule": [{"dueDate": "2026-10-31", "status": "overdue"}],
    "summary": {"overdue": 4857.53, "nextDue": {"date": "2026-11-05", "total": 7800}},
}
JOURNEY = {
    "onboarded": True,
    "sanctions": [
        {"id": "1000-12", "sanctionNo": "", "requestNo": "12", "limit": 5000000, "stage": "returned_to_maker", "stageHistory": [
            {"key": "raised", "label": "Raised by your relationship manager", "on": "2026-10-20"},
            {"key": "with_checker", "label": "Sent to the checker for approval", "on": "2026-10-20"},
            {"key": "returned_to_maker", "label": "Returned to your relationship manager for correction", "on": "2026-10-30"}]},
        {"id": "1000-11", "sanctionNo": "100411", "requestNo": "11", "limit": 5000000, "stage": "approved", "stageHistory": [
            {"key": "raised", "label": "Raised by your relationship manager", "on": "2026-08-25"},
            {"key": "with_checker", "label": "Sent to the checker for approval", "on": "2026-08-25"},
            {"key": "approved", "label": "Approved", "on": "2026-10-20"}]},
    ],
    "drawdowns": [
        {"id": "1000-501", "requestNo": "501", "drawdownNo": "23000068", "amount": 1000000, "stage": "disbursed", "stageHistory": [
            {"key": "raised", "label": "Raised by your relationship manager", "on": "2026-10-19"},
            {"key": "with_checker", "label": "Sent to the checker for approval", "on": "2026-10-19"},
            {"key": "approved", "label": "Approved", "on": ""},
            {"key": "disbursed", "label": "Amount disbursed", "on": "2026-10-22"}]},
        {"id": "1000-503", "requestNo": "503", "drawdownNo": "", "amount": 5, "stage": "not_approved", "stageHistory": [
            {"key": "not_approved", "label": "Not approved", "on": "2026-10-31"}, {"key": "unknown", "label": "x", "on": "2026-10-31"}]},
    ],
}


def by_id(items):
    return {i["id"]: i for i in items}


# --- LAS ---------------------------------------------------------------------------------------------------------------

def test_each_las_stage_is_an_item_with_its_chip_and_page():
    items = by_id(notifications_feed.journey_items(JOURNEY, TODAY))
    assert set(items) == {
        "sanction-1000-12-raised", "sanction-1000-12-with_checker", "sanction-1000-12-returned_to_maker", "sanction-1000-11-approved",
        "drawdown-1000-501-raised", "drawdown-1000-501-with_checker", "drawdown-1000-501-disbursed", "drawdown-1000-503-not_approved",
    }  # an old step, an undated one and an unknown key are left out
    back = items["sanction-1000-12-returned_to_maker"]
    assert (back["title"], back["stage"], back["tone"], back["workflow"], back["to"], back["kind"]) == (
        "Loan application 12 returned to your relationship manager for correction", "maker", "back", "loans", "/loans", "update")
    assert items["sanction-1000-12-with_checker"]["stage"] == "checker"
    assert items["sanction-1000-11-approved"]["title"] == "Sanction 100411 approved"
    paid = items["drawdown-1000-501-disbursed"]
    assert (paid["title"], paid["stage"], paid["to"], paid["detail"]) == (
        "Drawdown request 501 amount disbursed", "disbursed", "/drawdowns", ["₹10,00,000.00", "Disbursement No. 23000068"])
    assert items["drawdown-1000-503-not_approved"]["tone"] == "rejected"
    assert notifications_feed.journey_items({"onboarded": False}, TODAY) == []


def test_finance_gives_payments_and_dues_and_the_stages_only_without_the_journey():
    items = by_id(notifications_feed.finance_items(FINANCE, TODAY))
    assert set(items) == {"payment-7001", "payment-7002-verifying", "payment-7003-rejected", "overdue-2026-10-31", "due-2026-11-05"}
    assert items["payment-7001"]["on"] == "2026-10-29"  # confirmed when it was applied
    assert (items["payment-7002-verifying"]["title"], items["payment-7002-verifying"]["stage"]) == ("Payment of ₹5,000.00 is being verified", "verifying")
    assert items["payment-7003-rejected"]["title"] == "Payment of ₹900.00 not accepted"
    assert items["overdue-2026-10-31"]["kind"] == "action" and items["due-2026-11-05"]["to"] == "/repayments"
    fallback = by_id(notifications_feed.finance_items(FINANCE, TODAY, with_stages=False))
    assert {"sanction-100411", "drawdown-501", "disbursed-23000068"} <= set(fallback) and "sanction-100300" not in fallback


def test_a_due_beyond_a_week_and_no_overdue_make_no_action():
    quiet = {**FINANCE, "summary": {"overdue": 0, "nextDue": {"date": "2026-12-31", "total": 7800}}}
    assert not [i for i in notifications_feed.finance_items(quiet, TODAY) if i["kind"] == "action"]
    assert notifications_feed.finance_items({"onboarded": False}, TODAY) == []


# --- onboarding --------------------------------------------------------------------------------------------------------

def vendor(status, round_no=1, submitted="2026-10-28 09:00:00", updated="2026-10-29 10:00:00"):
    return {"status": status, "submission_round": round_no, "submitted_at": submitted, "updated_at": updated}


def audit(audit_id, action, actor, status=None, at="2026-10-29 10:00:00", **extra):
    after = {"status": status, **extra} if status or extra else None
    return {"id": audit_id, "action": action, "actor": actor, "after_value": json.dumps(after) if after else None, "created_at": at}


def onboarding(status_row, audit_rows=(), rejections=(), stage=auth.STAGE_MAKER_REVIEW):
    return notifications_feed.onboarding_items({"vendor": status_row, "audit": list(audit_rows)}, list(rejections), stage, TODAY)


def test_a_submitted_application_shows_submitted_and_with_the_maker():
    items = onboarding(vendor("Pending"))
    assert [(i["id"], i["stage"], i["kind"]) for i in items] == [
        ("onb-submitted-r1", "submitted", "update"), ("onb-now-maker-r1-2026-10-29", "maker", "update")]
    assert items[1]["title"] == "Your application is with the maker for review" and items[1]["to"] == "/application-status"


def test_sent_to_the_checker_is_one_item_whether_the_review_app_logged_it_or_not():
    logged = onboarding(vendor("01"), [audit(7, "approval_recorded", "maker", "01")], stage=auth.STAGE_CHECKER_REVIEW)
    assert [(i["id"], i["stage"]) for i in logged] == [("onb-submitted-r1", "submitted"), ("onb-a7", "checker")]
    assert logged[1]["title"] == "Your application was sent to the checker for approval" and logged[1]["detail"] == ["By the maker"]
    # LAS's maker writes no audit row: the stage it is in now says it.
    unlogged = onboarding(vendor("01"), stage=auth.STAGE_CHECKER_REVIEW)
    assert unlogged[-1]["id"] == "onb-now-checker-r1-2026-10-29" and unlogged[-1]["stage"] == "checker"


def test_a_return_for_correction_says_who_returned_it_and_asks_while_it_is_open():
    rejections = [
        {"rejection_id": 3, "round_no": 1, "rejected_by_role": "maker", "rejected_at": "2026-10-20 10:00:00", "resubmitted_at": "2026-10-21 10:00:00"},
        {"rejection_id": 5, "round_no": 2, "rejected_by_role": "checker", "rejected_at": "2026-10-30 10:00:00", "resubmitted_at": None,
         "overall_remark": "Upload a clearer\n bank proof"},
    ]
    items = by_id(onboarding(vendor("returned", round_no=2, submitted="2026-10-21 10:00:00"), rejections=rejections, stage=auth.STAGE_RETURNED))
    assert set(items) == {"onb-submitted-r2", "onb-returned-3", "onb-returned-5"}  # no second "corrections required"
    # The open return asks for the corrections, with the reviewer's note to the customer (2026-11-04).
    assert (items["onb-returned-5"]["title"], items["onb-returned-5"]["kind"], items["onb-returned-5"]["detail"], items["onb-returned-5"]["to"]) == (
        "Corrections required", "action", ["Upload a clearer bank proof", "By the checker", "Round 2"], "/request-vendor")
    assert items["onb-returned-3"]["kind"] == "update" and items["onb-returned-3"]["detail"] == ["By the maker", "Round 1"]
    assert items["onb-returned-3"]["title"] == "Your application was returned to you for correction"
    assert items["onb-submitted-r2"]["title"] == "Resubmitted for review, round 2"


def test_each_round_submitted_shows_once_from_the_audit_trail_and_a_long_remark_is_shortened():
    rows = [audit(20, "submitted", "vendor", "Pending", at="2026-10-20 09:00:00", round=1),
            audit(21, "resubmitted", "vendor", "Pending", at="2026-10-25 09:00:00", round=2),
            audit(22, "resubmitted", "vendor", "Pending", at="2026-10-31 09:00:00", round=3)]
    long = "Please upload " + "a clearer copy " * 20
    rejections = [{"rejection_id": 7, "round_no": 3, "rejected_by_role": "maker", "rejected_at": "2026-11-01 10:00:00", "resubmitted_at": None,
                   "overall_remark": long}]
    items = by_id(onboarding(vendor("returned", round_no=3, submitted="2026-10-31 09:00:00"), rows, rejections, stage=auth.STAGE_RETURNED))
    assert [items[f"onb-submitted-r{n}"]["title"] for n in (1, 2, 3)] == [
        "Your application was submitted", "Resubmitted for review, round 2", "Resubmitted for review, round 3"]
    assert len([i for i in items.values() if i["stage"] == "submitted"]) == 3  # the current round once, from the vendor row
    note = items["onb-returned-7"]["detail"][0]
    assert note.endswith("…") and len(note) <= notifications_feed.REMARK_CHARS and items["onb-returned-7"]["title"] == "Corrections required"


def test_a_logged_return_still_asks_for_the_corrections_but_a_closed_legacy_one_does_not():
    logged = by_id(onboarding(vendor("returned"), [audit(12, "returned", "maker", "returned", at="2026-10-30 10:00:00")], stage=auth.STAGE_RETURNED))
    assert logged["onb-a12"]["kind"] == "update" and logged["onb-a12"]["detail"] == ["By the maker"]
    assert (logged["onb-now-returned-r1"]["kind"], logged["onb-now-returned-r1"]["to"]) == ("action", "/request-vendor")
    legacy = onboarding(vendor("Returned to Vendor"), [audit(13, "rejected", "maker", "Returned to Vendor")], stage=auth.STAGE_REJECTED)
    assert [(i["id"], i["kind"]) for i in legacy if i["id"] != "onb-submitted-r1"] == [("onb-a13", "update")]


def test_returned_to_the_maker_not_approved_and_the_customer_account_in_sap():
    to_maker = onboarding(vendor("returned_to_maker"), [audit(8, "returned_to_maker", "checker", "returned_to_maker", reasons=["x"], overall_remark="internal")])
    assert to_maker[-1]["title"] == "The checker sent your application back to the maker" and to_maker[-1]["stage"] == "maker"
    assert "internal" not in str(to_maker)
    rejected = onboarding(vendor("Rejected"), [audit(9, "rejected", "checker", "Rejected", reason="internal")], stage=auth.STAGE_REJECTED)
    assert [(i["id"], i["stage"], i["detail"]) for i in rejected][-1] == ("onb-a9", "rejected", ["By the checker"])
    assert "internal" not in str(rejected)
    active = by_id(onboarding(vendor("active"), [audit(10, "approval_recorded", "checker", "active", at="2026-10-30 10:00:00"),
                                                 audit(11, "sap_business_partner_created", "system", business_partner="0000100440", at="2026-10-30 10:05:00")],
                              stage=auth.STAGE_ACTIVE))
    assert active["onb-a10"]["title"] == "Your application was approved and your account is active"
    assert (active["onb-a11"]["title"], active["onb-a11"]["stage"], active["onb-a11"]["detail"], active["onb-a11"]["to"]) == (
        "Your customer account is set up in SAP", "account", ["Customer No. 100440"], "/home")
    assert "onb-active" not in active


def test_an_approval_las_did_not_log_and_a_draft_still_show():
    approved = by_id(onboarding(vendor("active"), stage=auth.STAGE_ACTIVE))
    assert approved["onb-active"]["stage"] == "approved" and approved["onb-active"]["on"] == "2026-10-29"
    draft = onboarding(vendor("registered", submitted=None), stage=auth.STAGE_DRAFT)
    assert [(i["id"], i["kind"], i["to"]) for i in draft] == [("onb-now-draft-r1", "action", "/request-vendor")]


def test_old_updates_drop_off_but_the_stage_it_is_in_now_stays():
    items = onboarding(vendor("Pending", submitted="2026-08-01 09:00:00", updated="2026-08-01 09:00:00"))
    assert [i["id"] for i in items] == ["onb-now-maker-r1-2026-08-01"]


# --- invoices and change requests --------------------------------------------------------------------------------------

def test_every_invoice_stage_with_who_returned_it_by_role():
    records = {
        "ids": [1, 2, 3],
        "invoices": [
            {"id": 1, "invoice_number": "INV-1", "status": "Returned to Vendor", "created_at": "2026-10-20 09:00:00", "updated_at": "2026-10-30 09:00:00"},
            {"id": 2, "invoice_number": "INV-2", "status": "Rejected", "created_at": "2026-10-21 09:00:00", "updated_at": "2026-10-25 09:00:00"},
            {"id": 3, "invoice_number": "INV-3", "status": "pending", "created_at": "2026-10-31 09:00:00", "updated_at": "2026-10-31 09:00:00"},
        ],
        "audit": [
            {"id": 21, "entity_id": "1", "action": "status_changed", "actor": "maker", "after_value": '{"status": "Sent for Approval"}', "created_at": "2026-10-22 09:00:00"},
            {"id": 22, "entity_id": "1", "action": "status_changed", "actor": "checker", "after_value": '{"status": "Pending Authorization"}', "created_at": "2026-10-23 09:00:00"},
            {"id": 23, "entity_id": "1", "action": "returned", "actor": "authorizer", "after_value": '{"returned_to": "maker"}', "created_at": "2026-10-24 09:00:00"},
            {"id": 24, "entity_id": "1", "action": "replaced", "actor": "vendor", "after_value": None, "created_at": "2026-10-26 09:00:00"},
            {"id": 25, "entity_id": "2", "action": "rejected", "actor": "authorizer", "after_value": None, "created_at": "2026-10-25 09:00:00"},
        ],
    }
    returns = [
        {"return_id": 31, "invoice_id": 1, "outcome": "returned", "returned_by_role": "authorizer", "returned_to": "maker", "returned_at": "2026-10-24 09:00:00", "resolved_at": None},
        {"return_id": 32, "invoice_id": 1, "outcome": "returned", "returned_by_role": "checker", "returned_to": "vendor", "returned_at": "2026-10-30 09:00:00", "resolved_at": None},
        {"return_id": 33, "invoice_id": 2, "outcome": "rejected", "returned_by_role": "authorizer", "returned_to": None, "returned_at": "2026-10-25 09:00:00", "resolved_at": None},
    ]
    items = by_id(notifications_feed.invoice_items(records, returns, TODAY))
    assert {k: (v["stage"], v["title"]) for k, v in items.items()} == {
        "inv-1-uploaded": ("submitted", "Invoice INV-1 was uploaded"),
        "inv-1-a21": ("checker", "Invoice INV-1 was sent to the checker for approval"),
        "inv-1-a22": ("authorizer", "Invoice INV-1 is with the authorizer for final approval"),
        "inv-1-r31": ("maker", "Invoice INV-1 was sent back to the maker"),
        "inv-1-a24": ("submitted", "A corrected copy of invoice INV-1 was submitted"),
        "inv-1-r32": ("returned", "Invoice INV-1 was returned to you for correction"),
        "inv-2-uploaded": ("submitted", "Invoice INV-2 was uploaded"),
        "inv-2-r33": ("rejected", "Invoice INV-2 was not approved"),
        "inv-3-uploaded": ("submitted", "Invoice INV-3 was uploaded"),
        "inv-3-now-maker": ("maker", "Invoice INV-3 is with the maker for review"),
    }
    assert items["inv-1-r31"]["detail"] == ["By the authorizer"] and items["inv-2-r33"]["detail"] == ["By the authorizer"]
    assert (items["inv-1-r32"]["kind"], items["inv-1-r32"]["detail"], items["inv-1-r32"]["to"]) == ("action", ["By the checker"], "/invoices")
    assert all(i["kind"] == "update" for k, i in items.items() if k != "inv-1-r32")
    # Without invoice_return the audit rows tell the returns, with the role that acted.
    fallback = by_id(notifications_feed.invoice_items(records, None, TODAY))
    assert (fallback["inv-1-a23"]["title"], fallback["inv-1-a23"]["detail"]) == ("Invoice INV-1 was sent back to the maker", ["By the authorizer"])
    assert (fallback["inv-2-a25"]["stage"], fallback["inv-2-a25"]["detail"]) == ("rejected", ["By the authorizer"])
    assert fallback["inv-1-now-returned"]["kind"] == "action"  # status says it is with the customer; no audit row named the return to them


def test_an_invoice_without_a_number_still_reads_well():
    records = {"ids": [9], "audit": [], "invoices": [
        {"id": 9, "invoice_number": None, "status": "pending", "created_at": "2026-10-31 09:00:00", "updated_at": "2026-10-31 09:00:00"}]}
    titles = [i["title"] for i in notifications_feed.invoice_items(records, [], TODAY)]
    assert titles == ["An invoice was uploaded", "An invoice is with the maker for review"]


def test_change_request_stages():
    rows = [
        {"request_id": 4, "status": "approved", "requested_at": "2026-10-20 09:00:00", "maker_actioned_at": "2026-10-21 09:00:00", "checker_actioned_at": "2026-10-22 09:00:00"},
        {"request_id": 5, "status": "update requested", "requested_at": "2026-10-31 09:00:00", "maker_actioned_at": None, "checker_actioned_at": None},
        {"request_id": 6, "status": "rejected", "requested_at": "2026-10-25 09:00:00", "maker_actioned_at": "2026-10-26 09:00:00", "checker_actioned_at": None},
    ]
    items = by_id(notifications_feed.change_request_items(rows, TODAY))
    assert {k: v["stage"] for k, v in items.items()} == {
        "cr-4-submitted": "submitted", "cr-4-checker": "checker", "cr-4-approved": "approved",
        "cr-5-submitted": "submitted", "cr-5-maker": "maker",
        "cr-6-submitted": "submitted", "cr-6-rejected": "rejected",
    }
    assert items["cr-6-rejected"]["detail"] == ["By the maker"] and items["cr-4-approved"]["to"] == "/update-requests"


# --- the endpoint ------------------------------------------------------------------------------------------------------

def ago(days, clock="09:00:00"):
    return f"{(date.today() - timedelta(days=days)).isoformat()} {clock}"


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "bell.db"
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE vendor (vendor_id INTEGER PRIMARY KEY, email TEXT, status TEXT, submission_round INTEGER, gstin TEXT,
                             submitted_at DATETIME, updated_at DATETIME);
        CREATE TABLE invoices (id INTEGER PRIMARY KEY, vendor_id TEXT, vendor_tax_id TEXT, invoice_number TEXT, status TEXT,
                               created_at DATETIME, updated_at DATETIME);
        CREATE TABLE audit_log (id INTEGER PRIMARY KEY, entity_type TEXT, entity_id TEXT, action TEXT, actor TEXT, before_value TEXT,
                                after_value TEXT, created_at DATETIME);
        CREATE TABLE invoice_return (return_id INTEGER PRIMARY KEY, invoice_id INTEGER, outcome TEXT, round_no INTEGER, returned_by_role TEXT,
                                     returned_by TEXT, returned_to TEXT, overall_remark TEXT, returned_at DATETIME, resolved_at DATETIME);
        CREATE TABLE vendor_rejection (rejection_id INTEGER PRIMARY KEY, vendor_id INTEGER, round_no INTEGER, rejected_by_role TEXT,
                                       rejected_by TEXT, overall_remark TEXT, rejected_at DATETIME, resubmitted_at DATETIME);
        CREATE TABLE vendor_update_request (request_id INTEGER PRIMARY KEY, vendor_id INTEGER, status TEXT, requested_at DATETIME,
                                            maker_actioned_at DATETIME, checker_actioned_at DATETIME);
        CREATE TABLE vendor_agreement (agreement_id INTEGER PRIMARY KEY, agreement_no TEXT, vendor_id INTEGER, version INTEGER, status TEXT,
                                       expires_at DATETIME);
        CREATE TABLE agreement_event (event_id INTEGER PRIMARY KEY, agreement_id INTEGER, event_type TEXT, actor TEXT, created_at DATETIME);
        CREATE TABLE customer_notification_read (vendor_id INTEGER, notification_id TEXT, read_at DATETIME,
                                                 PRIMARY KEY (vendor_id, notification_id));
    """)
    db.executemany("INSERT INTO vendor VALUES (?, ?, ?, ?, ?, ?, ?)", [
        (84, "c@x.test", "active", 1, "27AAAAA0000A1Z5", ago(200), ago(100)),
        (85, "d@x.test", "Pending", 1, None, ago(1), ago(1)),
        (86, "e@x.test", "active", 1, "27BBBBB0000B1Z5", ago(200), ago(100)),
        (87, "f@x.test", "agreement_sent", 1, None, ago(10), ago(2)),
    ])
    db.executemany("INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?, ?)", [
        (1, "84", None, "INV-1", "Returned to Vendor", ago(4), ago(0)),
        (2, "86", None, "INV-OTHER", "pending", ago(1), ago(1)),
    ])
    db.executemany("INSERT INTO audit_log (entity_type, entity_id, action, actor, after_value, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
        ("invoice", "1", "status_changed", "maker", '{"status": "Sent for Approval"}', ago(3)),
        ("invoice", "1", "returned", "checker", '{"returned_to": "vendor", "overall_remark": "internal note"}', ago(0)),
        ("invoice", "2", "status_changed", "maker", '{"status": "Sent for Approval"}', ago(0)),
        ("vendor", "85", "documents_uploaded", "maker", '{"types": ["PAN"]}', ago(1, "10:00:00")),
    ])
    db.execute("INSERT INTO invoice_return VALUES (1, 1, 'returned', 1, 'checker', 'Checker Name', 'vendor', 'internal note', ?, NULL)", (ago(0),))
    db.executemany("INSERT INTO vendor_update_request VALUES (?, ?, ?, ?, ?, ?)", [
        (4, 84, "sent for approval", ago(5), ago(2), None),
        (9, 86, "update requested", ago(1), None, None),
    ])
    db.execute("INSERT INTO vendor_agreement VALUES (1, 'AGR-87-1', 87, 1, 'sent', NULL)")
    db.execute("INSERT INTO agreement_event VALUES (1, 1, 'issued', 'checker', ?)", (ago(2),))
    db.commit()
    db.close()
    connect = lambda: sqlite_db.Connection(path)  # noqa: E731
    for module in (auth, customer_home, notifications_feed):
        monkeypatch.setattr(module, "get_connection", connect)
    calls = []

    def finance():
        calls.append("finance")
        return {"onboarded": True, "summary": {"overdue": 100}, "schedule": [], "payments": []}, 200

    def journey(vendor_id):
        calls.append(("journey", vendor_id))
        return JOURNEY_RECENT

    monkeypatch.setattr(customer_finance, "_finance", finance)
    monkeypatch.setattr(notifications_feed, "_journey", journey)
    return portal.app.test_client(), path, calls


JOURNEY_RECENT = {"onboarded": True, "drawdowns": [], "sanctions": [
    {"id": "1000-12", "sanctionNo": "", "requestNo": "12", "limit": 100, "stageHistory": [
        {"key": "raised", "label": "Raised by your relationship manager", "on": date.today().isoformat()},
        {"key": "with_checker", "label": "Sent to the checker for approval", "on": date.today().isoformat()}]}]}


def signed_in(vendor_id):
    return {"Authorization": f"Bearer {auth.issue_token(vendor_id, 'c@x.test')}"}


def bell(app, vendor_id):
    return app.get("/vendors/me/notifications", headers=signed_in(vendor_id)).get_json()


def test_an_active_customer_sees_every_workflow_and_only_their_own(client):
    app, _, calls = client
    body = bell(app, 84)
    assert body["readState"] is True and body["unavailable"] == []
    ids = [i["id"] for i in body["items"]]
    # What needs the customer first: the open invoice return and the overdue amount.
    assert {i["id"] for i in body["items"] if i["kind"] == "action"} == {"inv-1-r1", "overdue-" + date.today().isoformat()}
    assert ids[:2] == [i["id"] for i in body["items"] if i["kind"] == "action"]
    assert {"inv-1-uploaded", "inv-1-a1", "cr-4-submitted", "cr-4-checker", "sanction-1000-12-raised", "sanction-1000-12-with_checker"} <= set(ids)
    assert next(i for i in body["items"] if i["id"] == "inv-1-a1")["stage"] == "checker"
    assert {i["workflow"] for i in body["items"]} == {"invoices", "change_requests", "loans", "repayments"}
    returned = next(i for i in body["items"] if i["id"] == "inv-1-r1")
    assert returned["detail"] == ["By the checker"] and returned["stage"] == "returned"
    raw = str(body)
    assert "INV-OTHER" not in raw and "cr-9" not in raw and "internal note" not in raw and "Checker Name" not in raw
    assert ("journey", 84) in calls and "finance" in calls
    assert "_at" not in raw and "_pinned" not in raw


def test_a_customer_in_onboarding_sees_their_stages_and_las_is_not_asked(client):
    app, _, calls = client
    body = bell(app, 85)
    # Newest first: documents added (10:00), then with the maker and submitted (both 09:00, the stage it is in now on top).
    assert [(i["id"], i["stage"], i["to"]) for i in body["items"]] == [
        ("onb-a4", "maker", "/application-status"),
        (f"onb-now-maker-r1-{date.today() - timedelta(days=1)}", "maker", "/application-status"),
        ("onb-submitted-r1", "submitted", "/application-status"),
    ]
    assert body["unavailable"] == [] and calls == []
    # Waiting to sign: one item asks for the signature, opening the agreement.
    signing = bell(app, 87)["items"]
    assert [(i["id"], i["kind"], i["to"]) for i in signing if i["kind"] == "action"] == [("agr-1", "action", "/agreement")]
    assert app.get("/vendors/me/notifications").status_code == 401


def test_read_marks_stay_with_each_stage(client):
    app, _, _ = client
    body = bell(app, 84)
    assert body["unread"] == len(body["items"])
    first = body["items"][0]["id"]
    assert app.post("/vendors/me/notifications/read", json={"ids": [first]}, headers=signed_in(84)).get_json() == {"marked": 1}
    assert app.post("/vendors/me/notifications/read", json={"ids": [first]}, headers=signed_in(84)).get_json() == {"marked": 0}
    again = bell(app, 84)
    assert [i["id"] for i in again["items"]] == [i["id"] for i in body["items"]]  # the same ids on every read
    assert next(i for i in again["items"] if i["id"] == first)["read"] is True and again["unread"] == len(body["items"]) - 1
    marked = app.post("/vendors/me/notifications/read", json={"all": True}, headers=signed_in(84)).get_json()["marked"]
    assert marked == len(body["items"]) - 1 and bell(app, 84)["unread"] == 0
    # Another customer's marks are their own.
    assert bell(app, 86)["unread"] == len(bell(app, 86)["items"]) > 0


def test_read_marks_are_per_customer_and_ids_are_checked(client):
    app, path, _ = client
    for bad in ({}, {"ids": []}, {"ids": ["x" * 121]}, {"ids": ["a b"]}, {"ids": ["ok"] * 201}):
        assert app.post("/vendors/me/notifications/read", json=bad, headers=signed_in(84)).status_code == 400
    app.post("/vendors/me/notifications/read", json={"ids": ["overdue-2026-10-31"]}, headers=signed_in(84))
    db = sqlite3.connect(path)
    assert db.execute("SELECT vendor_id FROM customer_notification_read").fetchall() == [(84,)]


def test_a_source_that_fails_is_named_and_the_rest_still_show(client, monkeypatch):
    app, path, _ = client
    monkeypatch.setattr(customer_finance, "_finance", lambda: ({"error": "x"}, 503))
    monkeypatch.setattr(notifications_feed, "_journey", lambda vendor_id: None)
    body = bell(app, 84)
    assert body["unavailable"] == ["loan_stages", "loans"]
    assert {i["workflow"] for i in body["items"]} == {"invoices", "change_requests"}
    # The journey alone failing: the finance answer's sanction news stands in for its stages.
    monkeypatch.setattr(customer_finance, "_finance", lambda: ({**FINANCE, "facilities": [{"sanctionNo": "9", "sanctionedAmount": 1,
                                                                                            "sanctionDate": date.today().isoformat()}]}, 200))
    assert "sanction-9" in {i["id"] for i in bell(app, 84)["items"]}
    # A journey read that raises is a failing source too, not an error page.
    monkeypatch.setattr(notifications_feed, "_journey", lambda vendor_id: 1 / 0)
    assert bell(app, 84)["unavailable"] == ["loan_stages"]
    db = sqlite3.connect(path)
    db.execute("DROP TABLE vendor_update_request")
    db.execute("DROP TABLE invoice_return")  # the audit rows still tell the return, by role
    db.commit()
    db.close()
    body = bell(app, 84)
    assert "change_request" in body["unavailable"] and "invoice" not in body["unavailable"]
    returned = next(i for i in body["items"] if i["workflow"] == "invoices" and i["kind"] == "action")
    assert returned["detail"] == ["By the checker"]


def test_without_the_read_table_items_still_show_as_unread(client):
    app, path, _ = client
    db = sqlite3.connect(path)
    db.execute("DROP TABLE customer_notification_read")
    db.commit()
    db.close()
    body = bell(app, 84)
    assert body["readState"] is False and body["unread"] == len(body["items"]) > 0
    assert app.post("/vendors/me/notifications/read", json={"all": True}, headers=signed_in(84)).status_code == 503


def test_the_bell_keeps_at_most_fifty_items_actions_first(client, monkeypatch):
    app, _, _ = client
    many = {"onboarded": True, "drawdowns": [], "sanctions": [
        {"id": f"1000-{n}", "sanctionNo": "", "requestNo": str(n), "limit": 1, "stageHistory": [
            {"key": "raised", "label": "Raised by your relationship manager", "on": date.today().isoformat()}]} for n in range(80)]}
    monkeypatch.setattr(notifications_feed, "_journey", lambda vendor_id: many)
    items = bell(app, 84)["items"]
    assert len(items) == notifications_feed.MAX_ITEMS == 50
    assert [i["kind"] for i in items[:2]] == ["action", "action"]
