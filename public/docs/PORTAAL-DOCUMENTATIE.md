# Brand Boekhouders – Automatisering Portaal

> Laatst bijgewerkt: 17 maart 2026

---

## 1. Wat is dit portaal?

Een intern portaal voor Brand Boekhouders om alle procesautomatiseringen (HubSpot, Zapier, backend scripts) te documenteren, visualiseren en beheren. Doelgroep: het IT-team en medewerkers die automatiseringen bouwen en onderhouden.

---

## 2. Fundament & Architectuur

### Technologie
| Laag | Technologie |
|---|---|
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Backend | Lovable Cloud (Supabase) |
| Authenticatie | E-mail/wachtwoord via Lovable Cloud |
| Diagrammen | Mermaid.js |
| Grafieken | Recharts |
| Mindmap | React Flow |

### Database Tabellen

**`automatiseringen`** – Kern van het portaal. Elke automatisering heeft:
- `id` – Uniek ID in formaat `AUTO-001`, `AUTO-002`, etc. (auto-gegenereerd)
- `naam` – Naam van de automatisering
- `categorie` – Type: HubSpot Workflow, Zapier Zap, Backend Script, HubSpot + Zapier, Anders
- `doel` – Wat de automatisering doet
- `trigger_beschrijving` – Wat de automatisering start
- `systemen` – Betrokken systemen (HubSpot, Zapier, Typeform, SharePoint, WeFact, Docufy, Backend, E-mail, API, Anders)
- `stappen` – Array van processtappen
- `afhankelijkheden` – Tekst met afhankelijkheden/knelpunten
- `owner` – Verantwoordelijke persoon
- `status` – Actief / Verouderd / In review / Uitgeschakeld
- `verbeterideeen` – Vrij tekstveld
- `mermaid_diagram` – Mermaid flowchart code
- `fasen` – Klantproces fasen: Marketing, Sales, Onboarding, Boekhouding, Offboarding
- `created_at` – Aanmaakdatum
- `created_by` – User ID (optioneel)

**`koppelingen`** – Verbindingen tussen automatiseringen:
- `bron_id` – De automatisering die de output levert
- `doel_id` – De automatisering die getriggerd wordt
- `label` – Beschrijving van de koppeling

### Belangrijke Bedrijfsregel: Driehoekstructuur
Elke HubSpot deal moet gekoppeld zijn aan zowel een Contact als een Company. Deze driehoek (Contact–Company–Deal) is een kritieke afhankelijkheid. Als de driehoek onvolledig is, falen downstream automatiseringen.

### Systeemkleuren
| Systeem | Kleur |
|---|---|
| HubSpot | `#ff7a59` |
| Zapier | `#ff4a00` |
| Typeform | `#262627` |
| SharePoint | `#038387` |
| WeFact | `#f5a623` |
| Docufy | `#6c3fc5` |
| Backend/API | `#0066cc` |

---

## 3. Pagina's & Functionaliteiten

### 3.1 Dashboard (`/`)
Overzichtspagina met snelle statistieken en navigatie naar alle onderdelen.

### 3.2 Nieuwe Automatisering (`/nieuw`)
Formulier om een nieuwe automatisering toe te voegen met alle velden:
- Naam, categorie, doel, trigger
- Systemen (multi-select)
- Stappen (dynamisch toevoegen/verwijderen)
- Afhankelijkheden, owner, status
- Klantproces fasen (multi-select): Marketing, Sales, Onboarding, Boekhouding, Offboarding
- Verbeterideeën
- Mermaid diagram (automatisch gegenereerd of handmatig)
- Koppelingen naar andere automatiseringen

### 3.3 AI Upload (`/ai-upload`)
Upload JSON-bestanden (bijv. Zapier exports) en laat AI automatisch de automatisering extraheren en invullen.

### 3.4 Alle Automatiseringen (`/alle`)
Overzichtstabel met:
- **Zoeken** op naam/ID
- **Filteren** op categorie, systeem, status
- **Uitklapbare details** per automatisering met Mermaid diagram, stappen, koppelingen
- **CSV Export** van alle data
- **Deep linking** – kan geopend worden met `?open=AUTO-001` om direct een specifieke automatisering te tonen

### 3.5 BPMN Viewer (`/bpmn`)
Twee weergavemodi:

