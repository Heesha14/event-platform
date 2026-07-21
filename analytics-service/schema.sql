-- Analytics Service schema
-- Run against the ClickHouse database configured via CLICKHOUSE_DB.
--
-- One wide table covers all three tracked analytics; event_type tells them
-- apart so each stays a cheap filter rather than a separate table:
--   event_view             - a visitor viewed a specific event's page
--   ticket_interest        - a visitor clicked a "register/buy tickets" CTA
--   registration_started   - the registration form was submitted (pre-API-call)
--   registration_completed - the registration API call succeeded

CREATE TABLE IF NOT EXISTS analytics_events
(
    event_time   DateTime DEFAULT now(),
    event_type   LowCardinality(String),
    event_id     UInt32,
    session_id   String,
    ticket_count UInt16 DEFAULT 0,
    referrer     String DEFAULT '',
    user_agent   String DEFAULT ''
)
ENGINE = MergeTree()
ORDER BY (event_type, event_id, event_time);
