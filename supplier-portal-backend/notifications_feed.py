"""The header bell: every stage of every workflow the signed-in customer has, after LAS Central's bell
(Loans-Against-Securities src/layout/NotificationBell.jsx). Like it, every item is worked out from the records as they
are now, so nothing is copied into a notification table; the one thing kept is which items the customer has read
(customer_notification_read.sql).

    GET  /vendors/me/notifications          { items: [{ id, kind, tone, workflow, stage, title, detail, on, to, read }],
                                              unread, readState, unavailable }
    POST /vendors/me/notifications/read     { ids: [...] } marks those read; { all: true } marks every current item read

kind is "action" (needs the customer, shown while it lasts) or "update"; tone is the icon (pending, back, rejected,
approved, overdue); workflow groups the items (onboarding, agreement, loans, drawdowns, invoices, payments, repayments,
change_requests); stage is the step's chip (submitted, maker, checker, authorizer, returned, approved, rejected, account,
disbursed, settled, verifying, confirmed, due, overdue, draft, agreement). Each id names its record and its stage, so a
read mark stays with it.

The workflows and where each stage comes from (each source optional: one that cannot be read is named in `unavailable`
and the rest still show):

    onboarding      submitted (vendor.submitted_at); with the maker / with the checker / back with the maker / approved /
                    not approved / agreement to sign (vendor.status, the stage it is in now); sent to the checker,
                    approved, returned to the maker, not approved, corrected by the maker, documents added, customer
                    account set up in SAP (audit_log, entity vendor, written by the review app); returned to you for
                    correction, by role (vendor_rejection)
    agreement       issued, signed, declined, withdrawn (agreement_event)
    invoices        uploaded (invoices.created_at); with the maker / checker / authorizer, approved (audit_log status_changed
                    and invoices.status now); returned to you or to the maker, and not approved, with who did it by role
                    (invoice_return; audit_log returned / rejected when that table cannot be read); corrected invoice
                    submitted (audit_log replaced)
    change requests submitted, sent to the checker, approved / not approved (vendor_update_request)
    loans           (active customers only, from LAS) each sanction's and drawdown's stageHistory from LAS's journey
                    (customer-journey.mjs): raised by the relationship manager, with the checker, updated and resent,
                    returned to the relationship manager, approved / not approved, disbursed, settled; payments being
                    verified, confirmed or not accepted, the repayment due within DUE_SOON_DAYS and an overdue amount,
                    from LAS's finance answer (customer_finance)

Updates show for RECENT_DAYS; an action, and the stage an application is in now, show while they last; at most
MAX_ITEMS, what needs the customer first. Margin calls and document requests have no source yet (LAS keeps no live
collateral valuation; there is no document request register), so the bell does not invent them.
"""
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from flask import Blueprint, g, jsonify, request
from mysql.connector import Error as MySQLError

import auth
import customer_finance
import customer_home
import customer_journey
from db import get_connection

log = logging.getLogger(__name__)

bp = Blueprint("notifications_feed", __name__)

RECENT_DAYS = 30
DUE_SOON_DAYS = 7
MAX_IDS = 200
MAX_ITEMS = 50
_ID = re.compile(r"^[\w.:-]{1,120}$")
ROLES = ("maker", "checker", "authorizer")


def _day(value):
    return str(customer_home._iso(value) or "")[:10]


def _at(value):
    return str(customer_home._iso(value) or "")


def _recent(on, today):
    return bool(on) and on >= (today - timedelta(days=RECENT_DAYS)).isoformat()


def _money(value):
    return f"₹{customer_finance._money_text(float(value))}"


def _role(value):
    value = str(value or "").strip().lower()
    return value if value in ROLES else None


def _by(role):
    return f"By the {role}" if role else None


def _item(item_id, workflow, stage, tone, title, on, to, detail=(), kind="update", at=None, pinned=False):
    """One notification. `pinned` keeps it however old (the stage something is in now); `at` orders a day's items."""
    return {"id": re.sub(r"[^\w.:-]", "_", item_id)[:120], "kind": kind, "tone": tone, "workflow": workflow, "stage": stage,
            "title": title, "detail": list(detail), "on": on or "", "to": to, "_at": at or on or "", "_pinned": pinned}


# --- onboarding -------------------------------------------------------------------------------------------------------

