import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Layers2 } from "lucide-react";
import {
  PageCommandBar,
  PageHeaderAction,
  PageHeaderMetric,
  PageHeaderMetrics,
  PageHeaderShell,
} from "@/components/layout/PageHeader";

describe("PageHeader command style", () => {
  it("renders a compact command header without the old card background", () => {
    const { container } = render(
      <PageHeaderShell
        icon={Layers2}
        eyebrow="Pipelines"
        title="Pipelines"
        description="Deal-pipelines vanuit HubSpot en handmatige processen buiten HubSpot."
        actions={<PageHeaderAction>Sync HubSpot</PageHeaderAction>}
        metrics={(
          <PageHeaderMetrics>
            <PageHeaderMetric value={15} label="actief" />
            <PageHeaderMetric value={57} label="pipelines" />
          </PageHeaderMetrics>
        )}
      >
        <PageCommandBar>
          <div>Tabs</div>
          <div>Search</div>
        </PageCommandBar>
      </PageHeaderShell>,
    );

    expect(screen.getByRole("heading", { name: "Pipelines" })).toBeInTheDocument();
    expect(screen.getByText("Deal-pipelines vanuit HubSpot en handmatige processen buiten HubSpot.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync HubSpot" })).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("actief")).toBeInTheDocument();
    expect(container.querySelector(".bg-primary-soft")).toBeNull();
  });
});
