# Brandy Diagnose-Assistent — Design Spec
*2026-04-14*

## Overzicht

Brandy krijgt altijd-aan diagnose-gedrag: ze stelt altijd één gerichte vervolgvraag als ze meer context nodig heeft, en redeneert stap-voor-stap naar een oorzaak en oplossing. Dit is geen aparte modus die de gebruiker activeert — het is gewoon hoe Brandy werkt.

Visueel wordt dit zichtbaar via een diagnose-banner boven Brandy's bericht in de chat.

---

## 1. Gedrag

- Brandy stelt altijd **precies één gerichte vervolgvraag** als de situatie onduidelijk is
- Ze redeneert stap-voor-stap: eerst de situatie begrijpen, dan de oorzaak, dan de oplossing
- Bij eenvoudige informatievragen (geen probleem, geen fout) stelt ze geen vervolgvraag
- Zodra ze een duidelijke conclusie kan geven (oorzaak + oplossing), stopt ze met doorvragen

---

## 2. Response schema — nieuwe velden

Het bestaande `brandy_antwoord` tool schema krijgt twee nieuwe velden:

```json
"diagnose_modus": {
  "type": "boolean",
  "description": "true zolang Brandy nog doorvraagt of redeneert naar een oorzaak. false zodra er een conclusie is of bij een eenvoudige informatievraag."
},
"stap_nummer": {
  "type": "integer",
  "minimum": 1,
  "description": "Huidige stapnummer in de diagnose. Begint bij 1, loopt op per vervolgvraag. Irrelevant als diagnose_modus = false."
}
```

Beide velden zijn verplicht in elke response.

---

## 3. System prompt toevoeging (sectie 19)

De volgende sectie wordt toegevoegd aan `BRANDY_SYSTEM_PROMPT` in `brandy-ask/index.ts`:

```
## 19. DIAGNOSE-GEDRAG

Als je meer context nodig hebt om een goede diagnose te stellen: stel precies één gerichte vervolgvraag. Niet meerdere tegelijk. Wacht op het antwoord voordat je verdere conclusies trekt.

Zet diagnose_modus = true zolang je nog doorvraagt of redeneert naar een oorzaak. Zet stap_nummer op het huidige stapnummer (begin bij 1). Zodra je een duidelijke conclusie kunt geven — oorzaak + oplossing — zet je diagnose_modus = false.

Bij eenvoudige informatievragen (geen probleem, geen fout) stel je geen vervolgvraag en zet je diagnose_modus = false direct.
```

---

## 4. Frontend — diagnose-banner

In `src/pages/Brandy.tsx`, in de berichtenweergave per Brandy-bericht:

- Als `diagnose_modus === true`: toon een gekleurde banner **boven** het berichttekst met tekst `"Brandy diagnosticeert — stap {stap_nummer}"`
- Als het vorige Brandy-bericht `diagnose_modus === true` had maar het huidige `diagnose_modus === false`: toon een groene **"Conclusie"** badge naast de berichtheader
- Kleur banner: amber/oranje (past bij "bezig", niet bij "fout")
- Kleur conclusie-badge: groen

De banner is onderdeel van de bestaande chatbericht-component — geen apart paneel of popup.

---

## 5. Type-definitie update

`BrandyResponse` in `src/lib/brandy.ts` krijgt:

```typescript
diagnose_modus?: boolean;
stap_nummer?: number;
```

Optioneel zodat bestaande responses zonder deze velden niet breken.

---

## 6. Wat niet verandert

- Geen nieuwe edge functions
- Geen database-wijzigingen
- Feedback-knoppen (correct/incorrect/onvolledig) blijven ongewijzigd
- Bronnen en entiteiten blijven ongewijzigd
- De bestaande chatflow en mind-panel blijven ongewijzigd

---

## 7. Randgevallen

- Als `diagnose_modus` ontbreekt in de response (backward compat): geen banner tonen
- Als `stap_nummer` ontbreekt maar `diagnose_modus = true`: toon banner zonder stapnummer ("Brandy diagnosticeert")
- Gebruiker kan gewoon doortypen tijdens een diagnose — er is geen geblokkeerde staat