def onboarding_link(stage):
    """Where the customer follows their application now (the routes allow each page only in its stages)."""
    if stage == auth.STAGE_ACTIVE:
        return "/home"
    if stage == auth.STAGE_AGREEMENT:
        return "/agreement"
    if stage in (auth.STAGE_DRAFT, auth.STAGE_RETURNED):
        return "/request-vendor"
    return "/application-status"


# vendor.status (lower case) -> the stage the application is in now: (stage, tone, title, kind).
CURRENT_STAGE = {
    "registered": ("draft", "pending", "Finish and submit your application", "action"),
    "pending": ("maker", "pending", "Your application is with the maker for review", "update"),
    "": ("maker", "pending", "Your application is with the maker for review", "update"),
    "01": ("checker", "pending", "Your application is with the checker for approval", "update"),
    "sent for approval": ("checker", "pending", "Your application is with the checker for approval", "update"),
    "returned_to_maker": ("maker", "back", "Your application is back with the maker for correction", "update"),
    "returned": ("returned", "back", "Your application needs your corrections", "action"),
    # Not here: the older review app's "Returned to Vendor" and "Pending Correction", which the portal treats as closed
    # (auth.stage_for: rejected, nothing to edit), so the bell does not ask for corrections the customer cannot make;
    # their dated return still shows.
    "02": ("approved", "approved", "Your application is approved; your customer account is being set up", "update"),
    "approved": ("approved", "approved", "Your application is approved; your customer account is being set up", "update"),
    "agreement_sent": ("agreement", "pending", "Your agreement is ready for you to sign", "action"),
    "agreement_signed": ("checker", "pending", "Agreement signed; waiting for the checker's final approval", "update"),
    "change_req_maker": ("maker", "pending", "Your request to change details is with the maker", "update"),
    "change_req_checker": ("checker", "pending", "Your request to change details is with the checker", "update"),
    "rejected": ("rejected", "rejected", "Your application was not approved", "update"),
}
# The review app's audit_log actions on a vendor that are a stage of the application (everything else stays internal).
VENDOR_ACTIONS = ("approval_recorded", "returned_to_maker", "rejected", "returned", "returned_for_correction", "corrected",
                  "documents_uploaded", "sap_business_partner_created")
# approval_recorded, by the status it moved the application to.
APPROVALS = {
    "01": ("checker", "pending", "Your application was sent to the checker for approval"),
    "active": ("approved", "approved", "Your application was approved and your account is active"),
    "02": ("approved", "approved", "Your application was approved"),
    "approved": ("approved", "approved", "Your application was approved"),
    "agreement_sent": ("agreement", "pending", "Your application was approved; your agreement was issued"),
    "change_req_checker": ("checker", "pending", "Your request to change details was sent to the checker"),
}


def _onboarding_reader(cursor, vendor_id):
    cursor.execute("SELECT status, submission_round, submitted_at, updated_at FROM vendor WHERE vendor_id = %s", (vendor_id,))
    vendor = cursor.fetchone() or {}
    cursor.execute(
        f"SELECT id, action, actor, after_value, created_at FROM audit_log WHERE entity_type = 'vendor' AND entity_id = %s "
        f"AND action IN ({', '.join(['%s'] * len(VENDOR_ACTIONS))})",
        (str(vendor_id), *VENDOR_ACTIONS),
    )
    return {"vendor": vendor, "audit": cursor.fetchall()}


def _rejections_reader(cursor, vendor_id):
    cursor.execute(
        "SELECT rejection_id, round_no, rejected_by_role, rejected_at, resubmitted_at FROM vendor_rejection WHERE vendor_id = %s",
        (vendor_id,),
    )
    return cursor.fetchall()


