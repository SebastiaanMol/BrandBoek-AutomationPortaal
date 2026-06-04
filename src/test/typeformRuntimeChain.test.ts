import { describe, expect, it } from "vitest";
import { buildFlowRuntimeChain } from "@/lib/flowRuntimeChain";
import type { Automatisering } from "@/lib/types";

function makeAuto(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "Typeform",
    doel: "",
    trigger: "",
    systemen: ["Typeform"],
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
    ...overrides,
  };
}

describe("Typeform runtime chain", () => {
  it("shows Typeform form submission steps before the backend automation without technical copy", () => {
    const typeform = makeAuto({
      id: "typeform",
      naam: "Onboarding formulier",
      source: "typeform",
      categorie: "Typeform",
      systemen: ["Typeform", "Backend"],
      webhookPaths: ["/typeform/onboarding"],
      importProposal: {
        source: "typeform",
        read_only: true,
        typeform: {
          form: {
            id: "abc123",
            title: "Onboarding formulier",
            display_url: "https://brandboekhouders.typeform.com/to/abc123",
            hidden_fields: ["deal_id"],
            fields: [
              { id: "field-1", ref: "administratie", title: "Hoe is de administratie gevoerd?", type: "long_text" },
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
              {
                index: 2,
                kind: "webhook",
                title: "Formulierinzending wordt doorgestuurd",
                summary: "Typeform geeft de formulierinzending door aan de backend.",
                details: ["Webhook: brand-backend"],
                webhookPaths: ["/typeform/onboarding"],
              },
            ],
          },
        },
      },
    });
    const gitlab = makeAuto({
      id: "gitlab",
      naam: "Typeform onboarding verwerken",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "HubSpot", "Typeform"],
      gitlabEndpoint: {
        endpoint: "/typeform/onboarding",
        method: "POST",
        handler: "onboarding_typeform",
      },
    });

    const steps = buildFlowRuntimeChain(
      ["typeform", "gitlab"],
      new Map([
        ["typeform", typeform],
        ["gitlab", gitlab],
      ]),
    );

    expect(steps.map((step) => step.type)).toEqual([
      "signal",
      "typeform_step",
      "typeform_step",
      "gitlab_worker",
      "state_write",
      "downstream",
    ]);
    expect(steps[0].description).toContain("Typeform formulier");
    expect(steps[1]).toMatchObject({
      label: "Typeform stap",
      title: "Formulier wordt ingevuld",
    });
    expect(steps[2]).toMatchObject({
      label: "Typeform overdracht",
      title: "Formulierinzending wordt doorgestuurd",
    });
    expect(steps[2].description).not.toMatch(/POST|endpoint|handler|\/typeform\/onboarding/i);
    expect(steps[2].evidence).toContain("/typeform/onboarding");
    expect(steps[3].transitionFromPrevious?.description).toContain("Webhook-match");
    expect(steps[3].transitionFromPrevious?.description).toContain("backendverwerking");
  });
});
