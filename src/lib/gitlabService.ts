// In dev, requests are proxied through Vite to avoid CORS issues.
// In production, GitLab allows cross-origin requests from browsers.
const GITLAB_BASE = import.meta.env.DEV ? "/gitlab-api" : "https://gitlab.com";

/**
 * Fetches the decoded text content of a file from GitLab.
 * Throws if the file is not found or the token is invalid.
 */
export async function fetchGitlabFileContent(
  projectId: string,
  filePath: string,
  branch: string,
  token: string
): Promise<string> {
  const encoded = encodeURIComponent(filePath);
  const res = await fetch(
    `${GITLAB_BASE}/api/v4/projects/${projectId}/repository/files/${encoded}?ref=${encodeURIComponent(branch)}`,
    { headers: { "PRIVATE-TOKEN": token } }
  );
  if (!res.ok) {
    throw new Error(`GitLab bestand ophalen mislukt (${res.status}): ${filePath}`);
  }
  const data = await res.json();
  // GitLab returns content as base64 with embedded newlines
  if (typeof data.content !== "string") {
    throw new Error(`GitLab API: onverwacht antwoordformaat voor ${filePath}`);
  }
  return atob(data.content.replace(/\n/g, ""));
}

/**
 * Returns the ISO timestamp of the most recent commit that touched this file.
 * Returns "onbekend" if no commit is found or the request fails.
 */
export async function fetchGitlabLastCommit(
  projectId: string,
  filePath: string,
  branch: string,
  token: string
): Promise<string> {
  const res = await fetch(
    `${GITLAB_BASE}/api/v4/projects/${projectId}/repository/commits?path=${encodeURIComponent(filePath)}&ref_name=${encodeURIComponent(branch)}&per_page=1`,
    { headers: { "PRIVATE-TOKEN": token } }
  );
  if (!res.ok) {
    console.warn(`GitLab commits ophalen mislukt (${res.status}): ${filePath}`);
    return "onbekend";
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return "onbekend";
  const ts = (data[0] as { created_at?: string }).created_at;
  return typeof ts === "string" ? ts : "onbekend";
}
