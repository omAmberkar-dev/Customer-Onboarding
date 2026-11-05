-- What a customer submitted in each round of their application (application_history.py). Run once on the portal database.
-- The vendor row only ever holds the latest values; a resubmission after a return adds a row here instead of losing the earlier
-- round, so LAS's maker can see what changed. One row per application and round, written with the submit itself.
CREATE TABLE IF NOT EXISTS vendor_submission (
  submission_id  INT          NOT NULL AUTO_INCREMENT,
  vendor_id      INT          NOT NULL,
  round_no       INT          NOT NULL,
  details_json   LONGTEXT     NOT NULL,
  documents_json LONGTEXT     NULL,
  submitted_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (submission_id),
  UNIQUE KEY uq_vendor_submission_round (vendor_id, round_no)
);
