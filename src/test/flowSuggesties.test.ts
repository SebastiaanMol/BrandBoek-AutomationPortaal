import { describe, it, expect } from "vitest";
import { toZekerheid } from "@/lib/storage/automationLinks";

describe("toZekerheid", () => {
  it("maps confidence 1.0 to webhook", () => {
    expect(toZekerheid(1.0)).toBe("webhook");
  });

  it("maps confidence 0.7 to ai", () => {
    expect(toZekerheid(0.7)).toBe("ai");
  });

  it("maps confidence 0 to ai", () => {
    expect(toZekerheid(0)).toBe("ai");
  });

  it("maps confidence above 1.0 to webhook", () => {
    expect(toZekerheid(1.1)).toBe("webhook");
  });
});
