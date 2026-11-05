"""Money with LAS: the signed-in customer's facilities, drawdowns, dues, payments and transactions, read from LAS's
customer finance API (Loans-Against-Securities server/integrations/customer-finance.mjs), and their statements.

    GET /vendors/me/finance                       what LAS answers, as it answered (LAS words it for the customer)
    GET /vendors/me/finance/statement             a statement of one section as PDF or Excel (.xlsx), with the
                                                  same filters as the screen: section=transactions|schedule|payments,
                                                  format=pdf|xlsx, from, to (YYYY-MM-DD), disbursement, type, status

LAS reads SAP for it; this backend never does. The portal id sent to LAS is always the signed-in customer's (the same
server-to-server key and failure handling as My loans, customer_journey.py), so one customer can never ask for
another's. Every figure is LAS's: nothing here adds, nets or estimates an amount; a statement only lists rows.
"""
import io
import logging
import re
import zipfile
from datetime import date, datetime
from xml.sax.saxutils import escape

from flask import Blueprint, Response, g, jsonify, request

import auth
import customer_journey

log = logging.getLogger(__name__)

bp = Blueprint("customer_finance", __name__)

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TOKEN = re.compile(r"^[\w-]{0,40}$")

# Each statement section: its rows in the finance answer, its date field, the field `type` filters, and its columns
# as (heading, field, kind) with kind text, date or money.
SECTIONS = {
    "transactions": {
        "title": "Transaction statement",
        "rows": "transactions",
        "date": "date",
        "type": "type",
        "columns": [
            ("Date", "date", "date"), ("Reference", "reference", "text"), ("Sanction No.", "sanctionNo", "text"),
            ("Disbursement No.", "disbursementNo", "text"), ("Type", "type", "label"), ("Description", "description", "text"),
            ("Inflow", "inflow", "money"), ("Outflow", "outflow", "money"), ("Charged", "charged", "money"),
            ("Currency", "currency", "text"), ("Status", "status", "label"),
            ("Payment reference / UTR", "paymentReference", "text"),
        ],
    },
    "schedule": {
        "title": "Repayment statement",
        "rows": "schedule",
        "date": "dueDate",
        "type": "kind",
        "columns": [
            ("Sanction No.", "sanctionNo", "text"), ("Disbursement No.", "disbursementNo", "text"), ("Instalment", "instalment", "text"),
            ("Due date", "dueDate", "date"),
            ("Component", "kind", "label"), ("Description", "description", "text"), ("Amount due", "amount", "money"),
            ("Paid", "paid", "money"), ("Outstanding", "outstanding", "money"), ("Status", "status", "label"),
        ],
    },
    "payments": {
        "title": "Receipts statement",
        "rows": "payments",
        "date": "paymentDate",
        # The Receipts screen's allocation filter (allocated, partially allocated, unallocated, pending approval).
        "type": "allocationStatus",
        "columns": [
            ("Payment date", "paymentDate", "date"), ("Receipt No.", "receiptNo", "text"), ("Payment reference / UTR", "reference", "text"),
            ("Mode", "referenceType", "text"), ("Sanction No.", "sanctionNo", "text"), ("Disbursement No.", "disbursementNo", "text"),
            ("Amount", "amount", "money"), ("Applied to dues", "applied", "money"), ("Not yet applied", "unapplied", "money"),
            ("Currency", "currency", "text"), ("Status", "status", "label"), ("Allocation", "allocationStatus", "allocation"),
        ],
    },
}
LABELS = {
    "disbursement": "Loan disbursement", "principal_repayment": "Principal repayment", "interest_payment": "Interest payment",
    "fee_payment": "Fees and charges", "payment": "Payment", "reversal": "Reversal", "posted": "Posted", "scheduled": "Scheduled",
    "pending": "Pending verification", "rejected": "Not accepted", "cancelled": "Cancelled", "confirmed": "Confirmed",
    "allocated": "Applied to dues", "principal": "Principal", "interest": "Interest", "fee": "Fees and charges", "tax": "GST",
    "paid": "Paid", "overdue": "Overdue", "due": "Due", "partially_paid": "Partially paid", "upcoming": "Upcoming",
    "interest_charge": "Interest charged", "fee_charge": "Fees and GST charged",
}
# A receipt's allocation state (LAS customer-finance.mjs allocationStatus), for the payments statement's Allocation column.
ALLOCATION_LABELS = {
    "pending_approval": "Pending approval", "unallocated": "Unallocated", "partially_allocated": "Partially allocated",
    "allocated": "Allocated", "rejected": "Not accepted", "cancelled": "Cancelled",
}