**Totaaloverzicht** – Alle automatiseringen in één diagram met swimming lanes:
- Groeperen op **Categorie** (HubSpot, Zapier, etc.) of **Klantfase** (Marketing, Sales, etc.)
- Toont onderlinge koppelingen tussen automatiseringen als pijlen
- Volledig Mermaid-gebaseerd

**Per automatisering** – Selecteer één automatisering en bekijk het individuele BPMN/flowchart diagram.

### 3.6 Mindmap (`/mindmap`)
React Flow visualisatie met:
- **Centrale systeemhubs** als grote hexagon nodes (HubSpot, Zapier, Backend)
- **Automatiseringen als satellietnodes** rond hun oorsprongssysteem
- **Oorsprong-logica**: automatiseringen worden gegroepeerd bij hun primaire systeem op basis van categorie:
  - HubSpot Workflow → HubSpot hub
  - Zapier Zap → Zapier hub
  - HubSpot + Zapier → Beide hubs
  - Backend Script → Backend hub
- **Klikbare nodes** met detailpaneel
- Radiale layout met automatische positionering

### 3.7 Analyse (`/analyse`)
Uitgebreide analysepagina met vier secties:

#### Klantproces Tijdlijn
- Horizontale tijdlijn met 5 fasen: Marketing → Sales → Onboarding → Boekhouding → Offboarding
- Per fase: aantal automatiseringen en hoeveel actief
- **Klikbare kaartjes** – klik op een automatisering navigeert naar `/alle?open=AUTO-XXX`
- Kleurcodes per fase met iconen

#### Impact & Complexiteit Scores
- Scoretabel gesorteerd op impact (hoogste eerst)
- **Filteren** op impact-niveau (Hoog ≥70 / Gemiddeld 40-69 / Laag <40) en complexiteit-niveau
- Per automatisering:
  - **Impact score** (0-100): gebaseerd op fasen-dekking, systeembreedte, directe afhankelijkheden, status
  - **Complexiteit score** (0-100): gebaseerd op aantal stappen, systemen, afhankelijkheden, koppelingen
  - **Cascade-telling**: hoeveel andere automatiseringen geraakt worden bij uitval
- Visuele progress bars met kleurcodering (groen/oranje/rood)

#### Afhankelijkheidsgraph
- Kaarten per actieve automatisering
- Toont cascade-effect: "Wat breekt als X uitvalt?"
- Risiconiveaus: hoog (≥2 geraakt), gemiddeld (1), laag (0)
- Uitklapbare lijst van getroffen automatiseringen
- Kleurgecodeerde randen (rood/geel/standaard)

#### Overzicht Grafieken
- Staafdiagrammen (Recharts) voor:
  - Per Categorie
  - Per Systeem
  - Per Owner
  - Per Status

#### Knelpunten Overzicht
- Lijst van automatiseringen met geregistreerde afhankelijkheden/knelpunten

---

## 4. Beveiliging

- Alle tabellen hebben Row Level Security (RLS) ingeschakeld
- Alleen geauthenticeerde gebruikers kunnen lezen, schrijven, updaten en verwijderen
- Authenticatie via e-mail en wachtwoord met e-mailverificatie

---

## 5. Koppelingenregels

- Een koppeling tussen twee automatiseringen is **alleen geldig** als de output van de ene de directe trigger is van de andere
- **Nooit** automatisch koppelen op basis van gedeelde keywords of systemen
- Koppelingen worden expliciet door de gebruiker gedefinieerd

---

## 6. ID-formaat

Alle automatiseringen krijgen een uniek ID in het formaat `AUTO-001`, `AUTO-002`, etc. Dit wordt automatisch gegenereerd via een database functie (`generate_auto_id`) die het hoogste bestaande nummer opzoekt en +1 doet.

---

## 7. Statusopties

| Status | Icoon | Betekenis |
|---|---|---|
| Actief | ✅ | Draait in productie |
| Verouderd | ⚠️ | Moet vervangen/bijgewerkt worden |
| In review | 🔍 | Wordt geëvalueerd |
| Uitgeschakeld | ❌ | Staat uit |

---

## 8. Klantproces Fasen

Elke automatisering kan aan één of meer fasen gekoppeld worden:

| Fase | Beschrijving |
|---|---|
| Marketing | Leadgeneratie, campagnes, content |
| Sales | Verkoopproces, offertes, gesprekken |
| Onboarding | Nieuwe klant inrichten, KvK, contracten |
| Boekhouding | Jaarrekening, IB, facturatie, WeFact |
| Offboarding | Klant uitschrijven, archiveren |
