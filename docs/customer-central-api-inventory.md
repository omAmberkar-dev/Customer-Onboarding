# Customer Central — API inventory and source-of-truth map

Status: Gate 1 (baseline) and Gate 2 (discovery) only. Nothing is implemented from this document yet.
Inspected 2026-10-28 from the code, not from names: every row below was traced to its handler.

Two repositories are involved:

| Repo | Path | What it is |
|---|---|---|
| Customer Central (this repo) | `Desktop/Customer-Onboarding` | The customer-facing portal. React 19 + Vite + Tailwind 4 (`supplier-portal-frontend`), Flask 3 + MySQL (`supplier-portal-backend`). Customer sign-in, bearer token. |
| LAS Central | `Desktop/NEW LAS-APPLICATION/Loans-Against-Securities` | The back-office app (maker, checker, operations, auditor, admin). Node 24 HTTP server, React 19 SPA. **Keeps no database: every read goes to SAP** (`server/workspace/sap-workspace.mjs`). |

The customer portal described in the brief is this repo; LAS Central is staff-only and is used here only through its APIs.

## 1. Baseline (Gate 1)

| Check | Command | Result |
|---|---|---|
| Portal backend tests | `pytest` (277 tests, 14 files) | **PASS** 277/277 |
| Portal frontend lint | `eslint .` | **FAIL**: 3 errors that predate this work (`InvoiceCompare.jsx` ×2 react-refresh, `ReplaceInvoiceModal.jsx` unescaped `'`) |
| Portal frontend build | `vite build` | **PASS** (warning: one 800 kB chunk) |
| Portal frontend unit tests | — | **NOT RUN**: the frontend has no test runner configured |
| LAS tests | `node --test tests/*.test.mjs` per file | see section 9 |
| Live SAP | LAS → SAP OData | **BLOCKED** on 2026-10-28: every SAP read timed out (FortiVPN not connected) |

## 2. How each side authenticates

**Portal → customer.** `POST /vendors/login` issues a bearer token; `auth.vendor_required(stage)` resolves the vendor from the token (`g.vendor`) and refuses a `vendor_id` named in the request (`test_another_vendor_id_in_the_request_is_refused`). Every `/vendors/me/*` route is scoped to the signed-in vendor.

**LAS → its users.** Five demo roles (`maker`, `checker`, `operations`, `auditor`, `admin`) share one password (`LAS_DEMO_PASSWORD`), HttpOnly `las_session` cookie, 8 h. There is **no customer identity in LAS** and no per-customer filtering on its read APIs: any signed-in role reads the whole book.

**Between them (existing, server to server):**

| Direction | Key | Purpose |
|---|---|---|
| LAS → portal `/las/*` | `X-LAS-Key` = `LAS_INTEGRATION_KEY` / `PORTAL_LAS_KEY` | LAS maker/checker read and decide portal onboarding applications |
| portal → LAS `/api/customer-portal/*` | `X-Portal-Key` = `PORTAL_JOURNEY_KEY` | My loans. **Added 2026-10-28 and uncommitted in LAS**; see section 8 |

## 3. Customer → SAP business partner mapping

This is the hinge for every loan, repayment and collateral screen.

- On the LAS checker's Approve, LAS creates the SAP business partner with `BusinessPartnerIDByExtSystem = PORTAL-<vendor_id>` (`server/integrations/portal-customer.mjs`).
- The portal is **not told** the partner number. `vendor.sap_vendor` is set for 24 of 25 older active vendors (earlier vendor flow), but is **NULL for vendors approved through LAS** (e.g. vendor 85).
- LAS's public APIs return partners without the external id (`/api/sap/business-partners`: partner, name, category only), so the portal cannot resolve the mapping through an existing LAS endpoint.

**Consequence:** without a LAS-side lookup by `PORTAL-<vendor_id>` (or LAS writing the partner back to the portal), customer isolation for SAP-owned data cannot be guaranteed. Matching on name or PAN in the workspace is not acceptable.

