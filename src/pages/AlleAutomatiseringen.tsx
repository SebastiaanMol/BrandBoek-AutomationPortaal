import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAutomatiseringen, useDeleteAutomatisering, usePortalSettings } from "@/lib/hooks";
import { exportToCSV } from "@/lib/supabaseStorage";
import { CATEGORIEEN, SYSTEMEN, STATUSSEN, Systeem, Automatisering } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Download, Search as SearchIcon, Loader2, Pencil, Trash2, Zap, Sparkles } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export default function AlleAutomatiseringen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, isLoading } = useAutomatiseringen();
  const { data: portalSettings } = usePortalSettings();
  const [sortOrder, setSortOrder] = useState<"created_at" | "naam" | "status">("created_at");
  const [settingsApplied, setSettingsApplied] = useState(false);
  const deleteMutation = useDeleteAutomatisering();
  const [openId, setOpenId] = useState<string | null>(searchParams.get("open") || null);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("alle");
  const [sysFilter, setSysFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [koppelingFilter, setKoppelingFilter] = useState<string>("alle");

  // When navigated here with ?open=ID, wait for data then open that item (clear filters so it's visible)
  const pendingOpen = searchParams.get("open");
  useEffect(() => {
    if (!pendingOpen || !data) return;
    const exists = data.some((a) => a.id === pendingOpen);
    if (exists) {
      setOpenId(pendingOpen);
      setQuery("");
      setCatFilter("alle");
      setSysFilter("alle");
      setStatusFilter("alle");
      setKoppelingFilter("alle");
    }
  }, [pendingOpen, data]);

  useEffect(() => {
    if (portalSettings && !settingsApplied) {
      setStatusFilter(portalSettings.standaardStatusFilter);
      setSortOrder(portalSettings.standaardSortering);
      setSettingsApplied(true);
    }
  }, [portalSettings, settingsApplied]);

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
    const matchesKoppeling =
      koppelingFilter === "alle" ||
      (koppelingFilter === "verbonden" && a.koppelingen.length > 0) ||
      (koppelingFilter === "niet-verbonden" && a.koppelingen.length === 0);
    return matchesQuery && matchesCat && matchesSys && matchesStatus && matchesKoppeling;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortOrder === "naam") return a.naam.localeCompare(b.naam, "nl");
    if (sortOrder === "status") return a.status.localeCompare(b.status, "nl");
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
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
          <Select value={koppelingFilter} onValueChange={setKoppelingFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Koppelingen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle koppelingen</SelectItem>
              <SelectItem value="verbonden">Verbonden</SelectItem>
              <SelectItem value="niet-verbonden">Niet verbonden</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as typeof sortOrder)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Sortering" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Aanmaakdatum</SelectItem>
              <SelectItem value="naam">Naam (A–Z)</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{sorted.length} results</p>
          <button
            onClick={downloadCSV}
            className="inline-flex items-center gap-2 bg-card border border-border px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors"
          >
            <Download className="h-4 w-4" /> Download CSV
          </button>
        </div>
      </div>

      {sorted.map((a) => {
        const isOpen = openId === a.id;
        const score = completenessScore(a);
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
                  {a.gitlabFilePath && (
                    <span className="badge-gitlab">GL</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <CompletenessBadge score={score} />
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
                  <div className="px-5 pb-5 pt-3 border-t border-border space-y-5">
                    {/* Actions */}
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => navigate(`/brandy?context=${a.id}&naam=${encodeURIComponent(a.naam)}`)}
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Vraag Brandy
                      </button>
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

                    {/* Plain-language description */}
                    {a.beschrijvingInSimpeleTaal && a.beschrijvingInSimpeleTaal.length > 0 ? (
                      <div className="bg-secondary/40 rounded-md px-4 py-3 space-y-1.5">
                        <p className="label-uppercase mb-2">Wat doet deze automatisering?</p>
                        {a.beschrijvingInSimpeleTaal.map((line, i) => (
                          <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>
                        ))}
                      </div>
                    ) : a.doel ? (
                      <div className="bg-secondary/40 rounded-md px-4 py-3">
                        <p className="label-uppercase mb-1">Wat doet deze automatisering?</p>
                        <p className="text-sm text-foreground leading-relaxed">{a.doel}</p>
                      </div>
                    ) : null}

                    {/* Trigger */}
                    {a.trigger && (
                      <div className="flex items-start gap-2">
                        <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <p className="label-uppercase mb-0.5">Wordt gestart door</p>
                          <p className="text-sm text-foreground">{a.trigger}</p>
                        </div>
                      </div>
                    )}

                    {/* Flow steps */}
                    {a.stappen.length > 0 && (
                      <div>
                        <p className="label-uppercase mb-2">Hoe werkt het?</p>
                        <div className="flex flex-col gap-1.5">
                          {a.stappen.map((s, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">
                                {i + 1}
                              </span>
                              <p className="text-sm text-foreground leading-snug pt-0.5">{s}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Phase + meta row */}
                    <div className="grid md:grid-cols-2 gap-4 pt-1 border-t border-border">
                      {a.fasen && a.fasen.length > 0 && (
                        <div>
                          <p className="label-uppercase mb-1.5">Bedrijfsfasen</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {a.fasen.map((f) => (
                              <span key={f} className="px-2 py-0.5 rounded-full text-[11px] bg-secondary text-foreground border border-border">{f}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {a.owner && <Detail label="Owner" value={a.owner} />}
                      {a.afhankelijkheden && <Detail label="Dependencies" value={a.afhankelijkheden} />}
                    </div>

                    {/* Systems */}
                    <div>
                      <p className="label-uppercase mb-1">Systemen</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
                      </div>
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
      {sorted.length === 0 && <p className="text-muted-foreground text-sm">No results found.</p>}
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

function completenessScore(a: Automatisering): number {
  const checks = [
    !!a.doel?.trim(),
    !!a.trigger?.trim(),
    a.stappen?.length > 0,
    a.systemen?.length > 0,
    !!a.owner?.trim(),
    a.fasen?.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function CompletenessBadge({ score }: { score: number }) {
  const color =
    score === 100 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    score >= 67   ? "text-amber-600 bg-amber-50 border-amber-200" :
                    "text-red-600 bg-red-50 border-red-200";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>
      {score}%
    </span>
  );
}
