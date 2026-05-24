import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ZapierProcessCard } from "@/components/flows/ZapierProcessCard";
import type { Automatisering } from "@/lib/types";

function makeZapierAutomation(): Automatisering {
  return {
    id: "AUTO-ZAP-EMAIL",
    naam: "Geen gehoor 1: Telefonische mail",
    categorie: "Zapier Zap",
    doel: "",
    trigger: "Zapier trigger: HubSpot-dealfase activeert deze Zap.",
    systemen: ["Zapier", "HubSpot", "Outlook"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: "zapier",
    importProposal: {
      source: "zapier",
      read_only: true,
      zap: {
        id: "231364342",
        title: "Geen gehoor 1: Telefonische mail",
        status: "Actief",
        process: {
          trigger: "Start wanneer een HubSpot-deal deze Zap activeert: Geen gehoor 1: Telefonische mail.",
          outcome: "Zapier stuurt 2 Outlook-mails, afhankelijk van de voorwaarden in de Zap.",
          conditions: ['Gaat door via pad "Nederlands" wanneer taal2 gelijk is aan Nederlands.'],
          emails: [{ subject: "Plan eenvoudig zelf je afspraak", recipients: ["{{contact_email}}"] }],
          webhookHandoffs: [],
          dataLookups: ["Haalt contactgegevens op: Contact information: Voertaal."],
          steps: [
            {
              index: 1,
              appName: "HubSpot",
              title: "Geen gehoor 1: Telefonische mail",
              type: "read",
              kind: "trigger",
              summary: "Start wanneer een HubSpot-deal deze Zap activeert: Geen gehoor 1: Telefonische mail.",
              details: ["Pipeline-id: 802700718."],
              webhookPaths: [],
            },
          ],
        },
        steps: [],
      },
    },
  };
}

describe("ZapierProcessCard", () => {
  it("shows rich Zapier process details for non-technical users", () => {
    render(<ZapierProcessCard automation={makeZapierAutomation()} />);

    expect(screen.getByText("Zapier processtappen")).toBeInTheDocument();
    expect(screen.getAllByText(/Start wanneer een HubSpot-deal/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Haalt contactgegevens op/)).toBeInTheDocument();
    expect(screen.getByText(/taal2 gelijk is aan Nederlands/)).toBeInTheDocument();
    expect(screen.getByText(/Plan eenvoudig zelf je afspraak/)).toBeInTheDocument();
    expect(screen.queryByText(/POST \//)).not.toBeInTheDocument();
  });
});
