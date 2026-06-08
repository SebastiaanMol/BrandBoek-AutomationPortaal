# Procesreis op Canvas — Design Spec

**Date:** 2026-06-08  
**Status:** Approved

---

## Probleem

Het rechterpaneel in Bewerken-modus toont alleen losse automations. Een procesreis (flow) is een volledige end-to-end automation bestaande uit meerdere onderdelen, maar is nergens sleepbaar naar het canvas. Gebruikers willen procesreizen als één eenheid op het canvas kunnen plaatsen — visueel onderscheiden van losse automations.

---

## Oplossing

Het rechterpaneel krijgt drie inklapbare secties. Procesreizen worden sleepbaar naar verbindingslijnen op het canvas, net als losse automations, maar zien er anders uit.

---

## Rechterpaneel — drie accordion-secties

### Sectie 1: Gekoppeld (standaard uitgeklapt)
Toont alle items die op het **huidige canvas** geplaatst zijn:
- Losse automations die al op een verbindingslijn staan
- Procesreizen die al op een verbindingslijn staan
- Elke rij toont: icoon (type), naam, gekoppelde stap ("op stap A → B")
- Klikken op een item verwijdert de koppeling (zelfde gedrag als nu)

### Sectie 2: Procesreizen (standaard ingeklapt)
Toont alle beschikbare procesreizen uit de database:
- Geladen via de bestaande `useFlows()` hook
- Elke rij: indigo icoon, naam van de procesreis, aantal automations erin
- Drag-and-drop naar een verbindingslijn op het canvas
- Label "Sleep naar een pijl op de flow"

### Sectie 3: Losse automations (standaard ingeklapt)
Huidige "Niet-gekoppeld" lijst, ongewijzigd gedrag:
- Drag-and-drop naar verbindingslijn
- Label "Sleep naar een pijl op de flow"

---

## Canvas-dot: Procesreis vs Automation

| Eigenschap | Procesreis-dot | Automation-dot (huidig) |
|---|---|---|
| Kleur | Indigo (`#6366F1`) | Amber (`hsl(45 95% 55%)`) |
| Icoon | ⛓ (Link/chain, lucide `Link`) | ⚡ (bliksem) |
| Grootte | radius 13px | radius 11px |
| Hover tooltip | Naam van de procesreis | Naam van de automation |
| Klik | Opent detail panel | Opent detail panel |

### Klik op procesreis-dot → detail panel
- Naam + beschrijving van de procesreis
- Systemen (badges)
- Aantal automations erin
- Knop "Bekijk volledige procesreis" → link naar `/flows/:id`

---

## Data — ProcessState uitbreiding

Nieuw veld in `ProcessState` (src/data/processData.ts):

```ts
flowLinks?: Record<string, { fromStepId: string; toStepId: string }>;
// key = flow.id, value = de verbindingslijn waarop de procesreis staat
```

Opgeslagen via het bestaande `saveProcessState` / `buildSavedProcessState` mechanisme.

In `SavedProcessState` (src/lib/storage/processState.ts):
```ts
flowLinks?: Record<string, { fromStepId: string; toStepId: string }>;
```

---

## Bestanden te wijzigen

| Bestand | Wijziging |
|---------|-----------|
| `src/data/processData.ts` | `flowLinks` toevoegen aan `ProcessState` |
| `src/lib/storage/processState.ts` | `flowLinks` opslaan/laden |
| `src/lib/processStateMapping.ts` | `flowLinks` meenemen in build/restore functies |
| `src/components/process/ProcessenEditor.tsx` | Rechterpaneel herontwerpen (3 secties), `useFlows()` toevoegen, flowLinks-handlers |
| `src/components/process/ProcessCanvas.tsx` | Procesreis-dot renderen + drag-drop + klik-handler |

---

## Out of scope

- Procesreis-dot in de ProcessviewerCanvas (viewer) — volgt later
- Meerdere procesreizen op dezelfde verbindingslijn
- Bewerken van de procesreis vanuit het canvas
