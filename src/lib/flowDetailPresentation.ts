import type { FlowRuntimeStep, FlowRuntimeStepType, FlowRuntimeWorkerMiniStep } from "./flowRuntimeChain";
import type { Automatisering, Flow } from "./types";

export interface FlowDetailPresentation {
  id: string;
  approvedDescription: string;
  processChainIntro: string;
  processJourneyIntro: string;
  automationCardsIntro: string;
  selectedAutomationIntro: string;
  evidenceIntro: string;
  evidenceItems: Array<{
    label: string;
    status: string;
    reason: string;
  }>;
  automationSummaries: {
    hubspot: string;
    gitlab: string;
  };
  automationLabels: {
    hubspot: string;
    gitlab: string;
  };
}

const WEFACT_FLOW_ID = "f8164cda-51b2-4f80-ae49-cf58a4c9eda8";
const WEFACT_ENDPOINT = "/wefact/hubspot/upsert_debtor";
const CREATE_NEW_DEAL_FLOW_ID = "8a9ef9d2-9bf8-469c-8107-647c28ac03ba";
const CREATE_NEW_DEAL_ENDPOINT = "/operations/hubspot/create_new_deal";

const WEFACT_PRESENTATION: FlowDetailPresentation = {
  id: "wefact-debtor",
  approvedDescription: [
    "Wanneer HubSpot de WeFact-verwerking activeert, wordt de klant- en bedrijfscontext doorgegeven aan de verwerking die de debiteur in WeFact aanmaakt of bijwerkt.",
    "De verwerking neemt de relevante klant- en bedrijfsgegevens uit HubSpot over en werkt de debiteur in WeFact bij. Zo blijven de debiteurgegevens voor facturatie actueel zonder dat dezelfde klantgegevens opnieuw handmatig hoeven te worden ingevoerd.",
    "Na afloop blijft HubSpot het startpunt voor de klantrelatie en is WeFact bijgewerkt voor facturatie. Controle blijft vooral nodig bij uitzonderingen, ontbrekende gegevens of foutieve koppelingen.",
  ].join("\n\n"),
  processJourneyIntro:
    "Deze procesreis laat de WeFact-reis als bedrijfsproces zien: HubSpot activeert de verwerking, waarna de backend de debiteur in WeFact aanmaakt of bijwerkt.",
  processChainIntro: "Van HubSpot-trigger naar backendverwerking en WeFact-update.",
  automationCardsIntro:
    "Dit zijn de twee onderdelen van deze procesreis: de HubSpot workflow die de synchronisatie start en de GitLab verwerking die WeFact bijwerkt.",
  selectedAutomationIntro:
    "Wat deze stap betekent voor Brand Boekhouders en de facturatieflow.",
  evidenceIntro:
    "Voor deze procesreis is vooral belangrijk welke overgang bewezen is, welke volgorde is afgeleid en waar nog geen vervolgtrigger is aangetoond.",
  evidenceItems: [
    {
      label: "Webhook-match",
      status: "Bevestigd",
      reason:
        "De HubSpot workflow roept dezelfde webhook aan als de GitLab verwerking afhandelt. Daarmee is de overgang tussen HubSpot en de backend bevestigd.",
    },
    {
      label: "Procesvolgorde",
      status: "Afgeleid",
      reason:
        "De volgorde HubSpot workflow -> GitLab verwerking volgt uit de webhook en de opgeslagen procesreis. Verdere subvolgorde binnen de backend blijft technische trace.",
    },
    {
      label: "Vervolgtrigger",
      status: "Niet bewezen",
      reason:
        "Er is geen exacte HubSpot-property of waarde gevonden die na deze WeFact-update automatisch een volgende procesreis start.",
    },
  ],
  automationSummaries: {
    hubspot:
      "Start de WeFact-synchronisatie wanneer HubSpot aangeeft dat een klant of bedrijf als debiteur verwerkt moet worden.",
    gitlab:
      "Neemt de relevante HubSpot klant- en bedrijfsgegevens over en maakt of werkt de WeFact debiteur bij voor facturatie.",
  },
  automationLabels: {
    hubspot: "HubSpot WeFact-synchronisatie",
    gitlab: "WeFact debiteur synchroniseren",
  },
};

