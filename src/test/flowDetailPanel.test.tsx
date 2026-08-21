import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlowDetailPanel } from "@/components/process/FlowDetailPanel";
import type { Flow } from "@/lib/types";

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

const flow: Flow = {
  id: "flow-route",
  naam: "Route journey",
  beschrijving: "",
  systemen: [],
  automationIds: [],
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

describe("FlowDetailPanel", () => {
  it("shows the concrete placement label for the current detach action", () => {
    const onDetach = vi.fn();
    const onClose = vi.fn();

    render(
      <FlowDetailPanel
        flow={flow}
        isAttached
        placementLabel="IB - Automatic sync"
        onClose={onClose}
        onDetach={onDetach}
      />,
    );

    expect(screen.getByText("IB - Automatic sync")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Loskoppelen van IB - Automatic sync" }));

    expect(onDetach).toHaveBeenCalledWith("flow-route");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
