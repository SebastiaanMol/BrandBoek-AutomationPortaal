import { useMemo, useState } from "react";
import { getAutomatiseringen, exportToCSV } from "@/lib/storage";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Download } from "lucide-react";

export default function AlleAutomatiseringen() {
  const data = useMemo(() => getAutomatiseringen(), []);
  const [openId, setOpenId] = useState<string | null>(null);

  const downloadCSV = () => {
    const csv = exportToCSV(data);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "automatiseringen.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">{data.length} automatiseringen</p>
        <button
          onClick={downloadCSV}
          className="inline-flex items-center gap-2 bg-card border border-border px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors"
        >
          <Download className="h-4 w-4" /> CSV Downloaden
        </button>
      </div>

      {data.map((a) => {
        const isOpen = openId === a.id;
        return (
          <div key={a.id} className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : a.id)}
              className="w-full px-5 py-4 flex items-center gap-3 justify-between text-left hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs text-muted-foreground shrink-0">{a.id}</span>
                <span className="font-medium truncate">{a.naam}</span>
                <CategorieBadge categorie={a.categorie} />
                <StatusBadge status={a.status} />
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 pt-2 border-t border-border space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <Detail label="Doel" value={a.doel} />
                      <Detail label="Trigger" value={a.trigger} />
                      <Detail label="Owner" value={a.owner} />
                      <Detail label="Afhankelijkheden" value={a.afhankelijkheden} />
                    </div>
                    <div>
                      <p className="label-uppercase mb-1">Systemen</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
                      </div>
                    </div>
                    <div>
                      <p className="label-uppercase mb-1">Stappen</p>
                      <ol className="list-decimal list-inside text-sm text-foreground space-y-0.5">
                        {a.stappen.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                    {a.verbeterideeën && <Detail label="Verbeterideeën" value={a.verbeterideeën} />}
                    {a.mermaidDiagram && (
                      <div>
                        <p className="label-uppercase mb-2">BPMN Diagram</p>
                        <MermaidDiagram chart={a.mermaidDiagram} />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-uppercase mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}
