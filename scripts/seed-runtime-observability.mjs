import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();
const profilesPath = path.join(repoRoot, "docs", "runtime-orchestration", "worker-profiles.json");
const graphPath = path.join(repoRoot, "docs", "runtime-orchestration", "runtime-propagation-graph.json");

const apply = process.argv.includes("--apply");
const sqlFileIndex = process.argv.indexOf("--sql-file");
const sqlFilePath = sqlFileIndex >= 0 ? process.argv[sqlFileIndex + 1] : null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function slug(value, prefix = "") {
  const clean = String(value || "unknown")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return prefix ? `${prefix}-${clean || "unknown"}` : clean || "unknown";
}

function canonicalGraphName(value) {
  return String(value || "unknown").split(" -> ")[0].trim();
}

function graphId(value) {
  return slug(canonicalGraphName(value), "wg");
}

function uniqueById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

function riskLevelFromText(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("critical") || text.includes("very high") || text.includes("zeer hoog")) return "critical";
  if (text.includes("high") || text.includes("hoog")) return "high";
  if (text.includes("low") || text.includes("laag")) return "low";
  return "medium";
}

function scoreFromRisk(level) {
  return { low: 20, medium: 45, high: 70, critical: 90 }[level] ?? 45;
}

function confidenceFromLabel(label) {
  return { low: 0.35, medium: 0.6, high: 0.8, confirmed: 1 }[label] ?? 0.6;
}

function confidenceLabel(value) {
  const text = String(value || "").toLowerCase();
  if (text === "high") return "high";
  if (text === "low") return "low";
  if (text === "confirmed") return "confirmed";
  return "medium";
}

function inferSignalType(name, sourceKind = "") {
  const text = `${name} ${sourceKind}`.toLowerCase();
  if (text.includes("dealstage") || text.includes("stage")) return "dealstage";
  if (text.includes("pipeline")) return "pipeline";
  if (text.includes("association") || text.includes("->")) return "association";
  if (text.includes("webhook") || text.includes("external") || text.includes("submitted")) return "external_event";
  if (sourceKind === "emits") return "worker_event";
  if (sourceKind === "writes_property" || sourceKind === "reads_property" || text.includes("_")) return "property";
  return "unknown";
}

function inferObjectType(name) {
  const text = String(name || "").toLowerCase();
  if (text.includes("company") || text.includes("bedrijf") || text.includes("bankkoppeling")) return "company";
  if (text.includes("contact") || text.includes("machtiging_fiscaal") || text.includes("partner")) return "contact";
  if (text.includes("pipeline")) return "pipeline";
  if (text.includes("dossier")) return "dossier";
  if (text.includes("deal") || text.includes("stage") || text.includes("year") || text.includes("quarter")) return "deal";
  return null;
}

function signalRecord(name, sourceKind = "", metadata = {}) {
  const signalType = inferSignalType(name, sourceKind);
  const propertyLike = signalType === "property" ? String(name) : null;
  const stageLike = signalType === "dealstage" ? String(name) : null;
  return {
    id: slug(name, "sig"),
    name: String(name),
    signal_type: signalType,
    hubspot_object_type: inferObjectType(name),
    property_name: propertyLike,
    property_label: propertyLike,
    stage_label: stageLike,
    semantic_group: inferSemanticGroup(name),
    metadata,
  };
}

function inferSemanticGroup(name) {
  const text = String(name || "").toLowerCase();
  if (text.includes("bank")) return "bank_connection";
  if (text.includes("machtiging") || text.includes("typeform") || text.includes("ib_")) return "ib_readiness";
  if (text.includes("jr") || text.includes("jaarrekening")) return "jr_readiness";
  if (text.includes("btw") || text.includes("quarter") || text.includes("kwartaal")) return "btw_progress";
  if (text.includes("owner") || text.includes("controleur") || text.includes("boeker")) return "assignment";
  if (text.includes("betaalt") || text.includes("payment")) return "payment";
  if (text.includes("year") || text.includes("jaar")) return "temporal";
  if (text.includes("pipeline") || text.includes("dealstage")) return "routing";
  return null;
}

