#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DRY_RUN_ONLY = true;

const PROVEN_FOLLOW_UP_RULE =
  "Een procesreis wordt alleen doorgetrokken naar een vervolgstap wanneer de exacte property, waarde, dealstage, workflowtrigger of codekoppeling bewezen is. Zonder bewijs stopt de procesreis bij de laatst bewezen systeemupdate.";

const pilotMatchers = [
  /wefact|debtor|debiteur/i,
  /btw|kwartaal|quarter/i,
  /machtiging|vig/i,
];

function readEnv() {
  if (!existsSync(".env")) {
    throw new Error("Geen .env gevonden. Dit script heeft VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY nodig.");
  }

  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index),
          line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

function readSessionAccessToken() {
  const statePath = "tmp/playwright-auth-state.json";
  if (!existsSync(statePath)) {
    throw new Error("Geen tmp/playwright-auth-state.json gevonden. Log eerst lokaal in of maak een Playwright storageState.");
  }

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const storedSession = state.origins?.[0]?.localStorage?.find((entry) =>
    entry.name.includes("auth-token")
  )?.value;
  if (!storedSession) throw new Error("Geen Supabase auth-token gevonden in tmp/playwright-auth-state.json.");

  return JSON.parse(storedSession).access_token;
}

async function supabaseGet(path) {
  const env = readEnv();
  const token = readSessionAccessToken();
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase request mislukt (${res.status}): ${text}`);
  return JSON.parse(text);
}

function cleanName(name = "") {
  return name
    .replace(/\s*\(POST\s+[^)]+\)/gi, "")
    .replace(/\bendpoint\b/gi, "verwerking")
    .replace(/\bhandler\b/gi, "verwerking")
    .replace(/\s+/g, " ")
    .trim();
}

function combinedText(flow, automations) {
  return [
    flow.naam,
    flow.beschrijving,
    ...(automations ?? []).flatMap((automation) => [
      automation.naam,
      automation.doel,
      automation.trigger_beschrijving,
      automation.endpoints?.join(" "),
      automation.import_proposal?.gitlab_endpoint?.endpoint,
    ]),
  ].filter(Boolean).join(" ");
}

function detectDomain(flow, automations) {
  const text = combinedText(flow, automations);
  if (/wefact|debtor|debiteur/i.test(text)) return "wefact";
  if (/btw|kwartaal|quarter|berekening compleet/i.test(text)) return "btw";
  if (/machtiging|vig/i.test(text)) return "machtiging";
  if (/vpb/i.test(text)) return "vpb";
  if (/jaarrekening|\bjr\b/i.test(text)) return "jaarrekening";
  if (/\bib\b|inkomstenbelasting/i.test(text)) return "ib";
  if (/year|jaar/i.test(text)) return "jaar";
  return "algemeen";
}

function findStartAutomation(automations) {
  return automations.find((automation) => automation.source === "hubspot") ?? automations[0];
}

function findBackendAutomation(automations) {
  return automations.find((automation) => automation.source === "gitlab") ?? automations[automations.length - 1];
}

function safeManualWorkSentence() {
  return "Dit vermindert handmatig werk, terwijl uitzonderingen of ontbrekende gegevens zichtbaar blijven voor controle.";
}

function exceptionControlSentence() {
  return "Medewerkers hoeven vooral nog in te grijpen bij ontbrekende gegevens, foutieve koppelingen of uitzonderingen.";
}

export function buildDraftCopy(flow, automations) {
  const domain = detectDomain(flow, automations);
  const text = combinedText(flow, automations);
  const start = findStartAutomation(automations);
  const backend = findBackendAutomation(automations);
  const startName = cleanName(start?.naam ?? flow.naam);
  const backendName = cleanName(backend?.naam ?? "de backendverwerking");

  if (/create new deal/i.test(text)) {
    return [
      `Wanneer de HubSpot-workflow "${startName}" start, geeft HubSpot het werk automatisch door aan de verwerking "${backendName}".`,
      "De verwerking maakt of werkt de salesdeal bij op basis van de gegevens die HubSpot op dat moment kent. Zo blijft de eerste commerciële opvolging gekoppeld aan de juiste contactpersoon, company en dealcontext.",
      `${safeManualWorkSentence()} Een vervolgproces wordt alleen gekoppeld als de volgende trigger expliciet uit workflowdata of code blijkt.`,
    ].join("\n\n");
  }

  if (/betaalt niet/i.test(text)) {
    return [
      `Wanneer een deal de fase "Betaalt niet" verlaat, start de workflow "${startName}".`,
      `De verwerking "${backendName}" herstelt de betaalstatus op de gekoppelde HubSpot-deal, zodat de klant of deal niet onterecht als betalingsblokkade blijft staan.`,
      `${exceptionControlSentence()} Een volgende stap is alleen gekoppeld wanneer de trigger daarvan expliciet is aangetoond.`,
    ].join("\n\n");
  }

  if (/kvk/i.test(text)) {
    return [
      `Wanneer HubSpot bedrijfsgegevens via de workflow "${startName}" wil verrijken, geeft HubSpot het werk door aan de verwerking "${backendName}".`,
      "De verwerking haalt KvK-informatie op en werkt de beschikbare companygegevens in HubSpot bij. Daardoor blijven bedrijfsgegevens zoals naam, rechtsvorm of KvK-gerelateerde kenmerken beter bruikbaar voor klantdossiers en vervolgautomatiseringen.",
      `${exceptionControlSentence()} Er is geen bewezen automatische vervolgstap gevonden in deze voorsteltekst.`,
    ].join("\n\n");
  }

  if (/contactgegevens|name change of contact|contact change/i.test(text)) {
    return [
      `Wanneer de workflow "${startName}" ziet dat contactgegevens zijn gewijzigd, wordt de verwerking "${backendName}" aangeroepen.`,
      "De verwerking gebruikt de actuele contactinformatie om gekoppelde HubSpot-gegevens, zoals dealnamen of herkenbare klantgegevens, bij te werken. Zo blijven contact, deal en klantdossier makkelijker herkenbaar voor medewerkers.",
      "Hierdoor blijft de status actueel zonder dat medewerkers deze stap standaard handmatig hoeven over te nemen. Een vervolgproces wordt alleen gekoppeld wanneer de trigger daarvan bewezen is.",
    ].join("\n\n");
  }

  if (/customer type changes|check beginner stage/i.test(text)) {
    return [
      `Wanneer het klanttype in HubSpot verandert, start de workflow "${startName}".`,
      `De verwerking "${backendName}" controleert of de gekoppelde deal nog in de juiste beginfase staat. Dat helpt voorkomen dat een klant in de verkeerde start- of onboardingfase blijft staan.`,
      `${exceptionControlSentence()} Een volgende procesreis wordt pas gekoppeld wanneer de exacte trigger is aangetoond.`,
    ].join("\n\n");
  }

  if (domain === "wefact") {
    return [
      `Wanneer een klant of bedrijf in HubSpot klaarstaat om in WeFact te worden aangemaakt of bijgewerkt, start de workflow "${startName}".`,
      "De verwerking neemt de relevante klant- en bedrijfsgegevens uit HubSpot over en werkt de debiteur in WeFact bij. Zo blijven de debiteurgegevens voor facturatie actueel zonder dat dezelfde klantgegevens opnieuw handmatig hoeven te worden ingevoerd.",
      "Na afloop blijft HubSpot het startpunt voor de klantrelatie en is WeFact bijgewerkt voor facturatie. Controle blijft vooral nodig bij uitzonderingen, ontbrekende gegevens of foutieve koppelingen.",
    ].join("\n\n");
  }

  if (domain === "btw") {
    return [
      `Wanneer in HubSpot zichtbaar wordt dat een BTW-stap of kwartaalstatus is afgerond, start de workflow "${startName}".`,
      `De verwerking bepaalt welke BTW-deal of welk volgende kwartaal bijgewerkt moet worden. Zo blijft de administratie aan de juiste periode gekoppeld en ziet het team in HubSpot of de BTW-aangifte verder kan worden opgepakt.`,
      "Een volgende procesreis wordt pas gekoppeld wanneer de exacte property of dealstage als starttrigger van een andere workflow is bewezen.",
    ].join("\n\n");
  }

  if (domain === "machtiging") {
    if (/copy machtiging contact property naar deal|machtiging actief contact/i.test(text)) {
      return [
        `Wanneer de machtigingsinformatie op contactniveau verandert, start de workflow "${startName}".`,
        "De verwerking zet de actuele machtigingsstatus door naar de gekoppelde deal. Daardoor is de fiscale machtigingsinformatie niet alleen op het contact, maar ook in de relevante deal zichtbaar voor medewerkers en vervolgcontroles.",
        "Een vervolgstap wordt alleen gekoppeld wanneer uit code of workflowdata blijkt welke property of dealstage daarna een nieuwe workflow start.",
      ].join("\n\n");
    }

    if (/correct stage ib|route after typeform and machtiging|prereqs_webhook/i.test(text)) {
      return [
        `Wanneer de machtigingsinformatie van een klant verandert, start de workflow "${startName}".`,
        "De verwerking controleert of de gekoppelde IB-deal nog in de juiste fase staat. Daarbij is vooral relevant of de machtiging/VIG actief is en of andere voorwaarden, zoals jaarrekeningen of aanvullende klantinformatie, compleet zijn.",
        "Zo blijft in HubSpot zichtbaar of de IB-aangifte nog wacht op machtiging of verder kan worden opgepakt.",
      ].join("\n\n");
    }

    return [
      `Wanneer de machtigingsinformatie van een klant verandert, start de workflow "${startName}".`,
      "Het systeem werkt de bijbehorende klant- of dossierinformatie bij, zodat duidelijk blijft of Brand de benodigde fiscale gegevens mag gebruiken. Dit is vooral belangrijk voor IB-werk, waar machtiging of VIG kan bepalen of aangifte-informatie compleet is.",
      "Na afloop ziet de medewerker in HubSpot of het dossier verder kan of dat machtiging nog aandacht vraagt. Een vervolgproces wordt alleen gekoppeld als die vervolgstap hard uit de code of workflowdata blijkt.",
    ].join("\n\n");
  }

  if (domain === "ib") {
    return [
      `Wanneer de HubSpot-workflow "${startName}" start, roept HubSpot de verwerking "${backendName}" aan.`,
      "De verwerking werkt de status van de gekoppelde IB-deal bij, zodat in HubSpot zichtbaar blijft of de inkomstenbelastingaangifte verder kan worden opgepakt. Dit is belangrijk omdat IB-werk afhankelijk kan zijn van machtiging/VIG, afgeronde jaarrekeningen en aanvullende klantinformatie.",
      "Controle blijft nodig bij uitzonderingen of ontbrekende gegevens. Een vervolgproces wordt alleen gekoppeld wanneer uit de code of workflowdata blijkt welke exacte property, waarde of dealstage daarna een nieuwe workflow start.",
    ].join("\n\n");
  }

  if (domain === "vpb") {
    return [
      `Wanneer de workflow "${startName}" aangeeft dat een VPB-stap is afgerond, roept HubSpot de verwerking "${backendName}" aan.`,
      "De verwerking werkt de gekoppelde VPB-deal bij, zodat in HubSpot zichtbaar blijft dat de VPB-stap is afgerond en de fiscale status actueel blijft.",
      `${exceptionControlSentence()} Een vervolgproces wordt alleen gekoppeld wanneer de exacte vervolgstap uit code of workflowdata blijkt.`,
    ].join("\n\n");
  }

  if (domain === "jaarrekening") {
    return [
      `Wanneer de workflow "${startName}" ziet dat een jaarrekening invloed heeft op IB-werk, roept HubSpot de verwerking "${backendName}" aan.`,
      "De verwerking werkt de prioriteit of status van de gekoppelde jaarrekeningdeal bij. Daardoor ziet het team in HubSpot welke jaarrekening extra aandacht nodig heeft omdat een IB-aangifte daarop kan wachten.",
      `${safeManualWorkSentence()} Een volgende stap is alleen gekoppeld wanneer de trigger daarvan expliciet is aangetoond.`,
    ].join("\n\n");
  }

  if (domain === "jaar") {
    return [
      `Wanneer HubSpot een jaargebonden wijziging registreert, start de workflow "${startName}".`,
      `De verwerking "${backendName}" werkt het jaar of de jaarcontext op de HubSpot-deal bij. Daardoor blijven jaargebonden werkzaamheden, zoals BTW, IB, JR of VPB, aan de juiste periode gekoppeld.`,
      `Na afloop ziet de medewerker in HubSpot de bijgewerkte jaarinformatie. ${safeManualWorkSentence()}`,
    ].join("\n\n");
  }

  return [
    `Wanneer de HubSpot-workflow "${startName}" start, geeft HubSpot het werk automatisch door aan de verwerking "${backendName}".`,
    "De verwerking werkt de gekoppelde HubSpot-deal, company of contact bij op basis van de gegevens die de workflow aanlevert. Zo blijft de processtatus in HubSpot beter aansluiten op wat er in het klant- of dossierproces is gebeurd.",
    `${safeManualWorkSentence()} Een vervolgstap wordt alleen genoemd wanneer die uit de aangeleverde data blijkt.`,
  ].join("\n\n");
}

export function buildDraftName(flow, automations) {
  const domain = detectDomain(flow, automations);
  const text = combinedText(flow, automations);
  const currentName = cleanName(flow.naam);

  if (/create new deal/i.test(text)) return "Salesdeal aanmaken";
  if (/betaalt niet/i.test(text)) return "Betaalt niet status herstellen";
  if (/kvk/i.test(text)) return "KvK gegevens ophalen";
  if (/contactgegevens|name change of contact|contact change/i.test(text)) return "Contactgegevens bijwerken";
  if (/jaarrekening prioriteit|jr prio|jr priority/i.test(text)) return "Jaarrekening prioriteit bijwerken";
  if (/customer type changes|check beginner stage/i.test(text)) return "Klanttype en beginfase controleren";
  if (domain === "wefact") return "WeFact debiteur bijwerken";
  if (domain === "machtiging") return "Machtiging verwerken";
  if (domain === "btw" && /kwartaal|quarter/i.test(text)) return "BTW kwartaalstatus bijwerken";
  if (domain === "btw" && /berekening compleet/i.test(text)) return "BTW berekening afronden";
  if (domain === "btw") return "BTW procesfase bijwerken";
  if (domain === "vpb") return "VPB status bijwerken";
  if (domain === "ib") return "IB status bijwerken";
  if (domain === "jaarrekening") return "Jaarrekeningstatus bijwerken";
  if (domain === "jaar") return "Jaarveld bijwerken";

  const start = cleanName(findStartAutomation(automations)?.naam ?? flow.naam);
  if (/procesreis bijwerken|procesfase bepalen/i.test(flow.naam) && start) return start;
  return currentName;
}

function selectPilotFlows(flows, automationsById) {
  const selected = [];
  for (const matcher of pilotMatchers) {
    const match = flows.find((flow) => {
      const automations = (flow.automation_ids ?? []).map((id) => automationsById.get(id)).filter(Boolean);
      return matcher.test(combinedText(flow, automations)) && !selected.some((item) => item.id === flow.id);
    });
    if (match) selected.push(match);
  }
  return selected;
}

function writePilot(pilotItems) {
  mkdirSync("tmp", { recursive: true });
  const isAllRun = process.argv.includes("--all");
  const jsonPath = join("tmp", isAllRun ? "process-journey-copy-all.json" : "process-journey-copy-pilot.json");
  const markdownPath = join("tmp", isAllRun ? "process-journey-copy-all.md" : "process-journey-copy-pilot.md");
  writeFileSync(jsonPath, JSON.stringify({ DRY_RUN_ONLY, items: pilotItems }, null, 2), "utf8");
  writeFileSync(
    markdownPath,
    [
      "# Procesreis Copy Pilot",
      "",
      "DRY_RUN_ONLY: dit bestand is alleen een voorstel en schrijft niets terug naar Supabase.",
      "",
      "## Algemene regel",
      "",
      PROVEN_FOLLOW_UP_RULE,
      "",
      ...pilotItems.map((item) => [
        `## ${item.naam}`,
        "",
        `ID: \`${item.id}\``,
        "",
        "### oude naam",
        "",
        item.oudeNaam,
        "",
        "### nieuwe naam",
        "",
        item.nieuweNaam,
        "",
        "### oude tekst",
        "",
        item.oudeTekst || "_Geen beschrijving opgeslagen._",
        "",
        "### nieuwe tekst",
        "",
        item.nieuweTekst,
        "",
      ].join("\n")),
    ].join("\n"),
    "utf8",
  );
  return { jsonPath, markdownPath };
}

async function main() {
  const [flows, automations] = await Promise.all([
    supabaseGet("flows?select=*&order=created_at.desc"),
    supabaseGet("automatiseringen?select=id,naam,categorie,doel,trigger_beschrijving,systemen,source,endpoints,import_proposal&order=created_at.asc"),
  ]);
  const automationsById = new Map(automations.map((automation) => [automation.id, automation]));
  const pilotFlows = process.argv.includes("--all") ? flows : selectPilotFlows(flows, automationsById);
  const pilotItems = pilotFlows.map((flow) => {
    const flowAutomations = (flow.automation_ids ?? []).map((id) => automationsById.get(id)).filter(Boolean);
    return {
      id: flow.id,
      naam: flow.naam,
      oudeNaam: flow.naam,
      nieuweNaam: buildDraftName(flow, flowAutomations),
      oudeTekst: flow.beschrijving ?? "",
      nieuweTekst: buildDraftCopy(flow, flowAutomations),
      automations: flowAutomations.map((automation) => ({
        naam: automation.naam,
        categorie: automation.categorie,
        source: automation.source,
      })),
    };
  });

  const output = writePilot(pilotItems);
  console.log(JSON.stringify({ ...output, count: pilotItems.length, DRY_RUN_ONLY }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
