import type { Automatisering } from "@/lib/types";

// Bron-onafhankelijke versie van wat voorheen `buildSummary`/`buildWhatHappens` in
// `hubspotAutomationDetailPresentation.ts` was. Die logica bleek zelf al geen enkele
// HubSpot-specifieke aanname te bevatten behalve de allerlaatste terugval-zin — alle
// brondata komt uit het gedeelde `ai_enrichment`-veld dat voor elke bron (HubSpot,
// Zapier, GitLab, Typeform) hetzelfde schema heeft (zie `AutomationAiEnrichment` in
// `types.ts`). Deze module maakt die logica expliciet bron-onafhankelijk, zodat de
// "Wat gebeurt er?"-kaart (`AutomationWhatHappensCard`) voor alle vier de bronnen
// hetzelfde kan werken in plaats van alleen voor HubSpot.
// Zie architectuur-audit.md, punt 1 en aanbeveling 3.

export interface AutomationWhatHappensPresentation {
  when?: string;
  background?: string;
  visibleInHubspot?: { status: "yes" | "no"; detail?: string };
  why?: string;
}

export interface AutomationWhatHappensResult {
  summary: string;
  whatHappens: AutomationWhatHappensPresentation;
}

export function getAutomationWhatHappensPresentation(automation: Automatisering): AutomationWhatHappensResult {
  return {
    summary: buildSummary(automation),
    whatHappens: buildWhatHappens(automation),
  };
}

function buildSummary(automation: Automatisering): string {
  // Eerste keus: de rijke, per-automation gegenereerde uitleg ("aiEnrichment"). Dit is
  // specifieke, mensleesbare tekst (bv. welke stap wat doet en wat het eindresultaat is),
  // in tegenstelling tot de generieke status-zin die elke bron-import automatisch meegeeft.
  const enrichment = automation.aiEnrichment;
  const enrichedDescription = enrichment?.description?.trim();
  if (
    enrichedDescription
    && !containsTechnicalText(enrichedDescription)
    && !isGenericStatusDescription(enrichedDescription, automation.naam)
  ) {
    const endResult = enrichment?.end_result?.trim();
    if (endResult && !enrichedDescription.includes(endResult)) {
      // `end_result` is bedoeld als het concrete eindresultaat, maar bij veel automations
      // herhaalt het gegenereerde eindresultaat grotendeels dezelfde feiten als `description`.
      // Alleen toevoegen als het echt nieuwe informatie bevat, en dan duidelijk gelabeld als
      // resultaat i.p.v. als een derde, ononderscheiden zin.
      if (!hasSubstantialWordOverlap(enrichedDescription, endResult)) {
        return `${enrichedDescription} Resultaat: ${lowercaseFirstLetter(endResult)}`;
      }
    }
    return enrichedDescription;
  }

  const simpleDescription = enrichment?.summary?.trim()
    || automation.aiDescription
    || automation.beschrijvingInSimpeleTaal?.find((line) => line.trim())
    || automation.doel;
  if (simpleDescription && !containsTechnicalText(simpleDescription) && !isGenericStatusDescription(simpleDescription, automation.naam)) return simpleDescription.trim();

  // Bron-neutrale terugval: `simpleDescription` (inclusief `doel`) is hierboven al
  // geweigerd wegens technische taal of generieke status-tekst, dus die niet alsnog
  // ongefilterd tonen — anders lekt bv. een rauwe webhook-URL door. Geen aanname over
  // HubSpot-workflows, Zaps, endpoints of formulieren — gewoon een eerlijke lege staat.
  return `Voor "${automation.naam}" is nog geen samenvatting beschikbaar. Bekijk de technische details hieronder voor de brongegevens.`;
}