## 4. Existing portal APIs (this repo)

All verified in `supplier-portal-backend`. "Owner" is the system of record.

| Capability | Method + route | Owner | Status |
|---|---|---|---|
| Sign in / password | `POST /vendors/login`, `POST /vendors/me/password` | Portal DB `vendor` | EXISTS |
| Customer context + profile | `GET /vendors/me` | Portal DB `vendor` | EXISTS |
| Onboarding form / submit | `PUT /vendors/me/draft`, `POST /vendors/me/submit`, `POST /vendors/verify/<service>`, `POST /vendors/check-pan`, email/phone OTP routes | Portal DB; checks via shared services | EXISTS |
| Onboarding decision | LAS calls `GET/POST /las/applications…`, `GET /las/return-reasons` | Portal DB (status), LAS decides | EXISTS |
| Customer documents | `GET /vendors/me/documents`, `GET …/content`, `DELETE /vendors/me/documents`, `POST /vendors/<id>/documents` | Azure Blob `ven-support-docs` + DB | EXISTS (onboarding documents only) |
| Change requests | `GET /vendors/me/change-request/fields`, `POST /vendors/me/change-request`, `POST …/cancel`; staff: `GET/POST /vendors/update-requests` | Portal DB `vendor_update_request` | EXISTS |
| Agreements | `GET /vendors/me/agreements`, `…/<id>/pdf`, `send-code`, `verify-code`, `code-status`, `sign`, `preview`, `decline`; `GET /agreements/verify` | Portal DB `vendor_agreement`, `agreement_event` | EXISTS |
| Agreement renewal | `GET /vendors/me/renewal`, `POST/DELETE /vendors/me/renewal-request` | Portal DB | EXISTS |
| Agreement version history | — | — | PARTIAL: one row per agreement with events; no document-version list |
| Invoices (customer uploads) | `GET /invoices`, `POST /invoices/ocr`, `POST /invoices/<id>/replace`, `…/replace-preview`, `GET …/return-reasons`, `GET …/versions`, `…/versions/<n>`, `…/versions/<n>/file` | Portal DB `invoices`, `invoice_version`, `invoice_return*` | EXISTS |
| Invoice SAP posting status | — | — | **Not confirmed.** A 16-character SAP reference is stored, but no read-back of SAP's posting status was found. These are customer-uploaded invoices, not LAS's interest/dues invoices (below). |
| My loans journey + PDFs | `GET /vendors/me/loans`, `GET /vendors/me/loans/documents/<kind>/<id>` | Proxies LAS (section 5) | EXISTS in the portal; depends on the LAS endpoint in section 8 |
| Activity history | — (tables `audit_log`, `agreement_event`, `notification_events` exist) | Portal DB | PARTIAL: data exists, no customer-facing endpoint |
| Notifications | — (`notification_events` drives staff/customer emails) | Portal DB | PARTIAL: no in-app customer feed |
| Support | — | — | MISSING: no ticket or contact API |

## 5. Existing LAS APIs and the SAP services behind them

Every LAS read is SAP, live, per request. Roles column: who LAS lets call it.

