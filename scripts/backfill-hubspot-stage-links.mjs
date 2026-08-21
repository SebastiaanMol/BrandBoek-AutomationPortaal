import { readFileSync } from "node:fs";

const env = loadDotEnv();

const supabaseUrl = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const jwt = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("SUPABASE_URL or VITE_SUPABASE_URL is required.");
if (!publishableKey && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, or SUPABASE_SERVICE_ROLE_KEY is required.");
}
if (!jwt) {
  throw new Error("SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY is required because hubspot-sync has verify_jwt=true.");
}

const functionUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/hubspot-sync`;
const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || publishableKey;

const preview = await invokeHubSpotSync({ mode: "preview" });
const changeItems = Array.isArray(preview.changeItems) ? preview.changeItems : [];
const metadataChangedIds = changeItems
  .filter((item) => item?.changeType === "metadata_changed")
  .map((item) => String(item.id))
  .filter(Boolean);

console.log(`Preview syncRunId: ${preview.syncRunId}`);
console.log(`Detected metadata_changed records: ${metadataChangedIds.length}`);

if (metadataChangedIds.length === 0) {
  console.log("No metadata_changed records to apply.");
  process.exit(0);
}

const apply = await invokeHubSpotSync({
  mode: "apply",
  syncRunId: preview.syncRunId,
  selectedChangeItemIds: metadataChangedIds,
});

console.log("Apply result:");
console.log(JSON.stringify({
  syncRunId: apply.syncRunId,
  applied: apply.applied,
  updated: apply.updated,
  inserted: apply.inserted,
  failed: apply.failed,
  skipped: apply.skipped,
}, null, 2));

async function invokeHubSpotSync(body) {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.error) {
    throw new Error(`hubspot-sync failed (${response.status}): ${json.error || text}`);
  }
  return json;
}

function loadDotEnv() {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}
