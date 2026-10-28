"""Customer type (Individual or Organization) and the CIN, which is required unless the MSME status is Registered."""
import app as portal

CIN = "U12345MH2014PTC123456"
BASE = {"vendor_type": "Organization", "msme_status": "Not registered", "cin": CIN}


def check(values, existing=None):
    return portal._validate_vendor_values(values, existing)


def test_only_individual_and_organization_are_customer_types():
    assert portal.VENDOR_TYPES == {"Individual", "Organization"}
    assert check({**BASE, "vendor_type": "Individual"}) is None
    assert check({**BASE, "vendor_type": "Private limited company"}) == "vendor_type is not a recognised value"


def test_cin_is_required_unless_msme_registered():
    for status in ("Not registered", "Not applicable"):
        assert check({**BASE, "msme_status": status, "cin": None}) == "cin is required when msme_status is not Registered"
    assert check({**BASE, "msme_status": "Registered", "udyam_number": "UDYAM-MH-12-1234567", "cin": None}) is None
    assert check({**BASE, "cin": "U123"}) == "cin must be a 21-character CIN"
    # A saved draft may still be missing it.
    assert portal._validate_vendor_values({**BASE, "cin": None}, draft=True) is None


def test_an_older_record_is_not_blocked_by_itself_on_a_profile_update():
    old = {"vendor_type": "Private limited company", "msme_status": "Not registered", "cin": None}
    # Unchanged type and no CIN: the rest can still be updated.
    assert check({"vendor_type": "Private limited company", "msme_status": "Not registered", "city": "Pune"}, old) is None
    # Changing the type, or the MSME status, holds the change to the new rules.
    assert check({"vendor_type": "Partnership"}, old) == "vendor_type is not a recognised value"
    assert check({"msme_status": "Not applicable"}, old) == "cin is required when msme_status is not Registered"
