import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
    }),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
if (fs.existsSync("tmp/playwright-auth-state.json")) {
  const state = JSON.parse(fs.readFileSync("tmp/playwright-auth-state.json", "utf8"));
  const authItem = state.origins
    ?.flatMap((origin) => origin.localStorage ?? [])
    ?.find((item) => item.name.includes("auth-token"));
  if (authItem?.value) {
    const session = JSON.parse(authItem.value);
    const token = session?.access_token ?? session?.currentSession?.access_token;
    if (token) await supabase.auth.setSession({ access_token: token, refresh_token: session.refresh_token ?? session.currentSession?.refresh_token ?? "" });
  }
}

function normalizeEndpointPath(value) {
  const trimmed = String(value ?? "").trim();
  const withoutMethod = trimmed.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "");
  let route = withoutMethod;
  try {
    if (/^https?:\/\//i.test(withoutMethod)) route = new URL(withoutMethod).pathname;
  } catch {
    route = withoutMethod.replace(/^https?:\/\/[^/]+/i, "");
  }
  return route
    .replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();
}

function buildEdges(automations) {
  const edges = [];
  const seen = new Set();
  for (const from of automations) {
    for (const path of from.webhook_paths ?? []) {
      const normalizedPath = normalizeEndpointPath(path);
      if (!normalizedPath) continue;
      for (const to of automations) {
        if (from.id === to.id) continue;
        for (const endpoint of to.endpoints ?? []) {
          if (normalizedPath !== normalizeEndpointPath(endpoint)) continue;
          const key = `${from.id}->${to.id}:${normalizedPath}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({ from, to, path: normalizedPath });
        }
      }
    }
  }
  return edges;
}

function traceFrom(startId, edges, maxNodes = 50) {
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.from.id)) outgoing.set(edge.from.id, []);
    outgoing.get(edge.from.id).push(edge);
  }
  const ordered = [];
  const visited = new Set();
  const traceEdges = [];
  function visit(id) {
    if (visited.has(id) || ordered.length >= maxNodes) return;
    visited.add(id);
    ordered.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      traceEdges.push(edge);
      visit(edge.to.id);
    }
  }
  visit(startId);
  return { ordered, traceEdges };
}

const { data, error } = await supabase
  .from("automatiseringen")
  .select("id, naam, source, webhook_paths, endpoints, import_status")
  .or("source.is.null,import_status.is.null,import_status.eq.approved");

if (error) throw error;

const automations = data ?? [];
const edges = buildEdges(automations);
const incoming = new Set(edges.map((edge) => edge.to.id));
const sourceIds = [...new Set(edges.map((edge) => edge.from.id))];
const roots = sourceIds.filter((id) => !incoming.has(id));
const starts = roots.length ? roots : sourceIds;
const traces = starts
  .map((id) => traceFrom(id, edges))
  .filter((trace) => trace.traceEdges.length > 0);

const automationById = new Map(automations.map((automation) => [automation.id, automation]));
const result = {
  automationCount: automations.length,
  webhookEdgeCount: edges.length,
  rootCount: roots.length,
  traceLengthDistribution: traces.reduce((acc, trace) => {
    const key = String(trace.ordered.length);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {}),
  maxTraceLength: Math.max(0, ...traces.map((trace) => trace.ordered.length)),
  examplesOverTwo: traces
    .filter((trace) => trace.ordered.length > 2)
    .slice(0, 5)
    .map((trace) => ({
      count: trace.ordered.length,
      names: trace.ordered.map((id) => automationById.get(id)?.naam ?? id),
      edges: trace.traceEdges.map((edge) => `${edge.from.naam} -> ${edge.to.naam} (${edge.path})`),
    })),
  firstTenEdges: edges.slice(0, 10).map((edge) => `${edge.from.naam} -> ${edge.to.naam} (${edge.path})`),
};

console.log(JSON.stringify(result, null, 2));
