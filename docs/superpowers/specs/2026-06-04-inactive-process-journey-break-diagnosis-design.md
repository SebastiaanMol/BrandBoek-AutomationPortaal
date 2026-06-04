# Uitgeschakelde Procesreizen: Breukdiagnose

## Doel

De tab `Uitgeschakelde automations` op de procesreis-overzichtspagina moet niet alleen tonen dat een procesreis een uitgeschakelde automation bevat. De pagina moet direct uitleggen waar de procesreis breekt, welke individuele automation de breuk veroorzaakt, en wat de impact is op de rest van de procesreis.

## Scope

In scope:

- De bestaande tab `Uitgeschakelde automations` op `src/pages/Flows.tsx`.
- Zowel opgeslagen procesreizen als conceptprocesreizen die door uitgeschakelde automations apart gezet worden.
- Een breukdiagnose per procesreis, gebaseerd op de volgorde van automations die al voor de procesreis wordt berekend.
- Een compacte mini-keten waarin de eerste kapotte automation zichtbaar gemarkeerd is.
- Een begrijpelijke, niet-technische impactzin.
- Acties om de procesreis en de kapotte automation te openen.

Out of scope:

- Automations automatisch opnieuw inschakelen.
- Brondata of statuswaarden wijzigen.
- Nieuwe databasevelden.
- Wijzigingen in `gitlabtest`.

## Gebruikerservaring

Elke kaart in de tab toont:

- Type: `Procesreis` of `Conceptprocesreis`.
- Titel en bestaande beschrijving.
- Badge `Breukdiagnose`.
- `Breekt bij`: de eerste uitgeschakelde automation in de procesreis, inclusief stapnummer.
- `Waarom is de procesreis uitgeschakeld?`: een korte impactzin in zakelijke taal.
- Mini-keten:
  - stappen voor de breuk: actief/goed;
  - kapotte stap: rood of amber;
  - stappen na de breuk: gedimd, omdat ze geraakt worden.
- Acties:
  - `Open procesreis` of `Open concept`;
  - `Open automation` voor de eerste kapotte automation.

## Diagnose-regels

De diagnose gebruikt de eerste uitgeschakelde automation in de geordende procesreis als primaire breuk.

Severity:

- `breekt-start`: de eerste automation is uitgeschakeld. De procesreis komt niet op gang.
- `breekt-midden`: een tussenstap is uitgeschakeld. Vervolgstappen kunnen ontbreken of onbetrouwbare data gebruiken.
- `breekt-eind`: de laatste automation is uitgeschakeld. Het eindresultaat ontbreekt, maar eerdere stappen zijn nog betrouwbaar.

Impacttekst:

- Start: "De procesreis komt niet betrouwbaar op gang, omdat het startsignaal of de eerste verwerking uit staat."
- Midden: "De procesreis stopt bij deze stap. Vervolgstappen kunnen ontbreken of met onbetrouwbare data werken."
- Eind: "De eerdere stappen lopen nog, maar het eindresultaat van deze procesreis wordt niet betrouwbaar afgerond."

Als meerdere automations uitgeschakeld zijn, blijft de eerste kapotte automation de primaire diagnose. De overige uitgeschakelde automations worden onder `Ook uitgeschakeld` getoond.

## Architectuur

Voeg een kleine presentation helper toe, bijvoorbeeld:

`src/lib/inactiveJourneyDiagnosis.ts`

Deze helper krijgt:

- titel;
- type;
- beschrijving;
- geordende automations;
- open callbacks worden niet in de helper verwerkt.

Deze helper retourneert:

- `primaryBrokenAutomation`;
- `brokenStepIndex`;
- `severity`;
- `impactText`;
- `steps` met status `before-break`, `broken`, of `after-break`;
- `otherInactiveAutomations`.

`src/pages/Flows.tsx` blijft verantwoordelijk voor rendering en navigatie.

## Componenten

De bestaande `InactiveAutomationJourneyCard` wordt vervangen of uitgebreid met:

- `BreakDiagnosisCard`;
- `BreakDiagnosisChain`;
- `BreakDiagnosisNode`;

De componenten blijven lokaal in `Flows.tsx` tenzij de file te groot/onoverzichtelijk wordt. Als de JSX duidelijk groeit, verhuizen de diagnosekaart-componenten naar `src/components/flows/InactiveJourneyBreakDiagnosis.tsx`.

## Testplan

Unit tests:

- Helper markeert eerste uitgeschakelde automation als primaire breuk.
- Helper classificeert start/midden/eind correct.
- Helper dimt alle stappen na de breuk.
- Helper behoudt overige uitgeschakelde automations als secundaire meldingen.

UI tests:

- Tab `Uitgeschakelde automations` toont `Breekt bij`.
- Kaart toont de naam van de kapotte automation.
- Kaart toont een niet-technische impactzin.
- Mini-keten toont stappen na de breuk als geraakt.
- Actie `Open automation` verwijst naar de juiste automation.

## Acceptatiecriteria

- Een gebruiker kan per uitgeschakelde procesreis binnen enkele seconden zien welke individuele automation kapot is.
- De pagina maakt duidelijk of de breuk bij start, midden of eind zit.
- De impacttekst is begrijpelijk zonder technische kennis van webhooks, endpoints of API-routes.
- Bestaande actieve procesreis- en concepttabs blijven functioneel gelijk.
- Er worden geen wijzigingen gemaakt in `gitlabtest`.
