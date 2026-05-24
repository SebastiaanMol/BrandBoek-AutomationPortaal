import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TypeformProcessCard } from "@/components/flows/TypeformProcessCard";
import type { Automatisering } from "@/lib/types";

function makeTypeformAutomation(): Automatisering {
  return {
    id: "AUTO-TF-ONBOARDING",
    naam: "Onboarding formulier",
    categorie: "Typeform",
    doel: "Een klant vult het onboardingformulier in. Typeform geeft de gegevens door aan de volgende verwerking.",
    trigger: "Typeform formulier wordt ingevuld",
    systemen: ["Typeform", "Backend"],
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
    source: "typeform",
    importProposal: {
      source: "typeform",
      read_only: true,
      typeform: {
        form: {
          id: "abc123",
          title: "Onboarding formulier",
          display_url: "https://brandboekhouders.typeform.com/to/abc123",
          hidden_fields: ["deal_id", "company_id"],
          fields: [
            { id: "field-1", ref: "administratie", title: "Hoe is de administratie gevoerd?", type: "long_text" },
            { id: "field-2", ref: "software", title: "Welk boekhoudpakket gebruikt de klant?", type: "multiple_choice", choices: ["Brand portaal", "Exact Online", "Moneybird"] } as any,
            { id: "field-3", ref: "voorwaarden", title: "Ga je akkoord met de voorwaarden?", type: "legal" },
          ],
        },
        webhooks: [
          {
            tag: "brand-backend",
            enabled: true,
            eventTypes: ["form_response"],
            path: "/typeform/onboarding",
            host: "automation.brandboekhouders.nl",
          },
        ],
        process: {
          trigger: "Een klant vult het Typeform formulier \"Onboarding formulier\" in.",
          outcome: "Typeform geeft de formulierinzending door aan de volgende verwerking.",
          webhookHandoffs: [
            { method: "POST", path: "/typeform/onboarding", host: "automation.brandboekhouders.nl" },
          ],
          steps: [
            {
              index: 1,
              kind: "form_submission",
              title: "Formulier wordt ingevuld",
              summary: "Een klant vult het onboardingformulier in.",
              details: ["Belangrijke velden: Hoe is de administratie gevoerd?"],
              webhookPaths: [],
            },
          ],
        },
      },
    },
  };
}

describe("TypeformProcessCard", () => {
  it("shows Typeform form structure and webhook status without exposing technical route copy", () => {
    render(<TypeformProcessCard automation={makeTypeformAutomation()} />);

    expect(screen.getByText("Typeform enquête-preview")).toBeInTheDocument();
    expect(screen.getByText("Onboarding formulier")).toBeInTheDocument();
    expect(screen.getByText(/Hoe is de administratie gevoerd/)).toBeInTheDocument();
    expect(screen.getByText("deal_id")).toBeInTheDocument();
    expect(screen.getByText("company_id")).toBeInTheDocument();
    expect(screen.getByText(/Na verzenden doorgestuurd/)).toBeInTheDocument();
    expect(screen.queryByText(/POST \//)).not.toBeInTheDocument();
    expect(screen.queryByText(/endpoint|handler/i)).not.toBeInTheDocument();
  });

  it("renders fields as a survey with question previews and answer options", () => {
    render(<TypeformProcessCard automation={makeTypeformAutomation()} />);

    expect(screen.getByText("Vraag 1")).toBeInTheDocument();
    expect(screen.getByText("Vraag 2")).toBeInTheDocument();
    expect(screen.getByText("Vraag 3")).toBeInTheDocument();
    expect(screen.getAllByText("Lang antwoord").length).toBeGreaterThan(0);
    expect(screen.getByText("Brand portaal")).toBeInTheDocument();
    expect(screen.getByText("Exact Online")).toBeInTheDocument();
    expect(screen.getByText("Moneybird")).toBeInTheDocument();
    expect(screen.getByText("Akkoord")).toBeInTheDocument();
  });

  it("keeps multiple choice questions visible when they appear later in a long form", () => {
    const automation = makeTypeformAutomation();
    automation.importProposal!.typeform!.form!.fields = [
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `text-${index + 1}`,
        title: `Tekstvraag ${index + 1}`,
        type: "short_text",
      })),
      {
        id: "choice-late",
        title: "Welke dienstverlening wil de klant bespreken?",
        type: "multiple_choice",
        choices: [
          "BTW-aangifte",
          "Jaarrekening",
          "Inkomstenbelasting",
          "Vennootschapsbelasting",
          "Salarisadministratie",
          "Volledige boekhouding",
          "Fiscale vraag",
        ],
      } as any,
    ];

    render(<TypeformProcessCard automation={automation} />);

    expect(screen.getByText("Meerkeuzevragen")).toBeInTheDocument();
    expect(screen.getByText("Welke dienstverlening wil de klant bespreken?")).toBeInTheDocument();
    expect(screen.getByText("BTW-aangifte")).toBeInTheDocument();
    expect(screen.getByText("Fiscale vraag")).toBeInTheDocument();
  });
});
