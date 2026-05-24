import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Brand Boekhouders Gemini context", () => {
  it("keeps the company context markdown in the repository", () => {
    const context = read("context/brand_boekhouders_gemini_context.md");

    expect(context).toContain("Brand Boekhouders");
    expect(context).toContain("Gebruik interne context alleen om de code beter te duiden");
    expect(context).toContain("Verzin geen bedrijfsregels");
  });

  it("exposes a shared prompt helper with code-first guardrails", () => {
    const helper = read("supabase/functions/_shared/brand-context.ts");

    expect(helper).toContain("BRAND_BOEKHOUDERS_GEMINI_CONTEXT");
    expect(helper).toContain("buildBrandContextPrompt");
    expect(helper).toContain("De code, workflowdata en concrete input blijven leidend");
    expect(helper).toContain("verzin geen processen");
    expect(helper).toContain("Schrijf hoofdteksten voor niet-technische Brand-medewerkers");
    expect(helper).toContain("Gebruik technische termen alleen als bewijs of in een technische trace");
  });

  it("defines non-technical process journey writing rules", () => {
    const context = read("context/brand_boekhouders_gemini_context.md");

    expect(context).toContain("## Schrijfstijl voor procesreizen");
    expect(context).toContain("Hoofdtekst is voor niet-technische Brand-medewerkers");
    expect(context).toContain("Vermijd in hoofdteksten technische termen zoals `POST /...`, `endpoint`, `handler`, `payload`, `runtime` en `call graph`");
    expect(context).toContain("Leg altijd uit wat een medewerker daarna ziet of merkt in HubSpot, WeFact, het portaal of een andere bronsysteem");
    expect(context).toContain("Maak elke procesbeschrijving zo specifiek mogelijk op basis van bewezen informatie");
    expect(context).toContain("Gebruik geen algemene zin als duidelijker blijkt welk object, systeem, property of proces wordt bijgewerkt");
    expect(context).toContain("Controle blijft alleen nodig bij uitzonderingen of ontbrekende gegevens");
  });

  it("keeps a dry-run audit script for confirmed process journey copy", () => {
    const script = read("scripts/audit-process-journey-copy.mjs");

    expect(script).toContain("confirmed-flows-copy-audit.json");
    expect(script).toContain("Controleer voor het opslaan");
    expect(script).toContain("technicalTerms");
    expect(script).toContain("scoreFlowCopy");
  });

  it("keeps a pilot script for old-versus-new process journey copy", () => {
    const script = read("scripts/draft-process-journey-copy-pilot.mjs");

    expect(script).toContain("process-journey-copy-pilot.md");
    expect(script).toContain("buildDraftCopy");
    expect(script).toContain("buildDraftName");
    expect(script).toContain("DRY_RUN_ONLY");
    expect(script).toContain("oude tekst");
    expect(script).toContain("oude naam");
    expect(script).toContain("nieuwe tekst");
    expect(script).toContain("nieuwe naam");
    expect(script).toContain("--all");
  });

  it("keeps a guarded one-flow apply script for approved process journey copy", () => {
    const script = read("scripts/apply-process-journey-copy.mjs");

    expect(script).toContain("process-journey-copy-all.json");
    expect(script).toContain("--id");
    expect(script).toContain("--apply");
    expect(script).toContain("DRY_RUN_ONLY");
    expect(script).toContain("refresh_token");
    expect(script).toContain("PATCH");
    expect(script).toContain("naam");
    expect(script).toContain("beschrijving");
    expect(script).not.toContain("--all");
  });

  it("drafts process journey copy without the generic fallback sentence or overclaiming manual checks", async () => {
    const { buildDraftCopy } = await import("../../scripts/draft-process-journey-copy-pilot.mjs");

    const copy = buildDraftCopy(
      { naam: "Procesreis bijwerken", beschrijving: "", automation_ids: [] },
      [
        { naam: "Update IB kan gemaakt worden property", source: "hubspot" },
        { naam: "Update ib deal (POST /properties/update_ib_kan_gemaakt_worden)", source: "gitlab" },
      ],
    );

    expect(copy).toContain("IB-deal");
    expect(copy).toContain("inkomstenbelastingaangifte");
    expect(copy).not.toContain("verwerkt de bekende klant-, deal- of dossiergegevens");
    expect(copy).not.toContain("niet handmatig te controleren");
    expect(copy).toContain("uitzonderingen");
  });

  it("prioritizes jaarrekening meaning when JR priority copy also mentions IB", async () => {
    const { buildDraftCopy } = await import("../../scripts/draft-process-journey-copy-pilot.mjs");

    const copy = buildDraftCopy(
      { naam: "Jaarrekening prioriteit bijwerken", beschrijving: "", automation_ids: [] },
      [
        { naam: "Move JR deals based on priority from IB", source: "hubspot" },
        { naam: "Jr prio from ib (POST /properties/jr_prio_from_ib)", source: "gitlab" },
      ],
    );

    expect(copy).toContain("jaarrekeningdeal");
    expect(copy).toContain("IB-aangifte");
    expect(copy).not.toContain("status van de gekoppelde IB-deal");
  });

  it("uses safer final-review wording for VPB, Betaalt niet and KvK drafts", async () => {
    const { buildDraftCopy } = await import("../../scripts/draft-process-journey-copy-pilot.mjs");

    const vpbCopy = buildDraftCopy(
      { naam: "Procesreis bijwerken", beschrijving: "", automation_ids: [] },
      [
        { naam: "VPB ingediend -> VA VPB deal aanpassen", source: "hubspot" },
        { naam: "Vpb finished webhook (POST /properties/vpb/finished_webhook)", source: "gitlab" },
      ],
    );
    expect(vpbCopy).toContain("dat de VPB-stap is afgerond en de fiscale status actueel blijft");
    expect(vpbCopy).not.toContain("door kan naar een volgende fiscale status");

    const betaalCopy = buildDraftCopy(
      { naam: "Procesreis bijwerken", beschrijving: "", automation_ids: [] },
      [
        { naam: 'Revert betaalt niet when deal leaves "Betaalt niet" in sales pipeline', source: "hubspot" },
        { naam: "Reset betaalt niet (POST /operations/hubspot/reset_betaalt_niet)", source: "gitlab" },
      ],
    );
    expect(betaalCopy).toContain("zodat de klant of deal niet onterecht als betalingsblokkade blijft staan");
    expect(betaalCopy).not.toContain("zodat het dossier niet onnodig als betalingsblokkade blijft staan");

    const kvkCopy = buildDraftCopy(
      { naam: "Procesreis bijwerken", beschrijving: "", automation_ids: [] },
      [
        { naam: "Ophalen KvK gegevens", source: "hubspot" },
        { naam: "Kvk sync company (POST /kvk/hubspot/sync_company)", source: "gitlab" },
      ],
    );
    expect(kvkCopy).toContain("werkt de beschikbare companygegevens in HubSpot bij");
    expect(kvkCopy).toContain("bedrijfsgegevens zoals naam, rechtsvorm of KvK-gerelateerde kenmerken");
    expect(kvkCopy).not.toContain("bedrijfsnaam, rechtsvorm of andere KvK-gerelateerde gegevens");
  });

  it("distinguishes IB stage correction from copying machtiging from contact to deal", async () => {
    const { buildDraftCopy } = await import("../../scripts/draft-process-journey-copy-pilot.mjs");

    const correctStageCopy = buildDraftCopy(
      { naam: "Machtiging verwerken", beschrijving: "", automation_ids: [] },
      [
        { naam: "Correct Stage IB", source: "hubspot" },
        { naam: "Ib route after typeform and machtiging (POST /properties/ib/route_after_typeform_and_machtiging)", source: "gitlab" },
      ],
    );
    expect(correctStageCopy).toContain("controleert of de gekoppelde IB-deal nog in de juiste fase staat");
    expect(correctStageCopy).toContain("machtiging/VIG actief is");
    expect(correctStageCopy).toContain("jaarrekeningen of aanvullende klantinformatie");
    expect(correctStageCopy).toContain("of de IB-aangifte nog wacht op machtiging of verder kan worden opgepakt");
    expect(correctStageCopy).not.toContain("zet de actuele machtigingsstatus door naar de gekoppelde deal");

    const copyToDealCopy = buildDraftCopy(
      { naam: "Machtiging verwerken", beschrijving: "", automation_ids: [] },
      [
        { naam: "Copy Machtiging contact property naar deal", source: "hubspot" },
        { naam: "Ib machtiging actief contact webhook (POST /properties/ib/machtiging_actief_contact_webhook)", source: "gitlab" },
      ],
    );
    expect(copyToDealCopy).toContain("Wanneer de machtigingsinformatie op contactniveau verandert");
    expect(copyToDealCopy).toContain("zet de actuele machtigingsstatus door naar de gekoppelde deal");
    expect(copyToDealCopy).toContain("niet alleen op het contact, maar ook in de relevante deal zichtbaar");
    expect(copyToDealCopy).not.toContain("controleert of de gekoppelde IB-deal nog in de juiste fase staat");
  });

  it("writes one general proven-follow-up rule instead of repeating the same heavy line per process", () => {
    const script = read("scripts/draft-process-journey-copy-pilot.mjs");

    expect(script).toContain("Algemene regel");
    expect(script).toContain("Zonder bewijs stopt de procesreis bij de laatst bewezen systeemupdate");
    expect(script).not.toContain("De procesreis stopt bij de bewezen systeemupdate. Een vervolgproces wordt alleen gekoppeld wanneer de exacte property, waarde of dealstage als starttrigger van een andere workflow is bewezen.");
  });

  it("adds the shared company context to Gemini description functions", () => {
    const functionPaths = [
      "supabase/functions/gitlab-sync/index.ts",
      "supabase/functions/enrich-automation/index.ts",
      "supabase/functions/describe-flow/index.ts",
      "supabase/functions/name-flow/index.ts",
      "supabase/functions/describe-pipeline/index.ts",
      "supabase/functions/hubspot-pipelines/index.ts",
      "supabase/functions/extract-automation/index.ts",
    ];

    for (const path of functionPaths) {
      const source = read(path);
      expect(source, path).toContain("../_shared/brand-context.ts");
      expect(source, path).toContain("buildBrandContextPrompt");
    }
  });
});
