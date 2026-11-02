# Customer Central — Phase 1 (finance screens): implementation and critical review

Date: 2026-11-02. Scope: Phase 1 of the master brief. Nothing is committed in either repository.

## 1. What was built

| Module | Screen / route | Status |
|---|---|---|
| Dashboard (= Financial Overview) | `/home` | Six finance KPIs, loan-utilisation chart, monthly activity chart, upcoming obligations, loan events in Recent activity. Invoice KPIs, upcoming items and quick actions kept. |
| My Loans & Sanctions | `/loans` | New "Your facilities" table (approved sanctions only). Journey tracker and memo cards unchanged. |
| Drawdown History | `/drawdowns` (new) | KPIs, filterable and sortable table. |
| Repayment Schedule | `/repayments` (new) | KPIs, upcoming-payment breakdown, instalment table, PDF/Excel statement. |
| Cashflow & Transactions | `/cashflow` (new) | KPIs, monthly inflow/outflow chart, net trend, breakdown by type, transaction table with Actual / Pending & scheduled / All views, filters, search, details dialog, PDF/Excel statement. |
| Payments & Receipts | `/payments` (new) | KPIs, payment table, details dialog with how each payment was applied, PDF/Excel statement. Read only. |
| Invoice Management | `/invoices` | Status names aligned to the brief (Draft, Under review, Returned for correction, Approved, Rejected). Nothing else changed; see §6. |
| Notifications | Header bell | The LAS Central bell pattern (items worked out from records, never stored), plus read/unread. |
| Help & Support | `/support` | Unchanged (renamed in the sidebar only). |

The sidebar labels follow the brief. Routes are unchanged, and Change Requests and Profile are kept.

## 2. Data path and source mapping

Browser → portal backend (customer token) → LAS `GET /api/customer-portal/finance?portalId=<token's id>` (server-to-server key) → SAP. The portal never calls SAP. LAS finds the customer's business partner by `PORTAL-<id>`, and every row is filtered to that partner inside LAS.

| Portal figure | LAS / SAP source |
|---|---|
| Facilities, sanctioned amount, validity | ZFS_LAS_WEB_T001 approved rows |
| Utilised, Available | LAS's own `valuation().outstanding` and `drawingPower() − pendingDrawdowns()` (same as `GET /api/sap/drawdowns`) |
| Drawdowns, statuses | LasDrawdown; "Disbursed" only once the deal's paid-out flow (category 10) is posted in TreasuryFlow |
| Repayment schedule, paid, outstanding | ZFS_LAS_WEB_T008 AllocationItem (Zamt scheduled, ZaAmt paid) |
| Interest / fees charged | TreasuryFlow flows with posting status 2 (TBB1 posted) |
| Payments, UTR, verification | ZFS_LAS_WEB_T007 receipts (Pending / Approved / Allocated / Rejected / Reversed, cancelled, written off) |
| What each payment paid | ZFS_LAS_WEB_T013 allocation history |

Never sent to the portal: SAP users, checker remarks, FI document numbers, Allocation Nos., SAP error text. All of these are checked by tests.

## 3. KPI definitions (calculated in LAS, `customer-finance.mjs` `summaryOf`)

| KPI | Definition |
|---|---|
| Total sanctioned | Σ approved sanction amounts |
| Total disbursed / Total inflows | Σ posted paid-out flows |
| Total outflows | Σ confirmed (approved or allocated) receipts; pending receipts are excluded and shown separately |
| Net cashflow | Actual inflows − actual outflows (posted only) |
| Outstanding principal | Σ T008 outstanding on principal dues (all dates) |
| Total outstanding | Outstanding principal + interest, fee and GST dues already due and unpaid. Future interest is not added. |
| Overdue | Σ T008 outstanding with due date before today |
| Upcoming payment | The earliest unpaid due date: its principal, interest and charges |
| Principal repaid / Interest paid / Fees paid | Σ T008 paid (ZaAmt) by component |
| Available limit | LAS drawing power less pending drawdowns |

Flow classification is LAS's own: category 10 is disbursement, 1200 is interest, 1110/1140/1120 are principal, GST flow types are tax, anything else is a fee. Amounts are added in paise.

Due status: paid / overdue (past due date) / due (within 7 days) / partially paid / upcoming.

## 4. APIs and database changes

New:
- LAS: `GET /api/customer-portal/finance` (read only, `X-Portal-Key`). Files: `server/integrations/customer-finance.mjs`, controller and route.
- Portal: `GET /vendors/me/finance`, `GET /vendors/me/finance/statement?section=transactions|schedule|payments&format=pdf|xlsx&from&to&disbursement&type&status` (`customer_finance.py`).
- Portal: `GET /vendors/me/notifications`, `POST /vendors/me/notifications/read` (`notifications_feed.py`).

