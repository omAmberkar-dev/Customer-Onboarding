-- Which bell items a customer has read (notifications_feed.py). Run once on the portal database.
-- The items themselves are worked out from the records each time and never stored; only the read mark is.
CREATE TABLE IF NOT EXISTS customer_notification_read (
  vendor_id       INT          NOT NULL,
  notification_id VARCHAR(120) NOT NULL,
  read_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vendor_id, notification_id)
);