function collectWorkflowGraphs(profiles, graph) {
  const names = new Set();
  for (const profile of profiles) names.add(canonicalGraphName(profile.workflow_graph));
  for (const edge of graph.edges) names.add(canonicalGraphName(edge.workflow_graph));
  for (const chain of graph.major_runtime_chains || []) names.add(canonicalGraphName(chain.workflow_graph));
  return [...names].filter(Boolean).map((name) => ({
    id: graphId(name),
    name,
    description: `Runtime workflow graph for ${name}.`,
    criticality: /debtor|migration|ib|vpb|va|btw/i.test(name) ? "high" : "medium",
    metadata: { imported_from: "runtime-orchestration-json" },
  }));
}

function collectWorkers(profiles) {
  return profiles.map((profile) => {
    const riskLevel = riskLevelFromText(`${profile.orchestration_risk} ${profile.fan_out_risk}`);
    return {
      id: slug(profile.worker_name, "worker"),
      name: profile.worker_name,
      source_system: "gitlab",
      actor_role: profile.runtime_actor_role,
      workflow_graph_id: graphId(profile.workflow_graph),
      status: "inferred",
      business_semantics: profile.business_semantics,
      fan_out_risk: profile.fan_out_risk,
      orchestration_risk: profile.orchestration_risk,
      risk_score: scoreFromRisk(riskLevel),
      confidence_score: 0.65,
      metadata: {
        root_trigger_events: profile.root_trigger_events,
        trigger_signals: profile.trigger_signals,
        reads_entities: profile.reads_entities,
        reads_properties: profile.reads_properties,
        traverses_associations: profile.traverses_associations,
        computes: profile.computes,
        writes_properties: profile.writes_properties,
        writes_dealstages: profile.writes_dealstages,
        emits_signals: profile.emits_signals,
        downstream_workflows: profile.downstream_workflows,
        temporal_logic: profile.temporal_logic,
        imported_from: "worker-profiles.json",
      },
    };
  });
}

function collectSignals(profiles, graph) {
  const records = [];
  for (const profile of profiles) {
    for (const value of profile.trigger_signals || []) records.push(signalRecord(value, "trigger", { source: "trigger_signals" }));
    for (const value of profile.reads_properties || []) records.push(signalRecord(value, "reads_property", { source: "reads_properties" }));
    for (const value of profile.writes_properties || []) records.push(signalRecord(value, "writes_property", { source: "writes_properties" }));
    for (const value of profile.writes_dealstages || []) records.push(signalRecord(value, "writes_dealstage", { source: "writes_dealstages" }));
    for (const value of profile.emits_signals || []) records.push(signalRecord(value, "emits", { source: "emits_signals" }));
  }
  for (const edge of graph.edges || []) records.push(signalRecord(edge.emitted_signal, "emits", { source: "runtime_edges" }));
  for (const signal of graph.critical_runtime_signals || []) records.push(signalRecord(signal, "critical_signal", { source: "critical_runtime_signals" }));
  for (const hub of graph.orchestration_hubs || []) {
    records.push({
      ...signalRecord(hub.signal, "hub", { source: "orchestration_hubs", reason: hub.why, blast_radius: hub.blast_radius }),
      is_orchestration_hub: true,
      hub_score: scoreFromRisk(riskLevelFromText(hub.blast_radius)),
    });
  }
  return uniqueById(records).map((record) => ({
    is_orchestration_hub: false,
    hub_score: 0,
    ...record,
  }));
}

function collectWorkerReads(profiles) {
  const rows = [];
  for (const profile of profiles) {
    const workerId = slug(profile.worker_name, "worker");
    for (const value of [...(profile.trigger_signals || []), ...(profile.reads_properties || [])]) {
      rows.push({ worker_id: workerId, signal_id: slug(value, "sig"), metadata: { imported_from: "worker profile" } });
    }
  }
  return uniqueByCompound(rows, (row) => `${row.worker_id}:${row.signal_id}`);
}

function collectWorkerWrites(profiles) {
  const rows = [];
  for (const profile of profiles) {
    const workerId = slug(profile.worker_name, "worker");
    for (const value of profile.writes_properties || []) {
      rows.push({ worker_id: workerId, signal_id: slug(value, "sig"), write_kind: "property", metadata: { imported_from: "worker profile" } });
    }
    for (const value of profile.writes_dealstages || []) {
      rows.push({ worker_id: workerId, signal_id: slug(value, "sig"), write_kind: "dealstage", metadata: { imported_from: "worker profile" } });
    }
    for (const value of profile.emits_signals || []) {
      rows.push({ worker_id: workerId, signal_id: slug(value, "sig"), write_kind: "signal", metadata: { imported_from: "worker profile" } });
    }
  }
  return uniqueByCompound(rows, (row) => `${row.worker_id}:${row.signal_id}:${row.write_kind}`);
}

