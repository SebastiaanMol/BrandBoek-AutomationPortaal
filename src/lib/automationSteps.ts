export function normalizeAutomationSteps(
  steps: string[] | null | undefined,
  source?: string | null,
): string[] {
  const cleaned = (steps ?? [])
    .map((step) => step.trim())
    .filter(Boolean);

  if ((source ?? "").toLowerCase() !== "hubspot") {
    return cleaned;
  }

  const counts = new Map<string, number>();
  const firstByKey = new Map<string, string>();
  const orderedKeys: string[] = [];

  for (const step of cleaned) {
    const key = normalizeStepKey(step);
    if (!counts.has(key)) {
      counts.set(key, 0);
      firstByKey.set(key, step);
      orderedKeys.push(key);
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return orderedKeys.map((key) => {
    const step = firstByKey.get(key) ?? key;
    const count = counts.get(key) ?? 1;
    return count > 1 ? `${step} (${count} paden)` : step;
  });
}

function normalizeStepKey(step: string): string {
  return step.replace(/\s+/g, " ").trim().toLowerCase();
}
