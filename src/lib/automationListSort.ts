import type { Automatisering, Status } from "./types";

export type AutomationListSortOrder = "created_at" | "naam" | "status";

const STATUS_PRIORITY: Record<Status, number> = {
  Actief: 0,
  "In review": 1,
  Verouderd: 2,
  Uitgeschakeld: 3,
};

export function sortAutomationsForList(
  automations: Automatisering[],
  sortOrder: AutomationListSortOrder,
): Automatisering[] {
  return [...automations].sort((a, b) => {
    const statusDiff = statusPriority(a.status) - statusPriority(b.status);
    if (statusDiff !== 0) return statusDiff;

    if (sortOrder === "naam") {
      const nameDiff = a.naam.localeCompare(b.naam, "nl");
      if (nameDiff !== 0) return nameDiff;
    }

    if (sortOrder === "status") {
      const nameDiff = a.naam.localeCompare(b.naam, "nl");
      if (nameDiff !== 0) return nameDiff;
    }

    const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (createdDiff !== 0) return createdDiff;

    return a.id.localeCompare(b.id, "nl");
  });
}

function statusPriority(status: Status): number {
  return STATUS_PRIORITY[status] ?? 2;
}
