# AI Enrichment & Review Dashboard — Design Spec

## Doel

Gesyncde automations doorlopen een review-fase voor ze zichtbaar worden in Alle Automatiseringen. Per automation genereert Gemini een samengestelde beschrijving op basis van de HubSpot workflow-data én de bijbehorende GitLab backend-code. De reviewer ziet de AI-suggesties per veld, past aan waar nodig, en keurt goed of af.

## Scope

**Inbegrepen:**
- Nieuwe `enrich-automation` Supabase edge function
- `ai_enrichment` en `reviewer_overrides` JSONB kolommen op `automatiseringen`
- Automatische aanroep na hubspot-sync, gitlab-sync en bij nieuwe inserts
- Vervangen van de huidige Imports-pagina door een nieuw Review dashboard
- Per-veld bewerkbare AI-suggesties (naam, doel, beschrijving, systemen, fasen)
- Goedkeuren / Afwijzen flow (soft delete)

**Niet inbegrepen:**
- Handmatig herstarten van enrichment via de UI (toekomstig)
- Batch goedkeuren (toekomstig — prioriteit verhogen als instroom groot blijkt)
- Enrichment voor Zapier-automations met Zapier API-data (alleen naam/beschrijving via workflow-data)

---

## Architectuur

### 1. Database

Nieuwe kolommen op `automatiseringen`:

```sql
ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS ai_enrichment      JSONB,
  ADD COLUMN IF NOT EXISTS reviewer_overrides JSONB,
  ADD COLUMN IF NOT EXISTS rejected_at        TIMESTAMPTZ;
```

Nieuwe kolom op `automation_links`:

```sql
ALTER TABLE automation_links
  ADD COLUMN IF NOT EXISTS sync_run_id TEXT;
```

`sync_run_id` wordt gevuld door de sync-functie met een unieke run-ID (bijv. `crypto.randomUUID()`) en gebruikt om nieuw aangemaakte links te identificeren in Trigger 1.

**`ai_enrichment`** — gevuld door de `enrich-automation` edge function:

```json
{
  "summary": "Één zin die de kern beschrijft.",
  "description": "2-3 zinnen van trigger tot eindresultaat.",
  "systems": ["HubSpot", "Railway"],
  "trigger_moment": "Wanneer start de automatisering?",
  "end_result": "Wat is het eindresultaat?",
  "data_flow": "Welke data stroomt van HubSpot naar de backend?",
  "phases": ["Onboarding", "Sales"],
  "generated_at": "2026-04-16T12:00:00Z"
}
```

`ai_enrichment` blijft null zolang Gemini nog niet gedraaid heeft. Wordt overschreven bij nieuwe enrichment-runs (bijv. als GitLab-code wijzigt).

**`reviewer_overrides`** — gevuld door de reviewer in het dashboard, nooit overschreven door enrichment:

```json
{
  "summary": "Handmatig aangepaste versie",
  "systems": ["HubSpot", "WeFact"]
}
```

Bij weergave en bij goedkeuren geldt altijd: `reviewer_overrides` wint van `ai_enrichment`. Velden die niet in `reviewer_overrides` staan vallen terug op `ai_enrichment`.

**Soft delete bij afwijzen:**
`import_status = 'rejected'` in plaats van verwijderen. Een achtergrondtaak (of handmatige SQL) ruimt `rejected` automations op na 30 dagen. Dit voorkomt dataverlies bij een misklun.

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
9. Sla op in `ai_enrichment` op de automation — `reviewer_overrides` wordt nooit aangeraakt

**Fallback:** als GitLab-fetch of Gemini mislukt → `ai_enrichment` blijft null, geen crash. De reviewer kan dan handmatig invullen.

**Rate limiting:** aanroepen worden sequentieel gedaan vanuit de sync-functies (niet parallel) om Gemini-limieten te respecteren. Een korte pauze van 500ms tussen aanroepen voorkomt 429-errors bij grote syncs.

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
  "data_flow": "Welke data wordt doorgegeven van HubSpot naar de backend?",
  "phases": ["lijst", "van", "klantfasen"]
}

