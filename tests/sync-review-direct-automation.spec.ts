import { expect, test } from "../playwright-fixture";

const automationName = "E2E HubSpot Sync Automation";
const externalId = `e2e-sync-${Date.now()}`;

test("sync review apply shows a new automation directly in the browser list", async ({ page }) => {
  let applied = false;
  let reviewAvailable = false;

  await page.addInitScript(() => {
    window.localStorage.setItem("sb-icvrrpxtycwgaxcajwdf-auth-token", JSON.stringify({
      access_token: "e2e-access-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "e2e-refresh-token",
      user: {
        id: "e2e-user",
        aud: "authenticated",
        role: "authenticated",
        email: "e2e@example.test",
      },
    }));
  });

  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "e2e-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "e2e-refresh-token",
        user: {
          id: "e2e-user",
          aud: "authenticated",
          role: "authenticated",
          email: "e2e@example.test",
        },
      }),
    });
  });

  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "e2e-user",
        aud: "authenticated",
        role: "authenticated",
        email: "e2e@example.test",
      }),
    });
  });

  await page.route("**/functions/v1/hubspot-sync", async (route) => {
    const body = route.request().postDataJSON() as { mode?: string };
    if (body.mode === "apply") {
      applied = true;
      reviewAvailable = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          inserted: 1,
          updated: 0,
          deactivated: 0,
          total: 1,
          proposed: 0,
          findings: 0,
          missing: 0,
          changed: 0,
          syncRunId: "sync-e2e",
          mode: "apply",
          applied: 1,
          skipped: 0,
          failed: 0,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        inserted: 0,
        updated: 0,
        deactivated: 0,
        total: 1,
        proposed: 1,
        findings: 0,
        missing: 0,
        changed: 0,
        syncRunId: "sync-e2e",
        mode: "preview",
        changeItems: [{
          id: "change-e2e",
          syncRunId: "sync-e2e",
          source: "hubspot",
          externalId,
          automationId: null,
          changeType: "new_automation",
          status: "pending",
          title: automationName,
          summary: "Nieuwe HubSpot automation gevonden.",
          impact: "Wordt direct zichtbaar na toepassen.",
          oldValue: null,
          newValue: {},
          payload: {
            external_id: externalId,
            source: "hubspot",
            naam: automationName,
            status: "Actief",
            doel: "Browser smoke test",
            trigger_beschrijving: "Nieuwe workflow",
            systemen: ["HubSpot"],
            stappen: ["Start"],
            categorie: "Workflow",
            import_proposal: { read_only: true },
          },
          selectedByDefault: true,
        }],
      }),
    });
    reviewAvailable = true;
  });

  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const isPendingAutomationQuery = path.endsWith("/automatiseringen")
      && url.search.includes("import_status=eq.pending_approval");
    const isAutomationListQuery = path.endsWith("/automatiseringen")
      && url.search.includes("import_status.eq.approved");
    const isSyncReviewItemsQuery = path.endsWith("/source_sync_change_items");

    if (isPendingAutomationQuery) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if (isAutomationListQuery) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(applied ? [approvedAutomationRow()] : []),
      });
      return;
    }

    if (isSyncReviewItemsQuery) {
      await route.fulfill({
        status: 200,
        headers: {
          "content-range": reviewAvailable ? "0-0/1" : "*/0",
        },
        contentType: "application/json",
        body: JSON.stringify(reviewAvailable ? [pendingSyncReviewRow()] : []),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/imports");
  await expect(page.getByRole("heading", { name: "Imports" })).toBeVisible();
  await expect(page.getByText(/Geen HubSpot voorstellen wachten op goedkeuring/i)).not.toBeVisible();
  await page.getByRole("button", { name: /HubSpot synchroniseren/i }).click();
  await expect(page.getByRole("heading", { name: /Bronwijzigingen uit synchronisaties/i })).toBeVisible();
  await expect(page.getByText(automationName)).toBeVisible();
  await expect(page.getByText("1-1 van 1")).toBeVisible();

  await page.getByRole("button", { name: /1 geselecteerde regel toepassen/i }).click();
  await expect(page.getByText(/1 nieuwe automation aangemaakt/i)).toBeVisible();

  await page.goto("/alle");
  await expect(page.getByText(automationName)).toBeVisible();
  await expect(page.getByText(/Geen HubSpot voorstellen wachten op goedkeuring/i)).not.toBeVisible();
});

function pendingSyncReviewRow() {
  return {
    id: "change-e2e",
    sync_run_id: "sync-e2e",
    source: "hubspot",
    external_id: externalId,
    automation_id: null,
    change_type: "new_automation",
    status: "pending",
    title: automationName,
    summary: "Nieuwe HubSpot automation gevonden.",
    impact: "Wordt direct zichtbaar na toepassen.",
    old_value_sanitized: null,
    new_value_sanitized: {},
    payload_sanitized: {
      external_id: externalId,
      source: "hubspot",
      naam: automationName,
      status: "Actief",
      doel: "Browser smoke test",
      trigger_beschrijving: "Nieuwe workflow",
      systemen: ["HubSpot"],
      stappen: ["Start"],
      categorie: "Workflow",
      import_proposal: { read_only: true },
    },
    selected_by_default: true,
  };
}

function approvedAutomationRow() {
  return {
    id: `AUTO-HS-${externalId}`,
    naam: automationName,
    categorie: "Workflow",
    doel: "Browser smoke test",
    trigger_beschrijving: "Nieuwe workflow",
    systemen: ["HubSpot"],
    stappen: ["Start"],
    branches: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaid_diagram: "",
    fasen: [],
    created_at: "2026-06-29T08:00:00.000Z",
    laatst_geverifieerd: null,
    geverifieerd_door: null,
    external_id: externalId,
    endpoints: [],
    webhook_paths: [],
    source: "hubspot",
    import_status: "approved",
    import_proposal: { read_only: true },
  };
}
