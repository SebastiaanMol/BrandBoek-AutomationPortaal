import { describe, it, expect } from "vitest";
import type { ProcessStep } from "@/data/processData";

// Inline the intended post-change logic (mirrors ProcessCanvas helpers).
// Pattern mirrors processCanvas.test.ts — pure logic duplicated for testability.

function isEvent(step: Pick<ProcessStep, "type">) {
  return step.type === "start" || step.type === "end"
    || step.type === "terminate" || step.type === "send" || step.type === "receive";
}

function isDecision(step: Pick<ProcessStep, "type">) {
  return step.type === "decision" || step.type === "and";
}

describe("BPMN-01: isEvent — event types", () => {
  it("returns true for start", () => expect(isEvent({ type: "start" })).toBe(true));
  it("returns true for end",   () => expect(isEvent({ type: "end" })).toBe(true));
  it("returns true for terminate", () => expect(isEvent({ type: "terminate" })).toBe(true));
  it("returns true for send",  () => expect(isEvent({ type: "send" })).toBe(true));
  it("returns true for receive", () => expect(isEvent({ type: "receive" })).toBe(true));
  it("returns false for task",     () => expect(isEvent({ type: "task" })).toBe(false));
  it("returns false for decision", () => expect(isEvent({ type: "decision" })).toBe(false));
  it("returns false for and",      () => expect(isEvent({ type: "and" })).toBe(false));
  it("returns false for undefined", () => expect(isEvent({ type: undefined })).toBe(false));
});

describe("BPMN-02: isDecision — gateway types", () => {
  it("returns true for decision", () => expect(isDecision({ type: "decision" })).toBe(true));
  it("returns true for and",      () => expect(isDecision({ type: "and" })).toBe(true));
  it("returns false for start",   () => expect(isDecision({ type: "start" })).toBe(false));
  it("returns false for task",    () => expect(isDecision({ type: "task" })).toBe(false));
  it("returns false for terminate", () => expect(isDecision({ type: "terminate" })).toBe(false));
  it("returns false for send",    () => expect(isDecision({ type: "send" })).toBe(false));
  it("returns false for receive", () => expect(isDecision({ type: "receive" })).toBe(false));
  it("returns false for undefined", () => expect(isDecision({ type: undefined })).toBe(false));
});

describe("BPMN-03: StepDialog type restoration logic", () => {
  const VALID_TYPES = ["task","decision","start","end","terminate","send","receive","and"] as const;
  type StepType = typeof VALID_TYPES[number];

  function restoreType(raw: string | undefined): StepType {
    return VALID_TYPES.includes(raw as StepType) ? (raw as StepType) : "task";
  }

  it("restores each valid type to itself", () => {
    for (const t of VALID_TYPES) expect(restoreType(t)).toBe(t);
  });
  it("falls back to 'task' for undefined", () => expect(restoreType(undefined)).toBe("task"));
  it("falls back to 'task' for unknown string", () => expect(restoreType("bogus")).toBe("task"));
});
