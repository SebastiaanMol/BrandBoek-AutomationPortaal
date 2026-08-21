const calls = [];

const mockPreview = {
  success: true,
  syncRunId: "mock-sync-1",
  changeItems: [
    { id: "change-1", changeType: "metadata_changed", title: "Workflow met stage update" },
    { id: "change-2", changeType: "source_data_incomplete", title: "Workflow waarschuwing" },
    { id: "change-3", changeType: "metadata_changed", title: "Workflow met pipeline update" },
  ],
};

const mockApply = {
  success: true,
  syncRunId: "mock-sync-1",
  applied: 2,
  updated: 2,
  inserted: 0,
  failed: 0,
  skipped: 0,
};

globalThis.fetch = async (_url, options = {}) => {
  const body = JSON.parse(String(options.body ?? "{}"));
  calls.push(body);

  if (body.mode === "preview") {
    return jsonResponse(mockPreview);
  }

  if (body.mode === "apply") {
    assertEqual(body.syncRunId, "mock-sync-1", "apply syncRunId");
    assertDeepEqual(body.selectedChangeItemIds, ["change-1", "change-3"], "selectedChangeItemIds");
    return jsonResponse(mockApply);
  }

  return jsonResponse({ error: `Unsupported mode: ${body.mode}` }, 400);
};

const preview = await invokeHubSpotSync({ mode: "preview" });
const metadataChangedIds = preview.changeItems
  .filter((item) => item.changeType === "metadata_changed")
  .map((item) => item.id);

const apply = await invokeHubSpotSync({
  mode: "apply",
  syncRunId: preview.syncRunId,
  selectedChangeItemIds: metadataChangedIds,
});

assertEqual(calls.length, 2, "HTTP call count");
assertDeepEqual(calls[0], { mode: "preview" }, "preview request body");

console.log("Dry-run backfill mock OK");
console.log(`Preview items: ${preview.changeItems.length}`);
console.log(`metadata_changed selected: ${metadataChangedIds.length}`);
console.log(`Would update records: ${apply.updated}`);
console.log(`Selected IDs: ${metadataChangedIds.join(", ")}`);

async function invokeHubSpotSync(body) {
  const response = await fetch("mock://hubspot-sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: "mock-api-key",
      Authorization: "Bearer mock-jwt",
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(`hubspot-sync mock failed (${response.status}): ${json.error ?? "unknown error"}`);
  }
  return json;
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch. Expected ${expected}, received ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch. Expected ${expectedJson}, received ${actualJson}`);
  }
}