| Capability | LAS route | SAP service / entity | Roles | Per-customer filter |
|---|---|---|---|---|
| Whole workspace (applications, drawdowns, loans, customers, receipts + allocations, fees) | `GET /api/state` | `ZFS_LAS_WEB_T001` LasSanction (+ `_Collateral` T003), `ZFS_SD_LASDRAWDOWN` LasDrawdown, businessPartnerSet, `ZFS_LAS_WEB_T007` LasWebReceipt, `ZFS_LAS_WEB_T008` AllocationItem, `ZFS_LAS_WEB_T005` fees, `ZFS_SD_LASWEB` customer requests | any signed-in | **none** (whole book) |
| Sanctions (approved/rejected/reversed) | `GET /api/sanctions` | T001 | any | none |
| Drawdowns, with each facility's utilised and available (drawing power net of pending) | `GET /api/sap/drawdowns` | LasDrawdown, `trmFac` facility, partners; figures from LAS `valuation()` / `drawingPower()` | any | none |
| DPD / ageing (dues, overdue days) | `GET /api/reports/dpd?keyDate=&customer=&disbursement=&testRun=true` | T008 AllocationItem, `ZFS_SD_TRMMASTER` flow types | any | **yes**, `customer=` |
| Customer name, address, GSTIN, email | `GET /api/sap/customer-details?partner=` | `API_BUSINESS_PARTNER` | any | by partner |
| Allocation book (open dues to a key date) | `GET /api/sap/allocation-book?companyCode=&keyDate=` | T008 | any | none (company code) |
| Prepayment book / posting | `GET /api/sap/prepayment-book?companyCode=`, `/prepayment-posting` | T008, T007, `lasPrepay` | any | none (company code) |
| Invoice report (LAS dues/fees invoices, posted or not, FI docs) | `GET /api/sap/invoice-report` | `ZFS_SD_TRMFLOWPOST` TreasuryFlow, `ZFS_SD_FIACCDOC` JournalEntry | **checker/admin only** | by company code + date |
| Collateral master (securities, ISIN, LTV) | `GET /api/sap/collateral-master` | `ZFS_LAS_WEB_T002`, `ZFS_SD_TRMSECCLASS` | any | n/a (reference data) |
| Product types, flow types, company codes | `GET /api/sap/product-type(s)`, `/fee-flow-types`, `/company-codes`, `/drawdown-product-types` | `ZFS_SD_TRMMASTER`, companyCodeSet | any | n/a |
| Every write (application, drawdown, receipt, allocation, prepayment, release…) | `POST /api/command` | the services above | maker / checker per `server/services/permissions.mjs` | n/a |

**What SAP does not hold** (`sap-workspace.mjs` header, verified): pledges, margin calls, live allocations outside T008, invoices register (T018), journals, audit trail. LAS's in-memory versions of these start empty on every request.

## 6. Capability inventory (brief section 5)

Legend: EXISTS, PARTIAL, MISSING, BLOCKED, N/A.

