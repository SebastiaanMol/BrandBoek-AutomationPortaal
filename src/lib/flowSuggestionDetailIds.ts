const EDGE_DETAIL_PREFIX = "edge:";
const EDGE_DETAIL_SEPARATOR = "~";

export function buildSuggestionEdgeDetailId(fromId: string, toId: string): string {
  return `${EDGE_DETAIL_PREFIX}${encodeURIComponent(fromId)}${EDGE_DETAIL_SEPARATOR}${encodeURIComponent(toId)}`;
}

export function parseSuggestionEdgeDetailId(value: string): { fromId: string; toId: string } | null {
  if (!value.startsWith(EDGE_DETAIL_PREFIX)) return null;
  const body = value.slice(EDGE_DETAIL_PREFIX.length);
  const [fromPart, toPart] = body.split(EDGE_DETAIL_SEPARATOR);
  if (!fromPart || !toPart) return null;

  try {
    return {
      fromId: decodeURIComponent(fromPart),
      toId: decodeURIComponent(toPart),
    };
  } catch {
    return null;
  }
}