const WEFACT_STEP_COPY: Partial<Record<FlowRuntimeStepType, Partial<FlowRuntimeStep>>> = {
  signal: {
    title: "HubSpot activeert de WeFact-verwerking",
    description:
      "De technische trigger van de HubSpot workflow blijft leidend. Functioneel betekent dit dat HubSpot voor een gekoppelde klant of bedrijf de WeFact-synchronisatie activeert.",
  },
  hubspot_workflow: {
    title: "HubSpot start de WeFact-synchronisatie",
    description:
      "De HubSpot workflow geeft de klant- en bedrijfscontext door aan de backendverwerking die de WeFact-debiteur synchroniseert.",
  },
  gitlab_backend_block: {
    title: "WeFact debiteur aanmaken of bijwerken",
    description:
      "De backend ontvangt de HubSpot-context en synchroniseert de relevante klant- en bedrijfsgegevens naar WeFact, zodat de debiteur voor facturatie actueel blijft.",
  },
  return_to_hubspot: {
    label: "Resultaat van verwerking",
    title: "WeFact-verwerking is afgerond",
    description:
      "Na de backendverwerking is de debiteur in WeFact aangemaakt of bijgewerkt. HubSpot blijft het startpunt voor de klantrelatie; WeFact is bijgewerkt voor facturatie.",
  },
  downstream: {
    label: "Einde procesreis",
    title: "Einde procesreis - Geen vervolgproces bewezen",
    description:
      "Deze procesreis stopt bij de WeFact-update. Er is geen bewezen HubSpot-trigger gevonden die hierna automatisch een volgende procesreis start.",
  },
};

const WEFACT_WORKER_STEPS: FlowRuntimeWorkerMiniStep[] = [
  {
    kind: "start",
    title: "Ontvangt HubSpot-context",
    summary:
      "De backend krijgt vanuit HubSpot genoeg context om te bepalen welke klant of welk bedrijf in WeFact verwerkt moet worden.",
  },
  {
    kind: "read",
    title: "Leest klant- en bedrijfsgegevens",
    summary:
      "De verwerking gebruikt de relevante HubSpot-gegevens als bron voor de debiteurinformatie in WeFact.",
  },
  {
    kind: "compute",
    title: "Bepaalt aanmaken of bijwerken",
    summary:
      "De backend verwerkt de debiteur als aanmaak- of bijwerkactie, afhankelijk van de beschikbare WeFact-koppeling en backendlogica.",
  },
  {
    kind: "write",
    title: "Werkt WeFact bij",
    summary:
      "WeFact wordt bijgewerkt zodat de debiteurgegevens voor facturatie aansluiten op de klantrelatie in HubSpot.",
  },
];

const CREATE_NEW_DEAL_PRESENTATION: FlowDetailPresentation = {
  id: "create-new-deal",
  approvedDescription: [
    "Deze procesreis kan op twee manieren starten. Een medewerker kan een deal handmatig inschrijven in de HubSpot-workflow, of HubSpot schrijft de deal automatisch in wanneer de deal in het Klantenbestand staat, actief is gezet, een dealfase heeft, minimaal een gekoppeld line item bevat en het veld Software/Portaal/Pakket is ingevuld.",
    "Wanneer de deal is ingeschreven, geeft HubSpot de deal door aan de verwerking die bepaalt welke vervolgdeals voor de klant nodig zijn. De verwerking kijkt naar de gekoppelde klant, company, contactpersoon, verkochte producten en het klanttype.",
    "Daarna controleert de verwerking of passende vervolgdeals al bestaan. Ontbrekende vervolgdeals worden aangemaakt; bestaande vervolgdeals kunnen worden bijgewerkt. Omdat re-enrollment aanstaat, kan dezelfde deal later opnieuw door deze workflow lopen wanneer relevante startvelden opnieuw worden bijgewerkt.",
  ].join("\n\n"),
  processJourneyIntro:
    "Een stap-voor-stap overzicht van de ingeschreven HubSpot-deal naar de benodigde vervolgdeals. Startsignaal en vervolgcontrole staan apart.",
  processChainIntro: "Van HubSpot-inschrijving naar backendverwerking en vervolgdeals.",
  automationCardsIntro:
    "Dit zijn de onderdelen van deze procesreis: de HubSpot workflow die de deal inschrijft en de backendverwerking die vervolgdeals bepaalt.",
  selectedAutomationIntro:
    "Wat deze stap betekent voor het omzetten van een klantdeal naar de juiste vervolgdeals.",
  evidenceIntro:
    "Voor deze procesreis is vooral belangrijk welke enrollmentvoorwaarden bewezen zijn, welke overdracht via webhook is bevestigd en waar nog geen vervolgtrigger is aangetoond.",
  evidenceItems: [
    {
      label: "Enrollmentvoorwaarden",
      status: "Bevestigd",
      reason:
        "De HubSpot workflow bevat automatische enrollmentcriteria voor Klantenbestand, Activiteit Sales Deal Stage, dealfase, line items en Software/Portaal/Pakket.",
    },
    {
      label: "Webhook-match",
      status: "Bevestigd",
      reason:
        "De HubSpot workflow geeft dezelfde verwerking door als de gekoppelde GitLab automation afhandelt. De technische route staat onder Logica.",
    },
    {
      label: "Re-enrollment",
      status: "Bevestigd",
      reason:
        "Re-enrollment staat aan; dezelfde deal kan opnieuw instromen wanneer relevante startvelden opnieuw aan de voorwaarden voldoen.",
    },
    {
      label: "Vervolgtrigger",
      status: "Niet bewezen",
      reason:
        "Er is geen exacte HubSpot-property of waarde gevonden die na deze verwerking automatisch een volgende procesreis start.",
    },
  ],
  automationSummaries: {
    hubspot:
      "Schrijft een deal in wanneer die handmatig wordt gestart of voldoet aan de automatische enrollmentvoorwaarden voor actieve klantdeals.",
    gitlab:
      "Bepaalt op basis van klantcontext, producten en bestaande deals welke vervolgdeals in HubSpot moeten worden aangemaakt of bijgewerkt.",
  },
  automationLabels: {
    hubspot: "HubSpot deal-inschrijving",
    gitlab: "Vervolgdeals bepalen",
  },
};

