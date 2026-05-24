ALTER TABLE runtime_event_ingest_queue
  ADD COLUMN IF NOT EXISTS runtime_event_id uuid REFERENCES runtime_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trace_id uuid REFERENCES runtime_traces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_event_id text,
  ADD COLUMN IF NOT EXISTS normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS correlation_strategy text
    CHECK (correlation_strategy IS NULL OR correlation_strategy IN ('explicit_correlation_id', 'hubspot_object_time_window', 'property_stage_continuity', 'association_traversal', 'workflow_graph_continuity', 'new_trace')),
  ADD COLUMN IF NOT EXISTS confidence_score numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1);

ALTER TABLE runtime_events
  ADD COLUMN IF NOT EXISTS ingest_queue_id uuid REFERENCES runtime_event_ingest_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES runtime_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS causation_event_id uuid REFERENCES runtime_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_event_id text,
  ADD COLUMN IF NOT EXISTS correlation_strategy text
    CHECK (correlation_strategy IS NULL OR correlation_strategy IN ('explicit_correlation_id', 'hubspot_object_time_window', 'property_stage_continuity', 'association_traversal', 'workflow_graph_continuity', 'new_trace')),
  ADD COLUMN IF NOT EXISTS confidence_score numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1);

ALTER TABLE runtime_state_transitions
  ADD COLUMN IF NOT EXISTS causation_event_id uuid REFERENCES runtime_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correlation_strategy text
    CHECK (correlation_strategy IS NULL OR correlation_strategy IN ('explicit_correlation_id', 'hubspot_object_time_window', 'property_stage_continuity', 'association_traversal', 'workflow_graph_continuity', 'new_trace')),
  ADD COLUMN IF NOT EXISTS source_event_type text,
  ADD COLUMN IF NOT EXISTS emitted_signal_id text REFERENCES runtime_signals(id) ON DELETE SET NULL;

ALTER TABLE runtime_traces
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_count integer NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  ADD COLUMN IF NOT EXISTS observed_edge_count integer NOT NULL DEFAULT 0 CHECK (observed_edge_count >= 0),
  ADD COLUMN IF NOT EXISTS reconstruction_version integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_runtime_ingest_event ON runtime_event_ingest_queue(runtime_event_id);
CREATE INDEX IF NOT EXISTS idx_runtime_ingest_trace ON runtime_event_ingest_queue(trace_id);
CREATE INDEX IF NOT EXISTS idx_runtime_ingest_confidence ON runtime_event_ingest_queue(confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_events_ingest ON runtime_events(ingest_queue_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_parent ON runtime_events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_causation ON runtime_events(causation_event_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_external ON runtime_events(source_system, external_event_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_confidence ON runtime_events(confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_state_transitions_causation ON runtime_state_transitions(causation_event_id);
CREATE INDEX IF NOT EXISTS idx_runtime_state_transitions_emitted_signal ON runtime_state_transitions(emitted_signal_id);

CREATE INDEX IF NOT EXISTS idx_runtime_traces_correlation ON runtime_traces(correlation_id);
CREATE INDEX IF NOT EXISTS idx_runtime_traces_last_event ON runtime_traces(last_event_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_events_external_unique
  ON runtime_events(source_system, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_ingest_external_unique
  ON runtime_event_ingest_queue(source_system, event_type, correlation_id, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE OR REPLACE VIEW runtime_ingestion_health AS
SELECT
  count(*) FILTER (WHERE processing_status = 'pending') AS pending_count,
  count(*) FILTER (WHERE processing_status = 'processed') AS processed_count,
  count(*) FILTER (WHERE processing_status = 'failed') AS failed_count,
  count(*) FILTER (WHERE processing_status = 'ignored') AS ignored_count,
  min(received_at) FILTER (WHERE processing_status = 'pending') AS oldest_pending_at,
  max(processed_at) FILTER (WHERE processing_status = 'processed') AS last_processed_at,
  count(*) FILTER (WHERE received_at > now() - interval '15 minutes') AS received_last_15m,
  count(*) FILTER (WHERE processed_at > now() - interval '15 minutes') AS processed_last_15m
FROM runtime_event_ingest_queue;

CREATE OR REPLACE VIEW runtime_trace_reconstruction_metrics AS
SELECT
  count(*) AS trace_count,
  count(*) FILTER (WHERE status = 'running') AS running_count,
  count(*) FILTER (WHERE status = 'completed') AS completed_count,
  count(*) FILTER (WHERE status = 'failed') AS failed_count,
  coalesce(avg(event_count), 0) AS avg_events_per_trace,
  coalesce(avg(observed_edge_count), 0) AS avg_observed_edges_per_trace,
  max(last_event_at) AS last_event_at
FROM runtime_traces;

COMMENT ON COLUMN runtime_events.parent_event_id IS
  'Previous observed runtime event in the reconstructed trace sequence.';

COMMENT ON COLUMN runtime_events.causation_event_id IS
  'Runtime event that most likely caused this event, for answering why a worker ran or why state changed.';

COMMENT ON COLUMN runtime_events.correlation_strategy IS
  'Strategy used to attach this event to a runtime trace.';

COMMENT ON COLUMN runtime_state_transitions.emitted_signal_id IS
  'Signal produced by this transition, used to connect observed state changes to downstream workers.';

DROP POLICY IF EXISTS "authenticated can enqueue runtime telemetry" ON runtime_event_ingest_queue;
CREATE POLICY "authenticated can enqueue runtime telemetry"
  ON runtime_event_ingest_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON POLICY "authenticated can enqueue runtime telemetry" ON runtime_event_ingest_queue IS
  'Portal users may enqueue runtime telemetry; service-role processors reconstruct traces and write canonical runtime events.';