def _finance():
    """LAS's answer for the signed-in customer as (body, status); the empty answer before onboarding is approved."""
    if g.vendor["stage"] != auth.STAGE_ACTIVE:
        return {"onboarded": False, "stage": g.vendor["stage"]}, 200
    try:
        response = customer_journey._las("/finance", params={"portalId": g.vendor["vendor_id"]})
    except customer_journey.LasUnavailable as err:
        log.warning("MY_FINANCE_UNAVAILABLE vendor=%s: %s", g.vendor["vendor_id"], err)
        return {"error": customer_journey.UNAVAILABLE}, 503
    try:
        body = response.json() if response.status_code == 200 else None
    except ValueError:
        body = None
    if not isinstance(body, dict):
        log.warning("MY_FINANCE_UNAVAILABLE vendor=%s: LAS answered HTTP %s", g.vendor["vendor_id"], response.status_code)
        return {"error": customer_journey.UNAVAILABLE}, 503
    return {**body, "stage": g.vendor["stage"]}, 200


@bp.get("/vendors/me/finance")
@auth.vendor_required()
def my_finance():
    body, status = _finance()
    return jsonify(body), status


def filtered(rows, section, args):
    """The rows a statement lists: those inside the date range and matching the disbursement, type and status asked.
    Raises ValueError naming a filter that is not well formed."""
    spec = SECTIONS[section]
    start, end = args.get("from", ""), args.get("to", "")
    for value in (start, end):
        if value and not _DATE.match(value):
            raise ValueError("Dates must be YYYY-MM-DD.")
    if start and end and start > end:
        raise ValueError("The start date is later than the end date.")
    wanted = {key: args.get(key, "") for key in ("disbursement", "type", "status")}
    if not all(_TOKEN.match(v) for v in wanted.values()):
        raise ValueError("A filter is not valid.")
    out = []
    for row in rows or []:
        on = str(row.get(spec["date"]) or "")
        if (start and on < start) or (end and on > end):
            continue
        if wanted["disbursement"] and str(row.get("disbursementNo") or "") != wanted["disbursement"]:
            continue
        if wanted["type"] and spec["type"] and row.get(spec["type"]) != wanted["type"]:
            continue
        if wanted["status"] and row.get("status") != wanted["status"]:
            continue
        out.append(row)
    return out


def _cell(row, field, kind):
    value = row.get(field)
    if value is None or value == "":
        return ""
    if kind == "label":
        return LABELS.get(value, str(value))
    if kind == "allocation":
        return ALLOCATION_LABELS.get(value, str(value))
    if kind == "money":
        return float(value)
    return str(value)


def _money_text(value):
    """₹ amounts as Indian grouping, e.g. 12,34,567.80."""
    whole, frac = f"{abs(value):.2f}".split(".")
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    grouped = ",".join(([head] if head else []) + groups + [tail]) if head or groups else tail
    return f"{'-' if value < 0 else ''}{grouped}.{frac}"


