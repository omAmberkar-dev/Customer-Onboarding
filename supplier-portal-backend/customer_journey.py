"""My loans: the signed-in customer's loan journey and documents, read from LAS (Loans Against Securities).

Once the customer is onboarded (vendor.status active) and LAS has created their SAP customer, LAS's maker and checker
carry the loan on in SAP: application, sanction, drawdowns, invoices. LAS answers for one customer at a time through its
customer journey API (Loans-Against-Securities server/controllers/customer-portal.controller.mjs), which this backend
calls server to server with the shared key in X-Portal-Key (PORTAL_JOURNEY_KEY, the same value in both .env files). The
browser never sees the key, and only ever asks about its own account: the vendor id is the signed-in one's.

    GET /vendors/me/loans                                  the journey (an empty one before onboarding is approved)
    GET /vendors/me/loans/documents/<kind>/<doc_id>       a Sanction Memo, Drawdown Memo or invoice PDF, streamed through

Only the journey itself is passed on as LAS gave it (LAS already words it for the customer); any failure is logged here
with its reason and answered in plain words.
"""
import logging
import os
import re

import requests
from flask import Blueprint, Response, g, jsonify, stream_with_context

import auth

log = logging.getLogger(__name__)

bp = Blueprint("customer_journey", __name__)

TIMEOUT_SECONDS = 30
DOCUMENT_KINDS = ("sanction", "drawdown", "invoice")
_DOC_ID = re.compile(r"^[\w-]{1,200}$")
UNAVAILABLE = "Your loan details can't be loaded right now. Please try again in a little while."
NOT_FOUND = "We couldn't find that document."


class LasUnavailable(Exception):
    """LAS is not set up, did not answer, or refused this backend; the reason is for the log, not the customer."""


def _las(path, **kwargs):
    base = os.getenv("LAS_API_URL", "").rstrip("/")
    key = os.getenv("PORTAL_JOURNEY_KEY", "")
    if not base or not key:
        raise LasUnavailable("My loans is not set up: LAS_API_URL and PORTAL_JOURNEY_KEY must both be in the backend's .env.")
    try:
        response = requests.get(f"{base}/api/customer-portal{path}", headers={"X-Portal-Key": key}, timeout=TIMEOUT_SECONDS, **kwargs)
    except requests.RequestException as err:
        raise LasUnavailable(f"LAS did not answer at {base}: {err}") from err
    if response.status_code == 401:
        raise LasUnavailable("LAS refused the key: PORTAL_JOURNEY_KEY must be the same in LAS's .env and this backend's.")
    if response.status_code == 503 and "PORTAL_JOURNEY_KEY" in response.text:
        raise LasUnavailable("LAS is not set up for My loans: PORTAL_JOURNEY_KEY is missing from LAS's .env.")
    return response


def _unavailable(err):
    log.warning("MY_LOANS_UNAVAILABLE vendor=%s: %s", g.vendor["vendor_id"], err)
    return jsonify({"error": UNAVAILABLE}), 503


def _not_onboarded(stage):
    return {"onboarded": False, "stage": stage, "steps": [], "sanctions": [], "drawdowns": [], "invoices": [], "invoicesAvailable": True}


@bp.get("/vendors/me/loans")
@auth.vendor_required()
def my_loans():
    stage = g.vendor["stage"]
    # Before the customer is active LAS has no SAP customer for them, so there is nothing to ask.
    if stage != auth.STAGE_ACTIVE:
        return jsonify(_not_onboarded(stage)), 200
    try:
        response = _las("/journey", params={"portalId": g.vendor["vendor_id"]})
    except LasUnavailable as err:
        return _unavailable(err)
    try:
        journey = response.json() if response.status_code == 200 else None
    except ValueError:
        journey = None
    if not isinstance(journey, dict):
        return _unavailable(f"LAS answered HTTP {response.status_code} ({response.headers.get('Content-Type', '')})")
    return jsonify({**journey, "stage": stage}), 200


@bp.get("/vendors/me/loans/documents/<kind>/<doc_id>")
@auth.vendor_required(auth.STAGE_ACTIVE)
def my_loan_document(kind, doc_id):
    if kind not in DOCUMENT_KINDS or not _DOC_ID.match(doc_id):
        return jsonify({"error": NOT_FOUND}), 404
    try:
        response = _las(f"/documents/{kind}/{doc_id}", params={"portalId": g.vendor["vendor_id"]}, stream=True)
    except LasUnavailable as err:
        return _unavailable(err)
    if response.status_code == 404:
        response.close()
        return jsonify({"error": NOT_FOUND}), 404
    if response.status_code != 200 or not response.headers.get("Content-Type", "").startswith("application/pdf"):
        response.close()
        return _unavailable(f"LAS answered HTTP {response.status_code} ({response.headers.get('Content-Type', '')}) for {kind} {doc_id}")

    def chunks():
        try:
            yield from response.iter_content(chunk_size=64 * 1024)
        finally:
            response.close()

    headers = {
        "Content-Disposition": response.headers.get("Content-Disposition", "inline"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    }
    if response.headers.get("Content-Length"):
        headers["Content-Length"] = response.headers["Content-Length"]
    return Response(stream_with_context(chunks()), status=200, mimetype="application/pdf", headers=headers)