| Capability | Status | Source of truth | How the portal can get it | Notes |
|---|---|---|---|---|
| Authenticated customer context | EXISTS | Portal `vendor` | `GET /vendors/me` | |
| Onboarding details | EXISTS | Portal `vendor` | `GET /vendors/me` | |
| Customer → SAP partner | **BLOCKED** | SAP BP `PORTAL-<vendor_id>` | Only through a LAS lookup (section 3) | Required by every SAP row below |
| Customer facilities | PARTIAL | SAP T001 | LAS workspace filtered by partner | No per-customer LAS API except section 8 |
| Sanction details | PARTIAL | SAP T001 | same | Limit, dates, status, Sanction No |
| Facility eligibility (can draw?) | PARTIAL | LAS `drawingPower()` / `valuation()` | `GET /api/sap/drawdowns` `available` per facility (whole book) | The full rule set (`services/policy.mjs`, `margin.mjs`) runs only inside `POST /api/command`; `available` is an indication, not a guarantee |
| Drawdown history / status | PARTIAL | SAP LasDrawdown | LAS workspace filtered | Approved = SAP holds the TRM deal |
| Drawdown submission | **MISSING** | LAS `drawdownRequest` command, maker role | — | Only a LAS maker can raise one. The portal must not sign in as a maker (bypasses maker-checker). Needs a customer intake LAS reviews. |
| Loan account details | PARTIAL | SAP (deal per approved drawdown) | LAS workspace | `loans[].principal` is the **drawn total**, not outstanding after repayment |
| Outstanding dues / overdue | PARTIAL | SAP T008 flows | `GET /api/reports/dpd?customer=` (test run) | Needs partner number; LAS session |
| Repayment history / receipts | PARTIAL | SAP T007 + T008 | LAS workspace `receipts` filtered | Receipt has partner via its sanction |
| Payment-proof upload | MISSING | — | — | Receipts are maker-entered in LAS; no customer upload path |
| Invoice upload / list / verification | EXISTS | Portal DB | `/invoices*` | Customer-uploaded invoices |
| Invoice posting status (SAP) | MISSING | SAP FI | — | For portal uploads |
| LAS dues/fee invoices (PDF) | PARTIAL | SAP TreasuryFlow posted | checker-only report, or section 8 | |
| Agreement details / document | EXISTS | Portal DB | `/vendors/me/agreements*` | |
| Agreement version history | PARTIAL | Portal DB `agreement_event` | — | Events, not versions |
| Change requests | EXISTS | Portal DB | `/vendors/me/change-request*` | |
| Customer profile | EXISTS | Portal DB (SAP BP for LAS customers after approval) | `GET /vendors/me` | SAP copy is not synced back |
| Securities / collateral | PARTIAL | SAP T003 `_Collateral` lines | LAS workspace `proposals[].collateralLines` | Quantity and value **at sanction** |
| Collateral valuation (live) | **MISSING / unverified** | — | — | No SAP price feed identified |
| Pledge status | MISSING | not in SAP | — | |
| Margin status / shortfall | MISSING | not in SAP | — | `margin.mjs` rules exist; no data |
| Collateral top-up / release request | MISSING | LAS `releaseRequest`, maker only | — | Same intake problem as drawdowns |
| Home summary (invoices, agreement, change requests) | **EXISTS (new, Task 1)** | Portal DB | `GET /vendors/me/home` | Each section read on its own; a failed one is `null` + listed in `unavailable`, never 0 |
| Activity history | **EXISTS (new, Task 1)** | Portal `audit_log`, `agreement_event`, `invoices`, `vendor_update_request` | `GET /vendors/me/activity?limit=` | Allow-listed customer events only; no staff names, routing, SAP sync or before/after values. LAS keeps no audit trail, so loan events are not included |
| Notifications | MISSING | — | — | `notification_events` is the email-template catalogue, not a per-customer feed. No bell badge until a feed exists |
| Support | MISSING | — | — | Needs a business decision (contact details vs ticketing) |

## 7. Options for reading LAS data with **no change to LAS**

| | A. Portal signs in to LAS as `auditor` | B. Keep the additive LAS endpoint (section 8) |
|---|---|---|
| LAS code changed | No | Yes: 2 new files + 3 lines (new routes only) |
| Mapping vendor → partner | **Not possible** (section 3) | LAS looks up `PORTAL-<vendor_id>` |
| Customer isolation | Portal filters a whole-book response | LAS only ever returns one customer |
| Credential | Shared demo password stored in the portal | Dedicated key, one purpose |
| Load | Whole workspace + receipts per page view | Same SAP reads, one customer's JSON |
| Verdict | Blocked by the mapping, and weaker security | Recommended |

Writes (drawdown requests, payment proof, top-up/release) cannot be done through LAS without either impersonating a LAS maker (breaks maker-checker) or a LAS change that gives makers an intake queue, the way portal onboarding applications already work.

## 8. LAS customer endpoints: now in LAS itself (update)