function uniqueByCompound(items, keyFn) {
  const map = new Map();
  for (const item of items) map.set(keyFn(item), item);
  return [...map.values()];
}

function collectAssociationPaths(profiles) {
  const rows = [];
  for (const profile of profiles) {
    for (const value of profile.traverses_associations || []) {
      const [from, to] = String(value).split("->").map((part) => part.trim());
      rows.push({
        id: slug(value, "assoc"),
        path_label: String(value),
        from_object_type: from || null,
        to_object_type: to || null,
        semantic_meaning: inferSemanticGroup(value),
        metadata: { imported_from: "worker profile" },
      });
    }
  }
  return uniqueById(rows);
}

function collectWorkerTraverses(profiles) {
  const rows = [];
  for (const profile of profiles) {
    const workerId = slug(profile.worker_name, "worker");
    for (const value of profile.traverses_associations || []) {
      rows.push({ worker_id: workerId, association_path_id: slug(value, "assoc"), metadata: { imported_from: "worker profile" } });
    }
  }
  return uniqueByCompound(rows, (row) => `${row.worker_id}:${row.association_path_id}`);
}

function collectEdges(graph) {
  return graph.edges.map((edge) => {
    const risk = riskLevelFromText(edge.fan_out_risk);
    const confidence = confidenceLabel(edge.confidence);
    return {
      id: slug(`${edge.source_worker} ${edge.emitted_signal} ${edge.target_worker} ${edge.relationship_type}`, "edge"),
      source_worker_id: slug(edge.source_worker, "worker"),
      target_worker_id: slug(edge.target_worker, "worker"),
      emitted_signal_id: slug(edge.emitted_signal, "sig"),
      workflow_graph_id: graphId(edge.workflow_graph),
      relationship_type: edge.relationship_type,
      relationship_origin: "manual_model",
      evidence_type: "manual_model",
      confidence_score: confidenceFromLabel(confidence),
      confidence_label: confidence,
      confidence_reasons: [`Seeded from inferred runtime propagation graph with ${edge.confidence} confidence.`],
      fan_out_score: scoreFromRisk(risk),
      fan_out_risk: risk,
      risk_score: scoreFromRisk(risk),
      notes: null,
      metadata: {
        source_worker: edge.source_worker,
        target_worker: edge.target_worker,
        emitted_signal: edge.emitted_signal,
        workflow_graph_label: edge.workflow_graph,
        imported_from: "runtime-propagation-graph.json",
      },
    };
  });
}

function collectHubs(graph) {
  return (graph.orchestration_hubs || []).map((hub) => {
    const risk = riskLevelFromText(hub.blast_radius);
    const signalId = slug(hub.signal, "sig");
    return {
      id: slug(hub.signal, "hub"),
      hub_type: "signal",
      ref_id: signalId,
      name: hub.signal,
      reason: hub.why,
      hub_score: scoreFromRisk(risk),
      blast_radius_score: scoreFromRisk(risk),
      affected_workflow_graph_ids: [],
      metadata: { blast_radius: hub.blast_radius, imported_from: "runtime-propagation-graph.json" },
    };
  });
}

function collectLoops(graph) {
  return (graph.dangerous_propagation_loops || []).map((loop) => {
    const risk = riskLevelFromText(loop.risk);
    return {
      id: slug(loop.loop.join(" "), "loop"),
      name: loop.loop.join(" -> "),
      description: loop.risk,
      risk_level: risk,
      risk_score: scoreFromRisk(risk),
      is_confirmed_observed: false,
      mitigation_hint: loop.mitigation_hint,
      through_signal_ids: (loop.through_signals || []).map((signal) => slug(signal, "sig")),
      metadata: { workers: loop.loop, through_signals: loop.through_signals, imported_from: "runtime-propagation-graph.json" },
    };
  });
}

