# Flow Suggesties Staging — Design Spec

## Doel

Verander de Suggesties tab zodat gebruikers individuele koppelingen kunnen beoordelen (bevestigen of afwijzen) met de mogelijkheid te herzien, een hele FlowKandidaat in één keer als flow kunnen accepteren, en openstaande en afgewezen suggesties later kunnen inzien op de flow detailpagina.

---

## Database-wijziging

Voeg één kolom toe aan `automatisering_ai_flows`:

```sql
ALTER TABLE automatisering_ai_flows
  ADD COLUMN flow_id text REFERENCES flows(id) ON DELETE SET NULL;
```

Dit maakt het mogelijk om:
- Suggesties tab te filteren: `WHERE flow_id IS NULL`
- Flow detailpagina te filteren: `WHERE flow_id = :id`

---

## Rij-interacties (SuggestieRij)

Elke suggestierij heeft drie zichtbare staten:

| Staat | Weergave | DB-actie bij overgang |
|-------|----------|-----------------------|
| Onbeoordeeld | "Verwerp" + "Bevestig" knoppen | — |
| Bevestigd | Groene cirkel met vinkje + "Ongedaan maken" link | `confirmed=true` in `automatisering_ai_flows` + upsert naar `automation_links` |
| Afgewezen | Rode cirkel met kruis + "Ongedaan maken" link | `rejected=true` in `automatisering_ai_flows` |

**Undo bevestigd:** zet `confirmed=false` in `automatisering_ai_flows`, verwijder record uit `automation_links`. Rij terug naar onbeoordeeld.

**Undo afgewezen:** zet `rejected=false` in `automatisering_ai_flows`. Rij terug naar onbeoordeeld.

`bevestigFlowSuggestie` stelt voortaan `confirmed=true` in `automatisering_ai_flows` in plaats van het record te verwijderen. Zo blijft de bevestigde staat zichtbaar na een data-refresh.

`fetchFlowSuggesties` haalt alle records op waar `flow_id IS NULL` — inclusief bevestigde, afgewezen en onbeoordeelde — zodat de UI alle drie staten kan tonen.

---

## FlowKandidaat card (FlowKandidaatCard)

### Header (altijd zichtbaar, ook ingeklapt)

Bestaande inhoud behouden. Nieuw: teller `X van Y bevestigd` rechts in de header naast de Details-knop. `confirmedCount` en `totalCount` worden berekend in `groupFlowSuggesties`.

### Footer (alleen zichtbaar als card open is)

Één knop: **"Accepteer als Flow"**

- Disabled + tooltip `"Bevestig eerst minimaal één koppeling"` als `confirmedCount === 0`
- Actief zodra ≥ 1 koppeling bevestigd is

### Stroom bij klikken "Accepteer als Flow"

1. Verzamel de automations van alle bevestigde koppelingen in de groep
2. Roep `nameFlow(autos)` aan — AI genereert naam + beschrijving
3. Toon `FlowConfirmDialog` zodat de gebruiker naam/beschrijving kan aanpassen
4. Na bevestiging: sla de flow op via `createFlow.mutateAsync(...)`
5. Stel `flow_id = newFlowId` in op **alle** records van de groep in `automatisering_ai_flows` (bevestigd, onbeoordeeld en afgewezen)
6. Card verdwijnt van de Suggesties tab (query filtert op `flow_id IS NULL`)

---

## FlowDetail pagina — Openstaande suggesties

Nieuwe card in de rechter sidebar van `FlowDetail.tsx`, onder "Alle automations in deze flow", boven "Flow verwijderen".

Zichtbaar alleen als er ≥ 1 openstaande of afgewezen suggestie is.

### Query

```
SELECT * FROM automatisering_ai_flows
WHERE flow_id = :flowId
  AND confirmed = false
```

Rijen met `rejected = false` → sectie **"Nog te beoordelen"**
Rijen met `rejected = true` → sectie **"Afgewezen"**

### Lay-out

```
OPENSTAANDE SUGGESTIES

Nog te beoordelen (N)
└ [AutoNaam] → [AutoNaam]  [zekerheid-badge]  [Verwerp] [Bevestig]

Afgewezen (N)
└ [AutoNaam] → [AutoNaam]  [zekerheid-badge]  [Ongedaan maken]
```

### Acties vanuit dit blok

**Bevestigen:**
1. Upsert naar `automation_links` (`match_type: "manual"`, `confirmed: true`)
2. Voeg de automation toe aan `flow.automationIds` als die er nog niet in zit
3. Update `flow.systemen` op basis van de nieuwe automations
4. Zet `confirmed=true` in `automatisering_ai_flows` (rij verdwijnt uit "Nog te beoordelen")

**Verwerpen:** zet `rejected=true` — rij verschuift naar "Afgewezen"

**Ongedaan maken (afgewezen):** zet `rejected=false` — rij verschuift naar "Nog te beoordelen"

---

## Gewijzigde bestanden

| Bestand | Wijziging |
|---------|-----------|
| `supabase/migrations/20260504100000_ai_flows_flow_id.sql` | Voeg `flow_id` kolom toe aan `automatisering_ai_flows` |
| `src/integrations/supabase/types.ts` | `flow_id` kolom toevoegen aan type definitie |
| `src/lib/storage/automationLinks.ts` | `bevestigFlowSuggestie`: set `confirmed=true` i.p.v. delete; `verwerpFlowSuggestie`: set `rejected=true` i.p.v. delete (al deels gedaan); nieuw: `ongedaanVerwerpFlowSuggestie`; nieuw: `accepteerFlowKandidaat(groupFromIds, groupToIds, flowId)`; nieuw: `fetchOpenSuggestiesVoorFlow(flowId)` |
| `src/lib/queryHooks/automationLinks.ts` | Nieuw: `useOngedaanVerwerpFlowSuggestie`, `useOpenSuggestiesVoorFlow`, `useBevestigSuggestieInFlow`, `useAccepteerFlowKandidaat` |
| `src/lib/flowSuggestionGroups.ts` | `FlowSuggestionGroup` uitgebreid met `confirmedCount: number` en `totalCount: number` |
| `src/components/FlowSuggestiesTab.tsx` | `SuggestieRij`: drie staten; `FlowKandidaatCard`: teller + footer "Accepteer als Flow" + AI naming flow; `fetchFlowSuggesties` haalt alle records op waar `flow_id IS NULL` |
| `src/pages/FlowDetail.tsx` | Nieuwe `OpenSuggestiesCard` component in rechter sidebar |

---

## Niet in scope

- Zapier/GitLab-specifieke behandeling van suggesties
- Bulk-verwerpen van alle onbeoordeelde koppelingen
- Notificaties of badges op de FlowCard in het overzicht