Later on 2026-10-28 the LAS team committed its own version (LAS `8ab39e6`: `server/controllers/customer-portal.controller.mjs`, `server/integrations/customer-journey.mjs`, `server/middleware/portal-key.mjs`), with the same two routes and the same X-Portal-Key contract. Loans & Sanctions reads it live. Its drawdown statuses are requested → approved → disbursed (the deal's paid-out flow posted in SAP) → settled (every flow posted, none due after today), or not_approved. The history below is kept for the record.

### Earlier: removed

On 2026-10-28 read-only `GET /api/customer-portal/journey` and `/documents/<kind>/<id>` (X-Portal-Key) were added to LAS for My loans, then **reset out of the LAS repo** (LAS is clean at `4bc0426`). They will not be re-added from this side.

Effect: once LAS is restarted from the reset code, the portal's `GET /vendors/me/loans` and `/vendors/me/loans/documents/*` (customer_journey.py) answer 503 "can't be loaded right now" (LAS answers 401 for the unknown route without a session). On 2026-10-28 17:30 the running LAS process (started 16:37) still held the endpoints in memory and served vendor 85's live journey (SAP partner 700000692, no sanctions yet), which confirms the mapping and the SAP reads work end to end. Loans & Sanctions shows that message; Home shows its Loans card as unavailable, with retry, and the rest of Home works. Every LAS/SAP-owned row in section 6 is **BLOCKED** until LAS provides a per-customer read, or the business accepts option A of section 7 (which is itself blocked by the partner mapping).

## 9. LAS regression baseline

LAS `HEAD` (committed code, run from an export so the LAS folder was not touched), per file with a 120 s limit: 52 of 54 files run, **42 PASS, 10 FAIL before any portal-related change**:

| File | Failure (baseline) |
|---|---|
| `application-email` | imports `applicationReturnedEmail`, which `customer-emails.mjs` does not export |
| `customer-request-sap`, `customer-request-ui` | import `server/db/seed.mjs`, which no longer exists |
| `approval-mail-server` | SAP service `trmFac` missing from the test's SAP config |
| `customer-request-email` (5), `customer-request-store-e2e` (4) | assertion failures |
| `dpd-report-ui`, `receipts-ui` | screen text changed, test not updated |
| `sap-transport` (1) | 401 logon message assertion |
| `dpd-report-ui` | also exceeded the 120 s limit |

The working-copy comparison (HEAD + the section 8 files) was **NOT RUN** (stopped on request). `tests/customer-portal.test.mjs`: **PASS** 6/6.

## 9a. Invoice ownership (fixed 2026-10-28)

Invoices a Relationship Manager uploads are stored with `vendor_id = 'maker'` and no target customer; the invoice's GSTIN (`vendor_tax_id`) is the only link. GSTIN is not unique per portal account (21 active accounts share `29AQAPP7250M1ZC`; 66 and 85 share `27AAGCA5936J1ZE`), so every account with that GSTIN used to see all RM uploads for it.

Rule now (`app._vendor_invoice_ids`, behind `GET /invoices`, Home and Activity): own uploads always; an RM upload only when its GSTIN is the account's **and no other active account has that GSTIN**. Ambiguous uploads are shown to nobody. Detail endpoints (return reasons, versions, replace) already allowed own uploads only.

Effect on 2026-10-28 data: 16 accounts lost rows they should not have seen; **no account currently sees any RM upload**, because all 22 RM uploads carry a shared GSTIN. The RM upload happens in the enterprise (maker/checker) app, not this repo; it needs to record the target `vendor_id` (or the business must allow one active account per GSTIN) before RM uploads can reappear for the right customer.

## 9b. Support messages

`POST /vendors/me/support-request` (support_requests.py) sends through the shared email service to the `SUPPORT` email group, else `SUPPORT_EMAIL`. The service sends only named templates and has none for this (27 listed on 2026-10-28), so the template name is the `SUPPORT_REQUEST_TEMPLATE` setting; while unset the endpoint answers 503 and nothing is sent. Template params: request_id, customer_id, customer_name, customer_email, contact_no, topic, reference, message, submitted_at.

## 10. Dependencies needing other teams

| Need | Team |
|---|---|
| Decide whether LAS may gain read-only customer endpoints (section 7 B) | Product / LAS owners |
| A customer intake for drawdown, top-up and release requests in LAS (maker queue) | LAS owners |
| Live collateral valuation, pledge status, margin calls in SAP | SAP team (no service exists) |
| Outstanding principal after repayments (not the drawn total) | SAP team: authoritative balance service |
| SAP posting status for customer-uploaded invoices | SAP team |
| FortiVPN / SAP DS4 access from the test machine | Infra |
| Support channel definition | Business |
| The four reference images (Home, Invoices, Agreement, Change Requests) | You |
