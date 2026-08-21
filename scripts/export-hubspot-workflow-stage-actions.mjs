import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const STAGE_PROPS = new Set(["dealstage", "hs_pipeline_stage"]);
const PIPELINE_PROPS = new Set(["pipeline", "hs_pipeline"]);

const args = new Set(process.argv.slice(2));
const targetPipeline = readArgValue("--pipeline") ?? "Debiteurenbeheer";
const includeAllPipelines = args.has("--all");
const outputPath = readArgValue("--out")
  ?? path.join("exports", `hubspot-workflow-stage-actions-${dateStamp()}.csv`);

const env = readEnv();
const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY
  ?? env.SUPABASE_ANON_KEY
  ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL/VITE_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY of VITE_SUPABASE_PUBLISHABLE_KEY ontbreken.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const [automations, pipelines] = await Promise.all([
  fetchAll("automatiseringen", [
    "id",
    "naam",
    "external_id",
    "source",
    "status",
    "import_status",
    "pipeline_id",
    "stage_id",
    "import_proposal",
    "reviewer_overrides",
    "cleanup_delete_candidate",
  ].join(",")),
  fetchAll("pipelines", "pipeline_id,naam,stages,source,is_active"),
]);

const pipelineById = new Map();
const stageById = new Map();

for (const pipeline of pipelines) {
  pipelineById.set(String(pipeline.pipeline_id), pipeline);
  const stages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
  for (const stage of stages) {
    stageById.set(String(stage.stage_id), { stage, pipeline });
  }
}

const rows = automations
  .filter((automation) => automation.source === "hubspot")
  .filter((automation) => automation.import_status == null || automation.import_status === "approved")
  .filter((automation) => !isSourceDeleted(automation))
  .map((automation) => buildExportRow(automation, pipelineById, stageById))
  .filter((row) => includeAllPipelines || row.pipelineNaam.toLowerCase().includes(targetPipeline.toLowerCase()));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, toCsv(rows), "utf8");

console.log(`Export geschreven: ${outputPath}`);
console.log(`Rijen: ${rows.length}`);
if (rows.length === 0) {
  console.log("Geen rijen gevonden. Controleer of de gebruikte Supabase key toegang heeft tot automatiseringen en pipelines, of gebruik --all.");
}

function buildExportRow(automation, pipelineById, stageById) {
  const workflow = automation.import_proposal?.hubspot_workflow ?? {};
  const workflowId = String(automation.external_id ?? workflow.workflowId ?? workflow.id ?? automation.id);
  const stageIds = splitIds(automation.stage_id);
  const pipelineIds = splitIds(automation.pipeline_id);
  const inferredPipelineIds = new Set(pipelineIds);

  for (const stageId of stageIds) {
    const match = stageById.get(stageId);
    if (match?.pipeline?.pipeline_id) inferredPipelineIds.add(String(match.pipeline.pipeline_id));
  }

  const pipelineLabels = [...inferredPipelineIds]
    .map((pipelineId) => pipelineById.get(pipelineId))
    .filter(Boolean)
    .map((pipeline) => `${pipeline.naam} (${pipeline.pipeline_id})`);

  const stageLabels = stageIds.map((stageId) => {
    const match = stageById.get(stageId);
    if (!match) return `${stageId} (onbekende stage)`;
    return `${match.stage.label} (${stageId})`;
  });

  const triggerType = detectTriggerType(workflow, stageIds, pipelineIds);
  const actionSummary = summarizeActions(workflow);

  return {
    automationNaam: automation.naam ?? "",
    workflowId,
    pipelineNaam: pipelineLabels.join(" | ") || "Onbekend",
    pipelineId: [...inferredPipelineIds].join(", "),
    stages: stageLabels.join(" | ") || "Geen stage gedetecteerd",
    stageIds: stageIds.join(", "),
    triggerType,
    actieSamenvatting: actionSummary,
    status: automation.status ?? "",
  };
}

function detectTriggerType(workflow, stageIds, pipelineIds) {
  if (stageIds.length === 0 && pipelineIds.length === 0) return "onbekend";
  if (branchContainsStageOrPipeline(workflow?.enrollmentCriteria?.listFilterBranch)) return "enrollment";
  if (triggerSetsContainStageOrPipeline(workflow?.triggerSets)) return "enrollment";
  if (triggerSetsContainStageOrPipeline(workflow?.reEnrollmentTriggerSets)) return "re-enrollment";
  if (segmentCriteriaContainStageOrPipeline(workflow?.segmentCriteria)) return "enrollment";
  return "onbekend";
}

