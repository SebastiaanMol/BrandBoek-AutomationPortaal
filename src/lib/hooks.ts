import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, updateGitlabData } from "./supabaseStorage";
import { Automatisering } from "./types";
import { fetchGitlabFileContent, fetchGitlabLastCommit } from "./gitlabService";
import { generateAiDescription } from "./codeReaderService";

export function useAutomatiseringen() {
  return useQuery({
    queryKey: ["automatiseringen"],
    queryFn: fetchAutomatiseringen,
  });
}

export function useSaveAutomatisering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Automatisering) => insertAutomatisering(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
    },
  });
}

export function useUpdateAutomatisering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Automatisering) => updateAutomatisering(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
    },
  });
}

export function useDeleteAutomatisering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAutomatisering(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
    },
  });
}

export function useVerifieerAutomatisering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, door, status }: { id: string; door: string; status?: string }) =>
      verifieerAutomatisering(id, door, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
    },
  });
}

export function useNextId() {
  return useQuery({
    queryKey: ["nextAutoId"],
    queryFn: generateNextId,
  });
}

export function useIntegration(type: string) {
  return useQuery({
    queryKey: ["integration", type],
    queryFn: () => fetchIntegration(type),
  });
}

export function useSaveIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, token }: { type: string; token: string }) => saveIntegration(type, token),
    onSuccess: (_data, { type }) => {
      queryClient.invalidateQueries({ queryKey: ["integration", type] });
    },
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: string) => deleteIntegration(type),
    onSuccess: (_data, type) => {
      queryClient.invalidateQueries({ queryKey: ["integration", type] });
    },
  });
}

export function useHubSpotSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerHubSpotSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "hubspot"] });
    },
  });
}

export function useZapierSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerZapierSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "zapier"] });
    },
  });
}

export function useTypeformSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerTypeformSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "typeform"] });
    },
  });
}

export function useGitlabSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> => {
      const integration = await fetchIntegration("gitlab");
      if (!integration) throw new Error("GitLab niet verbonden");

      let pat: string, projectId: string, branch: string;
      try {
        ({ pat, projectId, branch } = JSON.parse(integration.token) as {
          pat: string;
          projectId: string;
          branch: string;
        });
      } catch {
        throw new Error("GitLab configuratie ongeldig — sla de verbinding opnieuw op");
      }

      const automations = await fetchAutomatiseringen();
      const withGitlab = automations.filter((a) => a.gitlabFilePath);

      if (withGitlab.length === 0) {
        throw new Error("Geen automations gevonden met een GitLab bestandspad");
      }

      let synced = 0;
      const failures: string[] = [];

      for (const a of withGitlab) {
        try {
          const fileContent = await fetchGitlabFileContent(projectId, a.gitlabFilePath!, branch, pat);
          const lastCommit = await fetchGitlabLastCommit(projectId, a.gitlabFilePath!, branch, pat);
          const aiDescription = await generateAiDescription(fileContent);
          await updateGitlabData(a.id, {
            gitlabFilePath: a.gitlabFilePath!,
            gitlabLastCommit: lastCommit,
            aiDescription,
          });
          synced++;
        } catch (e: any) {
          failures.push(`${a.naam}: ${(e as Error).message}`);
        }
      }

      if (failures.length > 0) {
        console.warn("GitLab sync gedeeltelijk mislukt:", failures);
      }
      return { inserted: 0, updated: synced, deactivated: 0, total: withGitlab.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "gitlab"] });
    },
  });
}
