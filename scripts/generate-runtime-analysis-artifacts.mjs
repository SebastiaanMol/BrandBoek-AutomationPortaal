import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();
const orchestrationDir = path.join(repoRoot, "docs", "runtime-orchestration");
const gitlabSourceRoot = path.join(repoRoot, "gitlabtest", "app");

const profilesPath = path.join(orchestrationDir, "worker-profiles.json");
const graphPath = path.join(orchestrationDir, "runtime-propagation-graph.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(fileName, value) {
  const filePath = path.join(orchestrationDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
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

function walk(dir) {
  const items = [];
  if (!fs.existsSync(dir)) return items;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) items.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".py")) items.push(full);
  }
  return items;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function relative(filePath) {
  return toPosix(path.relative(repoRoot, filePath));
}

function lineIndent(line) {
  return line.match(/^(\s*)/)?.[1].length ?? 0;
}

function parseConstants(content) {
  const constants = new Map();
  for (const match of content.matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*["']([^"']+)["']/gm)) {
    constants.set(match[1], match[2]);
  }
  return constants;
}

function parseRouterPrefix(content) {
  const match = content.match(/router\s*=\s*APIRouter\s*\([\s\S]*?prefix\s*=\s*["']([^"']+)["']/m);
  return match?.[1] || "";
}

function joinRoute(prefix, routePath) {
  const left = String(prefix || "").replace(/\/$/, "");
  const right = String(routePath || "").startsWith("/") ? routePath : `/${routePath}`;
  return left ? `${left}${right}` : right;
}

function normalizeImportBlocks(content) {
  const lines = content.split(/\r?\n/);
  const result = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*from app\..*import\s*\(\s*$/.test(line)) {
      const block = [line.trim()];
      while (i + 1 < lines.length) {
        i += 1;
        block.push(lines[i].trim());
        if (lines[i].includes(")")) break;
      }
      result.push(block.join(" "));
    } else {
      result.push(line);
    }
  }
  return result;
}

function parseFunctions(content) {
  const lines = normalizeImportBlocks(content);
  const functions = [];
  let pendingDecorators = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("@")) {
      pendingDecorators.push(trimmed);
      continue;
    }

    const defMatch = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\((.*)$/);
    if (!defMatch) {
      if (trimmed && !trimmed.startsWith("#")) pendingDecorators = [];
      continue;
    }

    const indent = defMatch[1].length;
    const name = defMatch[2];
    const signatureParts = [line.trim()];
    while (!signatureParts.at(-1)?.trim().endsWith(":") && i + 1 < lines.length) {
      i += 1;
      signatureParts.push(lines[i].trim());
    }

    const body = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const bodyLine = lines[j];
      if (bodyLine.trim() && lineIndent(bodyLine) <= indent) break;
      body.push(bodyLine);
    }
    i = j - 1;

    functions.push({
      name,
      decorators: pendingDecorators,
      signature: signatureParts.join(" "),
      body: body.join("\n"),
    });
    pendingDecorators = [];
  }

  return functions;
}

function resolveConstantOrLiteral(value, constants) {
  const trimmed = String(value || "").trim();
  const literal = trimmed.match(/^["']([^"']+)["']$/);
  if (literal) return literal[1];
  return constants.get(trimmed) || null;
}

