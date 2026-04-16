# AI Enrichment & Review Dashboard — Design Spec

## Doel

Gesyncde automations doorlopen een review-fase voor ze zichtbaar worden in Alle Automatiseringen. Per automation genereert Gemini een samengestelde beschrijving op basis van de HubSpot workflow-data én de bijbehorende GitLab backend-code. De reviewer ziet de AI-suggesties per veld, past aan waar nodig, en keurt goed of af.

## Scope

**Inbegrepen:**
- Nieuwe `enrich-automation` Supabase edge function
- `ai_enrichment` JSONB kolom op `automatiseringen`
- Automatische aanroep na hubspot-sync, gitlab-sync en bij nieuwe inserts
- Vervangen van de huidige Imports-pagina door een nieuw Review dashboard
- Per-veld bewerkbare AI-suggesties (naam, doel, beschrijving, systemen, fasen)
- Goedkeuren / Afwijzen flow

**Niet inbegrepen:**
- Handmatig herstarten van enrichment via de UI (toekomstig)
- Batch goedkeuren (toekomstig)
- Enrichment voor Zapier-automations met Zapier API-data (alleen naam/beschrijving via workflow-data)

---

## Architectuur

### 1. Database

Eén nieuwe kolom:

```sql
ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS ai_enrichment JSONB;
```

Structuur van de waarde:

```json
{
  "summary": "Één zin die de kern beschrijft.",
  "description": "2-3 zinnen van trigger tot eindresultaat.",
  "systems": ["HubSpot", "Railway"],
  "trigger_moment": "Wanneer start de automatisering?",
  "end_result": "Wat is het eindresultaat?",
  "data_flow": "Welke data stroomt van HubSpot naar de backend?",
  "generated_at": "2026-04-16T12:00:00Z",
  "matched_with": "AUTO-044"
}
```

`matched_with` is null als er geen GitLab-koppeling is. `ai_enrichment` blijft null zolang Gemini nog niet gedraaid heeft.

---

### 2. Edge function: `enrich-automation`

**Input:** `POST { automation_id: string }`

**Logica:**

1. Haal de automation op uit `automatiseringen` (inclusief `raw_payload`, `endpoints`, `webhook_paths`, `source`)
2. Zoek in `automation_links` of er een link bestaat met deze automation als `source_id`
3. Als ja: haal de gekoppelde GitLab-automation op (`target_id`), inclusief `gitlab_file_path`
4. Fetch productie-code via GitLab API: `GET /api/v4/projects/:id/repository/files/:path/raw`
5. Probeer testbestand te fetchen: zelfde bestandsnaam in `gitlabtest/` map
6. Vul het prompt-template in met alle beschikbare data (zie prompt hieronder)
7. Stuur naar Gemini 2.5 Flash (zelfde API-setup als gitlab-sync)
8. Parse de JSON-response
9. Sla op in `ai_enrichment` op de automation

**Fallback:** als GitLab-fetch of Gemini mislukt → `ai_enrichment` blijft null, geen crash. De reviewer kan dan handmatig invullen.

**Prompt template:**

```
Je krijgt twee databronnen van één automatisering:
1. De trigger-configuratie vanuit HubSpot
2. De bijbehorende backend-code vanuit GitLab

Jouw taak: schrijf een samengestelde beschrijving van deze automatisering
als één geheel — van trigger tot eindresultaat.

## Context over de backend-architectuur
De backend is een interne Python API (FastAPI) die draait op Railway.
HubSpot workflows sturen via webhooks data naar de API. De API verwerkt
de logica en koppelt terug naar HubSpot, Clockify, WeFact, SharePoint
of andere systemen. Zapier wordt gebruikt als relay voor eenvoudigere flows.

## HubSpot Workflow
Naam: {workflow_name}
Status: {workflow_status}
Trigger type: {trigger_type}
Trigger condities: {trigger_conditions}
Acties in de workflow: {workflow_actions}

## GitLab Backend

### Productie-code
Endpoint: {method} {endpoint_path}
Bestand: {gitlab_file}
{gitlab_code}

### Testcode (gitlabtest/)
Bestand: {gitlab_test_file}
{gitlab_test_code}

Geef je antwoord in dit JSON-formaat:
{
  "summary": "Één zin die de kern van de automatisering beschrijft.",
  "description": "2-3 zinnen die uitleggen wat er stap voor stap gebeurt.",
  "systems": ["lijst", "van", "betrokken", "systemen"],
  "trigger_moment": "Wanneer start deze automatisering?",
  "end_result": "Wat is het eindresultaat?",
  "data_flow": "Welke data wordt doorgegeven van HubSpot naar de backend?"
}

Schrijf alsof je uitlegt aan een niet-technische collega.
Gebruik geen jargon. Wees concreet en kort.
Als de testcode extra inzicht geeft, verwerk dat dan in de beschrijving.
```