def onboarding_items(records, rejections, stage, today):
    """The application's stages: what happened (dated) and the stage it is in now (while it lasts)."""
    vendor, to = records.get("vendor") or {}, onboarding_link(stage)
    status = str(vendor.get("status") or "").strip().lower()
    round_no = vendor.get("submission_round") or 1
    events = []
    if vendor.get("submitted_at") and status != "registered":
        title = "Your corrected application was submitted" if round_no > 1 else "Your application was submitted"
        events.append(_item(f"onb-submitted-r{round_no}", "onboarding", "submitted", "pending", title, _day(vendor["submitted_at"]), to,
                            [f"Round {round_no}" if round_no > 1 else None], at=_at(vendor["submitted_at"])))
    return_days = set()
    open_return = False
    for r in rejections or []:
        role = _role(r.get("rejected_by_role"))
        is_open = r.get("resubmitted_at") is None and status == "returned"
        open_return = open_return or is_open
        on = _day(r["rejected_at"])
        return_days.add(on)
        events.append(_item(f"onb-returned-{r['rejection_id']}", "onboarding", "returned", "back", "Your application was returned to you for correction",
                            on, to, [_by(role), f"Round {r['round_no']}" if r.get("round_no") else None],
                            kind="action" if is_open else "update", at=_at(r["rejected_at"]), pinned=is_open))
    approved_seen = False
    sap_on = None
    for a in records.get("audit") or []:
        after = customer_home._json(a.get("after_value")) or {}
        after_status = str(after.get("status") or "").strip().lower() if isinstance(after, dict) else ""
        on, at, role = _day(a["created_at"]), _at(a["created_at"]), _role(a.get("actor"))
        item_id, action = f"onb-a{a['id']}", a["action"]
        if action == "approval_recorded" and after_status in APPROVALS:
            stage_key, tone, title = APPROVALS[after_status]
            approved_seen = approved_seen or after_status == "active"
            events.append(_item(item_id, "onboarding", stage_key, tone, title, on, to, [_by(role)], at=at))
        elif action == "returned_to_maker":
            events.append(_item(item_id, "onboarding", "maker", "back", "The checker sent your application back to the maker", on, to, at=at))
        elif action == "rejected" and after_status == "rejected":
            events.append(_item(item_id, "onboarding", "rejected", "rejected", "Your application was not approved", on, to, [_by(role)], at=at))
        elif action in ("returned", "returned_for_correction", "rejected") and on not in return_days:
            # A return the review app logged without a vendor_rejection row (older records).
            events.append(_item(item_id, "onboarding", "returned", "back", "Your application was returned to you for correction", on, to, [_by(role)], at=at))
        elif action == "corrected":
            events.append(_item(item_id, "onboarding", "maker", "pending", "The maker updated your application", on, to, at=at))
        elif action == "documents_uploaded":
            events.append({**_item(item_id, "onboarding", "maker", "pending", "Documents were added to your application", on, to, at=at), "_info": True})
        elif action == "sap_business_partner_created":
            sap_on = sap_on or on
            partner = after.get("business_partner") if isinstance(after, dict) else None
            events.append({**_item(item_id, "onboarding", "account", "approved", "Your customer account is set up in SAP", on, to,
                                   [partner and f"Customer No. {str(partner).lstrip('0') or partner}"], at=at), "_info": True})
    events = [e for e in events if e["_pinned"] or _recent(e["on"], today)]

    # The stage it is in now, unless the newest event already says so; something to do is asked for unless an open return
    # already asks (a dated update does not). A note such as documents added is not a stage of its own.
    newest = max((e for e in events if not e.get("_info")), key=lambda e: e["_at"], default=None)
    changed_on = _day(vendor.get("updated_at") or vendor.get("submitted_at"))
    if status == "active":
        if not approved_seen and _recent(sap_on or changed_on, today):
            events.append(_item("onb-active", "onboarding", "approved", "approved", "Your application was approved and your account is active",
                                sap_on or changed_on, to))
    elif status in CURRENT_STAGE:
        stage_key, tone, title, kind = CURRENT_STAGE[status]
        if kind == "action":
            covered = stage_key == "returned" and open_return
        else:
            covered = newest is not None and newest["stage"] == stage_key
        if not covered:
            item_id = f"onb-now-{stage_key}-r{round_no}" + ("" if kind == "action" else f"-{changed_on}")
            events.append(_item(item_id, "onboarding", stage_key, tone, title, changed_on, to, kind=kind,
                                at=(_at(vendor.get("updated_at")) or changed_on) + "~", pinned=True))
    return events


# --- agreement --------------------------------------------------------------------------------------------------------

AGREEMENT_EVENTS = {
    "issued": ("agreement", "pending", "Agreement {no} issued for your signature"),
    "signed": ("approved", "approved", "Agreement {no} signed"),
    "declined": ("rejected", "rejected", "Agreement {no} declined"),
    "withdrawn": ("rejected", "rejected", "Agreement {no} withdrawn"),
}