function extractListValues(fragment, constants) {
  const values = new Set();
  for (const match of fragment.matchAll(/["']([a-zA-Z0-9_]+)["']/g)) values.add(match[1]);
  for (const match of fragment.matchAll(/\b([A-Z][A-Z0-9_]*)\b/g)) {
    const resolved = constants.get(match[1]);
    if (resolved) values.add(resolved);
  }
  return [...values];
}

function extractPropertiesArgument(body, constants) {
  const values = new Set();
  for (const match of body.matchAll(/properties\s*=\s*\[([\s\S]*?)\]/g)) {
    for (const value of extractListValues(match[1], constants)) values.add(value);
  }
  for (const match of body.matchAll(/,\s*\[([\s\S]{0,600}?)\]\s*(?:,|\))/g)) {
    for (const value of extractListValues(match[1], constants)) values.add(value);
  }
  return [...values].filter(isLikelyProperty);
}

function extractWriteProperties(body, constants) {
  const values = new Set();
  const windows = [
    ...body.matchAll(/update_deal_properties[\s\S]{0,900}/g),
    ...body.matchAll(/create_deal[\s\S]{0,900}/g),
    ...body.matchAll(/batch_create_deals[\s\S]{0,900}/g),
  ].map((match) => match[0]);

  for (const window of windows) {
    for (const key of window.matchAll(/["']([a-zA-Z0-9_]+)["']\s*:/g)) values.add(key[1]);
    for (const constName of window.matchAll(/\{\s*([A-Z][A-Z0-9_]*)\s*:/g)) {
      const resolved = constants.get(constName[1]);
      if (resolved) values.add(resolved);
    }
  }

  return [...values].filter(isLikelyProperty);
}

function isLikelyProperty(value) {
  const text = String(value || "");
  if (!text || text.length > 80) return false;
  if (/^(message|reason|error|updated|matched|target|status|id|name|value)$/.test(text)) return false;
  return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(text);
}

function detectAssociations(body) {
  const checks = [
    ["get_contact_id", "deal -> contact"],
    ["get_contacts_for_deal", "deal -> contact"],
    ["batch_get_contacts_for_deals", "deal -> contact"],
    ["get_deals_for_contact", "contact -> deal"],
    ["get_companies_for_contact", "contact -> company"],
    ["batch_get_companies_for_contacts", "contact -> company"],
    ["get_deals_for_company", "company -> deal"],
    ["batch_get_companies_for_deals", "deal -> company"],
    ["associations.contact", "deal -> contact"],
    ["associations.company", "deal -> company"],
  ];
  return checks.filter(([needle]) => body.includes(needle)).map(([, label]) => label);
}

function detectHubSpotRepositoryCalls(body) {
  const calls = new Set();
  for (const match of body.matchAll(/hubspot_calls\.([a-zA-Z_]\w*)/g)) calls.add(match[1]);
  return [...calls].sort();
}

function detectServiceCallHints(body) {
  const calls = new Set();
  for (const match of body.matchAll(/(?:await\s+|return\s+await\s+|background_tasks\.add_task\()\s*([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\s*\(/g)) {
    const raw = match[1];
    if (
      raw === "call_hubspot_api" ||
      raw.startsWith("logger.") ||
      raw.startsWith("logging.") ||
      raw.startsWith("HTTPException")
    ) {
      continue;
    }
    calls.add(raw);
  }
  return [...calls].sort();
}

function detectTemporalLogic(body, reads, writes) {
  const text = `${body} ${reads.join(" ")} ${writes.join(" ")}`.toLowerCase();
  const labels = [];
  if (/\byear\b|jaar/.test(text)) labels.push("year-based matching");
  if (/quarter|kwartaal|q1|q2|q3|q4/.test(text)) labels.push("quarter readiness");
  if (/date|deadline|closedate|createdate|cutoff|vanaf|tot/.test(text)) labels.push("date/cutoff logic");
  if (/batch|chunk|limit|after/.test(text)) labels.push("paged/batch processing");
  return [...new Set(labels)];
}

function classifyActor(functionName, body, writes, associations) {
  const text = `${functionName} ${body}`.toLowerCase();
  if (/repair|correct|check_correct|re[-_]?enroll|fix/.test(text)) return "repair";
  if (/route|stage|dealstage|pipeline/.test(text) && writes.includes("dealstage")) return "route";
  if (/sync|copy|propagat|owner|assignment/.test(text)) return "propagate";
  if (/migrate|copy/.test(text)) return "migrate";
  if (/kvk|enrich|fetch|external/.test(text)) return "enrich";
  if (/validate|allowed|guard|skip/.test(text)) return "guard";
  if (associations.length >= 2) return "coordinate";
  return writes.length ? "compute" : "read";
}

function workflowFromText(value) {
  const text = String(value || "").toLowerCase();
  const graphs = [];
  for (const [needle, graph] of [
    ["sales", "Sales"],
    ["btw", "BTW"],
    ["jr", "JR"],
    ["jaarrekening", "JR"],
    ["ib", "IB"],
    ["vpb", "VPB"],
    ["va", "VA"],
    ["bank", "Bank connection"],
    ["debiteur", "Debtor/payment"],
    ["payment", "Debtor/payment"],
    ["owner", "Assignment propagation"],
    ["assignment", "Assignment propagation"],
  ]) {
    if (text.includes(needle) && !graphs.includes(graph)) graphs.push(graph);
  }
  return graphs.length ? graphs.join(" / ") : "Operations";
}

function analyzeSource() {
  const records = [];
  for (const file of walk(gitlabSourceRoot)) {
    const content = fs.readFileSync(file, "utf8");
    const constants = parseConstants(content);
    const routerPrefix = parseRouterPrefix(content);
    for (const fn of parseFunctions(content)) {
      const reads = extractPropertiesArgument(fn.body, constants);
      const writes = extractWriteProperties(fn.body, constants);
      const associations = detectAssociations(fn.body);
      const repositoryCalls = detectHubSpotRepositoryCalls(fn.body);
      const serviceCallHints = detectServiceCallHints(fn.body);
      const temporalLogic = detectTemporalLogic(fn.body, reads, writes);
      const actorRole = classifyActor(fn.name, fn.body, writes, associations);
      const routeDecorators = fn.decorators
        .map((decorator) => decorator.match(/^@router\.(\w+)\s*\(\s*["']([^"']+)["']/))
        .filter(Boolean)
        .map((match) => `${match[1].toUpperCase()} ${joinRoute(routerPrefix, match[2])}`);

      if (
        reads.length === 0 &&
        writes.length === 0 &&
        associations.length === 0 &&
        repositoryCalls.length === 0 &&
        routeDecorators.length === 0
      ) {
        continue;
      }

      records.push({
        function_id: `${relative(file)}::${fn.name}`,
        function_name: fn.name,
        file: relative(file),
        workflow_graph_guess: workflowFromText(`${relative(file)} ${fn.name} ${reads.join(" ")} ${writes.join(" ")}`),
        runtime_actor_role_guess: actorRole,
        routes: routeDecorators,
        reads_properties: reads,
        writes_properties: writes,
        writes_dealstages: writes.includes("dealstage") ? ["dealstage"] : [],
        traverses_associations: [...new Set(associations)],
        temporal_logic: temporalLogic,
        hubspot_repository_calls: repositoryCalls,
        service_call_hints: serviceCallHints,
        evidence_score:
          reads.length * 2 +
          writes.length * 3 +
          associations.length * 2 +
          temporalLogic.length +
          repositoryCalls.length +
          serviceCallHints.length,
      });
    }
  }
  return records.sort((a, b) => b.evidence_score - a.evidence_score);
}

function collectProfileSignals(profiles) {
  const map = new Map();
  for (const profile of profiles) {
    const workerId = slug(profile.worker_name, "worker");
    for (const [kind, values] of [
      ["trigger", profile.trigger_signals || []],
      ["read", profile.reads_properties || []],
      ["write", profile.writes_properties || []],
      ["dealstage_write", profile.writes_dealstages || []],
      ["emit", profile.emits_signals || []],
    ]) {
      for (const value of values) {
        const signalId = slug(value, "sig");
        if (!map.has(signalId)) {
          map.set(signalId, {
            signal_id: signalId,
            signal_name: value,
            producers: [],
            consumers: [],
            profile_evidence: [],
            static_evidence: [],
          });
        }
        const entry = map.get(signalId);
        if (kind === "write" || kind === "dealstage_write" || kind === "emit") {
          entry.producers.push({ worker_id: workerId, worker_name: profile.worker_name, kind });
        } else {
          entry.consumers.push({ worker_id: workerId, worker_name: profile.worker_name, kind });
        }
        entry.profile_evidence.push({ worker_name: profile.worker_name, kind });
      }
    }
  }
  return map;
}

function addStaticSignalEvidence(signalMap, staticFunctions) {
  for (const record of staticFunctions) {
    for (const value of record.writes_properties) {
      const signalId = slug(value, "sig");
      if (!signalMap.has(signalId)) {
        signalMap.set(signalId, {
          signal_id: signalId,
          signal_name: value,
          producers: [],
          consumers: [],
          profile_evidence: [],
          static_evidence: [],
        });
      }
      signalMap.get(signalId).static_evidence.push({ function_id: record.function_id, kind: "write" });
    }
    for (const value of record.reads_properties) {
      const signalId = slug(value, "sig");
      if (!signalMap.has(signalId)) {
        signalMap.set(signalId, {
          signal_id: signalId,
          signal_name: value,
          producers: [],
          consumers: [],
          profile_evidence: [],
          static_evidence: [],
        });
      }
      signalMap.get(signalId).static_evidence.push({ function_id: record.function_id, kind: "read" });
    }
  }
}

function unique(items, keyFn = (item) => JSON.stringify(item)) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildSignalOwnership(profiles, staticFunctions) {
  const signalMap = collectProfileSignals(profiles);
  addStaticSignalEvidence(signalMap, staticFunctions);
  const signals = [...signalMap.values()].map((signal) => {
    signal.producers = unique(signal.producers, (item) => `${item.worker_id}:${item.kind}`);
    signal.consumers = unique(signal.consumers, (item) => `${item.worker_id}:${item.kind}`);
    const producerCount = signal.producers.length;
    const consumerCount = signal.consumers.length;
    const owner = producerCount === 1 ? signal.producers[0] : null;
    const staticWriteCount = signal.static_evidence.filter((item) => item.kind === "write").length;
    return {
      ...signal,
      owner_worker_id: owner?.worker_id || null,
      owner_worker_name: owner?.worker_name || null,
      owner_confidence:
        producerCount === 1 && staticWriteCount > 0 ? "high" :
        producerCount === 1 ? "medium" :
        producerCount > 1 ? "low_multi_writer" : "unknown_no_writer",
      co_writer_count: producerCount,
      consumer_count: consumerCount,
      hidden_coupling_score: producerCount * 25 + consumerCount * 10 + staticWriteCount * 5,
    };
  });
  return {
    generated_at: new Date().toISOString(),
    source_policy: "gitlabtest is read-only analysis input; this artifact is inferred metadata for the portal.",
    signals: signals.sort((a, b) => b.hidden_coupling_score - a.hidden_coupling_score),
    multi_writer_signals: signals.filter((signal) => signal.co_writer_count > 1),
    orphan_consumed_signals: signals.filter((signal) => signal.producers.length === 0 && signal.consumers.length > 0),
  };
}

function confidenceScore(edge, ownership) {
  let score = 0.45;
  if (edge.confidence === "high") score += 0.25;
  if (edge.confidence === "low") score -= 0.15;
  if (edge.relationship_type === "direct") score += 0.15;
  if (edge.relationship_type === "cross-workflow") score -= 0.05;
  const signal = ownership.signals.find((item) => item.signal_id === slug(edge.emitted_signal, "sig"));
  if (signal?.owner_confidence === "high") score += 0.1;
  if (signal?.owner_confidence === "low_multi_writer") score -= 0.1;
  return Math.max(0.05, Math.min(0.95, Number(score.toFixed(2))));
}

function buildDependencyMap(profiles, graph, staticFunctions, ownership) {
  const profileByName = new Map(profiles.map((profile) => [profile.worker_name, profile]));
  const explicitEdges = (graph.edges || []).map((edge) => ({
    source_worker: edge.source_worker,
    source_worker_id: slug(edge.source_worker, "worker"),
    emitted_signal: edge.emitted_signal,
    signal_id: slug(edge.emitted_signal, "sig"),
    target_worker: edge.target_worker,
    target_worker_id: slug(edge.target_worker, "worker"),
    relationship_type: edge.relationship_type,
    workflow_graph: edge.workflow_graph,
    confidence: edge.confidence,
    confidence_score: confidenceScore(edge, ownership),
    inference_basis: ["existing propagation graph", "signal semantics"],
  }));

  const propertyEdges = [];
  for (const signal of ownership.signals) {
    for (const producer of signal.producers) {
      for (const consumer of signal.consumers) {
        if (producer.worker_id === consumer.worker_id) continue;
        const sourceProfile = profileByName.get(producer.worker_name);
        const targetProfile = profileByName.get(consumer.worker_name);
        propertyEdges.push({
          source_worker: producer.worker_name,
          source_worker_id: producer.worker_id,
          emitted_signal: signal.signal_name,
          signal_id: signal.signal_id,
          target_worker: consumer.worker_name,
          target_worker_id: consumer.worker_id,
          relationship_type: sourceProfile?.workflow_graph === targetProfile?.workflow_graph ? "derived" : "cross-workflow",
          workflow_graph: `${sourceProfile?.workflow_graph || "Unknown"} -> ${targetProfile?.workflow_graph || "Unknown"}`,
          confidence: signal.owner_confidence === "high" ? "high" : "medium",
          confidence_score: signal.owner_confidence === "high" ? 0.75 : 0.55,
          inference_basis: ["producer writes signal", "consumer reads or triggers on signal"],
        });
      }
    }
  }

  const associationWorkers = staticFunctions
    .filter((record) => record.traverses_associations.length)
    .map((record) => ({
      function_id: record.function_id,
      workflow_graph_guess: record.workflow_graph_guess,
      traverses_associations: record.traverses_associations,
      reads_properties: record.reads_properties,
      writes_properties: record.writes_properties,
      temporal_logic: record.temporal_logic,
    }));

  const temporalJoins = staticFunctions
    .filter((record) => record.temporal_logic.length)
    .map((record) => ({
      function_id: record.function_id,
      workflow_graph_guess: record.workflow_graph_guess,
      temporal_logic: record.temporal_logic,
      reads_properties: record.reads_properties.filter((value) => /year|quarter|date|kwartaal|closedate|createdate/i.test(value)),
      writes_properties: record.writes_properties.filter((value) => /year|quarter|date|kwartaal|dealstage/i.test(value)),
    }));

  const allEdges = unique([...explicitEdges, ...propertyEdges], (edge) => `${edge.source_worker_id}:${edge.signal_id}:${edge.target_worker_id}`);
  return {
    generated_at: new Date().toISOString(),
    edges: allEdges.sort((a, b) => b.confidence_score - a.confidence_score),
    hidden_coupling: ownership.signals
      .filter((signal) => signal.co_writer_count > 1 || signal.consumer_count >= 3)
      .map((signal) => ({
        signal_id: signal.signal_id,
        signal_name: signal.signal_name,
        co_writer_count: signal.co_writer_count,
        consumer_count: signal.consumer_count,
        hidden_coupling_score: signal.hidden_coupling_score,
      })),
    association_traversal_map: associationWorkers,
    temporal_joins: temporalJoins,
  };
}

function riskWeight(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("critical") || text.includes("very high")) return 90;
  if (text.includes("high")) return 70;
  if (text.includes("low")) return 20;
  return 45;
}

function buildHotspots(profiles, dependencyMap, ownership, staticFunctions) {
  const outgoing = countBy(dependencyMap.edges, "source_worker_id");
  const incoming = countBy(dependencyMap.edges, "target_worker_id");
  const staticByWorkflow = new Map();
  for (const record of staticFunctions) {
    staticByWorkflow.set(record.workflow_graph_guess, (staticByWorkflow.get(record.workflow_graph_guess) || 0) + record.evidence_score);
  }

  const workerHotspots = profiles.map((profile) => {
    const workerId = slug(profile.worker_name, "worker");
    const out = outgoing.get(workerId) || 0;
    const inc = incoming.get(workerId) || 0;
    const signalWrites = (profile.writes_properties || []).length + (profile.writes_dealstages || []).length + (profile.emits_signals || []).length;
    const temporal = (profile.temporal_logic || []).length;
    const score = out * 18 + inc * 8 + signalWrites * 10 + temporal * 8 + riskWeight(`${profile.fan_out_risk} ${profile.orchestration_risk}`);
    return {
      worker_id: workerId,
      worker_name: profile.worker_name,
      workflow_graph: profile.workflow_graph,
      runtime_actor_role: profile.runtime_actor_role,
      outgoing_edges: out,
      incoming_edges: inc,
      signal_writes: signalWrites,
      temporal_logic_count: temporal,
      hotspot_score: score,
      hotspot_reason: [
        out >= 3 ? "high downstream fan-out" : null,
        inc >= 3 ? "many upstream dependencies" : null,
        signalWrites >= 3 ? "writes several orchestration signals" : null,
        temporal ? "contains temporal/year/quarter semantics" : null,
        profile.orchestration_risk,
      ].filter(Boolean),
    };
  });

  return {
    generated_at: new Date().toISOString(),
    worker_hotspots: workerHotspots.sort((a, b) => b.hotspot_score - a.hotspot_score),
    signal_hotspots: ownership.signals
      .filter((signal) => signal.hidden_coupling_score >= 40)
      .sort((a, b) => b.hidden_coupling_score - a.hidden_coupling_score)
      .slice(0, 50),
    workflow_hotspots: [...staticByWorkflow.entries()]
      .map(([workflow_graph, static_evidence_score]) => ({
        workflow_graph,
        static_evidence_score,
        worker_count: profiles.filter((profile) => profile.workflow_graph.includes(workflow_graph)).length,
      }))
      .sort((a, b) => b.static_evidence_score - a.static_evidence_score),
  };
}

function countBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = item[key];
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

function buildWorkflowSummaries(profiles, dependencyMap, ownership, staticFunctions) {
  const graphNames = [...new Set(profiles.map((profile) => profile.workflow_graph))].sort();
  return {
    generated_at: new Date().toISOString(),
    workflow_graphs: graphNames.map((graphName) => {
      const graphProfiles = profiles.filter((profile) => profile.workflow_graph === graphName);
      const workerIds = new Set(graphProfiles.map((profile) => slug(profile.worker_name, "worker")));
      const graphEdges = dependencyMap.edges.filter((edge) => workerIds.has(edge.source_worker_id) || workerIds.has(edge.target_worker_id));
      const functions = staticFunctions.filter((record) => record.workflow_graph_guess && graphName.toLowerCase().includes(record.workflow_graph_guess.split(" / ")[0].toLowerCase()));
      const signals = ownership.signals.filter((signal) =>
        signal.producers.some((producer) => workerIds.has(producer.worker_id)) ||
        signal.consumers.some((consumer) => workerIds.has(consumer.worker_id))
      );
      return {
        workflow_graph: graphName,
        worker_count: graphProfiles.length,
        edge_count: graphEdges.length,
        signal_count: signals.length,
        actor_roles: countValues(graphProfiles.map((profile) => profile.runtime_actor_role)),
        critical_signals: signals
          .filter((signal) => signal.hidden_coupling_score >= 40)
          .map((signal) => signal.signal_name)
          .slice(0, 12),
        temporal_logic: unique(functions.flatMap((record) => record.temporal_logic)),
        association_patterns: unique(functions.flatMap((record) => record.traverses_associations)),
        runtime_summary: summarizeWorkflow(graphName, graphProfiles, signals, graphEdges),
      };
    }),
  };
}

function countValues(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] || 0) + 1;
  return result;
}

function summarizeWorkflow(name, profiles, signals, edges) {
  const roles = [...new Set(profiles.map((profile) => profile.runtime_actor_role))].join(", ");
  const highSignals = signals
    .sort((a, b) => b.hidden_coupling_score - a.hidden_coupling_score)
    .slice(0, 3)
    .map((signal) => signal.signal_name)
    .join(", ");
  return `${name} contains ${profiles.length} inferred workers (${roles || "unknown roles"}), ${signals.length} runtime signals and ${edges.length} dependency edges. Most important signals: ${highSignals || "not enough evidence"}.`;
}

function humanize(value) {
  return String(value || "")
    .replace(/^_+/, "")
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentence(value) {
  const text = humanize(value);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Unknown";
}

function businessActionFromRole(role) {
  return {
    route: "routes the process to a different operational state",
    compute: "computes derived process state",
    propagate: "propagates state to related records",
    enrich: "enriches HubSpot runtime state with external data",
    sync: "keeps runtime state aligned with another source",
    migrate: "moves or copies process state between pipelines",
    coordinate: "coordinates multiple workflow graphs",
    guard: "guards process consistency",
    repair: "repairs or re-enrolls runtime state",
    read: "reads runtime state for analysis",
  }[role] || "participates in the runtime flow";
}

function explainSignal(signalName) {
  const text = String(signalName || "").toLowerCase();
  if (text.includes("dealstage")) return "a stage transition in a HubSpot pipeline";
  if (text.includes("pipeline")) return "a pipeline placement/change";
  if (text.includes("machtiging")) return "a mandate/readiness signal for IB work";
  if (text.includes("bank")) return "a bank connection readiness signal";
  if (text.includes("jaarrekening") || text.includes("jr")) return "a JR readiness or accounting-progress signal";
  if (text.includes("priority") || text.includes("hs_priority")) return "a HubSpot priority/routing signal";
  if (text.includes("owner") || text.includes("controleur")) return "an assignment/ownership signal";
  if (text.includes("year") || text.includes("quarter")) return "a temporal matching signal";
  if (text.includes("va_ingediend")) return "a VA submission completion signal";
  return "a runtime signal";
}

function inferPurposeFromFunction(record) {
  const action = businessActionFromRole(record.runtime_actor_role_guess);
  const writes = record.writes_properties.length
    ? ` It writes ${record.writes_properties.slice(0, 4).map((item) => `\`${item}\``).join(", ")}.`
    : "";
  const reads = record.reads_properties.length
    ? ` It reads ${record.reads_properties.slice(0, 5).map((item) => `\`${item}\``).join(", ")}.`
    : "";
  const associations = record.traverses_associations.length
    ? ` It traverses ${record.traverses_associations.join(", ")}.`
    : "";
  return `${sentence(record.function_name)} ${action}.${reads}${writes}${associations}`.trim();
}

function summarizeEffects(record) {
  const effects = [];
  if (record.writes_dealstages.length || record.writes_properties.includes("dealstage")) {
    effects.push("can move deals between HubSpot stages");
  }
  if (record.writes_properties.length) {
    effects.push(`can update ${record.writes_properties.slice(0, 5).join(", ")}`);
  }
  if (record.traverses_associations.length) {
    effects.push(`can affect related records through ${record.traverses_associations.join(", ")}`);
  }
  if (record.temporal_logic.length) {
    effects.push(`depends on ${record.temporal_logic.join(", ")}`);
  }
  return effects;
}

function endpointConfidence(record) {
  let score = 0.35;
  if (record.routes.length) score += 0.2;
  if (record.hubspot_repository_calls.length) score += 0.15;
  if (record.reads_properties.length) score += 0.1;
  if (record.writes_properties.length) score += 0.15;
  if (record.traverses_associations.length) score += 0.1;
  if (record.temporal_logic.length) score += 0.05;
  return Math.min(0.95, Number(score.toFixed(2)));
}

function buildEndpointRuntimeSemantics(staticFunctions) {
  const endpointRecords = staticFunctions
    .filter((record) => record.routes.length)
    .map((record) => ({
      endpoint_id: record.function_id,
      file: record.file,
      routes: record.routes,
      handler: record.function_name,
      workflow_graph_guess: record.workflow_graph_guess,
      runtime_actor_role_guess: record.runtime_actor_role_guess,
      runtime_purpose: inferPurposeFromFunction(record),
      trigger_semantics: record.routes.map((route) => `${route} receives an external or HubSpot workflow-triggered event.`),
      reads_properties: record.reads_properties,
      writes_properties: record.writes_properties,
      traverses_associations: record.traverses_associations,
      temporal_logic: record.temporal_logic,
      hubspot_repository_calls: record.hubspot_repository_calls,
      service_call_chain_hints: record.service_call_hints,
      downstream_effects: summarizeEffects(record),
      confidence_score: endpointConfidence(record),
      operational_usefulness:
        record.writes_properties.length || record.writes_dealstages.length
          ? "High: this endpoint appears to change HubSpot runtime state."
          : record.traverses_associations.length
            ? "Medium: this endpoint appears to inspect related process state."
            : "Low/medium: limited runtime write evidence found.",
    }));

  return {
    generated_at: new Date().toISOString(),
    source_policy: "Derived from read-only GitLab/FastAPI analysis input.",
    endpoints: endpointRecords.sort((a, b) => b.confidence_score - a.confidence_score),
  };
}

function edgeBusinessNarrative(edge) {
  const source = edge.source_worker || sentence(edge.source_worker_id);
  const target = edge.target_worker || sentence(edge.target_worker_id);
  return `${source} emits ${edge.emitted_signal}, which is ${explainSignal(edge.emitted_signal)}. ${target} likely reacts to it and continues the ${edge.workflow_graph} runtime chain.`;
}

function buildBusinessRuntimeChains(dependencyMap, profiles) {
  const edgesByWorkflow = new Map();
  for (const edge of dependencyMap.edges) {
    const workflow = edge.workflow_graph || "Unknown";
    if (!edgesByWorkflow.has(workflow)) edgesByWorkflow.set(workflow, []);
    edgesByWorkflow.get(workflow).push(edge);
  }

  const profileByWorkerId = new Map(profiles.map((profile) => [slug(profile.worker_name, "worker"), profile]));
  const chains = [...edgesByWorkflow.entries()].map(([workflow_graph, edges]) => {
    const rankedEdges = edges
      .slice()
      .sort((a, b) => b.confidence_score - a.confidence_score)
      .slice(0, 12);
    const workers = unique(rankedEdges.flatMap((edge) => [edge.source_worker_id, edge.target_worker_id]));
    return {
      workflow_graph,
      chain_confidence: Number((rankedEdges.reduce((sum, edge) => sum + edge.confidence_score, 0) / Math.max(1, rankedEdges.length)).toFixed(2)),
      worker_count: workers.length,
      handoff_count: rankedEdges.length,
      business_narrative: rankedEdges.map(edgeBusinessNarrative),
      simplified_chain: rankedEdges.map((edge) => ({
        from: edge.source_worker,
        signal: edge.emitted_signal,
        meaning: explainSignal(edge.emitted_signal),
        to: edge.target_worker,
        why_it_matters: profileByWorkerId.get(edge.target_worker_id)?.business_semantics || "Downstream process state may change.",
        confidence_score: edge.confidence_score,
      })),
    };
  });

  return {
    generated_at: new Date().toISOString(),
    purpose: "Human-readable runtime chains for explaining how business process state propagates.",
    chains: chains.sort((a, b) => b.chain_confidence - a.chain_confidence),
  };
}

function buildObservedVsInferredAnalysis(diff, dependencyMap) {
  const observedMatches = diff.observed_matching_inferred || [];
  const observedExtra = diff.observed_not_in_inferred || [];
  const observedKeySet = new Set(observedMatches.map((row) => `${row.source_worker_id}:${row.signal_id}:${row.target_worker_id}`));
  const inferred = dependencyMap.edges || [];
  const weakUnconfirmed = inferred
    .filter((edge) => edge.confidence_score < 0.6 && !observedKeySet.has(`${edge.source_worker_id}:${edge.signal_id}:${edge.target_worker_id}`))
    .sort((a, b) => a.confidence_score - b.confidence_score)
    .slice(0, 100);
  const strongButUnobserved = inferred
    .filter((edge) => edge.confidence_score >= 0.8 && !observedKeySet.has(`${edge.source_worker_id}:${edge.signal_id}:${edge.target_worker_id}`))
    .slice(0, 100);

  return {
    generated_at: new Date().toISOString(),
    observed_data_available: diff.observed_data_available,
    observed_reason: diff.observed_reason,
    summary: {
      inferred_edges: diff.inferred_edge_count,
      observed_edges: diff.observed_edge_count,
      observed_matching_inferred: observedMatches.length,
      observed_not_in_inferred: observedExtra.length,
      weak_unconfirmed_edges: weakUnconfirmed.length,
      strong_but_unobserved_sample_size: strongButUnobserved.length,
    },
    strongly_observed_paths: observedMatches
      .sort((a, b) => (b.observed_count || 0) - (a.observed_count || 0))
      .slice(0, 50),
    weak_unconfirmed_relationships: weakUnconfirmed.map((edge) => ({
      ...edge,
      recommended_action: "Validate with observed traces or user review before treating as a real runtime dependency.",
    })),
    strong_inferred_but_missing_observation: strongButUnobserved.map((edge) => ({
      ...edge,
      recommended_action: "Prioritize telemetry or manual confirmation; this relationship is semantically strong but not observed yet.",
    })),
    observed_not_in_inferred: observedExtra.map((row) => ({
      ...row,
      recommended_action: "Back-propagate into inference rules; observed runtime behavior found an edge the model did not infer.",
    })),
  };
}

function buildFragilityMap(hotspots, dependencyMap, ownership, graph) {
  const loops = graph.dangerous_propagation_loops || graph.circular_dependencies || graph.dangerous_loops || [];
  const fragileSignals = ownership.signals
    .filter((signal) => signal.co_writer_count > 1 || signal.consumer_count >= 4 || signal.hidden_coupling_score >= 70)
    .map((signal) => ({
      signal_id: signal.signal_id,
      signal_name: signal.signal_name,
      fragility_type: signal.co_writer_count > 1 ? "multi-writer signal" : "high-consumer signal",
      producer_count: signal.co_writer_count,
      consumer_count: signal.consumer_count,
      fragility_score: signal.hidden_coupling_score,
      why_fragile: signal.co_writer_count > 1
        ? "Multiple workers can write the same signal, so ownership is ambiguous."
        : "Many workers depend on this signal, so changes can fan out broadly.",
    }));

  const fanOutAmplifiers = hotspots.worker_hotspots
    .filter((worker) => worker.outgoing_edges >= 5 || worker.hotspot_score >= 500)
    .map((worker) => ({
      worker_id: worker.worker_id,
      worker_name: worker.worker_name,
      workflow_graph: worker.workflow_graph,
      outgoing_edges: worker.outgoing_edges,
      incoming_edges: worker.incoming_edges,
      fragility_score: worker.hotspot_score,
      why_fragile: worker.hotspot_reason,
    }));

  const crossWorkflowEdges = dependencyMap.edges.filter((edge) => edge.relationship_type === "cross-workflow");
  return {
    generated_at: new Date().toISOString(),
    fragile_signals: fragileSignals.sort((a, b) => b.fragility_score - a.fragility_score),
    fan_out_amplifiers: fanOutAmplifiers.sort((a, b) => b.fragility_score - a.fragility_score),
    cross_workflow_dependencies: crossWorkflowEdges
      .sort((a, b) => b.confidence_score - a.confidence_score)
      .slice(0, 150)
      .map((edge) => ({
        ...edge,
        fragility_reason: "This edge crosses workflow graph boundaries; a source-state change can affect another business domain.",
      })),
    loop_risks: loops,
    top_debugging_priorities: [
      ...fanOutAmplifiers.slice(0, 5).map((worker) => `Validate fan-out from ${worker.worker_name}`),
      ...fragileSignals.slice(0, 5).map((signal) => `Clarify ownership of ${signal.signal_name}`),
    ],
  };
}

function buildRuntimeHandoffAnalysis(dependencyMap, profiles) {
  const profileById = new Map(profiles.map((profile) => [slug(profile.worker_name, "worker"), profile]));
  const handoffs = dependencyMap.edges
    .filter((edge) => edge.relationship_type === "cross-workflow" || String(edge.workflow_graph).includes("->"))
    .map((edge) => {
      const source = profileById.get(edge.source_worker_id);
      const target = profileById.get(edge.target_worker_id);
      return {
        from_workflow_graph: source?.workflow_graph || edge.workflow_graph.split("->")[0]?.trim() || "Unknown",
        to_workflow_graph: target?.workflow_graph || edge.workflow_graph.split("->")[1]?.trim() || "Unknown",
        source_worker: edge.source_worker,
        target_worker: edge.target_worker,
        signal: edge.emitted_signal,
        signal_meaning: explainSignal(edge.emitted_signal),
        confidence_score: edge.confidence_score,
        handoff_narrative: `${edge.source_worker} hands off runtime state to ${edge.target_worker} via ${edge.emitted_signal}.`,
        operational_question: `If ${edge.emitted_signal} changes, does ${edge.target_worker} still route the process correctly?`,
      };
    });

  return {
    generated_at: new Date().toISOString(),
    purpose: "Critical handoffs where one workflow graph can trigger or reshape another.",
    handoffs: handoffs.sort((a, b) => b.confidence_score - a.confidence_score),
    top_handoffs: handoffs.sort((a, b) => b.confidence_score - a.confidence_score).slice(0, 25),
  };
}

async function loadObservedEdges() {
  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return { available: false, rows: [], reason: "Supabase env not available" };

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("runtime_edges")
    .select("id,source_worker_id,target_worker_id,signal_id,relationship_origin,confidence_score,observed_count,last_observed_at")
    .eq("relationship_origin", "observed");

  if (error) return { available: false, rows: [], reason: error.message };
  return { available: true, rows: data || [], reason: null };
}

function loadEnv() {
  const env = { ...process.env };
  for (const fileName of [".env", "gitlabtest/.env"]) {
    const filePath = path.join(repoRoot, fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

function buildObservedDiff(dependencyMap, observed) {
  const inferredKeys = new Set(dependencyMap.edges.map((edge) => `${edge.source_worker_id}:${edge.signal_id}:${edge.target_worker_id}`));
  const observedRows = observed.rows || [];
  const observedKeys = new Set(observedRows.map((row) => `${row.source_worker_id}:${row.signal_id}:${row.target_worker_id}`));
  return {
    generated_at: new Date().toISOString(),
    observed_data_available: observed.available,
    observed_reason: observed.reason,
    inferred_edge_count: inferredKeys.size,
    observed_edge_count: observedRows.length,
    observed_matching_inferred: observedRows.filter((row) => inferredKeys.has(`${row.source_worker_id}:${row.signal_id}:${row.target_worker_id}`)),
    observed_not_in_inferred: observedRows.filter((row) => !inferredKeys.has(`${row.source_worker_id}:${row.signal_id}:${row.target_worker_id}`)),
    inferred_not_observed_sample: dependencyMap.edges
      .filter((edge) => !observedKeys.has(`${edge.source_worker_id}:${edge.signal_id}:${edge.target_worker_id}`))
      .slice(0, 100),
  };
}

async function main() {
  const profiles = readJson(profilesPath);
  const graph = readJson(graphPath);
  const staticFunctions = analyzeSource();
  const ownership = buildSignalOwnership(profiles, staticFunctions);
  const dependencyMap = buildDependencyMap(profiles, graph, staticFunctions, ownership);
  const hotspots = buildHotspots(profiles, dependencyMap, ownership, staticFunctions);
  const summaries = buildWorkflowSummaries(profiles, dependencyMap, ownership, staticFunctions);
  const observed = await loadObservedEdges();
  const diff = buildObservedDiff(dependencyMap, observed);
  const endpointSemantics = buildEndpointRuntimeSemantics(staticFunctions);
  const businessChains = buildBusinessRuntimeChains(dependencyMap, profiles);
  const observedAnalysis = buildObservedVsInferredAnalysis(diff, dependencyMap);
  const fragilityMap = buildFragilityMap(hotspots, dependencyMap, ownership, graph);
  const handoffAnalysis = buildRuntimeHandoffAnalysis(dependencyMap, profiles);

  const files = [
    writeJson("runtime-static-analysis.json", {
      generated_at: new Date().toISOString(),
      source_policy: "gitlabtest is read-only analysis input.",
      functions: staticFunctions,
    }),
    writeJson("runtime-signal-ownership.json", ownership),
    writeJson("runtime-dependency-map.json", dependencyMap),
    writeJson("orchestration-hotspots.json", hotspots),
    writeJson("workflow-runtime-summaries.json", summaries),
    writeJson("inferred-vs-observed-diff.json", diff),
    writeJson("endpoint-runtime-semantics.json", endpointSemantics),
    writeJson("business-runtime-chains.json", businessChains),
    writeJson("observed-vs-inferred-analysis.json", observedAnalysis),
    writeJson("orchestration-fragility-map.json", fragilityMap),
    writeJson("runtime-handoff-analysis.json", handoffAnalysis),
  ];

  console.log(JSON.stringify({
    ok: true,
    generated: files.map((file) => relative(file)),
    static_functions_analyzed: staticFunctions.length,
    signals: ownership.signals.length,
    dependency_edges: dependencyMap.edges.length,
    hotspots: hotspots.worker_hotspots.length,
    endpoint_semantics: endpointSemantics.endpoints.length,
    business_chains: businessChains.chains.length,
    handoffs: handoffAnalysis.handoffs.length,
    fragile_signals: fragilityMap.fragile_signals.length,
    observed_edges: diff.observed_edge_count,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