// Bouwt de inhoud voor de "Wat gebeurt er?"-kaart: de plek waar iemand zonder
// technische achtergrond in één keer moet kunnen zien wanneer deze regel afgaat,
// wat er dan gebeurt (met een expliciet onderscheid tussen het onzichtbare
// achtergrondeffect en of dat effect ook echt in HubSpot te zien is), en waarom
// die regel bestaat. Elk stukje komt uit een los `ai_enrichment`-veld dat per
// automation wordt ingevuld tijdens de contentronde; zolang dat nog niet is
// gebeurd, laten we de betreffende regel gewoon weg in plaats van te gokken.
function buildWhatHappens(automation: Automatisering): AutomationWhatHappensPresentation {
  const enrichment = automation.aiEnrichment;

  const when = enrichment?.when_text?.trim() || enrichment?.trigger_moment?.trim() || undefined;
  const background = enrichment?.data_flow?.trim() || undefined;
  const why = enrichment?.why_text?.trim() || undefined;

  let visibleInHubspot: AutomationWhatHappensPresentation["visibleInHubspot"];
  if (typeof enrichment?.visible_in_hubspot === "boolean") {
    visibleInHubspot = {
      status: enrichment.visible_in_hubspot ? "yes" : "no",
      detail: enrichment.visible_in_hubspot_detail?.trim() || undefined,
    };
  }

  return { when, background, visibleInHubspot, why };
}

const SUMMARY_STOPWORDS = new Set([
  "de", "het", "een", "en", "van", "voor", "naar", "op", "in", "is", "wordt", "worden",
  "bij", "aan", "die", "dat", "deze", "dit", "als", "via", "met", "uit", "na", "daarna",
  "afhankelijk", "criteria", "relevante", "relevant", "gedefinieerde", "verdere",
]);

function significantWords(value: string): Set<string> {
  const words = value
    .toLowerCase()
    .replace(/['"()]/g, "")
    .split(/[^a-z0-9à-ÿ-]+/i)
    .filter((word) => word.length >= 4 && !SUMMARY_STOPWORDS.has(word));
  return new Set(words);
}

// Twee woorden tellen als "hetzelfde" als ze exact overeenkomen, of als het duidelijke
// vervoegingen/varianten van elkaar zijn (extern/externe, routing/procesrouting). Puur exacte
// matching mist te veel van dit soort AI-gegenereerde variatie en onderschat daardoor hoezeer
// end_result gewoon description herhaalt.
function wordsRelate(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a));
}

// Schat in of `end_result` grotendeels dezelfde inhoud herhaalt als `description`, zodat we
// weten of het toevoegen ervan de samenvatting echt iets nieuws vertelt of alleen langer maakt.
function hasSubstantialWordOverlap(description: string, endResult: string): boolean {
  const descWords = Array.from(significantWords(description));
  const resultWords = Array.from(significantWords(endResult));
  if (resultWords.length === 0) return true;

  const shared = resultWords.filter((word) => descWords.some((descWord) => wordsRelate(descWord, word))).length;
  return shared / resultWords.length >= 0.5;
}

function lowercaseFirstLetter(value: string): string {
  return value.length > 0 ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function containsTechnicalText(value: string): boolean {
  return /\b(GET|POST|PUT|PATCH|DELETE)\b|https?:\/\/|webhook\s*->|(?:^|\s)\/[a-z0-9][^\s.,)]|een van deze waarden is ['"]?\d+['"]?/i.test(value);
}

function isGenericStatusDescription(value: string, automationName: string): boolean {
  // Dit vangt de generieke boilerplate-zin die bij elke import automatisch wordt meegegeven
  // (bv. "Deze automatisering heet 'X' en is momenteel uitgeschakeld."), zodat we die nooit
  // als "goede" beschrijving tonen. De naam in die zin komt soms niet meer exact overeen met
  // de huidige `naam` van de automation (bv. omdat de portal-naam later een disambiguerend
  // ID-suffix kreeg), en de status kan ook "uitgeschakeld"/"in review"/"verouderd" zijn i.p.v.
  // alleen "actief", en met of zonder het woord "momenteel" — dus we matchen daar flexibel op.
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  const statusPattern = "(?:momenteel\\s+)?(?:actief|uitgeschakeld|in review|verouderd)";
  if (new RegExp(`^deze automatisering is ${statusPattern}\\.?$`, "i").test(normalized)) return true;

  const match = normalized.match(new RegExp(`^deze automatisering heet ['"]?(.+?)['"]?\\s+en is ${statusPattern}\\.?$`, "i"));
  if (!match) return false;
  const quotedName = match[1].trim();
  const name = automationName.trim().toLowerCase();
  return name === quotedName || name.startsWith(quotedName) || quotedName.startsWith(name);
}
