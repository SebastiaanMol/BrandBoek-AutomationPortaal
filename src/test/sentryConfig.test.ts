import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "@/lib/sentry";

describe("sentry config", () => {
  it("scrubs likely secrets and email addresses from event extras", () => {
    const event = scrubSentryEvent({
      message: "save failed",
      extra: {
        email: "person@example.com",
        token: "pat-secret-token",
        pipelineId: "pipe-1",
      },
    });

    expect(event.extra).toEqual({
      email: "[Filtered]",
      token: "[Filtered]",
      pipelineId: "pipe-1",
    });
  });
});
