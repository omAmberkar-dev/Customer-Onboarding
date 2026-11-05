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

## 8. Phase 2 modules (2026-11-04)

The sidebar now names the modules; the paths are unchanged so email and bell links keep working. Every figure comes from LAS's `GET /api/customer-portal/finance` (or `/journey` for the memos), read for the signed-in customer only (`portalId` = the token's vendor id, partner `PORTAL-<id>`); LAS filters every row to that partner. Nothing is computed from dummy or other customers' data.

| Module (path) | What it shows | Source (LAS → portal) |
|---|---|---|
| Loans & Sanctions (`/loans`) | "Your sanctions": Sanction No., sanctioned, utilised, outstanding, available, the drawdowns under it (link to Drawdown History), validity, status. Journey tracker, sanction/drawdown/invoice cards and their PDFs as before. | T001 approved rows; utilised/available from LAS valuation; outstanding = T008 principal still due on its drawdowns. |
| Drawdown History (`/drawdowns`) | Drawdown No. (or Request No. before SAP makes the deal), Sanction No., requested amount and date, approval (with the maker / with the checker / approved / rejected), disbursed amount and date, status. A drawer per drawdown: approval chips and dated steps, its transaction history (payout, charges, payments applied), due / paid / remaining, and the Drawdown Memo (view, download). | LasDrawdown + TreasuryFlow; `approval`, `stage`, `stageHistory` from the journey's `drawdownStages`; memo via `/vendors/me/loans/documents/drawdown/<documentId>`. |
| Cashflows (`/repayments`) | KPIs and next payment, then the schedule grouped Sanction → Drawdown → instalments (due date, principal, interest, charges, amount due, paid, remaining, status); due/paid/remaining at each level; filters; PDF/Excel. | T008 AllocationItem. |
| Transactions (`/cashflow`) | Disbursements, receipts (split by what they paid) and now the **charges billed** (interest, fees, GST posted in SAP), with Sanction and Disbursement No., filters (date, type, drawdown, status, search), Actual / Pending & scheduled / All views, a drawer with the drawdown's (or receipt's) full history, PDF/Excel. | TreasuryFlow posted flows, T007, T013. Charges carry `charged` with inflow/outflow 0, so the cash totals are unchanged. |
| Receipts (`/payments`) | Received / pending approval / allocated / unallocated KPIs; each receipt with UTR, Sanction and Disbursement No., amount, allocated, unallocated and allocation status (pending approval, unallocated, partially allocated, allocated, not accepted, cancelled); a drawer with mode, purpose, recorded / confirmed / last-allocated dates and the allocation history line by line (sanction, drawdown, due date, component, amount). Statement filters by allocation. | T007 status + ZbAmt (as LAS's Allocations screen reads them) and T013. |
| Invoice Management (`/invoices`) | Unchanged list and status pill; the invoice detail now shows a progress line: Submitted → Verification (Pending Approval) → Approval (Sent for Approval / Pending Authorization) → Approved, or stopped at "Could not be read", "Returned for correction" or "Rejected". | `invoices.status` as the review app writes it. |

**Documents** is temporarily off: no sidebar entry, no route (`/documents` shows Page not found), no Home link. `DocumentsPage.jsx` and its test stay (the test renders the page directly); the loan PDFs remain on Loans & Sanctions and, for the Drawdown Memo, in Drawdown History. There is no header search in the shell, so nothing to update there.

**LAS changes** (`server/integrations/customer-finance.mjs`, read only): drawdowns carry `approval`, `stage`, `stageLabel`, `stageHistory`, `documentId`; payments carry `allocationStatus`, `referenceType` / `purpose` as LAS's receipt screens word them, `recordedOn`, `confirmedOn`, `allocatedOn`, and `sanctionNo` per allocation line; an allocation line naming a deal that is not the customer's is dropped; charges are added to `transactions`; a facility's `outstandingPrincipal` is null when a disbursed drawdown under it has no principal due in T008 yet. The journey's stage rules are loaded inside `customerFinance()` (dynamic import) because `customer-journey.mjs` pulls in `server/config.mjs`, which must not be read before the environment is set.

**Known limits**
- LAS has no **authorizer** step for drawdowns (maker and checker only), so none is shown. The approval history only has the steps SAP's single Status and dates allow (an earlier return that was corrected leaves no step).
- **Outstanding per sanction** is principal only; the headline "Total outstanding" still adds interest and charges already due. The summary's outstanding principal is not nulled for a disbursed-but-unscheduled drawdown (only the facility row is).
- **Charges** are dated by the flow's due date (SAP's posting date is not readable) and show only once posted (TBB1).
- **Allocation status** relies on T007 ZbAmt; T013 history is used for the line items. Where T013 cannot be read, lines show "can't be shown" while the status still comes from T007.
- **Invoice progress**: an invoice sent back to the RM by the checker or authorizer returns to Verification (the review app sets it back to Pending Approval); no dates per step are stored for the customer.
- Not checked in a browser or against live SAP (no VPN in this run); responsiveness was built with the existing patterns (KPI cards two across on phones, tables scroll inside their card, drawers as bottom sheets) but not visually verified at 360 px.