Als er geen GitLab-match is, worden de GitLab-secties weggelaten en vraagt het prompt om een beschrijving op basis van de beschikbare bron alleen.

---

### 3. Trigger-logica

**Trigger 1 — Na hubspot-sync matching pass:**
Voor elke nieuw aangemaakte `automation_links` rij: roep `enrich-automation` aan met het HubSpot-automation ID. Automations met bestaand `ai_enrichment` worden overgeslagen tenzij de GitLab-code gewijzigd is.

**Trigger 2 — Na gitlab-sync:**
Voor elke GitLab-automation met endpoints én een bestaande `automation_links` rij: roep `enrich-automation` aan (GitLab-code kan veranderd zijn).

**Trigger 3 — Na nieuwe automation insert (alle bronnen):**
Elke nieuw gesyncde automation krijgt een `enrich-automation` aanroep zodat ook niet-gematchte automations een AI-beschrijving krijgen voor het Review dashboard.

**Uitvoering:** fire-and-forget — de sync wacht niet op enrichment. Enrichment-fouten blokkeren de sync niet.

---

### 4. Review dashboard

Vervangt de huidige Imports-pagina op `/imports`.

**Overzichtslijst:**
- Toont alle automations met `import_status = 'pending_approval'`
- Per rij: source-badge (HubSpot / GitLab / Zapier), naam, binnenkomstdatum
- Indicator: AI-beschrijving beschikbaar (groen) of nog niet gegenereerd (grijs)
- Als er een matched partner is: klein badge met partner-ID
- Filter op bron

**Review-kaart (uitgeklapt):**

Bewerkbare velden met AI-suggesties als vooringevulde waarden:

| Veld | Bewerkbaar | Bron |
|---|---|---|
| Naam | ja | sync-data / AI |
| Doel | ja | `ai_enrichment.summary` |
| Beschrijving | ja | `ai_enrichment.description` |
| Systemen | ja (checkboxes) | `ai_enrichment.systems` |
| Fasen | ja (checkboxes) | AI-suggestie |
| Trigger | readonly | HubSpot/sync data |
| Data flow | readonly | `ai_enrichment.data_flow` |
| Eindresultaat | readonly | `ai_enrichment.end_result` |

**Acties:**
- **Goedkeuren** → bevestigde veldwaarden worden opgeslagen op de automation, `import_status = 'approved'`, automation verschijnt in Alle Automatiseringen
- **Afwijzen** → automation wordt verwijderd inclusief bijbehorende `automation_links`

---

## Gedrag

| Situatie | Resultaat |
|---|---|
| Nieuwe HubSpot-sync met match | `enrich-automation` aangeroepen, `ai_enrichment` gevuld |
| Gemini faalt | `ai_enrichment` blijft null, reviewer vult handmatig in |
| Geen GitLab-match | Beschrijving op basis van HubSpot-data alleen |
| GitLab-code gewijzigd | Nieuwe enrichment overschrijft oude `ai_enrichment` |
| Reviewer past veld aan voor goedkeuring | Aangepaste waarde opgeslagen, AI-suggestie genegeerd |
| Afwijzen | Automation + links verwijderd |
| Al goedgekeurd, sync draait opnieuw | `import_status = 'approved'` — niet opnieuw in review |

## Wat er niet verandert

- De `import_proposal` kolom blijft bestaan (wordt nog gebruikt door sync-functies)
- `automation_links` bevestigingsflow blijft intact
- Bestaande goedgekeurde automations worden niet opnieuw in review gezet
