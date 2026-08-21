import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppLayout } from "@/components/AppLayout";

const notificationMocks = vi.hoisted(() => ({
  markSeen: vi.fn(),
  archive: vi.fn(),
}));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "test@example.com" },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/queryHooks/notificationCenter", () => ({
  useNotificationCenter: () => ({
    model: {
      unseenCount: 2,
      openItems: [
        {
          notificationKey: "sentry_linked_error:auto-1:issue-1",
          type: "sentry_linked_error",
          severity: "critical",
          title: "Sentry error in BTW verwerken",
          description: "Automation failed (12 events)",
          sourceLabel: "Sentry AUTOMATIONS-1",
          href: "/automations/auto-1",
          timestamp: "2026-06-18T10:00:00.000Z",
          seenAt: null,
          archivedAt: null,
        },
      ],
      seenItems: [],
      archivedItems: [],
      items: [],
    },
    isLoading: false,
    isError: false,
    markOpenNotificationsSeen: notificationMocks.markSeen,
    archiveNotification: notificationMocks.archive,
  }),
}));

describe("AppLayout notification bell", () => {
  it("shows unread notification count and marks open notifications as seen when closed", async () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <div />
        </AppLayout>
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: /Notificaties/i });
    expect(button).toHaveTextContent("2");

    fireEvent.click(button);
    expect(notificationMocks.markSeen).not.toHaveBeenCalled();

    const dialog = await screen.findByText("Notificaties");
    const popover = dialog.closest("[data-radix-popper-content-wrapper]") ?? dialog.parentElement!;
    expect(within(popover as HTMLElement).getByText("Sentry error in BTW verwerken")).toBeInTheDocument();
    expect(within(popover as HTMLElement).getByRole("link", { name: /Openen/i })).toHaveAttribute("href", "/automations/auto-1");
    fireEvent.click(within(popover as HTMLElement).getByRole("button", { name: /Archiveren/i }));
    expect(notificationMocks.archive).toHaveBeenCalledWith("sentry_linked_error:auto-1:issue-1");

    fireEvent.click(button);
    expect(notificationMocks.markSeen).toHaveBeenCalledTimes(1);
  });
});