def _agreement_reader(cursor, vendor_id):
    kinds = list(AGREEMENT_EVENTS)
    cursor.execute(
        f"SELECT e.event_id, e.event_type, e.created_at, a.agreement_no, a.version, a.status, "
        f"(a.expires_at IS NULL OR a.expires_at >= NOW()) AS live "
        f"FROM agreement_event e JOIN vendor_agreement a ON a.agreement_id = e.agreement_id "
        f"WHERE a.vendor_id = %s AND e.event_type IN ({', '.join(['%s'] * len(kinds))})",
        (vendor_id, *kinds),
    )
    return cursor.fetchall()


def agreement_items(rows, stage, today):
    to = "/agreement" if stage == auth.STAGE_AGREEMENT else "/agreements" if stage in (
        auth.STAGE_ACTIVE, auth.STAGE_AGREEMENT_SIGNED, auth.STAGE_MAKER_REVIEW, auth.STAGE_CHECKER_REVIEW,
        auth.STAGE_CHANGE_REQUESTED, auth.STAGE_RETURNED) else onboarding_link(stage)
    latest_issue = {}
    for r in rows or []:
        if r["event_type"] == "issued":
            latest_issue[r["agreement_no"]] = max(latest_issue.get(r["agreement_no"], ""), _at(r["created_at"]))
    items = []
    for r in rows or []:
        stage_key, tone, title = AGREEMENT_EVENTS[r["event_type"]]
        awaiting = (r["event_type"] == "issued" and r["status"] == "sent" and bool(r["live"])
                    and _at(r["created_at"]) == latest_issue.get(r["agreement_no"]))
        item = _item(f"agr-{r['event_id']}", "agreement", stage_key, tone, title.format(no=r["agreement_no"]), _day(r["created_at"]), to,
                     [r.get("version") and f"Version {r['version']}"], kind="action" if awaiting else "update", at=_at(r["created_at"]),
                     pinned=awaiting)
        if awaiting or _recent(item["on"], today):
            items.append(item)
    return items


# --- invoices ---------------------------------------------------------------------------------------------------------

# invoices.status (lower case) -> (stage, tone, how the step reads after "Invoice <no>").
INVOICE_STAGES = {
    "pending": ("maker", "pending", "is with the maker for review"),
    "pending approval": ("checker", "pending", "was sent to the checker for approval"),
    "sent for approval": ("checker", "pending", "was sent to the checker for approval"),
    "pending authorization": ("authorizer", "pending", "is with the authorizer for final approval"),
    "approved": ("approved", "approved", "was approved"),
    "returned to vendor": ("returned", "back", "was returned to you for correction"),
    "rejected": ("rejected", "rejected", "was not approved"),
}
INVOICE_ACTIONS = ("status_changed", "returned", "rejected", "replaced")


def _invoice_reader(cursor, vendor_id):
    ids = customer_home.deps["invoice_ids"](cursor, vendor_id)
    invoices, audit = [], []
    for start in range(0, len(ids), 200):
        chunk = ids[start:start + 200]
        marks = ", ".join(["%s"] * len(chunk))
        cursor.execute(f"SELECT id, invoice_number, status, created_at, updated_at FROM invoices WHERE id IN ({marks})", chunk)
        invoices += cursor.fetchall()
        cursor.execute(
            f"SELECT id, entity_id, action, actor, after_value, created_at FROM audit_log WHERE entity_type = 'invoice' "
            f"AND entity_id IN ({marks}) AND action IN ({', '.join(['%s'] * len(INVOICE_ACTIONS))})",
            (*[str(i) for i in chunk], *INVOICE_ACTIONS),
        )
        audit += cursor.fetchall()
    return {"ids": ids, "invoices": invoices, "audit": audit}


def _invoice_return_reader(ids):
    def reader(cursor):
        rows = []
        for start in range(0, len(ids), 200):
            chunk = ids[start:start + 200]
            cursor.execute(
                f"SELECT return_id, invoice_id, outcome, returned_by_role, returned_to, returned_at, resolved_at FROM invoice_return "
                f"WHERE invoice_id IN ({', '.join(['%s'] * len(chunk))})",
                chunk,
            )
            rows += cursor.fetchall()
        return rows
    return reader


