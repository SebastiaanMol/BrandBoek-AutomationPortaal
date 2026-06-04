import { AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getAutomationChainReactionPresentation,
  type AutomationChainReactionEdge,
  type AutomationChainReactionNode,
  type AutomationChainReactionNodeTone,
} from "@/lib/automationChainReactionPresentation";
import type { Automatisering } from "@/lib/types";

interface AutomationChainReactionCardProps {
  startAutomation: Automatisering;
  automations: Automatisering[];
}

type ChainItem =
  | { kind: "node"; node: AutomationChainReactionNode }
  | { kind: "edge"; edge: AutomationChainReactionEdge };

export function AutomationChainReactionCard({
  startAutomation,
  automations,
}: AutomationChainReactionCardProps): React.ReactNode {
  const presentation = getAutomationChainReactionPresentation({ startAutomation, automations });
  const chainItems = buildChainItems(presentation.nodes, presentation.edges);

  return (
    <section aria-label="Kettingreactie vanaf deze automation" className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Los van procesreis</p>
          <h2 className="mt-1 text-lg font-bold tracking-normal text-slate-950">Kettingreactie vanaf deze automation</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{presentation.subtitle}</p>
        </div>
        <span className="inline-flex w-fit shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
          {presentation.hasChain ? "Hard bewijs" : "Geen vervolgbewijs"}
        </span>
      </div>

      <div className="mt-5 max-w-full overflow-x-auto pb-2">
        <div className="flex w-max min-w-full items-stretch">
          {chainItems.map((item, index) => {
            if (item.kind === "edge") return <ChainArrow key={`${item.edge.id}-${index}`} edge={item.edge} />;
            return <ChainNode key={`${item.node.id}-${index}`} node={item.node} />;
          })}
        </div>
      </div>

      {presentation.gaps.length > 0 && (
        <div className="mt-5 grid gap-3">
          {presentation.gaps.map((gap) => (
            <div
              key={`${gap.title}-${gap.description}`}
              className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold">{gap.title}</p>
                  <span className="rounded-full border border-amber-200 bg-white/70 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                    {gap.tag}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-amber-900">{gap.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ChainNode({ node }: { node: AutomationChainReactionNode }): React.ReactNode {
  const content = (
    <div className={`flex min-h-[128px] w-[240px] shrink-0 flex-col justify-between rounded-2xl border p-4 ${nodeToneClass(node.tone)}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sourcePillClass(node.tone)}`}>
            {node.sourceLabel}
          </span>
        </div>
        <h3 className="mt-3 break-words text-sm font-bold leading-6 text-slate-950">{node.title}</h3>
        <p className="mt-1 break-words text-xs leading-5 text-slate-600">{node.subtitle}</p>
      </div>
      {node.badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {node.badges.slice(0, 2).map((badge) => (
            <span key={badge} className="max-w-full truncate rounded-full border border-white/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {badge}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  if (!node.href) return content;
  return (
    <Link to={node.href} className="shrink-0 transition-transform hover:-translate-y-0.5">
      {content}
    </Link>
  );
}

function ChainArrow({ edge }: { edge: AutomationChainReactionEdge }): React.ReactNode {
  return (
    <div className="flex w-[172px] shrink-0 flex-col justify-center px-3 text-center">
      <span className={`mx-auto mb-2 max-w-full rounded-full px-2.5 py-1 text-[11px] font-bold ${edgeBadgeClass(edge.tone)}`}>
        {edge.label}
      </span>
      <div className="flex items-center justify-center">
        <span className="h-px flex-1 bg-slate-300" />
        <ArrowRight className="mx-1 h-5 w-5 shrink-0 text-slate-900" />
        <span className="h-px flex-1 bg-slate-300" />
      </div>
      <p className="mt-2 break-words text-[11px] leading-4 text-slate-500">{edge.evidence}</p>
    </div>
  );
}

function buildChainItems(
  nodes: AutomationChainReactionNode[],
  edges: AutomationChainReactionEdge[],
): ChainItem[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  if (edges.length === 0) {
    return nodes.slice(0, 1).map((node) => ({ kind: "node", node }));
  }

  const items: ChainItem[] = [];
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.fromId);
    const toNode = nodeMap.get(edge.toId);
    const lastItem = items[items.length - 1];
    if (fromNode && !(lastItem?.kind === "node" && lastItem.node.id === fromNode.id)) {
      items.push({ kind: "node", node: fromNode });
    }
    items.push({ kind: "edge", edge });
    if (toNode) items.push({ kind: "node", node: toNode });
  }
  return items;
}

function nodeToneClass(tone: AutomationChainReactionNodeTone): string {
  if (tone === "hubspot") return "border-blue-200 bg-blue-50";
  if (tone === "gitlab") return "border-slate-300 bg-slate-50";
  if (tone === "zapier") return "border-orange-200 bg-orange-50";
  if (tone === "typeform") return "border-violet-200 bg-violet-50";
  if (tone === "stop") return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-slate-50";
}

function sourcePillClass(tone: AutomationChainReactionNodeTone): string {
  if (tone === "hubspot") return "bg-blue-100 text-blue-700";
  if (tone === "gitlab") return "bg-slate-200 text-slate-700";
  if (tone === "zapier") return "bg-orange-100 text-orange-700";
  if (tone === "typeform") return "bg-violet-100 text-violet-700";
  return "bg-slate-200 text-slate-700";
}

function edgeBadgeClass(tone: AutomationChainReactionEdge["tone"]): string {
  if (tone === "good") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border border-amber-200 bg-amber-50 text-amber-700";
  return "border border-slate-200 bg-slate-50 text-slate-600";
}
