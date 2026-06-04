import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getNavigationReturnHref,
  readNavigationMemoryData,
  rememberCurrentRoute,
} from "@/lib/navigationMemory";

describe("navigationMemory", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, "", "/alle?source=hubspot#catalog");
    Object.defineProperty(window, "scrollY", { value: 420, configurable: true });
  });

  it("stores the current route, scroll position and page-specific state", () => {
    rememberCurrentRoute("automations", {
      sourceFilter: "hubspot",
      query: "Whatsapp",
      expandedAutomationId: "AUTO-HS-WHATSAPP",
    });

    expect(getNavigationReturnHref("automations", "/alle")).toBe("/alle?source=hubspot#catalog");
    expect(readNavigationMemoryData("automations")).toEqual({
      sourceFilter: "hubspot",
      query: "Whatsapp",
      expandedAutomationId: "AUTO-HS-WHATSAPP",
    });
  });

  it("falls back to the parent route when nothing useful is stored", () => {
    expect(getNavigationReturnHref("flows", "/flows")).toBe("/flows");
  });

  it("ignores broken session storage payloads", () => {
    sessionStorage.setItem("automationNavigator.navigation.flows", "{not json");

    expect(getNavigationReturnHref("flows", "/flows")).toBe("/flows");
    expect(readNavigationMemoryData("flows")).toBeNull();
  });

  it("restores the stored scroll position on request", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { restoreNavigationScroll } = await import("@/lib/navigationMemory");

    rememberCurrentRoute("pipelines", { filter: "hubspot" });
    restoreNavigationScroll("pipelines");

    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: "auto" });
  });
});