def invoice_items(records, returns, today):
    """Each invoice's stages. `returns` is invoice_return's rows, or None when that table cannot be read."""
    # "Invoice <no>", or "An invoice" for one uploaded without a number.
    numbers = {str(i["id"]): f"Invoice {i['invoice_number']}" if i.get("invoice_number") else "An invoice" for i in records["invoices"]}
    by_invoice = {str(i["id"]): [] for i in records["invoices"]}
    status_of = {str(i["id"]): str(i.get("status") or "").strip().lower() for i in records["invoices"]}
    for inv in records["invoices"]:
        key = str(inv["id"])
        by_invoice[key].append(_item(f"inv-{key}-uploaded", "invoices", "submitted", "pending", f"{numbers[key]} was uploaded",
                                     _day(inv["created_at"]), "/invoices", at=_at(inv["created_at"])))

    def back(key, item_id, outcome, role, returned_to, at, is_open=False):
        number = numbers.get(key)
        if outcome == "rejected":
            return _item(item_id, "invoices", "rejected", "rejected", f"{number} was not approved", _day(at), "/invoices", [_by(role)], at=_at(at))
        if returned_to == "maker":
            return _item(item_id, "invoices", "maker", "back", f"{number} was sent back to the maker", _day(at), "/invoices", [_by(role)], at=_at(at))
        return _item(item_id, "invoices", "returned", "back", f"{number} was returned to you for correction", _day(at), "/invoices",
                     [_by(role)], kind="action" if is_open else "update", at=_at(at), pinned=is_open)

    if returns is not None:
        open_return = {}
        for r in returns:
            key = str(r["invoice_id"])
            if r["outcome"] == "returned" and r.get("returned_to") == "vendor" and r.get("resolved_at") is None:
                open_return[key] = max(open_return.get(key, ""), _at(r["returned_at"]))
        for r in returns:
            key = str(r["invoice_id"])
            if key not in by_invoice:
                continue
            is_open = status_of[key] == "returned to vendor" and open_return.get(key) == _at(r["returned_at"]) and r.get("resolved_at") is None
            by_invoice[key].append(back(key, f"inv-{key}-r{r['return_id']}", r["outcome"], _role(r.get("returned_by_role")),
                                        r.get("returned_to"), r["returned_at"], is_open))
    for a in records["audit"]:
        key = str(a["entity_id"])
        if key not in by_invoice:
            continue
        after = customer_home._json(a.get("after_value")) or {}
        after = after if isinstance(after, dict) else {}
        number, on, at = numbers.get(key), _day(a["created_at"]), _at(a["created_at"])
        if a["action"] == "status_changed":
            spec = INVOICE_STAGES.get(str(after.get("status") or "").strip().lower())
            # A return or rejection is told by its own record, with who did it.
            if spec and spec[0] not in ("returned", "rejected"):
                stage_key, tone, phrase = spec
                by_invoice[key].append(_item(f"inv-{key}-a{a['id']}", "invoices", stage_key, tone, f"{number} {phrase}", on, "/invoices", at=at))
        elif a["action"] == "replaced":
            by_invoice[key].append(_item(f"inv-{key}-a{a['id']}", "invoices", "submitted", "pending", f"A corrected copy of {number[0].lower() + number[1:]} was submitted",
                                         on, "/invoices", at=at))
        elif returns is None:
            returned_to = str(after.get("returned_to") or "vendor").strip().lower()
            is_open = a["action"] == "returned" and status_of[key] == "returned to vendor" and returned_to != "maker"
            by_invoice[key].append(back(key, f"inv-{key}-a{a['id']}", "rejected" if a["action"] == "rejected" else "returned",
                                        _role(a.get("actor")), returned_to, a["created_at"], is_open))
    items = []
    for inv in records["invoices"]:
        key = str(inv["id"])
        events = by_invoice[key]
        if returns is None:
            # Without invoice_return only the newest return can be the open one.
            opens = sorted((e for e in events if e["kind"] == "action"), key=lambda e: e["_at"])
            for e in opens[:-1]:
                e.update(kind="update", _pinned=False)
        newest = max(events, key=lambda e: e["_at"], default=None)
        spec = INVOICE_STAGES.get(status_of[key])
        if spec and not (newest and newest["stage"] == spec[0]) and not any(e["kind"] == "action" for e in events):
            stage_key, tone, phrase = spec
            action = stage_key == "returned"
            changed = inv.get("updated_at") or inv["created_at"]
            events.append(_item(f"inv-{key}-now-{stage_key}", "invoices", stage_key, tone, f"{numbers[key]} {phrase}", _day(changed),
                                "/invoices", kind="action" if action else "update", at=_at(changed), pinned=action))
        items += [e for e in events if e["_pinned"] or _recent(e["on"], today)]
    return items


# --- change requests --------------------------------------------------------------------------------------------------

