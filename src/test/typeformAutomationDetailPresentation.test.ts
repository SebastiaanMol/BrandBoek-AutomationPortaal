import { describe, expect, it } from "vitest";
import {
  getTypeformAutomationDetailPresentation,
  isTypeformAutomation,
} from "@/lib/typeformAutomationDetailPresentation";
import type { Automatisering } from "@/lib/types";

describe("Typeform automation detail presentation", () => {
  it("builds summary, metrics, dataflow and webhook handoff from Typeform data", () => {
    const presentation = getTypeformAutomationDetailPresentation(makeTypeformAutomation());

    expect(isTypeformAutomation(makeTypeformAutomation())).toBe(true);
    expect(presentation.title).toBe("Contactformulier");
    expect(presentation.openInTypeformUrl).toBe("https://brandboekhouders.typeform.com/to/contact");
    expect(presentation.summary).toContain("verzamelt contactgegevens");
    expect(presentation.summary).toContain("stuurt Typeform de inzending door");
    expect(presentation.metrics.map((metric) => metric.label)).toEqual([
      "Formulierstatus",
      "Velden",
      "Hidden fields",
      "Webhook",
    ]);
    expect(presentation.metrics[1]).toMatchObject({ value: "3", detail: "2 verplicht" });
    expect(presentation.dataflow.map((node) => node.name)).toEqual([
      "Bezoeker",
      "Contactformulier",
      "Webhook",
      "Backend",
    ]);
    expect(presentation.webhooks[0]).toMatchObject({
      label: "brand-backend",
      status: "Actief",
      eventLabel: "form_response",
      destination: "automation.brandboekhouders.nl/typeform/contact",
    });
    expect(presentation.issues.map((issue) => issue.title)).not.toContain("Geen actieve webhook");
  });

  it("shows choice options and hidden context fields in question presentation", () => {
    const presentation = getTypeformAutomationDetailPresentation(makeTypeformAutomation());

    expect(presentation.questions).toHaveLength(3);
    expect(presentation.questions[2]).toMatchObject({
      title: "Waar kunnen we je mee helpen?",
      typeLabel: "Meerkeuze",
      choices: ["BTW-aangifte", "Jaarrekening"],
    });
    expect(presentation.hiddenFields).toEqual(["utm_source", "hubspot_utk", "gclid"]);
  });

  it("shows a clear gap when no active webhook is available", () => {
    const automation = makeTypeformAutomation({
      importProposal: {
        source: "typeform",
        read_only: true,
        typeform: {
          form: {
            id: "nohook",
            title: "Los formulier",
            fields: [],
            hidden_fields: [],
          },
          webhooks: [],
          process: {
            trigger: "Een klant vult het Typeform formulier in.",
            outcome: "Het portaal toont de formulierstructuur.",
            webhookHandoffs: [],
            steps: [],
          },
        },
      },
    });

    const presentation = getTypeformAutomationDetailPresentation(automation);

    expect(presentation.metrics[3]).toMatchObject({ value: "Geen actieve webhook" });
    expect(presentation.dataflow.map((node) => node.name)).toEqual(["Bezoeker", "Los formulier"]);
    expect(presentation.webhooks).toEqual([]);
    expect(presentation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Geen actieve webhook",
          severity: "warning",
        }),
      ]),
    );
  });

  it("does not expose a working Typeform source link without a display URL", () => {
    const automation = makeTypeformAutomation({
      importProposal: {
        source: "typeform",
        read_only: true,
        typeform: {
          form: {
            id: "abc123",
            title: "Formulier zonder link",
            fields: [],
            hidden_fields: [],
          },
          webhooks: [],
          process: {
            trigger: "",
            outcome: "",
            webhookHandoffs: [],
            steps: [],
          },
        },
      },
    });

    expect(getTypeformAutomationDetailPresentation(automation).openInTypeformUrl).toBeNull();
  });

  it("gives safe fallbacks for a minimal Typeform automation", () => {
    const presentation = getTypeformAutomationDetailPresentation(makeTypeformAutomation({
      naam: "Minimaal formulier",
      externalId: undefined,
      importProposal: undefined,
    }));

    expect(presentation.title).toBe("Minimaal formulier");
    expect(presentation.summary).toContain("verzamelt formulierinformatie");
    expect(presentation.metrics[1].value).toBe("0");
    expect(presentation.questions).toEqual([]);
    expect(presentation.rawData).toMatchObject({ automationId: "AUTO-TF" });
  });
});

function makeTypeformAutomation(input: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "AUTO-TF",
    naam: "Contactformulier",
    categorie: "Typeform",
    doel: "Typeform verzamelt contactgegevens en stuurt die door.",
    trigger: "Typeform formulier wordt ingevuld",
    systemen: ["Typeform", "Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2025-09-26T14:04:45+00:00",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: "typeform",
    externalId: "MNWzKwKE",
    lastSyncedAt: "2026-05-21T14:06:52.744+00:00",
    importProposal: {
      source: "typeform",
      read_only: true,
      typeform: {
        form: {
          id: "MNWzKwKE",
          title: "Contactformulier",
          display_url: "https://brandboekhouders.typeform.com/to/contact",
          hidden_fields: ["utm_source", "hubspot_utk", "gclid"],
          fields: [
            { id: "name", ref: "name", title: "Naam", type: "short_text", required: true },
            { id: "email", ref: "email", title: "E-mailadres", type: "email", required: true },
            {
              id: "help",
              ref: "help",
              title: "Waar kunnen we je mee helpen?",
              type: "multiple_choice",
              choices: ["BTW-aangifte", "Jaarrekening"],
            },
          ] as any,
        },
        webhooks: [
          {
            tag: "brand-backend",
            enabled: true,
            eventTypes: ["form_response"],
            path: "/typeform/contact",
            host: "automation.brandboekhouders.nl",
          },
        ],
        process: {
          trigger: "Een klant vult het Typeform formulier \"Contactformulier\" in.",
          outcome: "Typeform geeft de formulierinzending door aan de volgende verwerking.",
          webhookHandoffs: [
            { method: "POST", path: "/typeform/contact", host: "automation.brandboekhouders.nl" },
          ],
          steps: [],
        },
      },
    },
    ...input,
  };
}