function collectLoopWorkers(graph) {
  const rows = [];
  for (const loop of graph.dangerous_propagation_loops || []) {
    const loopId = slug(loop.loop.join(" "), "loop");
    (loop.loop || []).forEach((worker, index) => {
      rows.push({
        loop_id: loopId,
        worker_id: slug(worker, "worker"),
        sequence_index: index,
        metadata: { imported_from: "runtime-propagation-graph.json" },
      });
    });
  }
  return uniqueByCompound(rows, (row) => `${row.loop_id}:${row.worker_id}`);
}

function collectLoopEdges(graph, edges) {
  const edgeByPair = new Map();
  for (const edge of edges) edgeByPair.set(`${edge.source_worker_id}:${edge.target_worker_id}`, edge.id);

  const rows = [];
  for (const loop of graph.dangerous_propagation_loops || []) {
    const loopId = slug(loop.loop.join(" "), "loop");
    for (let index = 0; index < loop.loop.length; index += 1) {
      const source = slug(loop.loop[index], "worker");
      const target = slug(loop.loop[(index + 1) % loop.loop.length], "worker");
      const edgeId = edgeByPair.get(`${source}:${target}`);
      if (!edgeId) continue;
      rows.push({ loop_id: loopId, edge_id: edgeId, sequence_index: index, metadata: { imported_from: "runtime-propagation-graph.json" } });
    }
  }
  return uniqueByCompound(rows, (row) => `${row.loop_id}:${row.edge_id}`);
}

function collectRisks(workers, signals, edges, hubs, loops) {
  const rows = [];
  for (const worker of workers) {
    const risk = riskLevelFromText(`${worker.orchestration_risk} ${worker.fan_out_risk}`);
    rows.push(riskRecord("worker", worker.id, scoreFromRisk(risk), risk, [worker.orchestration_risk, worker.fan_out_risk].filter(Boolean)));
  }
  for (const signal of signals.filter((item) => item.is_orchestration_hub || item.hub_score > 0)) {
    const risk = riskLevelFromText(signal.hub_score >= 75 ? "critical" : signal.hub_score >= 60 ? "high" : "medium");
    rows.push(riskRecord("signal", signal.id, signal.hub_score || scoreFromRisk(risk), risk, ["orchestration hub"]));
  }
  for (const edge of edges) {
    rows.push(riskRecord("edge", edge.id, edge.risk_score, edge.fan_out_risk, [`${edge.relationship_type} propagation`, `${edge.fan_out_risk} fan-out`]));
  }
  for (const hub of hubs) {
    const risk = riskLevelFromText(hub.blast_radius_score >= 75 ? "critical" : hub.blast_radius_score >= 60 ? "high" : "medium");
    rows.push(riskRecord("hub", hub.id, hub.blast_radius_score, risk, [hub.reason].filter(Boolean)));
  }
  for (const loop of loops) {
    rows.push(riskRecord("loop", loop.id, loop.risk_score, loop.risk_level, [loop.description, loop.mitigation_hint].filter(Boolean)));
  }
  return uniqueById(rows);
}

function riskRecord(targetType, targetId, score, level, reasons) {
  return {
    id: slug(`${targetType} ${targetId}`, "risk"),
    target_type: targetType,
    target_id: targetId,
    risk_score: score,
    risk_level: level,
    risk_reasons: reasons,
    fan_out_score: targetType === "edge" || targetType === "hub" ? score : 0,
    loop_score: targetType === "loop" ? score : 0,
    cross_workflow_score: reasons.some((reason) => String(reason).includes("cross-workflow")) ? score : 0,
    temporal_score: reasons.some((reason) => String(reason).includes("temporal")) ? score : 0,
    migration_score: reasons.some((reason) => String(reason).toLowerCase().includes("migrat")) ? score : 0,
    repair_score: reasons.some((reason) => String(reason).toLowerCase().includes("repair")) ? score : 0,
    metadata: { imported_from: "runtime seed" },
  };
}