def _change_request_reader(cursor, vendor_id):
    cursor.execute(
        "SELECT request_id, status, requested_at, maker_actioned_at, checker_actioned_at FROM vendor_update_request WHERE vendor_id = %s",
        (vendor_id,),
    )
    return cursor.fetchall()


def change_request_items(rows, today):
    items = []
    for r in rows or []:
        ref, status, key = f"CR-{r['request_id']}", str(r.get("status") or "").strip().lower(), f"cr-{r['request_id']}"
        items.append(_item(f"{key}-submitted", "change_requests", "submitted", "pending", f"Change request {ref} was submitted",
                           _day(r["requested_at"]), "/update-requests", at=_at(r["requested_at"])))
        if status == "update requested":
            items.append(_item(f"{key}-maker", "change_requests", "maker", "pending", f"Change request {ref} is with the maker for review",
                               _day(r["requested_at"]), "/update-requests", at=_at(r["requested_at"]) + "~", pinned=True))
        maker_at, checker_at = r.get("maker_actioned_at"), r.get("checker_actioned_at")
        if maker_at and (status == "sent for approval" or checker_at):
            items.append(_item(f"{key}-checker", "change_requests", "checker", "pending", f"Change request {ref} was sent to the checker for approval",
                               _day(maker_at), "/update-requests", at=_at(maker_at), pinned=status == "sent for approval"))
        decided_at = checker_at or maker_at
        if status in ("approved", "rejected") and decided_at:
            approved = status == "approved"
            items.append(_item(f"{key}-{status}", "change_requests", "approved" if approved else "rejected", "approved" if approved else "rejected",
                               f"Change request {ref} was {'approved' if approved else 'not approved'}", _day(decided_at), "/update-requests",
                               [_by("checker" if checker_at else "maker")], at=_at(decided_at)))
    return [i for i in items if i["_pinned"] or _recent(i["on"], today)]


# --- loans (LAS) ------------------------------------------------------------------------------------------------------

# A LAS stageHistory step -> (chip, tone).
LAS_STEPS = {
    "raised": ("maker", "pending"),
    "with_checker": ("checker", "pending"),
    "resubmitted": ("checker", "pending"),
    "returned_to_maker": ("maker", "back"),
    "approved": ("approved", "approved"),
    "not_approved": ("rejected", "rejected"),
    "disbursed": ("disbursed", "approved"),
    "settled": ("settled", "approved"),
}


def _lower_first(text):
    return text[:1].lower() + text[1:] if text else text


def journey_items(journey, today):
    """Each sanction's and drawdown's dated steps from LAS's journey (customer-journey.mjs stageHistory)."""
    items = []
    if not journey or not journey.get("onboarded"):
        return items
    for kind, rows in (("sanction", journey.get("sanctions") or []), ("drawdown", journey.get("drawdowns") or [])):
        for x in rows:
            if kind == "sanction":
                name = f"Sanction {x['sanctionNo']}" if x.get("sanctionNo") else f"Loan application {x.get('requestNo')}"
                workflow, to, detail = "loans", "/loans", [x.get("limit") is not None and _money(x["limit"])]
            else:
                name = f"Drawdown request {x.get('requestNo')}"
                workflow, to = "drawdowns", "/drawdowns"
                detail = [x.get("amount") is not None and _money(x["amount"]), x.get("drawdownNo") and f"Disbursement No. {x['drawdownNo']}"]
            for seq, step in enumerate(x.get("stageHistory") or []):
                spec = LAS_STEPS.get(step.get("key"))
                on = str(step.get("on") or "")[:10]
                if not spec or not _recent(on, today):
                    continue
                chip, tone = spec
                items.append(_item(f"{kind}-{x['id']}-{step['key']}", workflow, chip, tone, f"{name} {_lower_first(step.get('label') or '')}",
                                   on, to, detail, at=f"{on}~{seq:02d}"))
    return items


