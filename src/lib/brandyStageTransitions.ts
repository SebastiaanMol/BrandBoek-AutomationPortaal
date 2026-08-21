import type { BrandyResponse } from "@/lib/brandy";

const BTW_RE = /\bbtw\b/i;
const OPEN_RE = /\bopen\b/i;
const GEGEVENS_GEREED_RE = /\bgegevens\s+gereed\b/i;
const TRANSITION_INTENT_RE = /\b(?:voorwaarden|wanneer|waarom|hoe|moet|nodig|gaat|verplaatst|doorstroomt|stage|fase|dealstage)\b/i;

export function parseStageTransitionQuestion(question: string): "btw_open_to_gegevens_gereed" | null {
  const value = question.trim();
  if (!value) return null;

  if (
    BTW_RE.test(value) &&
    OPEN_RE.test(value) &&
    GEGEVENS_GEREED_RE.test(value) &&
    TRANSITION_INTENT_RE.test(value)
  ) {
    return "btw_open_to_gegevens_gereed";
  }

  return null;
}

export function buildStageTransitionBrandyResponse(
  transition: ReturnType<typeof parseStageTransitionQuestion>
): BrandyResponse | null {
  if (transition !== "btw_open_to_gegevens_gereed") return null;

  return {
    antwoord: [
      "Voor een BTW-deal is de route van Open naar Gegevens gereed inderdaad niet alleen de bankrekening. De bewezen backend-route loopt via route_btw_by_deal_id_and_update en gebruikt de deal, de gekoppelde company en periodevelden om de juiste BTW-stage te bepalen.",
      "",
      "Voor Gegevens gereed moet minimaal dit kloppen:",
      "- De deal moet gevonden kunnen worden en gekoppeld zijn aan een company.",
      "- De backend leest pipeline, dealstage, year en quarter op de deal.",
      "- De gekoppelde company moet een toegestane/actieve bankkoppeling hebben via bankkoppeling_status.",
      "- bankkoppeling_verlopen_datum mag de deal niet naar een verlopen-route sturen; de koppeling moet dus lang genoeg geldig zijn voor de relevante BTW-periode.",
      "- btw_2_maanden_geboekt_huidig_kwartaal speelt mee om te bepalen of een verlopen koppeling alsnog naar de speciale voortgangsstage gaat.",
      "- De doelstage Gegevens gereed moet in de betreffende pipeline vindbaar zijn.",
      "",
      "Belangrijke uitzonderingen:",
      "- Als de bankkoppeling verlopen is maar er is al voortgang, routeert de backend naar 2 maanden geboekt (bankkoppeling verlopen).",
      "- Als de koppeling verlopen is zonder bruikbare voortgang, blijft of valt de deal terug naar Open.",
      "- Pakket/software-routering kan de deal naar andere doelstages sturen, zoals Software, Pakket, CSV of Open Volledige Service.",
      "- Als geen specifieke route matcht, gebruikt de backend een beginner/fallback-stage in plaats van blind Gegevens gereed.",
      "",
      "Kort gezegd: Actieve bankkoppeling is de hoofdfactor, maar de echte beslissing hangt ook af van company-koppeling, pipeline/stage, year, quarter, verlopen-datum, boekingsvoortgang en pakketroutering.",
    ].join("\n"),
    bronnen: [
      "docs/runtime-orchestration/worker-profiles.json",
      "src/lib/generatedPythonCodePathAnalysis.ts",
      "gitlabtest/app/API/operations.py",
      "gitlabtest/app/service/operations/btw_bankconnection.py",
    ],
    entiteiten: [
      "BTW pipeline",
      "Open",
      "Gegevens gereed",
      "route_btw_by_deal_id_and_update",
      "find_correct_stage",
      "bankkoppeling_status",
      "bankkoppeling_verlopen_datum",
      "btw_2_maanden_geboekt_huidig_kwartaal",
      "year",
      "quarter",
      "company",
    ],
    zekerheid: "hoog",
    diagnose_modus: false,
    stap_nummer: 1,
  };
}