Reused: `/vendors/me/loans`, `/vendors/me/home`, `/vendors/me/activity` (its invoice and change-request events feed the bell), the invoice endpoints, and `customer_journey._las`.

Database: one new portal table, `customer_notification_read` (`supplier-portal-backend/customer_notification_read.sql`, **must be run once**). Without it the bell still works, but every item shows as unread. No LAS or SAP data structures changed, and no SAP posting logic was touched.

## 5. Tests actually executed (2026-11-02)

| Suite | Result |
|---|---|
| LAS `tests/customer-finance.test.mjs` (new: isolation, posted vs pending, overdue, partially paid, a customer with no loans, a customer not yet in SAP, SAP failure, leak checks) | 11/11 pass |
| LAS, all 68 test files | 68/68 files pass, 0 failures |
| Portal backend `pytest` (incl. new `test_customer_finance.py` 18, `test_notifications_feed.py` 8) | 339/339 pass |
| Portal frontend `vitest` (incl. new `FinancePages.test.jsx`, `finance.test.js`; Home and navigation tests updated) | 62/62 pass |
| Frontend lint | 3 errors, all predating this work (InvoiceCompare ×2, ReplaceInvoiceModal) |
| Frontend build | pass |

**Not executed:** an end-to-end run against live SAP. LAS was not running and SAP needs the VPN. Every test uses stand-ins shaped like SAP/LAS answers. No browser or visual check of the new screens has been done.

## 6. Critical review

### Confirmed defects (minor)
1. **Cashflow statement in the "Pending & scheduled" view** exports every status, because the statement's status filter cannot express "not posted".
2. **Repayment statement filters by component status**, while the screen filters by instalment status. A "partially paid" filter can therefore give different rows.
3. **Summary totals do not check currency.** Facilities in different currencies would be added together. LAS is INR-only today, so this is latent.

### Design limitations
- **Utilised is LAS's drawn total**, not net of repayments, so it can differ from Outstanding principal. The labels say this.
- **The disbursement date is the paid-out flow's due date.** SAP's posting date is not readable (the known TreasuryFlow quirk).
- **Approved amount = requested amount**, because SAP makes the deal at the requested amount.
- **Not shown, because SAP does not hold them:** facility number and sanction-level interest rate (rate is per drawdown); Draft and Cancelled drawdown statuses; refund and adjustment transactions.
- **Payments & Receipts is read only.** There is no receipt PDF in LAS. Payment-proof upload would need a customer intake into the LAS maker workflow, which does not exist.
- **The bell has no margin-call or document-request items.** There is no live collateral valuation and no document-request register.
- **Financial Overview is merged into the Dashboard**, as one screen (brief §4 title).

### Potential risks
- **Performance:** each finance call reads the whole book's sanctions, drawdowns, T007, T008 and T013 from SAP, then filters to one customer. The bell triggers its own LAS call. Mitigation: OData filters by partner where SAP's ALPHA padding allows, plus short caching in LAS.
- **Available limit can show ₹0** for a facility with no collateral lines in SAP (LAS valuation rule).
- **Deployment:** the change is in the Desktop LAS copy, which is one commit behind the Downloads clone. It must be carried to whichever copy is deployed, and LAS and the portal backend must be restarted.
- **Sidebar labels were renamed** to the brief's names. The brief also says not to rename working navigation. Decide which applies.

### Unresolved dependencies and decisions
1. **Invoice Management §9.** Linking an invoice to a disbursement, supporting documents and manual entry all need the external staff invoice app (maker/checker/authorizer, not in this workspace) to show them. Otherwise customers would upload documents nobody reviews. Also open: the brief treats invoices as uploaded "against LAS loan dues", while today's pipeline posts them to SAP as payables. Needs a business decision.
2. **Phase 2 data:** Collateral can show the T003 collateral lines at sanction. Pledge/unpledge status and live valuation are not in SAP. Documents: sanction and drawdown memos, dues invoices and the new statements exist; interest certificates do not. Help & Support categories: support is email-only, with no request status records to track.
3. **Account 66** shares account 85's GSTIN, which still hides RM-uploaded invoices from both.
4. **Run `customer_notification_read.sql`** on the portal database.

## 7. Recommended next steps
1. Restart LAS and the portal backend, connect the VPN, and check `/cashflow` and `/repayments` against a real disbursed customer.
2. Fix the three confirmed defects.
3. Decide the invoice and §6 decisions, then build Phase 2 (Collateral from T003 lines, Documents hub over the existing PDFs and statements).