def finance_items(finance, today, with_stages=True):
    """Payments and dues from LAS's finance answer (customer-finance.mjs); with_stages False adds the sanction, drawdown and
    disbursement news the journey would otherwise tell (when the journey could not be read)."""
    items = []
    if not finance or not finance.get("onboarded"):
        return items
    if not with_stages:
        for f in finance.get("facilities") or []:
            if _recent(f.get("sanctionDate"), today):
                items.append(_item(f"sanction-{f['sanctionNo']}", "loans", "approved", "approved", f"Sanction {f['sanctionNo']} approved",
                                   f["sanctionDate"], "/loans", [_money(f["sanctionedAmount"])]))
        for d in finance.get("drawdowns") or []:
            if d.get("status") in ("approved", "disbursed") and _recent(d.get("approvedOn"), today):
                items.append(_item(f"drawdown-{d['applicationNo']}", "drawdowns", "approved", "approved", f"Drawdown request {d['applicationNo']} approved",
                                   d["approvedOn"], "/drawdowns", [_money(d["requestedAmount"]), d.get("disbursementNo") and f"Disbursement No. {d['disbursementNo']}"]))
            if d.get("status") == "disbursed" and _recent(d.get("disbursedOn"), today):
                items.append(_item(f"disbursed-{d['disbursementNo']}", "drawdowns", "disbursed", "approved", f"{_money(d['disbursedAmount'])} disbursed to you",
                                   d["disbursedOn"], "/drawdowns", [f"Disbursement No. {d['disbursementNo']}"]))
    for p in finance.get("payments") or []:
        status, on = p.get("status"), p.get("paymentDate") or ""
        ref = [p.get("reference") and f"Ref. {p['reference']}"]
        if status in ("confirmed", "allocated"):
            applied = max((a.get("appliedOn") or "" for a in p.get("allocations") or []), default="")
            on = max(on, applied)
            item = _item(f"payment-{p['receiptNo']}", "payments", "confirmed", "approved", f"Payment of {_money(p['amount'])} confirmed", on, "/payments", ref)
        elif status == "pending":
            item = _item(f"payment-{p['receiptNo']}-verifying", "payments", "verifying", "pending", f"Payment of {_money(p['amount'])} is being verified",
                         on, "/payments", ref)
        elif status in ("rejected", "cancelled"):
            word = "not accepted" if status == "rejected" else "cancelled"
            item = _item(f"payment-{p['receiptNo']}-{status}", "payments", "rejected", "rejected", f"Payment of {_money(p['amount'])} {word}", on, "/payments", ref)
        else:
            continue
        if _recent(item["on"], today):
            items.append(item)
    summary = finance.get("summary") or {}
    overdue = summary.get("overdue")
    if overdue:
        first = min((line["dueDate"] for line in finance.get("schedule") or [] if line.get("status") == "overdue"), default=today.isoformat())
        items.append(_item(f"overdue-{first}", "repayments", "overdue", "overdue", f"{_money(overdue)} is overdue", first, "/repayments",
                           [f"Oldest due date {first}"], kind="action", pinned=True))
    nxt = summary.get("nextDue")
    if nxt and nxt.get("date") and nxt["date"] <= (today + timedelta(days=DUE_SOON_DAYS)).isoformat():
        items.append(_item(f"due-{nxt['date']}", "repayments", "due", "pending", f"{_money(nxt['total'])} due on {nxt['date']}", nxt["date"], "/repayments",
                           ["Principal, interest and charges as scheduled"], kind="action", pinned=True))
    return items


def _journey(vendor_id):
    """LAS's journey for this customer (customer-journey.mjs), or None when it cannot be read; the reason is logged."""
    try:
        response = customer_journey._las("/journey", params={"portalId": vendor_id})
        body = response.json() if response.status_code == 200 else None
    except (customer_journey.LasUnavailable, ValueError) as err:
        log.warning("NOTIFICATION_JOURNEY_UNAVAILABLE vendor=%s: %s", vendor_id, err)
        return None
    if not isinstance(body, dict):
        log.warning("NOTIFICATION_JOURNEY_UNAVAILABLE vendor=%s: LAS answered HTTP %s", vendor_id, response.status_code)
        return None
    return body


# --- the feed ---------------------------------------------------------------------------------------------------------

def _read_ids(vendor_id):
    """The ids this customer has read, or None while the table is not there (customer_notification_read.sql not run)."""
    conn = cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT notification_id FROM customer_notification_read WHERE vendor_id = %s", (vendor_id,))
        return {row[0] for row in cursor.fetchall()}
    except MySQLError as err:
        log.warning("NOTIFICATION_READ_STATE_UNAVAILABLE vendor=%s: %s", vendor_id, err)
        return None
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


def _items():
    vendor_id, stage = g.vendor["vendor_id"], g.vendor["stage"]
    if stage != auth.STAGE_ACTIVE:
        return _feed(vendor_id, stage, None)
    # LAS only knows an active customer; its two reads (SAP behind each) run side by side.
    with ThreadPoolExecutor(max_workers=1) as pool:
        return _feed(vendor_id, stage, pool.submit(_journey, vendor_id))


