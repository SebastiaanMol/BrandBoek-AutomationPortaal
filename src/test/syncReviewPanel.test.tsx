import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SyncReviewPanel } from "@/components/SyncReviewPanel";
import type { SyncReviewChangeItem } from "@/lib/storage/edgeFunctions";

function item(overrides: Partial<SyncReviewChangeItem>): SyncReviewChangeItem {
  return {
    id: "change-1",
    syncRunId: "sync-1",
    source: "hubspot",
    externalId: "ext-1",
    automationId: null,
    changeType: "new_automation",
    status: "pending",
    title: "Nieuwe automation",
    summary: "Nieuwe bronregel",
    impact: "Komt als importvoorstel in de catalogus.",
    oldValue: null,
    newValue: {},
    payload: {},
    selectedByDefault: true,
    ...overrides,
  };
}

describe("SyncReviewPanel", () => {
  it("shows paginated range and applies only selected rows from the current page", () => {
    const onApply = vi.fn();

    render(
      <SyncReviewPanel
        items={[
          item({ id: "page-row-1", title: "Rij 1", externalId: "ext-1" }),
          item({ id: "page-row-2", title: "Rij 2", externalId: "ext-2" }),
        ]}
        total={75}
        page={2}
        pageSize={50}
        pageCount={2}
        from={51}
        to={75}
        filters={{ source: "all", type: "all", selected: "all", search: "" }}
        isLoading={false}
        isApplying={false}
        onFiltersChange={vi.fn()}
        onPageChange={vi.fn()}
        onApply={onApply}
      />,
    );

    expect(screen.getByText("51-75 van 75")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 geselecteerde regels toepassen" })).toBeEnabled();

    const firstRow = screen.getByText("Rij 1").closest("[data-sync-review-row]");
    expect(firstRow).not.toBeNull();
    fireEvent.click(within(firstRow as HTMLElement).getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: "1 geselecteerde regel toepassen" }));

    expect(onApply).toHaveBeenCalledWith(["page-row-2"]);
  });

  it("wires filter controls to server-side filter state", () => {
    const onFiltersChange = vi.fn();

    render(
      <SyncReviewPanel
        items={[item({ id: "change-1" })]}
        total={1}
        page={1}
        pageSize={50}
        pageCount={1}
        from={1}
        to={1}
        filters={{ source: "all", type: "all", selected: "all", search: "" }}
        isLoading={false}
        isApplying={false}
        onFiltersChange={onFiltersChange}
        onPageChange={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Bron filter"), { target: { value: "hubspot" } });
    expect(onFiltersChange).toHaveBeenLastCalledWith({ source: "hubspot", type: "all", selected: "all", search: "" });

    fireEvent.change(screen.getByLabelText("Type filter"), { target: { value: "new" } });
    expect(onFiltersChange).toHaveBeenLastCalledWith({ source: "all", type: "new", selected: "all", search: "" });

    fireEvent.change(screen.getByLabelText("Selectie filter"), { target: { value: "unselected" } });
    expect(onFiltersChange).toHaveBeenLastCalledWith({ source: "all", type: "all", selected: "unselected", search: "" });

    fireEvent.change(screen.getByLabelText("Zoeken in bronwijzigingen"), { target: { value: "ext-1" } });
    expect(onFiltersChange).toHaveBeenLastCalledWith({ source: "all", type: "all", selected: "all", search: "ext-1" });
  });

  it("lets the page scroll instead of trapping rows in an internal scroll area", () => {
    const { container } = render(
      <SyncReviewPanel
        items={[item({ id: "change-1" })]}
        total={1}
        page={1}
        pageSize={50}
        pageCount={1}
        from={1}
        to={1}
        filters={{ source: "all", type: "all", selected: "all", search: "" }}
        isLoading={false}
        isApplying={false}
        onFiltersChange={vi.fn()}
        onPageChange={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(container.querySelector(".max-h-\\[56vh\\]")).toBeNull();
  });

  it("groups multiple review items for the same automation into one overview row", () => {
    render(
      <SyncReviewPanel
        items={[
          item({
            id: "actions-missing",
            externalId: "1799671812",
            title: "Bedrijven zonder bankkoppeling instellen",
            changeType: "source_data_incomplete",
            summary: "HubSpot acties ontbreken voor procesreisvorming.",
          }),
          item({
            id: "triggers-missing",
            externalId: "1799671812",
            title: "Bedrijven zonder bankkoppeling instellen",
            changeType: "source_data_incomplete",
            summary: "HubSpot triggercriteria ontbreken voor procesreisvorming.",
          }),
          item({
            id: "webhook-changed",
            externalId: "1799671812",
            title: "Bedrijven zonder bankkoppeling instellen",
            changeType: "route_changed",
            summary: "Webhook- of endpointinformatie wijzigt.",
            oldValue: { webhook_paths: ["/properties/bankkoppeling/sync_bedrijven_zonder_bankkoppeling_webhook"] },
            newValue: { webhook_paths: [] },
          }),
        ]}
        total={3}
        page={1}
        pageSize={50}
        pageCount={1}
        from={1}
        to={3}
        filters={{ source: "all", type: "all", selected: "all", search: "" }}
        isLoading={false}
        isApplying={false}
        onFiltersChange={vi.fn()}
        onPageChange={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Bedrijven zonder bankkoppeling instellen")).toHaveLength(1);
    const group = screen.getByText("Bedrijven zonder bankkoppeling instellen").closest("[data-sync-review-group]");
    expect(group).not.toBeNull();
    expect(within(group as HTMLElement).getByText("3 open punten")).toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("Toe te passen wijzigingen")).toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("Bronkwaliteit")).toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("HubSpot acties ontbreken voor procesreisvorming.")).toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("HubSpot triggercriteria ontbreken voor procesreisvorming.")).toBeInTheDocument();
    expect(within(group as HTMLElement).getByText("Webhook- of endpointinformatie wijzigt.")).toBeInTheDocument();
  });

  it("shows failed review items with their stored error message", () => {
    render(
      <SyncReviewPanel
        items={[
          item({
            id: "failed-gitlab",
            source: "gitlab",
            title: "Deal aanmaken",
            externalId: "app/API/deals.py::POST /deals/create",
            status: "failed",
            errorMessage: "Nieuwe automation uit sync-review aanmaken: duplicate key",
          }),
        ]}
        total={1}
        page={1}
        pageSize={50}
        pageCount={1}
        from={1}
        to={1}
        filters={{ source: "all", type: "all", selected: "all", search: "" }}
        isLoading={false}
        isApplying={false}
        onFiltersChange={vi.fn()}
        onPageChange={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Mislukt").length).toBeGreaterThan(0);
    expect(screen.getByText("Niet opgeslagen: Nieuwe automation uit sync-review aanmaken: duplicate key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 geselecteerde regel toepassen" })).toBeEnabled();
  });
});