const CREATE_NEW_DEAL_STEP_COPY: Partial<Record<FlowRuntimeStepType, Partial<FlowRuntimeStep>>> = {
  signal: {
    title: "Inschrijving in HubSpot workflow",
    description:
      "Deze procesreis kan handmatig starten wanneer een medewerker de deal in de workflow inschrijft. De procesreis start automatisch wanneer de deal in het Klantenbestand staat, Activiteit Sales Deal Stage op Actief staat, de dealfase gevuld is, er minimaal een gekoppeld line item is en Software/Portaal/Pakket is ingevuld. Omdat re-enrollment aanstaat, kan dezelfde deal opnieuw instromen wanneer relevante startvelden opnieuw aan de voorwaarden voldoen.",
  },
  hubspot_workflow: {
    title: "HubSpot verwerkt de ingeschreven deal",
    description:
      "De HubSpot workflow ontvangt de ingeschreven deal en geeft de dealcontext door aan de verwerking die de benodigde vervolgdeals bepaalt.",
  },
  gitlab_backend_block: {
    title: "Vervolgdeals bepalen en bijwerken",
    description:
      "De backend haalt de klant-, company-, contact-, product- en pipelinecontext op. Daarna bepaalt de verwerking welke vervolgdeals al bestaan en welke nog moeten worden aangemaakt of bijgewerkt.",
  },
  return_to_hubspot: {
    label: "Resultaat van verwerking",
    title: "Vervolgdeals zijn bepaald",
    description:
      "De verwerking levert de uitkomst terug aan HubSpot: de benodigde vervolgdeals zijn aangemaakt, gekoppeld of bijgewerkt op basis van de beschikbare klant- en productcontext.",
  },
  state_write: {
    label: "Eindpunt in HubSpot",
    title: "HubSpot bevat de bijgewerkte vervolgdeals",
    description:
      "Dit is het einde van deze procesreis. HubSpot bevat nu de aangemaakte of bijgewerkte vervolgdeals, zodat het operationele klantproces op de juiste dossiers kan doorlopen.",
  },
  downstream: {
    label: "Einde procesreis",
    title: "Einde procesreis - Geen vervolgproces bewezen",
    description:
      "Een volgende procesreis wordt pas gekoppeld wanneer een exacte HubSpot-property, waarde, dealstage of workflowtrigger na deze verwerking bewezen is.",
  },
};

const CREATE_NEW_DEAL_WORKER_STEPS: FlowRuntimeWorkerMiniStep[] = [
  {
    kind: "start",
    title: "Ontvangt de ingeschreven deal",
    summary:
      "De backend krijgt vanuit HubSpot de deal die handmatig of automatisch in de workflow is ingeschreven.",
  },
  {
    kind: "read",
    title: "Leest klant- en dealcontext",
    summary:
      "De verwerking haalt de gekoppelde company, contactpersoon, eigenaar, line items en relevante pipelines op.",
  },
  {
    kind: "compute",
    title: "Bepaalt klanttype en producten",
    summary:
      "Op basis van Software/Portaal/Pakket en de verkochte producten bepaalt de backend welke soort vervolgdeals nodig zijn.",
  },
  {
    kind: "compute",
    title: "Controleert bestaande vervolgdeals",
    summary:
      "De backend kijkt eerst of er al passende vervolgdeals bestaan, zodat er geen dubbele deals worden aangemaakt.",
  },
  {
    kind: "write",
    title: "Maakt of werkt vervolgdeals bij",
    summary:
      "Ontbrekende vervolgdeals worden aangemaakt. Bestaande vervolgdeals kunnen worden bijgewerkt wanneer de klant- of productcontext daarom vraagt.",
  },
];