function buildSeed() {
  const profiles = readJson(profilesPath);
  const graph = readJson(graphPath);
  const workflowGraphs = uniqueById(collectWorkflowGraphs(profiles, graph));
  const workers = collectWorkers(profiles);
  const signals = collectSignals(profiles, graph);
  const workerReads = collectWorkerReads(profiles);
  const workerWrites = collectWorkerWrites(profiles);
  const associationPaths = collectAssociationPaths(profiles);
  const workerTraverses = collectWorkerTraverses(profiles);
  const edges = collectEdges(graph);
  const hubs = collectHubs(graph);
  const loops = collectLoops(graph);
  const loopWorkers = collectLoopWorkers(graph);
  const loopEdges = collectLoopEdges(graph, edges);
  const risks = collectRisks(workers, signals, edges, hubs, loops);

  return {
    runtime_workflow_graphs: workflowGraphs,
    runtime_workers: workers,
    runtime_signals: signals,
    runtime_worker_reads: workerReads,
    runtime_worker_writes: workerWrites,
    runtime_association_paths: associationPaths,
    runtime_worker_traverses: workerTraverses,
    runtime_edges: edges,
    runtime_hubs: hubs,
    runtime_loops: loops,
    runtime_loop_workers: loopWorkers,
    runtime_loop_edges: loopEdges,
    runtime_risks: risks,
  };
}

async function upsertTable(supabase, table, rows) {
  if (!rows.length) return;
  const chunkSize = 250;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk);
    if (error) {
      throw new Error(`Failed to upsert ${table}: ${error.message}`);
    }
  }
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (Array.isArray(value)) {
    return `ARRAY[${value.map((item) => toSqlLiteral(item)).join(", ")}]::text[]`;
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const conflictTargets = {
  runtime_workflow_graphs: ["id"],
  runtime_workers: ["id"],
  runtime_signals: ["id"],
  runtime_worker_reads: ["worker_id", "signal_id"],
  runtime_worker_writes: ["worker_id", "signal_id", "write_kind"],
  runtime_association_paths: ["id"],
  runtime_worker_traverses: ["worker_id", "association_path_id"],
  runtime_edges: ["id"],
  runtime_hubs: ["id"],
  runtime_loops: ["id"],
  runtime_loop_workers: ["loop_id", "worker_id"],
  runtime_loop_edges: ["loop_id", "edge_id"],
  runtime_risks: ["id"],
};

function buildInsertSql(table, rows) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const conflict = conflictTargets[table];
  const updateColumns = columns.filter((column) => !conflict.includes(column));
  const values = rows
    .map((row) => `  (${columns.map((column) => toSqlLiteral(row[column])).join(", ")})`)
    .join(",\n");
  const updateClause = updateColumns.length
    ? `DO UPDATE SET ${updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`
    : "DO NOTHING";

  return [
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES`,
    values,
    `ON CONFLICT (${conflict.join(", ")}) ${updateClause};`,
  ].join("\n");
}

function writeSqlSeed(seed, filePath) {
  const order = [
    "runtime_workflow_graphs",
    "runtime_workers",
    "runtime_signals",
    "runtime_worker_reads",
    "runtime_worker_writes",
    "runtime_association_paths",
    "runtime_worker_traverses",
    "runtime_edges",
    "runtime_hubs",
    "runtime_loops",
    "runtime_loop_workers",
    "runtime_loop_edges",
    "runtime_risks",
  ];

  const sql = [
    "-- Generated by scripts/seed-runtime-observability.mjs --sql-file",
    "BEGIN;",
    ...order.map((table) => buildInsertSql(table, seed[table])).filter(Boolean),
    "COMMIT;",
    "",
  ].join("\n\n");

  fs.writeFileSync(filePath, sql, "utf8");
}

async function main() {
  const seed = buildSeed();
  const counts = Object.fromEntries(Object.entries(seed).map(([key, rows]) => [key, rows.length]));

  if (sqlFilePath) {
    writeSqlSeed(seed, path.resolve(repoRoot, sqlFilePath));
    console.log(JSON.stringify({ mode: "sql-file", path: sqlFilePath, counts }, null, 2));
    return;
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", counts }, null, 2));

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to write to Supabase.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL or VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before using --apply.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const order = [
    "runtime_workflow_graphs",
    "runtime_workers",
    "runtime_signals",
    "runtime_worker_reads",
    "runtime_worker_writes",
    "runtime_association_paths",
    "runtime_worker_traverses",
    "runtime_edges",
    "runtime_hubs",
    "runtime_loops",
    "runtime_loop_workers",
    "runtime_loop_edges",
    "runtime_risks",
  ];

  for (const table of order) {
    await upsertTable(supabase, table, seed[table]);
    console.log(`Seeded ${table}: ${seed[table].length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
