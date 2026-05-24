export type GitLabAutomationStatus = "Actief" | "Uitgeschakeld";

export interface GitLabCallSummary {
  depth: number;
  kind: string;
  from: string;
  to: string;
  file: string | null;
}

export interface GitLabEndpointAutomationInput {
  externalId: string;
  name: string;
  method: string;
  endpoint: string;
  apiFile: string;
  handler: string;
  systems: string[];
  phases?: string[];
  blobId?: string | null;
  calls: GitLabCallSummary[];
}

export interface GitLabStandardStep {
  index: number;
  kind: "trigger" | "process" | "outcome";
  title: string;
  summary: string;
  details: string[];
  evidenceRefs: string[];
}

export interface GitLabStandardProcess {
  source: "gitlab";
  trigger: string;
  outcome: string;
  systems: string[];
  handoffs: Array<{
    from: string;
    to: string;
    kind: string;
    evidence: string;
  }>;
  steps: GitLabStandardStep[];
  confidence: {
    evidence: "fastapi_endpoint_analysis";
    trigger: "derived";
    outcome: "derived";
    steps: "derived";
  };
}

export interface GitLabAutomationPayload {
  naam: string;
  categorie: "Backend Script";
  doel: string;
  trigger_beschrijving: string;
  systemen: string[];
  stappen: string[];
  afhankelijkheden: string;
  owner: string;
  status: GitLabAutomationStatus;
  verbeterideeen: string;
  mermaid_diagram: string;
  fasen: string[];
  endpoints: string[];
  webhook_paths: string[];
  external_id: string;
  source: "gitlab";
  import_source: "gitlab";
  import_status: "approved";
  gitlab_file_path: string;
  gitlab_last_commit: string | null;
  last_synced_at: string;
  import_proposal: {
    source: "gitlab";
    read_only: true;
    standard: GitLabStandardProcess;
    gitlab: {
      endpoint: {
        method: string;
        path: string;
        api_file: string;
        handler: string;
      };
      calls: GitLabCallSummary[];
      hubspotReads: GitLabCallSummary[];
      hubspotWrites: GitLabCallSummary[];
      internalCalls: GitLabCallSummary[];
      backgroundTasks: GitLabCallSummary[];
    };
    summary: string[];
    webhookPaths: string[];
    beschrijving_in_simpele_taal: string[];
    gitlab_endpoint: {
      method: string;
      endpoint: string;
      api_file: string;
      handler: string;
      calls: GitLabCallSummary[];
    };
  };
}

export function mapGitLabEndpointToAutomationPayload(
  input: GitLabEndpointAutomationInput,
  now: string,
): GitLabAutomationPayload {
  const operationName = toFunctionalOperationName(input.name || input.handler);
  const systems = inferGitLabSystems(input);
  const technical = splitGitLabCalls(input.calls);
  const standard = buildGitLabStandardProcess(input, operationName, systems, technical);

  return {
    naam: operationName,
    categorie: "Backend Script",
    doel: buildGoal(operationName, systems, technical),
    trigger_beschrijving: standard.trigger,
    systemen: systems,
    stappen: standard.steps.map((step) => `${step.index}. ${step.summary}`),
    afhankelijkheden: "GitLab endpoint-analyse; technische details staan onder Logica.",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaid_diagram: "",
    fasen: input.phases ?? [],
    endpoints: [input.endpoint],
    webhook_paths: [],
    external_id: input.externalId,
    source: "gitlab",
    import_source: "gitlab",
    import_status: "approved",
    gitlab_file_path: input.apiFile,
    gitlab_last_commit: input.blobId ?? null,
    last_synced_at: now,
    import_proposal: {
      source: "gitlab",
      read_only: true,
      standard,
      gitlab: {
        endpoint: {
          method: input.method,
          path: input.endpoint,
          api_file: input.apiFile,
          handler: input.handler,
        },
        calls: input.calls,
        ...technical,
      },
      summary: [
        standard.trigger,
        standard.outcome,
        "Technisch bewijs zoals route, handler en callgraph staat onder Logica.",
      ],
      webhookPaths: [],
      beschrijving_in_simpele_taal: standard.steps.map((step) => step.summary),
      // Legacy key for existing UI and flow-link code while the new gitlab layer rolls out.
      gitlab_endpoint: {
        method: input.method,
        endpoint: input.endpoint,
        api_file: input.apiFile,
        handler: input.handler,
        calls: input.calls,
      },
    },
  };
}

