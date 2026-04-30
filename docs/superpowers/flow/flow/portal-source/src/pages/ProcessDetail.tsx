import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProcess } from "@/data/portal";
import { ProcessHeader } from "@/components/flow/ProcessHeader";
import { ProcessFlowCanvas } from "@/components/flow/ProcessFlowCanvas";
import { AutomationList } from "@/components/flow/AutomationList";
import { AutomationDetail } from "@/components/flow/AutomationDetail";
import { ArrowLeft, Info, LayoutGrid, ListOrdered } from "lucide-react";

const ProcessDetail = () => {
  const { id } = useParams<{ id: string }>();
  const process = id ? getProcess(id) : undefined;

  const [selectedId, setSelectedId] = useState<string | null>(
    process?.automationIds[0] ?? null
  );
  const [view, setView] = useState<"flow" | "steps">("flow");

  if (!process) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Proces niet gevonden.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar overzicht
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 space-y-6 animate-fade-in">
        <ProcessHeader process={process} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* Left: visual flow */}
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Visuele flow
                </h2>
                <p className="text-sm text-muted-foreground">
                  {view === "flow"
                    ? "Elke node is één losse automation. Klik om de interne stappen te zien."
                    : "Alle automations in volgorde. Klik om te selecteren."}
                </p>
              </div>
              <div className="inline-flex items-center p-0.5 rounded-lg bg-secondary border border-border">
                <ToggleBtn
                  active={view === "flow"}
                  onClick={() => setView("flow")}
                  icon={<LayoutGrid className="w-3.5 h-3.5" />}
                  label="Flow"
                />
                <ToggleBtn
                  active={view === "steps"}
                  onClick={() => setView("steps")}
                  icon={<ListOrdered className="w-3.5 h-3.5" />}
                  label="Stappen"
                />
              </div>
            </div>
            {view === "flow" ? (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-primary-soft border border-primary/20 text-xs text-foreground/80 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <p>
                  Deze flow leest je van boven naar beneden: het proces start
                  bovenaan en loopt via de verbonden automations naar het
                  eindresultaat. Elke gekleurde node is een losse automation in
                  een specifiek systeem. <span className="font-semibold text-foreground">Klik op een node</span> voor de interne
                  stappen en zie aan de <span className="font-semibold text-primary">↻ badge</span> of een automation ook in andere processen
                  wordt hergebruikt.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-primary-soft border border-primary/20 text-xs text-foreground/80 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <p>
                  Hier zie je alle automations die samen dit proces vormen, in
                  de volgorde waarin ze worden uitgevoerd. <span className="font-semibold text-foreground">Klik op een stap</span> om
                  rechts te zien wat de automation precies doet, welk systeem
                  hem uitvoert en uit welke interne acties hij bestaat.
                </p>
              </div>
            )}
            <div className="card-elevated overflow-hidden h-[680px]">
              {view === "flow" ? (
                <ProcessFlowCanvas
                  process={process}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : (
                <div className="h-full overflow-y-auto p-5">
                  <AutomationList
                    process={process}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Right: details */}
          <aside className="space-y-4 lg:sticky lg:top-6 self-start">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Geselecteerde automation
              </h2>
              <p className="text-sm text-muted-foreground">
                Wat deze automation doet, in mensentaal.
              </p>
            </div>
            <AutomationDetail
              automationId={selectedId}
              currentProcessId={process.id}
              onClose={() => setSelectedId(null)}
            />

            <div className="card-elevated p-4">
              <p className="px-1 pb-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Alle automations in dit proces
              </p>
              <AutomationList
                process={process}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ProcessDetail;

const ToggleBtn = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
      active
        ? "bg-card text-foreground shadow-xs"
        : "text-muted-foreground hover:text-foreground"
    }`}
  >
    {icon}
    {label}
  </button>
);
