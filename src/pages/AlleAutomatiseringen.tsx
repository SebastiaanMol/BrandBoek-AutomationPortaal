import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAutomatiseringen, useDeleteAutomatisering } from "@/lib/hooks";
import { exportToCSV } from "@/lib/supabaseStorage";
import { CATEGORIEEN, SYSTEMEN, STATUSSEN, Systeem } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Download, Search as SearchIcon, Loader2, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function AlleAutomatiseringen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, isLoading } = useAutomatiseringen();
  const deleteMutation = useDeleteAutomatisering();
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
      <h1 className="sr-only">All Automations</h1>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all fields..." className="pl-9" />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Categorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">All categories</SelectItem>
              {CATEGORIEEN.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sysFilter} onValueChange={setSysFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Systeem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">All systems</SelectItem>
              {SYSTEMEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">All statuses</SelectItem>
              {STATUSSEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{filtered.length} results</p>
          <button
            onClick={downloadCSV}
            className="inline-flex items-center gap-2 bg-card border border-border px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors"
          >
            <Download className="h-4 w-4" /> Download CSV
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
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="font-mono text-xs text-muted-foreground shrink-0 w-[72px]">{a.id}</span>
                <span className="font-medium truncate w-[280px] shrink-0" title={a.naam}>{a.naam}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <CategorieBadge categorie={a.categorie} />
                  <SystemBadge systeem={a.systemen[0] || "Anders"} />
                  <StatusBadge status={a.status} />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
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
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => navigate(`/bewerk/${a.id}`)}
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete automation?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete <strong>{a.id} — {a.naam}</strong>? This also removes all links. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Automation</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={async () => {
                                try {
                                  await deleteMutation.mutateAsync(a.id);
                                  setOpenId(null);
                                  toast.success(`${a.id} deleted`);
                                } catch (err: any) {
                                  toast.error(err.message || "Delete failed");
                                }
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Detail label="Source System" value={a.categorie} />
                      <Detail label="Goal" value={a.doel} />
                      <Detail label="Trigger" value={a.trigger} />
                      <Detail label="Owner" value={a.owner} />
                      <Detail label="Dependencies" value={a.afhankelijkheden} />
                    </div>
                    <div>
                      <p className="label-uppercase mb-1">Systems</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
                      </div>
                    </div>
                    <div>
                      <p className="label-uppercase mb-1">Flow Steps</p>
                      <ol className="list-decimal list-inside text-sm text-foreground space-y-0.5">
                        {a.stappen.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                    {a.verbeterideeën && <Detail label="Improvement Ideas" value={a.verbeterideeën} />}
                    {a.mermaidDiagram && (
                      <div>
                        <p className="label-uppercase mb-2">Flow Diagram</p>
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
      {filtered.length === 0 && <p className="text-muted-foreground text-sm">No results found.</p>}
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
