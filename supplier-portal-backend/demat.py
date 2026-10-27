"""Demat account details on the onboarding form: their format rules and the Demat ID lookup.

All four fields (demat_id, dp_id, bo_id, depository) are optional, but any of the three IDs needs its depository. They are
alphanumeric, kept without spaces and in capitals, at the lengths SAP keeps: Demat ID 8-16, DP ID 8, BO ID 16 characters
(NSDL's IN300214 and CDSL's 12081600 both fit a DP ID).

The lookup posts {"demat_account_id": "<Demat ID>"} to the DEMAT URL in verification_endpoints.json. The service answers
200 {found, records: [{demat_account_id, dp_id, boid, depository, holders, bank, ...}]} or 400 {error}. Only the record's
DP ID, BO ID and depository reach the browser; the holders' and bank details stay on the server.
"""
import re

import requests

from verification import TIMEOUT_SECONDS, UNAVAILABLE_MESSAGE, VerificationUnavailable, _endpoint

DEPOSITORIES = ("CDSL", "NSDL")
ID_FIELDS = ("demat_id", "dp_id", "bo_id")
FIELDS = (*ID_FIELDS, "depository")

# column -> (pattern, message)
RULES = {
    "demat_id": (re.compile(r"^[A-Z0-9]{8,16}$"), "Enter a valid Demat ID: 8-16 letters or digits"),
    "dp_id": (re.compile(r"^[A-Z0-9]{8}$"), "Enter a valid DP ID: 8 letters or digits, e.g. IN300214 or 12081600"),
    "bo_id": (re.compile(r"^[A-Z0-9]{16}$"), "Enter a valid BO ID: 16 letters or digits"),
}
MAX_LENGTHS = {"demat_id": 16, "dp_id": 8, "bo_id": 16, "depository": 4}

NOT_FOUND_MESSAGE = "No Demat details found for this Demat ID."


def normalise(value):
    return re.sub(r"\s", "", str(value or "")).upper()


def validation_error(values, draft=False):
    """An error message for the demat fields in `values` (column names), or None.

    A draft only refuses what would not fit the columns; submit applies the format rules and the depository rule.
    """
    for field, limit in MAX_LENGTHS.items():
        if len(normalise(values.get(field))) > limit:
            return f"{field} is too long"
    if draft:
        return None
    depository = normalise(values.get("depository"))
    if depository and depository not in DEPOSITORIES:
        return "depository must be CDSL or NSDL"
    if not depository and any(normalise(values.get(field)) for field in ID_FIELDS):
        return "Select the depository (CDSL or NSDL)"
    for field, (pattern, message) in RULES.items():
        value = normalise(values.get(field))
        if value and not pattern.match(value):
            return message
    return None


def _result(verified, message, status=200, **extra):
    return {"verified": verified, "message": message, **extra}, status


def _lookup(demat_id):
    """The service's answer as (status, body). Raises VerificationUnavailable when it cannot be reached or does not answer JSON."""
    try:
        response = requests.post(_endpoint("DEMAT"), json={"demat_account_id": demat_id}, timeout=TIMEOUT_SECONDS)
        return response.status_code, response.json()
    except (requests.RequestException, ValueError) as err:
        raise VerificationUnavailable(str(err)) from err


def verify_for_form(value):
    """What the Demat ID's Verify button needs. Returns (body, http_status).

    Verified only when the service finds a record under exactly this Demat ID. "fill" then holds its dp_id, bo_id and
    depository, each only when the record has it (a depository other than CDSL / NSDL is left for the vendor to choose).
    """
    demat_id = normalise(value)
    if not demat_id:
        return _result(False, "Enter a Demat ID first.", 400)
    if not RULES["demat_id"][0].match(demat_id):
        return _result(False, RULES["demat_id"][1] + ".", 400)

    try:
        status, body = _lookup(demat_id)
    except VerificationUnavailable:
        return _result(False, UNAVAILABLE_MESSAGE, 503)

    if 400 <= status < 500 and isinstance(body, dict) and (body.get("error") or body.get("message")):
        return _result(False, f"The Demat ID could not be verified: {body.get('error') or body.get('message')}", 400)
    if status >= 400 or not isinstance(body, dict) or not isinstance(body.get("found"), bool):
        return _result(False, UNAVAILABLE_MESSAGE, 503)

    records = body.get("records") if body["found"] and isinstance(body.get("records"), list) else []
    record = next((r for r in records if isinstance(r, dict) and normalise(r.get("demat_account_id")) == demat_id), None)
    if record is None:
        return _result(False, NOT_FOUND_MESSAGE)

    depository = normalise(record.get("depository"))
    fill = {
        "dp_id": normalise(record.get("dp_id")),
        "bo_id": normalise(record.get("boid")),
        "depository": depository if depository in DEPOSITORIES else "",
    }
    fill = {key: value for key, value in fill.items() if value}
    return _result(True, "Demat ID verified. The DP ID, BO ID and depository are filled in.", fill=fill)
