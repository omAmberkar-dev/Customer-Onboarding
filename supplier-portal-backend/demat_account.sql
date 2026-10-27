-- Demat account details on the vendor onboarding form (see demat.py). Run once on the portal database, before deploying the code
-- that reads these columns. All four are optional; lengths match the SAP customer request columns.
ALTER TABLE vendor
  ADD COLUMN demat_id   VARCHAR(16) NULL AFTER cin,
  ADD COLUMN dp_id      VARCHAR(8)  NULL AFTER demat_id,
  ADD COLUMN bo_id      VARCHAR(16) NULL AFTER dp_id,
  ADD COLUMN depository VARCHAR(4)  NULL AFTER bo_id;
