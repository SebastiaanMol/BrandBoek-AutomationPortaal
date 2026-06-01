import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SyncReviewDialog } from "@/components/SyncReviewDialog";

const items = [
  {
    id: "change-1",
    changeType: "route_changed",
    title: "Create new deal",
    source: "hubspot",
    summary: "Webhookpad gewijzigd",
    impact: "Procesreis-bewijs wordt sterker",
    oldValue: {
      webhook_paths: ["/old/path"],
      endpoints: [],
      metadata: [{ field: "naam", value: "Create deal oud" }],
    },
    newValue: {
      webhook_paths: ["/new/path"],
      endpoints: [],
      metadata: [{ field: "naam", value: "Create deal nieuw" }],
    },
    selectedByDefault: true,
  },
  {
    id: "change-2",
    changeType: "new_automation",
    title: "Trustoo Leads - Utrecht",
    source: "zapier",
    summary: "Nieuwe Zapier automation gevonden",
    impact: "Komt als importvoorstel in de catalogus",
    selectedByDefault: true,
  },
];

describe("SyncReviewDialog", () => {
  it("shows all changes selected by default and applies only selected ids", () => {
    const onApply = vi.fn();
    render(
      <SyncReviewDialog
        open
        source="hubspot"
        syncRunId="run-1"
        items={items as any}
        isApplying={false}
        onOpenChange={() => {}}
        onApply={onApply}
      />,
    );

    expect(screen.getByText("Bronwijzigingen controleren")).toBeInTheDocument();
    expect(screen.getByText("Create new deal")).toBeInTheDocument();
    expect(screen.getByText("Was")).toBeInTheDocument();
    expect(screen.getByText("Wordt")).toBeInTheDocument();
    expect(screen.getByText("Create deal oud")).toBeInTheDocument();
    expect(screen.getByText("Create deal nieuw")).toBeInTheDocument();
    expect(screen.getByText("/old/path")).toBeInTheDocument();
    expect(screen.getByText("/new/path")).toBeInTheDocument();
    expect(screen.getByText("Trustoo Leads - Utrecht")).toBeInTheDocument();

    const trustooRow = screen.getByText("Trustoo Leads - Utrecht").closest("[data-sync-review-row]");
    fireEvent.click(within(trustooRow as HTMLElement).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /wijzigingen toepassen/i }));

    expect(onApply).toHaveBeenCalledWith(["change-1"]);
  });
});
