import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAutomatiseringen } from "@/lib/hooks";
import { exportToCSV } from "@/lib/supabaseStorage";
import { CATEGORIEEN, SYSTEMEN, STATUSSEN, Systeem } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Download, Search as SearchIcon, Loader2 } from "lucide-react";

export default function AlleAutomatiseringen() {
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useAutomatiseringen();
  const [openId, setOpenId] = useState<string | null>(searchParams.get("open") || null);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("alle");
  const [sysFilter, setSysFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const all = data || [];

  const filtered = all.filter((a) => {
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      Object.values(a).some((v) =>
        typeof v === "string"
          ? v.toLowerCase().includes(q)
          : Array.isArray(v)
            ? v.some((x) => String(x).toLowerCase().includes(q))
            : false
      );
    const matchesCat = catFilter === "alle" || a.categorie === catFilter;
    const matchesSys = sysFilter === "alle" || a.systemen.includes(sysFilter as Systeem);
    const matchesStatus = statusFilter === "alle" || a.status === statusFilter;
    return matchesQuery && matchesCat && matchesSys && matchesStatus;
  });

  const downloadCSV = () => {
    const csv = exportToCSV(filtered);
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek in alle velden..." className="pl-9" />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Categorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle categorieën</SelectItem>
              {CATEGORIEEN.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sysFilter} onValueChange={setSysFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Systeem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle systemen</SelectItem>
              {SYSTEMEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle statussen</SelectItem>
              {STATUSSEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{filtered.length} resultaten</p>
          <button
            onClick={downloadCSV}
            className="inline-flex items-center gap-2 bg-card border border-border px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors"
          >
            <Download className="h-4 w-4" /> CSV Downloaden
          </button>
        </div>
      </div>

      {filtered.map((a) => {
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
      {filtered.length === 0 && <p className="text-muted-foreground text-sm">Geen resultaten gevonden.</p>}
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