def _feed(vendor_id, stage, journey):
    """The items and the sources that could not be read; `journey` is the pending LAS journey read (active customers)."""
    today = date.today()
    items, unavailable = [], []
    active = journey is not None

    def read(name, reader):
        found, ok = customer_home._read(name, lambda cursor: reader(cursor, vendor_id))
        if not ok:
            unavailable.append(name)
        return found if ok else None

    records = read("onboarding", _onboarding_reader)
    if records is not None:
        rejections, ok = customer_home._read("onboarding", lambda cursor: _rejections_reader(cursor, vendor_id))
        if not ok and "onboarding" not in unavailable:
            unavailable.append("onboarding")
        items += onboarding_items(records, rejections or [], stage, today)
    agreements = read("agreement", _agreement_reader)
    if agreements is not None:
        signing = agreement_items(agreements, stage, today)
        if any(i["kind"] == "action" for i in signing):
            # The agreement's own item asks for the signature; the application's stage need not ask again.
            items = [i for i in items if not (i["id"].startswith("onb-now-agreement"))]
        items += signing
    if active:
        invoices = read("invoice", _invoice_reader)
        if invoices is not None:
            returns, ok = customer_home._read("invoice", _invoice_return_reader(invoices["ids"])) if invoices["ids"] else ([], True)
            items += invoice_items(invoices, returns if ok else None, today)
        changes = read("change_request", _change_request_reader)
        if changes is not None:
            items += change_request_items(changes, today)
        finance, status = customer_finance._finance()
        try:
            journey_body = journey.result()
        except Exception as err:  # noqa: BLE001 - whatever went wrong, the rest of the bell still shows
            log.warning("NOTIFICATION_JOURNEY_UNAVAILABLE vendor=%s: %s", vendor_id, err)
            journey_body = None
        if journey_body is None:
            unavailable.append("loan_stages")
        else:
            items += journey_items(journey_body, today)
        if status == 200:
            items += finance_items(finance, today, with_stages=journey_body is not None)
        else:
            unavailable.append("loans")
    # What needs the customer first, then the rest; newest first within each; at most MAX_ITEMS.
    unique = {}
    for item in items:
        unique.setdefault(item["id"], item)
    items = sorted(unique.values(), key=lambda i: (i["on"], i["_at"]), reverse=True)
    items.sort(key=lambda i: i["kind"] != "action")
    items = items[:MAX_ITEMS]
    for item in items:
        item["detail"] = [d for d in item["detail"] if d]
        item.pop("_at", None)
        item.pop("_pinned", None)
        item.pop("_info", None)
    return items, unavailable


@bp.get("/vendors/me/notifications")
@auth.vendor_required()
def my_notifications():
    items, unavailable = _items()
    read = _read_ids(g.vendor["vendor_id"])
    for item in items:
        item["read"] = bool(read and item["id"] in read)
    return jsonify({"items": items, "unread": sum(not i["read"] for i in items), "readState": read is not None, "unavailable": unavailable}), 200


@bp.post("/vendors/me/notifications/read")
@auth.vendor_required()
def mark_read():
    data = request.get_json(silent=True) or {}
    if data.get("all") is True:
        ids = [i["id"] for i in _items()[0]]
    else:
        ids = data.get("ids")
        if not isinstance(ids, list) or not ids or len(ids) > MAX_IDS or not all(isinstance(i, str) and _ID.match(i) for i in ids):
            return jsonify({"error": f"Send the ids to mark read (1 to {MAX_IDS})."}), 400
    vendor_id = g.vendor["vendor_id"]
    already = _read_ids(vendor_id)
    if already is None:
        return jsonify({"error": "Read status can't be saved right now."}), 503
    new = [i for i in dict.fromkeys(ids) if i not in already]
    conn = cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        for item_id in new:
            cursor.execute(
                "INSERT INTO customer_notification_read (vendor_id, notification_id, read_at) VALUES (%s, %s, NOW())",
                (vendor_id, item_id),
            )
        conn.commit()
    except MySQLError as err:
        log.warning("NOTIFICATION_MARK_READ_FAILED vendor=%s: %s", vendor_id, err)
        return jsonify({"error": "Read status can't be saved right now."}), 503
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()
    return jsonify({"marked": len(new)}), 200