export function getFlowDetailPresentation(
  flow: Pick<Flow, "id" | "naam">,
  automations: Automatisering[] = [],
): FlowDetailPresentation | null {
  const text = [
    flow.id,
    flow.naam,
    ...automations.flatMap((automation) => [
      automation.naam,
      automation.externalId,
      automation.gitlabEndpoint?.endpoint,
      automation.endpoints?.join(" "),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (flow.id === WEFACT_FLOW_ID || (text.includes("wefact") && text.includes("debtor")) || text.includes(WEFACT_ENDPOINT)) {
    return WEFACT_PRESENTATION;
  }

  if (
    flow.id === CREATE_NEW_DEAL_FLOW_ID ||
    text.includes(CREATE_NEW_DEAL_ENDPOINT) ||
    (text.includes("create new deal") && text.includes("new create deal"))
  ) {
    return CREATE_NEW_DEAL_PRESENTATION;
  }

  return null;
}

export function applyFlowDetailPresentationToRuntimeSteps(
  steps: FlowRuntimeStep[],
  presentation: FlowDetailPresentation | null,
): FlowRuntimeStep[] {
  if (!presentation) return steps;

  if (presentation.id === CREATE_NEW_DEAL_PRESENTATION.id) {
    return steps
      .filter((step) => step.type !== "emitted_signal")
      .map((step) => {
        const override = CREATE_NEW_DEAL_STEP_COPY[step.type] ?? {};
        const workers = step.workers?.map((worker) => ({
          ...worker,
          title: "Vervolgdeals bepalen",
          description:
            "Deze verwerking gebruikt de HubSpot klant- en productcontext om te bepalen welke vervolgdeals moeten bestaan. Zo wordt de klantdeal vertaald naar de juiste operationele dossiers.",
          miniSteps: CREATE_NEW_DEAL_WORKER_STEPS,
          backendTrace: worker.backendTrace
            ? {
                ...worker.backendTrace,
                summary:
                  "Technische codepadinformatie voor het bepalen, controleren en aanmaken van vervolgdeals. De trace blijft bedoeld voor controle, niet als hoofdverhaal voor de gebruiker.",
              }
            : worker.backendTrace,
        }));

        return {
          ...step,
          ...override,
          evidence: step.evidence,
          workers,
        };
      });
  }

  if (presentation.id !== WEFACT_PRESENTATION.id) return steps;

  return steps
    .filter((step) => !["hubspot_branching", "state_write", "emitted_signal"].includes(step.type))
    .map((step) => {
      const override = WEFACT_STEP_COPY[step.type] ?? {};
      const hubspotActions = step.hubspotActions?.map((action) =>
        action.tone === "route"
          ? {
              ...action,
              label: "Webhookactie",
              title: "Stuurt de WeFact-verwerking aan",
              description: "Een HubSpot-terugschrijving wordt alleen getoond als die uit de code blijkt.",
            }
          : action,
      );
      const workers = step.workers?.map((worker) => ({
        ...worker,
        title: worker.title.toLowerCase().includes("wefact") ? "WeFact debiteur synchroniseren" : worker.title,
        description:
          "Deze verwerking gebruikt HubSpot klant- en bedrijfsgegevens om een debiteur in WeFact aan te maken of bij te werken. Zo blijven facturatiegegevens actueel zonder dubbele handmatige invoer.",
        miniSteps: WEFACT_WORKER_STEPS,
        backendTrace: worker.backendTrace
          ? {
              ...worker.backendTrace,
              summary:
                "Technische codepadinformatie voor de WeFact-verwerking. De trace blijft bedoeld voor controle, niet als hoofdverhaal voor de gebruiker.",
              decisions: [
                "Controleert welke HubSpot klant- en bedrijfsgegevens beschikbaar zijn.",
                "Bepaalt of WeFact een debiteur moet aanmaken of bijwerken.",
                "Geeft uitzonderingen terug wanneer gegevens of koppelingen ontbreken.",
                ...worker.backendTrace.decisions,
              ],
            }
          : worker.backendTrace,
      }));

      return {
        ...step,
        ...override,
        evidence: step.evidence,
        hubspotActions,
        workers,
      };
    });
}

export function getPresentationAutomationSummary(
  presentation: FlowDetailPresentation | null,
  automation: Automatisering,
  fallback = "",
): string {
  if (!presentation) return fallback;
  const isGitLab = automation.source === "gitlab" || Boolean(automation.gitlabFilePath);
  return isGitLab ? presentation.automationSummaries.gitlab : presentation.automationSummaries.hubspot;
}

export function getPresentationAutomationLabel(
  presentation: FlowDetailPresentation | null,
  automation: Automatisering,
  fallback = "",
): string {
  if (!presentation) return fallback;
  const isGitLab = automation.source === "gitlab" || Boolean(automation.gitlabFilePath);
  return isGitLab ? presentation.automationLabels.gitlab : presentation.automationLabels.hubspot;
}
