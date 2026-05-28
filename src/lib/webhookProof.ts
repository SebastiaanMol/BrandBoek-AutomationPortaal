import type { Automatisering } from "./types";

export interface ExactWebhookProof {
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
}

export function getExactWebhookProof(
  from?: Automatisering,
  to?: Automatisering,
): ExactWebhookProof | null {
  if (!from || !to) return null;

  const sourcePaths = collectWebhookHandoffPaths(from);
  const targetPaths = collectWebhookReceiverPaths(to);

  for (const sourcePath of sourcePaths) {
    const normalizedSource = normalizeWebhookRoute(sourcePath);
    if (!normalizedSource) continue;

    for (const targetPath of targetPaths) {
      const normalizedTarget = normalizeWebhookRoute(targetPath);
      if (normalizedSource && normalizedSource === normalizedTarget) {
        return {
          sourcePath,
          targetPath,
          normalizedPath: normalizedSource,
        };
      }
    }
  }

  return null;
}

export function hasExactWebhookProof(from?: Automatisering, to?: Automatisering): boolean {
  return getExactWebhookProof(from, to) !== null;
}

export function collectWebhookHandoffPaths(automation: Automatisering): string[] {
  return uniqueRoutes([
    ...(automation.webhookPaths ?? []),
    ...((automation.importProposal?.webhookPaths ?? []) as string[]),
    ...((automation.hubspotWorkflow?.actions ?? [])
      .map((action) => action.webhookPath || action.webhookUrl)
      .filter(Boolean) as string[]),
    ...((automation.importProposal?.zap?.process?.webhookHandoffs ?? []).map((handoff) => handoff.path)),
    ...((automation.importProposal?.zap?.process?.steps ?? []).flatMap((step) => step.webhookPaths ?? [])),
    ...((automation.importProposal?.zap?.steps ?? []).flatMap((step) => step.webhookPaths ?? [])),
    ...((automation.importProposal?.typeform?.webhooks ?? [])
      .map((webhook) => webhook.path)
      .filter(Boolean) as string[]),
    ...((automation.importProposal?.typeform?.process?.webhookHandoffs ?? []).map((handoff) => handoff.path)),
    ...((automation.importProposal?.typeform?.process?.steps ?? []).flatMap((step) => step.webhookPaths ?? [])),
  ]);
}

export function collectWebhookReceiverPaths(automation: Automatisering): string[] {
  return uniqueRoutes([
    automation.gitlabEndpoint?.endpoint,
    automation.importProposal?.gitlab_endpoint?.endpoint,
    automation.importProposal?.gitlab?.endpoint?.path,
    ...(automation.endpoints ?? []),
  ]);
}

export function normalizeWebhookRoute(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";

  const withoutMethod = trimmed.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "");
  let route = withoutMethod;

  try {
    if (/^https?:\/\//i.test(withoutMethod)) {
      const url = new URL(withoutMethod);
      route = url.pathname;
    }
  } catch {
    route = withoutMethod.replace(/^https?:\/\/[^/]+/i, "");
  }

  return route
    .replace(/^https?:\/\/[^/]+/i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/g, "")
    .trim()
    .toLowerCase();
}

function uniqueRoutes(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}
