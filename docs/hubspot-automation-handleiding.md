# HubSpot Automations Handleiding

Deze handleiding legt in simpele taal uit hoe we HubSpot automations herkennen, begrijpen en gebruiken binnen Automation Navigator.

## Wat Is Een HubSpot Automation?

Een HubSpot automation is meestal een HubSpot workflow die automatisch reageert op een wijziging in HubSpot.

In gewone taal:

```text
Er verandert iets in HubSpot
↓
HubSpot workflow wordt gestart
↓
workflow controleert voorwaarden
↓
workflow wijzigt properties, stages of associations
↓
workflow roept eventueel een backend endpoint aan
↓
andere workflows kunnen daarna weer reageren
```

Een HubSpot automation is dus een processtap binnen HubSpot zelf.

## HubSpot Is De Runtime

In jullie systeem is HubSpot niet alleen een database.

HubSpot is de plek waar het bedrijfsproces leeft.

Daarom zien we HubSpot zo:

```text
HubSpot workflows = routers / procesacties
HubSpot properties = signalen
HubSpot deal stages = statussen in een proces
HubSpot associations = relaties tussen dossiers, deals, contacts en companies
```

Dus als een property verandert, is dat vaak niet zomaar data.

Het is vaak een gebeurtenis:

```text
machtiging_actief verandert
↓
IB/JR workflows kunnen starten
```

## Wat Telt Als Eén HubSpot Automation?

Eén HubSpot automation is meestal één HubSpot workflow.

Voorbeeld:

```text
"BTW 2 maanden geboekt instellen"
```

Dat is één HubSpot automation.

Niet de hele BTW-flow.
Niet de hele JR-flow.
Maar één workflow-stap binnen HubSpot.

## Hoe Herkennen We Een HubSpot Automation?

Een HubSpot automation herken je aan:

```text
1. Workflow naam
2. Trigger of enrollment rule
3. Voorwaarden
4. Acties
5. Properties die gelezen worden
6. Properties/stages die geschreven worden
7. Webhooks/endpoints die worden aangeroepen
8. Downstream workflows die hierdoor kunnen starten
```

Voorbeeld:

```text
Workflow:
"BTW 2 maanden geboekt instellen"

Startsignaal:
BTW kwartaal is geboekt

Actie:
Roept backend endpoint aan:
POST /properties/btw/update_next_quarter_prev2m

Effect:
Backend schrijft nieuwe HubSpot-state terug
```

## Minimale Informatie Per HubSpot Automation

Elke HubSpot automation moet minimaal deze informatie hebben:

```text
1. Workflow naam
2. HubSpot workflow ID
3. Trigger/startsignaal
4. Doel
5. Welke HubSpot properties/stages worden gelezen
6. Welke HubSpot properties/stages worden gewijzigd
7. Welke endpoint/webhook wordt aangeroepen
8. Welke systemen of processen worden geraakt
9. Laatste run / gebruiksdata als beschikbaar
10. Simpele uitleg
```

## HubSpot Properties Zijn Signalen

Een property is vaak een runtime-signaal.

Voorbeelden:

```text
machtiging_actief
bankkoppeling_status
jaarrekeningen_klaar_om_ib_te_maken
hs_priority
btw_2_maanden_geboekt
va_ingediend
```

Als zo'n property verandert, kan dat een workflow starten.

Bijvoorbeeld:

```text
btw_2_maanden_geboekt = true
↓
HubSpot ziet wijziging
↓
JR / VPB / VA vervolgflows kunnen starten
```

## Deal Stages Zijn Processtatussen

Deal stages zijn geen gewone labels.

Ze zijn statussen in een proces.

Bijvoorbeeld:

```text
Nieuwe klant
↓
Wachten op machtiging
↓
Klaar voor IB
↓
IB afgerond
```

Als een dealstage verandert, is dat meestal een belangrijke state transition.

Daarom moet een HubSpot workflow die een dealstage wijzigt altijd duidelijk maken:

```text
Van welke status?
Naar welke status?
Waarom?
Welke workflows reageren hierna?
```

## Associations Zijn De Procesrelaties

Associations vertellen hoe objecten met elkaar verbonden zijn.

Voorbeelden:

```text
contact → company
company → deal
IB deal → JR deal
BTW deal → company
```

Veel workflows werken niet op één object, maar volgen relaties.

Bijvoorbeeld:

```text
Contact krijgt machtiging_actief = true
↓
workflow zoekt gekoppelde deals
↓
gekoppelde IB/JR deals worden bijgewerkt
```

Daarom zijn associations belangrijk voor flowbegrip.

## Hoe Ziet Een HubSpot Automation In Een Flow Eruit?

