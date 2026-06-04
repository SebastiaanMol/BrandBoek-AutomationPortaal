import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProcessJourneyReview from "@/pages/ProcessJourneyReview";
import type { ProcessJourneyReviewItem } from "@/lib/storage/processJourneyReviewItems";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering } from "@/lib/types";

const { automations, suggestions, reviewItems, flows, saveJourney, createItem, updateStatus } = vi.hoisted(() => {
  const createItem = vi.fn();
  const updateStatus = vi.fn();
  const saveJourney = vi.fn();
  const baseAutomation = (overrides: Partial<Automatisering>): Automatisering => ({
    id: "auto",
    naam: "Automation",
    categorie: "Anders",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-29T00:00:00.000Z",
    laatstGeverifieerd: "2026-05-29T00:00:00.000Z",
    geverifieerdDoor: "Tester",
    lastSyncedAt: "2026-05-29T00:00:00.000Z",
    ...overrides,
  } as Automatisering);
  const baseSuggestion = (overrides: Partial<FlowSuggestie>): FlowSuggestie => ({
    fromId: "hs-create",
    toId: "gl-create",
    fromNaam: "Create new deal",
    toNaam: "New create deal",
    fromCategorie: "HubSpot Workflow",
    toCategorie: "Backend Script",
    fromSource: "hubspot",
    toSource: "gitlab",
    fromStatus: "Actief",
    toStatus: "Actief",
    zekerheid: "webhook",
    redenering: "Webhook-match: POST /operations/hubspot/create_new_deal",
    confirmed: false,
    rejected: false,
    ...overrides,
  });

  const automations = [
    baseAutomation({
      id: "hs-create",
      naam: "Create new deal",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      hubspotWorkflow: {
        name: "Create new deal",
        triggers: [{ label: "Deal wordt actief", source: "HubSpot" }],
        actions: [
          {
            index: 1,
            type: "WEBHOOK",
            label: "Send webhook",
            webhookMethod: "POST",
            webhookPath: "/operations/hubspot/create_new_deal",
          },
        ],
      },
    }),
    baseAutomation({
      id: "gl-create",
      naam: "New create deal",
      source: "gitlab",
      categorie: "Backend Script",
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        handler: "new_create_deal",
        calls: [],
      },
    }),
  ];
  const suggestions = [
    baseSuggestion({}),
  ];
  const reviewItems: ProcessJourneyReviewItem[] = [
    {
      id: "item-1",
      conceptJourneyId: "hs-create__gl-create",
      flowId: null,
      automationId: "hs-create",
      fromAutomationId: "hs-create",
      toAutomationId: "gl-create",
      normalizedPath: "/operations/hubspot/create_new_deal",
      itemType: "wrong_edge",
      status: "open",
      note: "Developer zegt dat dit endpoint oud is",
      proposedAction: "Controleer HubSpot workflow action",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
      resolvedAt: null,
    },
  ];

  const flows = [
    {
      id: "flow-existing",
      naam: "Bestaande reis",
      beschrijving: "Oude beschrijving.",
      systemen: ["HubSpot", "GitLab"],
      automationIds: ["hs-existing", "gl-existing"],
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
    },
  ];

  return { automations, suggestions, reviewItems, flows, saveJourney, createItem, updateStatus };
});

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations, isLoading: false }),
  useFlowSuggesties: () => ({ data: suggestions, isLoading: false }),
  useFlows: () => ({ data: flows, isLoading: false }),
  useAllConfirmedAutomationLinks: () => ({ data: [], isLoading: false }),
  useSaveCuratedProcessJourney: () => ({ mutateAsync: saveJourney, isPending: false }),
  useProcessJourneyReviewItems: () => ({ data: reviewItems, isLoading: false }),
  useCreateProcessJourneyReviewItem: () => ({ mutateAsync: createItem, isPending: false }),
  useUpdateProcessJourneyReviewItemStatus: () => ({ mutateAsync: updateStatus, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("ProcessJourneyReview page", () => {
  beforeEach(() => {
    createItem.mockClear();
    updateStatus.mockClear();
    saveJourney.mockClear();
    saveJourney.mockResolvedValue({ flowId: "flow-new", mode: "created" });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("shows the review queue, selected candidate, evidence and prompt/markdown actions", () => {
    render(
      <MemoryRouter>
        <ProcessJourneyReview />
      </MemoryRouter>,
    );

    screen.getByRole("heading", { name: "Procesreis Review Cockpit" });
    screen.getByText("2 review-items");
    screen.getByRole("button", { name: /Create new deal/i });
    screen.getByRole("heading", { name: "Webhook-bewijs" });
    screen.getByText("100% webhook-match");
    screen.getByText("/operations/hubspot/create_new_deal");
    screen.getByRole("link", { name: /Open goedkeurpagina/i });
    screen.getByRole("button", { name: /Prompt kopiëren/i });
    screen.getByRole("button", { name: /Markdown kopiëren/i });
  });

  it("saves the selected concept directly and advances to the next review item", async () => {
    render(
      <MemoryRouter>
        <ProcessJourneyReview />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Voorgestelde titel"), {
      target: { value: "Create new deal naar backend" },
    });
    fireEvent.change(screen.getByLabelText("Voorgestelde beschrijving"), {
      target: { value: "HubSpot geeft het nieuwe deal-signaal door aan de backend." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Opslaan en volgende/i }));

    expect(saveJourney).toHaveBeenCalledWith(expect.objectContaining({
      kind: "concept",
      title: "Create new deal naar backend",
      description: "HubSpot geeft het nieuwe deal-signaal door aan de backend.",
      automationIds: ["hs-create", "gl-create"],
      systemen: ["HubSpot", "GitLab"],
      transitions: [{ fromId: "hs-create", toId: "gl-create" }],
    }));

    await screen.findByText("Bestaande reis");
  });

  it("adds a review item from an edge and resolves existing items", async () => {
    render(
      <MemoryRouter>
        <ProcessJourneyReview />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Review edge/i }));
    fireEvent.change(screen.getByLabelText("Notitie"), { target: { value: "Endpoint mist body mapping" } });
    fireEvent.change(screen.getByLabelText("Voorgestelde actie"), { target: { value: "Vraag developer naar payload" } });
    fireEvent.click(screen.getByRole("button", { name: /Review-item opslaan/i }));

    expect(createItem).toHaveBeenCalledWith(expect.objectContaining({
      conceptJourneyId: "hs-create__gl-create",
      fromAutomationId: "hs-create",
      toAutomationId: "gl-create",
      normalizedPath: "/operations/hubspot/create_new_deal",
      itemType: "wrong_edge",
      note: "Endpoint mist body mapping",
      proposedAction: "Vraag developer naar payload",
    }));

    const item = screen.getByText("Developer zegt dat dit endpoint oud is").closest("article") as HTMLElement;
    fireEvent.click(within(item).getByRole("button", { name: /Oplossen/i }));

    expect(updateStatus).toHaveBeenCalledWith({ id: "item-1", status: "resolved" });
  });

  it("copies prompt and markdown from the selected journey", async () => {
    render(
      <MemoryRouter>
        <ProcessJourneyReview />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Prompt kopiëren/i }));
    fireEvent.click(screen.getByRole("button", { name: /Markdown kopiëren/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Verrijk en review deze procesreis"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("# Procesreis review"));
  });
});
