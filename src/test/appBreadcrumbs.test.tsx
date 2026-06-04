import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { AppBreadcrumbs } from "@/components/AppBreadcrumbs";

describe("AppBreadcrumbs", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("links automation detail back to the remembered automation catalog", () => {
    sessionStorage.setItem("automationNavigator.navigation.automations", JSON.stringify({
      pathname: "/alle",
      search: "?source=hubspot",
      hash: "#catalog",
      scrollY: 240,
      updatedAt: Date.now(),
      data: { query: "Whatsapp" },
    }));

    render(
      <MemoryRouter initialEntries={["/automations/AUTO-HS-WHATSAPP"]}>
        <AppBreadcrumbs />
      </MemoryRouter>,
    );

    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(within(breadcrumb).getByRole("link", { name: "Automations" })).toHaveAttribute("href", "/alle?source=hubspot#catalog");
    within(breadcrumb).getByText("Automation detail");
  });

  it("links flow detail back to the remembered process journey tab", () => {
    sessionStorage.setItem("automationNavigator.navigation.flows", JSON.stringify({
      pathname: "/flows",
      search: "",
      hash: "",
      scrollY: 100,
      updatedAt: Date.now(),
      data: { activeTab: "conceptprocesreizen" },
    }));

    render(
      <MemoryRouter initialEntries={["/flows/FLOW-1"]}>
        <AppBreadcrumbs />
      </MemoryRouter>,
    );

    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "Procesreizen" })).toHaveAttribute("href", "/flows");
    within(breadcrumb).getByText("Procesreis detail");
  });
});