function summarizeActions(workflow) {
  const actions = collectActions(workflow?.actions ?? []);
  const stageWrites = [];
  const readable = [];

  for (const action of actions) {
    const type = String(action.type ?? action.actionType ?? "").trim();
    const property = String(action.propertyName ?? action.property ?? action.property_name ?? "").toLowerCase();
    const value = firstText(action.propertyValue, action.value, action.newValue, action.targetValue, action.toValue);
    const label = firstText(action.label, action.name, action.description);

    if (STAGE_PROPS.has(property)) {
      stageWrites.push(`${type || "SET_PROPERTY"} zet ${property} naar ${value || "onbekend"}`);
      continue;
    }

    if (PIPELINE_PROPS.has(property)) {
      stageWrites.push(`${type || "SET_PROPERTY"} zet ${property} naar ${value || "onbekend"}`);
      continue;
    }

    if (label || type) readable.push([type, label].filter(Boolean).join(": "));
  }

  const parts = [];
  if (stageWrites.length > 0) parts.push(`Stage/pipeline acties: ${unique(stageWrites).join("; ")}`);
  if (readable.length > 0) parts.push(`Overige acties: ${unique(readable).slice(0, 8).join("; ")}`);
  return parts.join(" | ") || "Geen acties gevonden in opgeslagen workflowdata";
}

function collectActions(actions, result = []) {
  for (const action of Array.isArray(actions) ? actions : []) {
    result.push(action);
    collectActions(action.actions, result);
    collectActions(action.childActions, result);
    collectActions(action.thenActions, result);
    collectActions(action.elseActions, result);
    for (const branch of action.branches ?? action.ifThenBranches ?? action.branchActions ?? []) {
      collectActions(branch.actions ?? branch.thenActions ?? branch.childActions ?? [], result);
    }
  }
  return result;
}

function branchContainsStageOrPipeline(branch) {
  if (!branch) return false;
  for (const filter of branch.filters ?? []) {
    if (filterHasStageOrPipeline(filter)) return true;
  }
  return (branch.filterBranches ?? []).some(branchContainsStageOrPipeline);
}

function triggerSetsContainStageOrPipeline(triggerSets) {
  return (triggerSets ?? []).some((triggerSet) =>
    (triggerSet.filters ?? []).some(filterHasStageOrPipeline)
  );
}

function segmentCriteriaContainStageOrPipeline(segmentCriteria) {
  return (segmentCriteria ?? []).some((group) => {
    const filters = Array.isArray(group) ? group : [group];
    return filters.some(filterHasStageOrPipeline);
  });
}

function filterHasStageOrPipeline(filter) {
  const property = String(filter?.property ?? filter?.propertyName ?? "").toLowerCase();
  return STAGE_PROPS.has(property) || PIPELINE_PROPS.has(property);
}

async function fetchAll(table, select) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} ophalen mislukt: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function isSourceDeleted(row) {
  const overrides = row.reviewer_overrides ?? {};
  return row.cleanup_delete_candidate === true
    || overrides.cleanup_delete_candidate === true
    || Boolean(overrides.source_deleted_at);
}

function splitIds(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstText(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function unique(values) {
  return [...new Set(values)];
}

function toCsv(rows) {
  const headers = [
    ["automationNaam", "Automation naam"],
    ["workflowId", "Workflow-ID (HubSpot)"],
    ["pipelineNaam", "Pipeline"],
    ["pipelineId", "Pipeline ID"],
    ["stages", "Gedetecteerde stage(s)"],
    ["stageIds", "Stage ID(s)"],
    ["triggerType", "Trigger-type"],
    ["actieSamenvatting", "Actie-samenvatting"],
    ["status", "Status"],
  ];
  return [
    "\uFEFF" + headers.map(([, label]) => csvCell(label)).join(";"),
    ...rows.map((row) => headers.map(([key]) => csvCell(row[key])).join(";")),
  ].join("\n");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function readEnv() {
  const result = { ...process.env };
  if (!fs.existsSync(".env")) return result;

  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
    result[key] = result[key] ?? value;
  }

  return result;
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}