function buildGitLabStandardProcess(
  input: GitLabEndpointAutomationInput,
  operationName: string,
  systems: string[],
  technical: ReturnType<typeof splitGitLabCalls>,
): GitLabStandardProcess {
  const mainSystem = primaryBusinessSystem(systems);
  const hasWrites = technical.hubspotWrites.length > 0;
  const hasReads = technical.hubspotReads.length > 0;
  const hasInternalLogic = technical.internalCalls.length > 0 || technical.backgroundTasks.length > 0;

  const steps: GitLabStandardStep[] = [
    {
      index: 1,
      kind: "trigger",
      title: "De verwerking wordt gestart",
      summary: `Een gekoppelde workflow of externe automation geeft de verwerking "${operationName}" door aan de backend.`,
      details: [
        `Functioneel betekent dit dat het portaal bewijs heeft dat deze backendverwerking kan worden aangeroepen vanuit een ander systeem.`,
      ],
      evidenceRefs: ["gitlab.endpoint"],
    },
    {
      index: 2,
      kind: "process",
      title: "De backend past proceslogica toe",
      summary: hasInternalLogic
        ? `De backend voert de onderliggende procesregels uit en gebruikt daarvoor service- of helperlogica.`
        : `De backend verwerkt de binnengekomen context volgens de bekende backendlogica.`,
      details: hasReads
        ? [`De verwerking leest eerst actuele ${mainSystem}-context voordat de uitkomst wordt bepaald.`]
        : [`De verwerking gebruikt de beschikbare request- en systeemcontext om de uitkomst te bepalen.`],
      evidenceRefs: ["gitlab.calls"],
    },
    {
      index: 3,
      kind: "outcome",
      title: "De uitkomst wordt verwerkt",
      summary: hasWrites
        ? `De backend werkt ${mainSystem}-gegevens bij, zodat de operationele status actueel blijft.`
        : `De backend rondt de verwerking af; een zichtbare terugschrijving wordt alleen getoond als die uit de code blijkt.`,
      details: [
        `Een vervolgstap wordt pas gekoppeld wanneer een concrete workflowtrigger of webhook-match bewezen is.`,
      ],
      evidenceRefs: hasWrites ? ["gitlab.hubspotWrites"] : ["gitlab.calls"],
    },
  ];

  return {
    source: "gitlab",
    trigger: `Een gekoppelde workflow of externe automation geeft de verwerking "${operationName}" door aan de backend.`,
    outcome: hasWrites
      ? `De backend werkt ${mainSystem}-gegevens bij en houdt de processtatus actueel.`
      : `De backend verwerkt "${operationName}" en rondt de run af zonder bewezen directe HubSpot-terugschrijving.`,
    systems,
    handoffs: [
      {
        from: "Externe automation",
        to: "GitLab backend",
        kind: "backend_call",
        evidence: "fastapi_endpoint_analysis",
      },
    ],
    steps,
    confidence: {
      evidence: "fastapi_endpoint_analysis",
      trigger: "derived",
      outcome: "derived",
      steps: "derived",
    },
  };
}

function buildGoal(
  operationName: string,
  systems: string[],
  technical: ReturnType<typeof splitGitLabCalls>,
): string {
  const mainSystem = primaryBusinessSystem(systems);
  if (technical.hubspotWrites.length > 0) {
    return `Deze backendverwerking voert "${operationName}" uit en werkt ${mainSystem}-gegevens bij zodat de processtatus actueel blijft.`;
  }
  if (systems.includes("WeFact")) {
    return `Deze backendverwerking voert "${operationName}" uit en houdt de koppeling met WeFact bruikbaar voor facturatieprocessen.`;
  }
  return `Deze backendverwerking voert "${operationName}" uit en past de bijbehorende proceslogica toe.`;
}

function splitGitLabCalls(calls: GitLabCallSummary[]) {
  const backgroundTasks = calls.filter((call) => call.kind === "background_task");
  const hubspotCalls = calls.filter(isHubSpotCall);
  const hubspotReads = hubspotCalls.filter(isReadCall);
  const hubspotWrites = hubspotCalls.filter((call) => !isReadCall(call) && isWriteCall(call));
  const internalCalls = calls.filter((call) => call.kind !== "background_task");

  return {
    hubspotReads,
    hubspotWrites,
    internalCalls,
    backgroundTasks,
  };
}

function inferGitLabSystems(input: GitLabEndpointAutomationInput): string[] {
  const text = [
    input.endpoint,
    input.apiFile,
    input.handler,
    ...input.systems,
    ...input.calls.flatMap((call) => [call.from, call.to, call.file ?? ""]),
  ].join(" ").toLowerCase();

  const systems = ["GitLab", "Backend"];
  for (const [needle, label] of [
    ["hubspot", "HubSpot"],
    ["typeform", "Typeform"],
    ["zapier", "Zapier"],
    ["clockify", "Clockify"],
    ["kvk", "KvK"],
    ["wefact", "WeFact"],
    ["sharepoint", "SharePoint"],
    ["graph", "Microsoft Graph"],
  ] as const) {
    if (text.includes(needle)) systems.push(label);
  }

  for (const system of input.systems) {
    if (system && !systems.includes(system)) systems.push(system);
  }

  return unique(systems);
}

function primaryBusinessSystem(systems: string[]): string {
  return systems.find((system) => !["GitLab", "Backend"].includes(system)) ?? "de betrokken systemen";
}

function toFunctionalOperationName(value: string): string {
  const clean = value
    .split("::")
    .at(-1)!
    .replace(/^_+/, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "Backendverwerking";
  return `${clean[0].toUpperCase()}${clean.slice(1)}`;
}

function isHubSpotCall(call: GitLabCallSummary): boolean {
  return [call.from, call.to, call.file ?? ""].join(" ").toLowerCase().includes("hubspot");
}

function isReadCall(call: GitLabCallSummary): boolean {
  const text = [call.to, call.file ?? ""].join(" ").toLowerCase();
  return /(get|fetch|read|search|find|list|retrieve)/.test(text);
}

function isWriteCall(call: GitLabCallSummary): boolean {
  const text = [call.to, call.file ?? ""].join(" ").toLowerCase();
  return /(create|update|upsert|delete|patch|write|set|sync|batch_create|archive|restore)/.test(text);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
