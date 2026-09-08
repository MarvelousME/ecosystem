CREATE TABLE IF NOT EXISTS bridge_events(
  timestamp DateTime64(3), tenant_id String, subject LowCardinality(String), event_id UUID, payload String
) ENGINE=MergeTree ORDER BY (tenant_id,subject,timestamp);
