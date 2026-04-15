// src/lib/signalen.ts
import { Automatisering, berekenComplexiteit, getVerificatieStatus } from "./types";

export type SignaalType =
  | "outdated"
  | "uitgeschakeld-actief"
  | "missing-owner"
  | "missing-trigger"
  | "missing-systems"
  | "no-goal"
  | "hoge-complexiteit"
  | "broken-link"
  | "orphan"
  | "unverified";

export type Ernst = "error" | "warning" | "info";

export type SignaalCategorie = "status" | "kwaliteit" | "structuur" | "verificatie";

export interface Signaal {
  id: string;
  automationId: string;
  naam: string;
  type: SignaalType;
  ernst: Ernst;
  categorie: SignaalCategorie;
  bericht: string;
  suggestie: string;
}

export function detectSignalen(automations: Automatisering[], periodeDagen: number = 90): Signaal[] {
  const signalen: Signaal[] = [];
  const allIds = new Set(automations.map(a => a.id));

  const incomingRefs = new Map<string, Set<string>>();
  for (const a of automations) {
    if (!incomingRefs.has(a.id)) incomingRefs.set(a.id, new Set());
    for (const k of (a.koppelingen ?? [])) {
      if (!incomingRefs.has(k.doelId)) incomingRefs.set(k.doelId, new Set());
      incomingRefs.get(k.doelId)!.add(a.id);
    }
  }

  for (const a of automations) {
    const push = (
      type: SignaalType,
      ernst: Ernst,
      categorie: SignaalCategorie,
      bericht: string,
      suggestie: string,
      idSuffix = ""
    ) =>
      signalen.push({
        id: `${a.id}-${type}${idSuffix}`,
        automationId: a.id,
        naam: a.naam,
        type,
        ernst,
        categorie,
        bericht,
        suggestie,
      });

    if (a.status === "Verouderd") {
      push("outdated", "error", "status",
        "Status is 'Verouderd'",
        "Update of archiveer deze automatisering");
    }

    if (a.status === "Uitgeschakeld") {
      const activeRefCount = [...(incomingRefs.get(a.id) ?? [])].filter(refId => {
        const ref = automations.find(x => x.id === refId);
        return ref?.status === "Actief";
      }).length;
      if (activeRefCount > 0) {
        push("uitgeschakeld-actief", "error", "status",
          `Uitgeschakeld maar gerefereerd door ${activeRefCount} actieve automatisering(en)`,
          "Herstel of ontkoppel deze automatisering");
      }
    }

    if (!a.owner?.trim()) {
      push("missing-owner", "warning", "kwaliteit",
        "Geen eigenaar ingesteld",
        "Wijs een verantwoordelijke toe");
    }

    if (!a.trigger?.trim()) {
      push("missing-trigger", "warning", "kwaliteit",
        "Geen trigger gedefinieerd",
        "Beschrijf wat deze automatisering activeert");
    }

    if (!a.systemen?.length) {
      push("missing-systems", "warning", "kwaliteit",
        "Geen systemen gekoppeld",
        "Geef aan welke tools/systemen dit gebruikt");
    }

    if (!a.doel?.trim()) {
      push("no-goal", "info", "kwaliteit",
        "Geen doel beschreven",
        "Voeg een korte doelomschrijving toe");
    }

    if (berekenComplexiteit(a) > 50 && (a.stappen?.length ?? 0) <= 1) {
      push("hoge-complexiteit", "warning", "kwaliteit",
        "Hoge complexiteitsscore maar slechts 0–1 stappen gedocumenteerd",
        "Voeg de ontbrekende stappen toe aan de documentatie");
    }

    for (const k of (a.koppelingen ?? [])) {
      if (!allIds.has(k.doelId)) {
        push("broken-link", "error", "structuur",
          `Koppeling naar '${k.doelId}' bestaat niet meer`,
          `Verwijder of herstel de koppeling naar ${k.doelId}`,
          `-${k.doelId}`);
      }
    }

    const hasOutgoing = (a.koppelingen?.length ?? 0) > 0;
    const hasIncoming = (incomingRefs.get(a.id)?.size ?? 0) > 0;
    if (!hasOutgoing && !hasIncoming) {
      push("orphan", "warning", "structuur",
        "Staat volledig los — geen koppelingen in of uit",
        "Koppel aan gerelateerde automatiseringen of verwijder indien overbodig");
    }

    const vs = getVerificatieStatus(a, periodeDagen);
    if (vs === "verouderd") {
      push("unverified", "warning", "verificatie",
        `Niet geverifieerd in ${periodeDagen}+ dagen`,
        "Controleer of deze automatisering nog klopt");
    } else if (vs === "nooit") {
      push("unverified", "info", "verificatie",
        "Nog nooit geverifieerd",
        "Verifieer deze automatisering voor het eerst");
    }
  }

  return signalen;
}
