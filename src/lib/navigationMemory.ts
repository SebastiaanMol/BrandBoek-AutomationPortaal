export type NavigationMemoryKey = "automations" | "flows" | "pipelines";

export interface NavigationMemoryEntry<TData extends Record<string, unknown> = Record<string, unknown>> {
  pathname: string;
  search: string;
  hash: string;
  scrollY: number;
  updatedAt: number;
  data?: TData;
}

const STORAGE_PREFIX = "automationNavigator.navigation.";

export function rememberCurrentRoute<TData extends Record<string, unknown>>(
  key: NavigationMemoryKey,
  data?: TData,
): void {
  if (typeof window === "undefined") return;

  const entry: NavigationMemoryEntry<TData> = {
    pathname: window.location.pathname || "/",
    search: window.location.search || "",
    hash: window.location.hash || "",
    scrollY: Math.max(0, Math.round(window.scrollY || 0)),
    updatedAt: Date.now(),
    data,
  };

  writeNavigationMemory(key, entry);
}

export function getNavigationReturnHref(
  key: NavigationMemoryKey,
  fallbackPath: string,
): string {
  const entry = readNavigationMemory(key);
  if (!entry?.pathname) return fallbackPath;
  return `${entry.pathname}${entry.search ?? ""}${entry.hash ?? ""}`;
}

export function readNavigationMemoryData<TData extends Record<string, unknown>>(
  key: NavigationMemoryKey,
): TData | null {
  const entry = readNavigationMemory<TData>(key);
  return entry?.data ?? null;
}

export function restoreNavigationScroll(
  key: NavigationMemoryKey,
  behavior: ScrollBehavior = "auto",
): void {
  if (typeof window === "undefined") return;
  const entry = readNavigationMemory(key);
  if (!entry || entry.scrollY <= 0) return;

  window.setTimeout(() => {
    window.scrollTo({ top: entry.scrollY, left: 0, behavior });
  }, 0);
}

export function readNavigationMemory<TData extends Record<string, unknown> = Record<string, unknown>>(
  key: NavigationMemoryKey,
): NavigationMemoryEntry<TData> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NavigationMemoryEntry<TData>>;
    if (!parsed || typeof parsed.pathname !== "string") return null;

    return {
      pathname: parsed.pathname,
      search: typeof parsed.search === "string" ? parsed.search : "",
      hash: typeof parsed.hash === "string" ? parsed.hash : "",
      scrollY: typeof parsed.scrollY === "number" ? parsed.scrollY : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
      data: isRecord(parsed.data) ? parsed.data as TData : undefined,
    };
  } catch {
    return null;
  }
}

function writeNavigationMemory<TData extends Record<string, unknown>>(
  key: NavigationMemoryKey,
  entry: NavigationMemoryEntry<TData>,
): void {
  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Best effort only. Navigation must keep working even if storage is unavailable.
  }
}

function storageKey(key: NavigationMemoryKey): string {
  return `${STORAGE_PREFIX}${key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