Schrijf alsof je uitlegt aan een niet-technische collega.
Gebruik geen jargon. Wees concreet en kort.
Als de testcode extra inzicht geeft, verwerk dat dan in de beschrijving.
Geldige waarden voor phases: Onboarding, Marketing, Sales, Boekhouding, Offboarding.
```

Als er geen GitLab-match is, worden de GitLab-secties weggelaten en vraagt het prompt om een beschrijving op basis van de beschikbare bron alleen.

---

### 3. Trigger-logica

**Trigger 1 — Na hubspot-sync matching pass:**
Bij aanvang van de matching-pass genereert de sync-functie een `sync_run_id` (UUID). Alle nieuwe `automation_links` rijen krijgen dit ID meegeschreven. Na de pass: roep `enrich-automation` aan voor elke link met `sync_run_id = current_run_id`. Exact, zonder tijdsgevoeligheid.

**Trigger 2 — Na gitlab-sync:**
Voor elke GitLab-automation met endpoints én een bestaande `automation_links` rij: roep `enrich-automation` aan op de HubSpot-kant (GitLab-code kan veranderd zijn).

**Trigger 3 — Na nieuwe automation insert (alle bronnen):**
Elke nieuw gesyncde automation krijgt een `enrich-automation` aanroep zodat ook niet-gematchte automations een AI-beschrijving krijgen voor het Review dashboard.

**Uitvoering:** sequentieel, fire-and-forget — de sync wacht niet op enrichment. Enrichment-fouten blokkeren de sync niet.

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

Bewerkbare velden tonen de effectieve waarde: `reviewer_overrides[veld] ?? ai_enrichment[veld]`. Aanpassingen worden direct in `reviewer_overrides` opgeslagen.

| Veld | Bewerkbaar | Doelkolom bij goedkeuren |
|---|---|---|
| Naam | ja | `naam` |
| Doel | ja | `doel` |
| Beschrijving | ja | `beschrijving_in_simpele_taal[0]` |
| Systemen | ja (checkboxes) | `systemen` |
| Fasen | ja (checkboxes) | `fasen` |
| Trigger | readonly | — |
| Data flow | ja | `afhankelijkheden` |
| Eindresultaat | ja | — (blijft alleen in `ai_enrichment`, niet weggeschreven tot eigen kolom bestaat) |

**Goedkeuren — schrijflogica:**
Bij goedkeuren worden de effectieve waarden (`reviewer_overrides[veld] ?? ai_enrichment[veld]`) weggeschreven naar de bestaande kolommen van `automatiseringen`. De rest van de app (Alle Automatiseringen, detailpaneel) leest gewoon de bestaande kolommen — geen merge-logica nodig buiten het review-dashboard.

**Acties:**
- **Goedkeuren** → effectieve waarden weggeschreven naar bestaande kolommen (zie tabel), `import_status = 'approved'`, automation verschijnt in Alle Automatiseringen
- **Afwijzen** → `import_status = 'rejected'`, `rejected_at = now()`, automation verdwijnt uit de reviewlijst maar blijft in de database. Wordt na 30 dagen opgeruimd via een Supabase cron job die dagelijks draait en rijen verwijdert waar `import_status = 'rejected' AND rejected_at < now() - interval '30 days'`.

---

## Gedrag

| Situatie | Resultaat |
|---|---|
| Nieuwe HubSpot-sync met match | `enrich-automation` aangeroepen, `ai_enrichment` gevuld |
| Gemini faalt | `ai_enrichment` blijft null, reviewer vult handmatig in |
| Geen GitLab-match | Beschrijving op basis van HubSpot-data alleen |
| GitLab-code gewijzigd | `ai_enrichment` overschreven, `reviewer_overrides` onaangetast |
| Reviewer past veld aan | Opgeslagen in `reviewer_overrides`, wint altijd van AI |
| Afwijzen | `import_status = 'rejected'`, soft delete |
| Al goedgekeurd, sync draait opnieuw | `import_status = 'approved'` — niet opnieuw in review |
| Per ongeluk afgewezen | Automation terug te vinden via SQL, nog niet hard-deleted |

## Wat er niet verandert

- De `import_proposal` kolom blijft bestaan (wordt nog gebruikt door sync-functies)
- `automation_links` bevestigingsflow blijft intact
- Bestaande goedgekeurde automations worden niet opnieuw in review gezet
