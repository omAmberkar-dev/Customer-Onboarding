"""Demat ID lookup (demat.verify_for_form) and the demat field rules (demat.validation_error)."""
import pytest
import requests

import demat


class Answer:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


@pytest.fixture
def service(monkeypatch):
    calls = []

    def answer_with(status, body):
        def post(url, json, timeout):
            calls.append(json)
            if isinstance(body, requests.RequestException):
                raise body
            return Answer(status, body)
        monkeypatch.setattr(demat.requests, "post", post)
        return calls
    return answer_with


RECORD = {"demat_account_id": "12081600", "dp_id": "12081600", "boid": "1208160012345678", "depository": "cdsl",
          "holders": [{"name": "Someone"}], "bank": {"account": "123"}}


def test_found_record_fills_only_dp_bo_and_depository(service):
    calls = service(200, {"found": True, "records": [RECORD]})
    body, status = demat.verify_for_form(" 1208 1600 ")
    assert calls == [{"demat_account_id": "12081600"}]
    assert status == 200 and body["verified"] is True
    assert body["fill"] == {"dp_id": "12081600", "bo_id": "1208160012345678", "depository": "CDSL"}


def test_unknown_depository_is_left_for_the_vendor(service):
    service(200, {"found": True, "records": [{**RECORD, "depository": "OTHER"}]})
    body, _ = demat.verify_for_form("12081600")
    assert "depository" not in body["fill"]


def test_record_for_another_demat_id_is_not_a_match(service):
    service(200, {"found": True, "records": [{**RECORD, "demat_account_id": "99999999"}]})
    body, status = demat.verify_for_form("12081600")
    assert status == 200 and body == {"verified": False, "message": demat.NOT_FOUND_MESSAGE}


def test_not_found(service):
    service(200, {"found": False, "records": []})
    body, status = demat.verify_for_form("12081600")
    assert status == 200 and body["verified"] is False


def test_service_refusal_is_reported_as_bad_input(service):
    service(400, {"error": "demat_account_id is invalid"})
    body, status = demat.verify_for_form("12081600")
    assert status == 400 and "demat_account_id is invalid" in body["message"]


@pytest.mark.parametrize("status, body", [(500, {"error": "boom"}), (200, {"unexpected": True}), (200, ValueError("not json")),
                                          (0, requests.Timeout("slow"))])
def test_unavailable_service(service, status, body):
    service(status, body)
    result, code = demat.verify_for_form("12081600")
    assert code == 503 and result == {"verified": False, "message": demat.UNAVAILABLE_MESSAGE}


@pytest.mark.parametrize("value", ["", "1234", "12345678901234567", "1208-1600"])
def test_badly_formed_demat_id_is_not_sent(service, value):
    calls = service(200, {"found": False})
    body, status = demat.verify_for_form(value)
    assert status == 400 and body["verified"] is False and calls == []


@pytest.mark.parametrize("values, draft, error", [
    ({}, False, None),
    ({"demat_id": "12081600", "dp_id": "12081600", "bo_id": "1208160012345678", "depository": "CDSL"}, False, None),
    ({"dp_id": "IN300214"}, False, "Select the depository (CDSL or NSDL)"),
    ({"dp_id": "IN300214"}, True, None),
    ({"depository": "BSE"}, False, "depository must be CDSL or NSDL"),
    ({"bo_id": "123", "depository": "NSDL"}, False, demat.RULES["bo_id"][1]),
    ({"dp_id": "IN3002149"}, True, "dp_id is too long"),
])
def test_validation(values, draft, error):
    assert demat.validation_error(values, draft=draft) == error
