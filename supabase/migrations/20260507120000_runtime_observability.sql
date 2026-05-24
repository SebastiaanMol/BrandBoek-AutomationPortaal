CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS runtime_workflow_graphs (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  primary_hubspot_object_type text,
  primary_pipeline_ids text[] NOT NULL DEFAULT '{}',
  criticality text NOT NULL DEFAULT 'medium'
    CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_workers (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  source_system text NOT NULL DEFAULT 'gitlab'
    CHECK (source_system IN ('gitlab', 'hubspot_workflow', 'portal', 'external', 'manual_model')),
  actor_role text NOT NULL
    CHECK (actor_role IN ('route', 'compute', 'propagate', 'enrich', 'sync', 'migrate', 'coordinate', 'guard', 'repair')),
  workflow_graph_id text REFERENCES runtime_workflow_graphs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deprecated', 'inferred')),
  gitlab_file_path text,
  endpoint_method text,
  endpoint_path text,
  handler_name text,
  business_semantics text,
  fan_out_risk text,
  orchestration_risk text,
  risk_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_signals (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  signal_type text NOT NULL
    CHECK (signal_type IN ('property', 'dealstage', 'pipeline', 'association', 'external_event', 'worker_event', 'runtime_event', 'unknown')),
  hubspot_object_type text
    CHECK (hubspot_object_type IS NULL OR hubspot_object_type IN ('deal', 'company', 'contact', 'dossier', 'workflow', 'pipeline', 'none')),
  property_name text,
  property_label text,
  stage_id text,
  stage_label text,
  pipeline_id text,
  pipeline_label text,
  semantic_group text,
  is_orchestration_hub boolean NOT NULL DEFAULT false,
  hub_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (hub_score >= 0 AND hub_score <= 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_worker_reads (
  worker_id text NOT NULL REFERENCES runtime_workers(id) ON DELETE CASCADE,
  signal_id text NOT NULL REFERENCES runtime_signals(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, signal_id)
);

CREATE TABLE IF NOT EXISTS runtime_worker_writes (
  worker_id text NOT NULL REFERENCES runtime_workers(id) ON DELETE CASCADE,
  signal_id text NOT NULL REFERENCES runtime_signals(id) ON DELETE CASCADE,
  write_kind text NOT NULL DEFAULT 'property'
    CHECK (write_kind IN ('property', 'dealstage', 'pipeline', 'signal', 'external_state', 'unknown')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, signal_id, write_kind)
);

CREATE TABLE IF NOT EXISTS runtime_association_paths (
  id text PRIMARY KEY,
  path_label text NOT NULL UNIQUE,
  from_object_type text,
  to_object_type text,
  semantic_meaning text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_worker_traverses (
  worker_id text NOT NULL REFERENCES runtime_workers(id) ON DELETE CASCADE,
  association_path_id text NOT NULL REFERENCES runtime_association_paths(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, association_path_id)
);

CREATE TABLE IF NOT EXISTS runtime_edges (
  id text PRIMARY KEY,
  source_worker_id text NOT NULL REFERENCES runtime_workers(id) ON DELETE CASCADE,
  target_worker_id text NOT NULL REFERENCES runtime_workers(id) ON DELETE CASCADE,
  emitted_signal_id text REFERENCES runtime_signals(id) ON DELETE SET NULL,
  source_signal_id text REFERENCES runtime_signals(id) ON DELETE SET NULL,
  target_trigger_signal_id text REFERENCES runtime_signals(id) ON DELETE SET NULL,
  workflow_graph_id text REFERENCES runtime_workflow_graphs(id) ON DELETE SET NULL,
  relationship_type text NOT NULL
    CHECK (relationship_type IN ('direct', 'derived', 'cross-workflow', 'temporal', 'inferred', 'observed')),
  relationship_origin text NOT NULL DEFAULT 'manual_model'
    CHECK (relationship_origin IN ('static_code_analysis', 'manual_model', 'hubspot_workflow_metadata', 'observed_runtime_trace', 'hybrid')),
  evidence_type text NOT NULL DEFAULT 'manual_model'
    CHECK (evidence_type IN ('code_static', 'manual_model', 'hubspot_metadata', 'observed_trace', 'hybrid')),
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_label text NOT NULL DEFAULT 'medium'
    CHECK (confidence_label IN ('low', 'medium', 'high', 'confirmed')),
  confidence_reasons text[] NOT NULL DEFAULT '{}',
  fan_out_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (fan_out_score >= 0 AND fan_out_score <= 100),
  fan_out_risk text NOT NULL DEFAULT 'medium'
    CHECK (fan_out_risk IN ('low', 'medium', 'high', 'critical')),
  risk_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  observed_count integer NOT NULL DEFAULT 0 CHECK (observed_count >= 0),
  last_observed_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_worker_id, target_worker_id, emitted_signal_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS runtime_hubs (
  id text PRIMARY KEY,
  hub_type text NOT NULL CHECK (hub_type IN ('signal', 'worker', 'pipeline', 'association_path')),
  ref_id text NOT NULL,
  name text NOT NULL,
  reason text,
  hub_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (hub_score >= 0 AND hub_score <= 100),
  blast_radius_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (blast_radius_score >= 0 AND blast_radius_score <= 100),
  incoming_edge_count integer NOT NULL DEFAULT 0 CHECK (incoming_edge_count >= 0),
  outgoing_edge_count integer NOT NULL DEFAULT 0 CHECK (outgoing_edge_count >= 0),
  observed_event_count integer NOT NULL DEFAULT 0 CHECK (observed_event_count >= 0),
  affected_workflow_graph_ids text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hub_type, ref_id)
);

CREATE TABLE IF NOT EXISTS runtime_loops (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  risk_level text NOT NULL DEFAULT 'high'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  is_confirmed_observed boolean NOT NULL DEFAULT false,
  mitigation_hint text,
  through_signal_ids text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_loop_edges (
  loop_id text NOT NULL REFERENCES runtime_loops(id) ON DELETE CASCADE,
  edge_id text NOT NULL REFERENCES runtime_edges(id) ON DELETE CASCADE,
  sequence_index integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (loop_id, edge_id)
);

CREATE TABLE IF NOT EXISTS runtime_loop_workers (
  loop_id text NOT NULL REFERENCES runtime_loops(id) ON DELETE CASCADE,
  worker_id text NOT NULL REFERENCES runtime_workers(id) ON DELETE CASCADE,
  sequence_index integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (loop_id, worker_id)
);

CREATE TABLE IF NOT EXISTS runtime_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_event_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  root_hubspot_object_type text,
  root_hubspot_object_id text,
  workflow_graph_ids text[] NOT NULL DEFAULT '{}',
  summary text,
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid REFERENCES runtime_traces(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL
    CHECK (event_type IN ('webhook_received', 'worker_started', 'worker_finished', 'hubspot_property_changed', 'hubspot_stage_changed', 'api_write', 'error', 'portal_action', 'external_event')),
  source_system text NOT NULL
    CHECK (source_system IN ('gitlab', 'hubspot', 'portal', 'supabase_edge', 'external', 'manual')),
  worker_id text REFERENCES runtime_workers(id) ON DELETE SET NULL,
  signal_id text REFERENCES runtime_signals(id) ON DELETE SET NULL,
  hubspot_object_type text,
  hubspot_object_id text,
  property_name text,
  old_value text,
  new_value text,
  dealstage_old text,
  dealstage_new text,
  pipeline_id text,
  correlation_id text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE runtime_traces
  DROP CONSTRAINT IF EXISTS runtime_traces_root_event_id_fkey;

ALTER TABLE runtime_traces
  ADD CONSTRAINT runtime_traces_root_event_id_fkey
  FOREIGN KEY (root_event_id) REFERENCES runtime_events(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS runtime_trace_events (
  trace_id uuid NOT NULL REFERENCES runtime_traces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES runtime_events(id) ON DELETE CASCADE,
  sequence_index integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trace_id, event_id)
);

CREATE TABLE IF NOT EXISTS runtime_state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES runtime_events(id) ON DELETE SET NULL,
  trace_id uuid REFERENCES runtime_traces(id) ON DELETE SET NULL,
  worker_id text REFERENCES runtime_workers(id) ON DELETE SET NULL,
  signal_id text REFERENCES runtime_signals(id) ON DELETE SET NULL,
  transition_type text NOT NULL
    CHECK (transition_type IN ('property_write', 'dealstage_change', 'pipeline_change', 'association_change', 'external_state')),
  hubspot_object_type text,
  hubspot_object_id text,
  property_name text,
  old_value text,
  new_value text,
  pipeline_id text,
  dealstage_old text,
  dealstage_new text,
  confidence_score numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_risks (
  id text PRIMARY KEY,
  target_type text NOT NULL CHECK (target_type IN ('worker', 'signal', 'edge', 'hub', 'loop')),
  target_id text NOT NULL,
  risk_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level text NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_reasons text[] NOT NULL DEFAULT '{}',
  fan_out_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (fan_out_score >= 0 AND fan_out_score <= 100),
  loop_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (loop_score >= 0 AND loop_score <= 100),
  cross_workflow_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (cross_workflow_score >= 0 AND cross_workflow_score <= 100),
  temporal_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (temporal_score >= 0 AND temporal_score <= 100),
  migration_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (migration_score >= 0 AND migration_score <= 100),
  repair_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (repair_score >= 0 AND repair_score <= 100),
  observed_error_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (observed_error_score >= 0 AND observed_error_score <= 100),
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id)
);

CREATE TABLE IF NOT EXISTS runtime_event_ingest_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  source_system text NOT NULL,
  event_type text NOT NULL,
  correlation_id text,
  hubspot_object_type text,
  hubspot_object_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processed', 'failed', 'ignored')),
  processed_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_runtime_workers_workflow_graph ON runtime_workers(workflow_graph_id);
CREATE INDEX IF NOT EXISTS idx_runtime_workers_role ON runtime_workers(actor_role);
CREATE INDEX IF NOT EXISTS idx_runtime_workers_risk_score ON runtime_workers(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_workers_metadata_gin ON runtime_workers USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_runtime_signals_type ON runtime_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_runtime_signals_property ON runtime_signals(property_name);
CREATE INDEX IF NOT EXISTS idx_runtime_signals_hub ON runtime_signals(is_orchestration_hub, hub_score DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_signals_metadata_gin ON runtime_signals USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_runtime_worker_reads_signal ON runtime_worker_reads(signal_id);
CREATE INDEX IF NOT EXISTS idx_runtime_worker_writes_signal ON runtime_worker_writes(signal_id);
CREATE INDEX IF NOT EXISTS idx_runtime_worker_traverses_path ON runtime_worker_traverses(association_path_id);

CREATE INDEX IF NOT EXISTS idx_runtime_edges_source ON runtime_edges(source_worker_id);
CREATE INDEX IF NOT EXISTS idx_runtime_edges_target ON runtime_edges(target_worker_id);
CREATE INDEX IF NOT EXISTS idx_runtime_edges_signal ON runtime_edges(emitted_signal_id);
CREATE INDEX IF NOT EXISTS idx_runtime_edges_workflow_graph ON runtime_edges(workflow_graph_id);
CREATE INDEX IF NOT EXISTS idx_runtime_edges_confidence ON runtime_edges(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_edges_risk ON runtime_edges(risk_score DESC, fan_out_score DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_edges_observed ON runtime_edges(observed_count DESC, last_observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_edges_metadata_gin ON runtime_edges USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_runtime_hubs_ref ON runtime_hubs(hub_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_runtime_hubs_score ON runtime_hubs(hub_score DESC, blast_radius_score DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_loops_risk ON runtime_loops(risk_level, risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_events_trace ON runtime_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_occurred ON runtime_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_events_worker ON runtime_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_signal ON runtime_events(signal_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_hubspot_object ON runtime_events(hubspot_object_type, hubspot_object_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_correlation ON runtime_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_runtime_events_raw_payload_gin ON runtime_events USING gin(raw_payload);

CREATE INDEX IF NOT EXISTS idx_runtime_traces_root_object ON runtime_traces(root_hubspot_object_type, root_hubspot_object_id);
CREATE INDEX IF NOT EXISTS idx_runtime_traces_status ON runtime_traces(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_trace_events_sequence ON runtime_trace_events(trace_id, sequence_index);

CREATE INDEX IF NOT EXISTS idx_runtime_state_transitions_object ON runtime_state_transitions(hubspot_object_type, hubspot_object_id);
CREATE INDEX IF NOT EXISTS idx_runtime_state_transitions_property ON runtime_state_transitions(property_name);
CREATE INDEX IF NOT EXISTS idx_runtime_state_transitions_signal ON runtime_state_transitions(signal_id);
CREATE INDEX IF NOT EXISTS idx_runtime_state_transitions_occurred ON runtime_state_transitions(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_risks_target ON runtime_risks(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_runtime_risks_score ON runtime_risks(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_ingest_status ON runtime_event_ingest_queue(processing_status, received_at);
CREATE INDEX IF NOT EXISTS idx_runtime_ingest_correlation ON runtime_event_ingest_queue(correlation_id);

DROP TRIGGER IF EXISTS set_runtime_workflow_graphs_updated_at ON runtime_workflow_graphs;
CREATE TRIGGER set_runtime_workflow_graphs_updated_at
  BEFORE UPDATE ON runtime_workflow_graphs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_runtime_workers_updated_at ON runtime_workers;
CREATE TRIGGER set_runtime_workers_updated_at
  BEFORE UPDATE ON runtime_workers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_runtime_signals_updated_at ON runtime_signals;
CREATE TRIGGER set_runtime_signals_updated_at
  BEFORE UPDATE ON runtime_signals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_runtime_association_paths_updated_at ON runtime_association_paths;
CREATE TRIGGER set_runtime_association_paths_updated_at
  BEFORE UPDATE ON runtime_association_paths
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_runtime_edges_updated_at ON runtime_edges;
CREATE TRIGGER set_runtime_edges_updated_at
  BEFORE UPDATE ON runtime_edges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_runtime_hubs_updated_at ON runtime_hubs;
CREATE TRIGGER set_runtime_hubs_updated_at
  BEFORE UPDATE ON runtime_hubs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_runtime_loops_updated_at ON runtime_loops;
CREATE TRIGGER set_runtime_loops_updated_at
  BEFORE UPDATE ON runtime_loops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_runtime_traces_updated_at ON runtime_traces;
CREATE TRIGGER set_runtime_traces_updated_at
  BEFORE UPDATE ON runtime_traces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_runtime_risks_updated_at ON runtime_risks;
CREATE TRIGGER set_runtime_risks_updated_at
  BEFORE UPDATE ON runtime_risks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE runtime_workflow_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_worker_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_worker_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_association_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_worker_traverses ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_loop_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_loop_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_trace_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_event_ingest_queue ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'runtime_workflow_graphs',
    'runtime_workers',
    'runtime_signals',
    'runtime_worker_reads',
    'runtime_worker_writes',
    'runtime_association_paths',
    'runtime_worker_traverses',
    'runtime_edges',
    'runtime_hubs',
    'runtime_loops',
    'runtime_loop_edges',
    'runtime_loop_workers',
    'runtime_events',
    'runtime_traces',
    'runtime_trace_events',
    'runtime_state_transitions',
    'runtime_risks'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "authenticated can read %I" ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY "authenticated can read %I" ON %I FOR SELECT TO authenticated USING (true)',
      table_name,
      table_name
    );
  END LOOP;
END
$$;

COMMENT ON TABLE runtime_workers IS
  'Runtime transition actors in the HubSpot orchestration graph. These are workers, workflows, portal actions or external actors, not CRUD catalog items.';

COMMENT ON TABLE runtime_signals IS
  'HubSpot runtime signals such as properties, dealstages, pipelines, associations and external events that can trigger propagation.';

COMMENT ON TABLE runtime_edges IS
  'Directed inferred or observed runtime propagation relationships between workers through emitted HubSpot signals.';

COMMENT ON TABLE runtime_events IS
  'Observed runtime telemetry events, used to reconstruct actual traces and confirm inferred graph relationships.';

COMMENT ON TABLE runtime_state_transitions IS
  'Normalized HubSpot state changes derived from runtime events.';