Een HubSpot automation is vaak de stap vóór of na een GitLab/backend automation.

Voorbeeld:

```text
STARTSIGNAL
BTW 2 maanden geboekt

↓
HUBSPOT AUTOMATION
"BTW 2 maanden geboekt instellen"

↓
WEBHOOK / ENDPOINT
POST /properties/btw/update_next_quarter_prev2m

↓
GITLAB BACKEND AUTOMATION
update_next_quarter_prev2m

↓
STATE WRITE
btw_2_maanden_geboekt = true

↓
HUBSPOT AUTOMATION
JR / VPB / VA workflows reageren op nieuwe state
```

De HubSpot automation is dus de router:

```text
als dit gebeurt, stuur het werk daarheen
```

## Verschil Tussen HubSpot En GitLab Automations

HubSpot automation:

```text
Ziet dat er iets verandert in HubSpot
Controleert voorwaarden
Routeert het proces
Roept eventueel backend aan
Wijzigt eventueel HubSpot-state
```

GitLab/backend automation:

```text
Wordt aangeroepen via endpoint
Leest data
Berekent of beslist iets
Schrijft resultaat terug naar HubSpot
```

Simpel gezegd:

```text
HubSpot automation = procesrouter
GitLab automation = backend worker
```

## Checklist Voor Een Correcte HubSpot Automation

Een HubSpot automation is goed beschreven als je dit kunt beantwoorden:

```text
Wat start deze workflow?
```

Bijvoorbeeld:

```text
Property btw_2_maanden_geboekt verandert
```

```text
Wat controleert deze workflow?
```

Bijvoorbeeld:

```text
Of de deal in de juiste pipeline/stage zit
```

```text
Wat doet deze workflow?
```

Bijvoorbeeld:

```text
Roept een backend endpoint aan
```

```text
Welk endpoint wordt aangeroepen?
```

Bijvoorbeeld:

```text
POST /properties/btw/update_next_quarter_prev2m
```

```text
Welke HubSpot-state verandert?
```

Bijvoorbeeld:

```text
btw_2_maanden_geboekt = true
```

```text
Wat kan daarna gebeuren?
```

Bijvoorbeeld:

```text
JR / VPB / VA workflows kunnen starten
```

## Belangrijke HubSpot Signalen

Deze signalen lijken belangrijk in jullie runtime:

```text
dealstage
pipeline
machtiging_actief
bankkoppeling_status
jaarrekeningen_klaar_om_ib_te_maken
hs_priority
btw_2_maanden_geboekt
va_ingediend
owner/controller assignment velden
jaar/kwartaal velden
```

Deze properties verdienen extra aandacht, omdat ze vaak andere workflows starten.

## Belangrijke Workflowdomeinen

Veel HubSpot automations lijken te vallen in deze procesdomeinen:

```text
Sales
BTW
JR
IB
VPB
VA
Debtor/payment
Bank connection
Assignment propagation
```

Een goede flowkaart moet dus niet alleen tonen welke workflow draait, maar ook welk domein geraakt wordt.

## Wat Moet De Portal Tonen?

Voor HubSpot automations moet de portal vooral dit tonen:

```text
1. Startsignaal
2. Workflow naam
3. Wat controleert de workflow?
4. Wat doet de workflow?
5. Roept hij een backend endpoint aan?
6. Welke HubSpot-state verandert?
7. Welke vervolgflows kunnen starten?
8. Welke processen worden geraakt?
```

Technische details mogen zichtbaar zijn, maar niet centraal.

Centraal moet staan:

```text
Wat betekent deze workflow in het bedrijfsproces?
```

## Wat Een HubSpot Automation Niet Is

Een HubSpot automation is niet alleen:

```text
een naam in een lijst
```

En ook niet alleen:

```text
een losse webhook-call
```

Het is een processtap die runtime-state leest, verandert of doorstuurt.

## Simpele Samenvatting

Een HubSpot automation is:

```text
een workflow die reageert op HubSpot-state
en het werk naar de volgende stap stuurt
```

Een GitLab automation is:

```text
een backend worker die door zo'n workflow wordt aangeroepen
en daarna iets leest, berekent en terugschrijft
```

In een procesreis hoort het startsignaal bij de HubSpot-stap:

```text
HubSpot ziet signaal
↓
HubSpot workflow start
↓
HubSpot roept het GitLab backendblok aan
```

Het GitLab backendblok mag meerdere GitLab automations bevatten, maar blijft één backendstuk binnen de procesreis totdat er weer nieuwe HubSpot-state ontstaat.

Een flow is:

```text
HubSpot signaal
↓
HubSpot automation
↓
GitLab/backend automation
↓
HubSpot state update
↓
volgende HubSpot automation of ander systeem
```
