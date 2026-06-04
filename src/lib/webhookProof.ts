import type { Automatisering } from "./types";
import {
  collectIncomingRoutes,
  collectOutgoingRoutes,
  getExactWebhookProofBetween,
  normalizeWebhookRoute as normalizeAutomationRoute,
} from "./automationRouteGraph";

export interface ExactWebhookProof {
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
}

export function getExactWebhookProof(
  from?: Automatisering,
  to?: Automatisering,
): ExactWebhookProof | null {
  return getExactWebhookProofBetween(from, to);
}

export function hasExactWebhookProof(from?: Automatisering, to?: Automatisering): boolean {
  return getExactWebhookProof(from, to) !== null;
}

export function collectWebhookHandoffPaths(automation: Automatisering): string[] {
  return collectOutgoingRoutes(automation).map((route) => route.path);
}

export function collectWebhookReceiverPaths(automation: Automatisering): string[] {
  return collectIncomingRoutes(automation).map((route) => route.path);
}

export function normalizeWebhookRoute(value: string | null | undefined): string {
  return normalizeAutomationRoute(value);
}