def xlsx(title, columns, rows):
    """A one-sheet .xlsx (Office Open XML, written with the standard library): a heading row, then one row per record;
    amounts are numbers, everything else text."""
    def col(i):
        name = ""
        i += 1
        while i:
            i, rem = divmod(i - 1, 26)
            name = chr(65 + rem) + name
        return name

    def cell(ref, value, style=0):
        if isinstance(value, float):
            return f'<c r="{ref}" s="{style or 2}"><v>{value}</v></c>'
        return f'<c r="{ref}" t="inlineStr" s="{style}"><is><t xml:space="preserve">{escape(value)}</t></is></c>'

    lines = [f'<row r="1">{"".join(cell(f"{col(i)}1", h, 1) for i, (h, _, _) in enumerate(columns))}</row>']
    for n, row in enumerate(rows, start=2):
        lines.append(f'<row r="{n}">' + "".join(cell(f"{col(i)}{n}", _cell(row, f, k)) for i, (_, f, k) in enumerate(columns)) + "</row>")
    widths = "".join(f'<col min="{i + 1}" max="{i + 1}" width="{22 if k != "money" else 16}" customWidth="1"/>' for i, (_, _, k) in enumerate(columns))
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             f'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews>'
             f'<cols>{widths}</cols><sheetData>{"".join(lines)}</sheetData></worksheet>')
    styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
              '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
              '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
              '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
              '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
              '<cellXfs count="3"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs>'
              '</styleSheet>')
    sheet_name = escape(title[:31])
    parts = {
        "[Content_Types].xml": ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                                '<Default Extension="xml" ContentType="application/xml"/>'
                                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                                '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                                '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                                '</Types>'),
        "_rels/.rels": ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                        '</Relationships>'),
        "xl/workbook.xml": ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                            f'<sheets><sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets></workbook>'),
        "xl/_rels/workbook.xml.rels": ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                                       '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                       '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
                                       '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                                       '</Relationships>'),
        "xl/worksheets/sheet1.xml": sheet,
        "xl/styles.xml": styles,
    }
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in parts.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def pdf(title, columns, rows, customer, period):
    """A landscape A4 statement: the customer, the period, generated date, then the rows as a table."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm,
                            bottomMargin=12 * mm, title=title)
    styles = getSampleStyleSheet()
    small = styles["BodyText"].clone("small", fontSize=7.5, leading=9)
    head = [Paragraph(f"<b>{escape(h)}</b>", small) for h, _, _ in columns]
    body = []
    for row in rows:
        cells = []
        for _, field, kind in columns:
            value = _cell(row, field, kind)
            cells.append(Paragraph(_money_text(value) if isinstance(value, float) else escape(value), small))
        body.append(cells)
    table = Table([head, *body] if body else [head, [Paragraph("No records for this selection.", small)] + [""] * (len(columns) - 1)],
                  repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2fb")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#0046dc")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#d8e0e9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
    ] + [("ALIGN", (i, 1), (i, -1), "RIGHT") for i, (_, _, k) in enumerate(columns) if k == "money"]))
    story = [
        Paragraph(f"<b>{escape(title)}</b>", styles["Title"]),
        Paragraph(escape(customer), styles["BodyText"]),
        Paragraph(escape(f"Period: {period} · Generated {date.today().isoformat()} · Amounts as recorded by LAS"), small),
        Spacer(1, 6 * mm),
        table,
    ]
    doc.build(story)
    return buffer.getvalue()


@bp.get("/vendors/me/finance/statement")
@auth.vendor_required(auth.STAGE_ACTIVE)
def my_statement():
    section, kind = request.args.get("section", ""), request.args.get("format", "")
    if section not in SECTIONS or kind not in ("pdf", "xlsx"):
        return jsonify({"error": "Choose a statement (transactions, schedule or payments) and a format (pdf or xlsx)."}), 400
    body, status = _finance()
    if status != 200:
        return jsonify(body), status
    spec = SECTIONS[section]
    source = body.get(spec["rows"])
    if body.get("onboarded") is False or source is None:
        return jsonify({"error": "This statement can't be produced right now. Please try again later."}), 409
    try:
        rows = filtered(source, section, request.args)
    except ValueError as err:
        return jsonify({"error": str(err)}), 400
    period = f"{request.args.get('from') or 'start'} to {request.args.get('to') or date.today().isoformat()}"
    customer = " · ".join(filter(None, [body.get("customerName"), body.get("customerNo") and f"Customer No. {body['customerNo']}"]))
    stamp = datetime.now().strftime("%Y%m%d")
    if kind == "xlsx":
        content, mimetype, ext = xlsx(spec["title"], spec["columns"], rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    else:
        content, mimetype, ext = pdf(spec["title"], spec["columns"], rows, customer, period), "application/pdf", "pdf"
    log.info("MY_STATEMENT vendor=%s section=%s format=%s rows=%s", g.vendor["vendor_id"], section, kind, len(rows))
    return Response(content, mimetype=mimetype, headers={
        "Content-Disposition": f'attachment; filename="{section.capitalize()}_Statement_{stamp}.{ext}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })
