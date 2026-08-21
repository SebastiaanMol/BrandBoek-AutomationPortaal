# Brandy HubSpot Diagnose Design

## Goal

Let Brandy investigate HubSpot owner-related automation failures from natural language.

The user should be able to paste a diagnostic prompt such as:

```text
Check IB deal 61165856536, Jaarrekening deal 61186289939,
property jaarrekeningen_klaar_om_ib_te_maken, and owner 223935335.
```

Brandy should extract the relevant HubSpot identifiers, run a bounded read-only diagnosis, and explain where an old or archived owner is most likely still attached.

This extends the existing Brandy owner lookup. It does not replace the normal Brandy AI answer flow.

## Non-Goals

Brandy must not:

- update HubSpot records;
- write properties;
- change deal stages;
- create notes, tasks, owners, associations, or tickets;
- execute arbitrary HubSpot URLs from user text;
- expose the HubSpot access token to browser code;
- crawl the whole HubSpot portal;
- infer facts that the HubSpot API did not return.

## User Behavior

The user writes a free-text diagnostic question in Brandy. Brandy recognizes a HubSpot diagnosis when the text contains a combination of:

- HubSpot-related wording;
- one or more deal IDs;
- one or more owner IDs;
- optional property names;
- terms such as `IB deal`, `Jaarrekening deal`, `property history`, `owner`, `eigenaar`, `archived`, or `gearchiveerd`.

Brandy then returns a structured diagnosis:

- **Samenvatting**: what was checked and what the likely cause is.
- **Deal checks**: whether each deal exists, current stage, selected properties, and owner fields.
- **Property history**: the relevant property value and change history if HubSpot returns it.
- **Associations**: linked contacts, companies, and deals, limited to one association layer.
- **Owner checks**: active owner lookup first, archived owner lookup second.
- **Verdachte plekken**: records where the target owner ID still appears.
- **Handmatige check**: anything the API could not verify but the user should inspect in HubSpot UI.

## Parsing Rules

The parser should be deterministic and conservative.

It should extract:

- numeric deal IDs from phrases such as `IB deal 61165856536`, `Jaarrekening deal ID 61186289939`, and `deal 61186289939`;
- numeric owner IDs from phrases such as `owner ID 223935335`, `eigenaar 223935335`, and `kapotte owner 223935335`;
- property names from snake_case tokens near words such as `property`, `eigenschap`, or `properties`;
- role hints, for example `IB deal` and `Jaarrekening deal`, when present.

The parser should reject or ignore:

- texts with no clear HubSpot context;
- IDs embedded in URLs or text that are not tied to deals or owners;
- non-numeric IDs for this V1;
- more than the configured limits.

V1 limits:

- max 2 primary deal IDs;
- max 3 owner IDs;
- max 5 property names;
- max 1 association layer from each primary deal.

## Architecture

The flow stays read-only:

```text
Brandy UI -> frontend parser -> Supabase Edge Function -> HubSpot REST API -> Brandy response
```

### Frontend

Add a Brandy HubSpot diagnosis parser and response builder in the frontend lib layer.

The parser runs before the normal `brandy-ask` AI function. If a HubSpot diagnosis is detected, the frontend calls a dedicated Edge Function instead of `brandy-ask`.

The existing Brandy chat UI can stay unchanged for V1 because the answer is still a normal `BrandyResponse`.

### Supabase Edge Function

Create a dedicated function, for example `hubspot-diagnose`.

Responsibilities:

- read the existing HubSpot integration token from the `integrations` table;
- accept only structured IDs and property names from the frontend parser;
- validate all identifiers before making HubSpot requests;
- call only whitelisted read endpoints;
- sanitize all HubSpot responses before returning them;
- return partial results when one record fails but others can still be checked.

The function should use the same token source as the existing HubSpot sync functions: the latest connected `hubspot` integration.

## HubSpot Read Endpoints

The Edge Function may use these read-only API calls:

```text
GET /crm/v3/objects/deals/{dealId}
GET /crm/v3/objects/deals/{dealId}?properties=...&propertiesWithHistory=...
GET /crm/v4/objects/deals/{dealId}/associations/contacts
GET /crm/v4/objects/deals/{dealId}/associations/companies
GET /crm/v4/objects/deals/{dealId}/associations/deals
GET /crm/v3/objects/contacts/{contactId}
GET /crm/v3/objects/companies/{companyId}
GET /crm/v3/owners/{ownerId}?idProperty=id&archived=false
GET /crm/v3/owners/{ownerId}?idProperty=id&archived=true
```

The function must not expose a generic HubSpot proxy.

## Data Returned To Brandy

Suggested public response shape:

```ts
interface HubSpotDiagnosisResult {
  deals: HubSpotDiagnosisDeal[];
  associatedRecords: HubSpotDiagnosisAssociatedRecord[];
  owners: HubSpotDiagnosisOwner[];
  suspectedOwnerReferences: HubSpotOwnerReference[];
  warnings: string[];
  fetchedAt: string;
}
```

Deal summaries should include only operationally useful fields:

- `id`;
- `roleHint`;
- `archived`;
- `dealstage`;
- selected property values;
- selected property history entries;
- owner-like property values;
- association IDs and counts;
- fetch status.

Associated records should include:

- record type: contact, company, or deal;
- id;
- owner-like properties;
- fetch status.

Owner summaries should include:

- id;
- active lookup status;
- archived lookup status;
- name;
- email;
- teams;
- archived flag when available.

## Diagnosis Logic

The response builder should highlight:

- a target owner ID found on a primary deal;
- a target owner ID found on linked contact, company, or associated deal;
- a target owner ID that exists only with `archived=true`;
- missing owner data;
- missing property history;
- deal stage mismatches when the user mentioned an expected stage such as `Gecontroleerd & Gefactureerd`.

The language should distinguish evidence from inference:

- **Gevonden** for exact API matches.
- **Waarschijnlijk** only when the inference follows from a found owner reference and an archived/missing owner.
- **Niet gecontroleerd** when HubSpot API permissions or response shape block the check.

## Error Handling

The diagnosis should degrade gracefully.

Examples:

- If the HubSpot integration token is missing, Brandy says the HubSpot koppeling is not configured.
- If one deal returns 404, Brandy reports that deal as not found and continues with other records.
- If the owner is not found with active or archived lookup, Brandy reports the owner ID as stale or invalid.
- If property history is unavailable, Brandy reports current property value but says history must be checked manually in HubSpot.

No raw HubSpot error bodies should be shown to the user.

## Security And Privacy

The implementation should keep the same security posture as the read-only Sentry work:

- no browser-side HubSpot token;
- no mutation requests;
- no arbitrary endpoints;
- no raw response dumps;
- sensitive metadata and headers excluded from returned data;
- only enough record data to diagnose owner references and property state.

## Testing

Add unit tests for:

- free-text parsing of the example prompt;
- rejecting unrelated text;
- enforcing max deal, owner, and property limits;
- building the correct Edge Function request body;
- formatting a Brandy response with evidence, inference, and manual checks;
- active owner not found but archived owner found;
- owner reference found on contact/company/deal;
- empty and partial API results.

Add Edge Function source/sanitizer tests for:

- POST and OPTIONS only;
- existing HubSpot integration token source;
- allowed read-only endpoints only;
- no POST, PUT, PATCH, or DELETE to HubSpot;
- numeric ID validation;
- property name validation;
- sanitized response shape excludes raw payloads and tokens.

Run at minimum:

```bash
npm test -- src/test/brandyHubspotDiagnosis*.test.ts src/test/hubspotOwnerLookupEdgeSource.test.ts
npm run build
```

## Open Decisions

V1 uses deterministic parsing and a fixed diagnosis checklist. If this becomes too rigid, a later version can add an AI planning step that chooses among the same whitelisted read-only checks, but not arbitrary API execution.
