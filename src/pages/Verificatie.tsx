import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAutomatiseringen, useVerifieerAutomatisering } from "@/lib/hooks";
import { useAuth } from "@/lib/AuthContext";
import { Automatisering, getVerificatieStatus } from "@/lib/types";
import { CategorieBadge, SystemBadge, StatusBadge } from "@/components/Badges";
import { VerificatieBadge } from "@/components/VerificatieBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check, AlertTriangle, XCircle, Pencil, SkipForward, Keyboard, ChevronLeft, ChevronRight, ChevronDown, Eye, ShieldCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";

function sortForVerification(items: Automatisering[]): Automatisering[] {
  return [...items].sort((a, b) => {
    const statusA = getVerificatieStatus(a);
    const statusB = getVerificatieStatus(b);
    const order = { nooit: 0, verouderd: 1, geverifieerd: 2 };
    if (order[statusA] !== order[statusB]) return order[statusA] - order[statusB];
    const dateA = a.laatstGeverifieerd ? new Date(a.laatstGeverifieerd).getTime() : 0;
    const dateB = b.laatstGeverifieerd ? new Date(b.laatstGeverifieerd).getTime() : 0;
    return dateA - dateB;
  });
}

export default function Verificatie() {
  const { data, isLoading } = useAutomatiseringen();
  const verifieer = useVerifieerAutomatisering();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [notitie, setNotitie] = useState("");
  const [showNotitie, setShowNotitie] = useState<"twijfel" | "verouderd" | null>(null);
  const [direction, setDirection] = useState(1);
  const [history, setHistory] = useState<string[]>([]);
  const [tab, setTab] = useState<string>("verificatie");

  const all = data || [];
  const sorted = sortForVerification(all);
  const verifiedCount = all.filter((a) => getVerificatieStatus(a) === "geverifieerd").length;
  const totalCount = all.length;
  const progress = totalCount > 0 ? (verifiedCount / totalCount) * 100 : 0;

  const inReviewItems = all.filter((a) => a.status === "In review");
  const geverifieerdItems = all.filter((a) => getVerificatieStatus(a) === "geverifieerd");
  const verouderdItems = all.filter((a) => getVerificatieStatus(a) === "verouderd");

  const queue = sorted.filter((a) => !skipped.has(a.id));

  // Determine current item: if browsing history, show that item; otherwise show first in queue
  const currentIdx = currentId ? queue.findIndex((a) => a.id === currentId) : -1;
  const effectiveIdx = currentIdx >= 0 ? currentIdx : 0;
  const current = currentId
    ? all.find((a) => a.id === currentId) || queue[0] || null
    : queue[0] || null;
  const allDone = queue.length === 0 && !currentId;

  // Initialize currentId to first queue item
  const firstQueueId = queue[0]?.id;
  useEffect(() => {
    if (!currentId && firstQueueId) {
      setCurrentId(firstQueueId);
    }
  }, [firstQueueId, currentId]);

  const userName = user?.email?.split("@")[0] || "Onbekend";

  const handleGoToVerify = useCallback((id: string) => {
    setCurrentId(id);
    setTab("verificatie");
    setShowNotitie(null);
    setNotitie("");
  }, []);

  const goNext = useCallback(() => {
    setDirection(1);
    if (current) setHistory((h) => [...h, current.id]);
    // Find next unprocessed item in queue after current
    const idxInQueue = queue.findIndex((a) => a.id === current?.id);
    const nextItems = idxInQueue >= 0 ? queue.slice(idxInQueue + 1) : queue;
    const next = nextItems.find((a) => a.id !== current?.id);
    setCurrentId(next?.id || null);
    setShowNotitie(null);
    setNotitie("");
  }, [queue, current]);

  const goPrev = useCallback(() => {
    if (history.length === 0) return;
    const prevId = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setDirection(-1);
    setCurrentId(prevId);
    setShowNotitie(null);
    setNotitie("");
  }, [history]);

  const handleVerified = useCallback(async () => {
    if (!current) return;
    try {
      await verifieer.mutateAsync({ id: current.id, door: userName });
      toast.success(`${current.id} geverifieerd ✅`);
      goNext();
    } catch (e: any) {
      toast.error(e.message || "Fout bij verificatie");
    }
  }, [current, verifieer, userName, goNext]);

  const handleTwijfel = useCallback(async () => {
    if (!current) return;
    if (!showNotitie) {
      setShowNotitie("twijfel");
      return;
    }
    try {
      await verifieer.mutateAsync({ id: current.id, door: userName, status: "In review" });
      toast("In review gezet 🔍");
      goNext();
    } catch (e: any) {
      toast.error(e.message || "Fout");
    }
  }, [current, verifieer, userName, showNotitie, goNext]);

  const handleVerouderd = useCallback(async () => {
    if (!current) return;
    if (!showNotitie) {
      setShowNotitie("verouderd");
      return;
    }
    try {
      await verifieer.mutateAsync({ id: current.id, door: userName, status: "Verouderd" });
      toast("Als verouderd gemarkeerd ⚠️");
      goNext();
    } catch (e: any) {
      toast.error(e.message || "Fout");
    }
  }, [current, verifieer, userName, showNotitie, goNext]);

  const handleSkip = useCallback(() => {
    if (!current) return;
    setSkipped((s) => new Set(s).add(current.id));
    setShowNotitie(null);
    setNotitie("");
  }, [current]);

  // Keyboard shortcuts
  useEffect(() => {
    if (tab !== "verificatie" || !current || showNotitie) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") handleVerified();
      else if (e.key === "ArrowLeft") handleVerouderd();
      else if (e.key === "ArrowUp") handleTwijfel();
      else if (e.key === "ArrowDown") handleSkip();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, current, showNotitie, handleVerified, handleVerouderd, handleTwijfel, handleSkip]);

  // Confetti when all done
  useEffect(() => {
    if (allDone && totalCount > 0 && verifiedCount === totalCount) {
      confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
    }
  }, [allDone, totalCount, verifiedCount]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            <strong className="text-foreground">{verifiedCount}</strong> van {totalCount} geverifieerd
          </span>
          <span className="text-muted-foreground text-xs flex items-center gap-1.5">
            <Keyboard className="h-3.5 w-3.5" />
            → goedkeuren · ← verouderd · ↑ twijfel · ↓ skip
          </span>
        </div>
        <Progress value={progress} className="h-2.5" />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="verificatie">Verificatie</TabsTrigger>
          <TabsTrigger value="alle" className="gap-1.5">
            Alle
            {totalCount > 0 && (
              <span className="ml-1 bg-muted-foreground/20 text-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {totalCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="geverifieerd" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Geverifieerd
            {geverifieerdItems.length > 0 && (
              <span className="ml-1 bg-[hsl(var(--status-active))] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {geverifieerdItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="verouderd" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Verouderd
            {verouderdItems.length > 0 && (
              <span className="ml-1 bg-[hsl(var(--status-outdated))] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {verouderdItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="in-review" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            In review
            {inReviewItems.length > 0 && (
              <span className="ml-1 bg-[hsl(var(--status-review))] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {inReviewItems.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verificatie" className="space-y-4 mt-4">
          {/* Back button */}
          {history.length > 0 && !allDone && (
            <Button variant="ghost" size="sm" onClick={goPrev} className="text-muted-foreground">
              <ChevronLeft className="h-4 w-4 mr-1" /> Vorige
            </Button>
          )}

          {/* Card */}
          <AnimatePresence mode="wait">
            {allDone ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card border border-border rounded-[var(--radius-outer)] p-12 text-center space-y-4"
              >
                {verifiedCount === totalCount ? (
                  <>
                    <p className="text-4xl">🎉</p>
                    <h2 className="text-xl font-semibold">Alles geverifieerd!</h2>
                    <p className="text-muted-foreground text-sm">
                      Alle {totalCount} automatiseringen zijn up-to-date.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-4xl">✅</p>
                    <h2 className="text-xl font-semibold">Wachtrij doorlopen</h2>
                    <p className="text-muted-foreground text-sm">
                      {skipped.size > 0 && `${skipped.size} overgeslagen. `}
                      Bekijk het "In review" tabblad voor items die aandacht nodig hebben.
                    </p>
                  </>
                )}
              </motion.div>
            ) : current ? (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: direction * 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -direction * 60 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm overflow-hidden"
              >
                {/* Header */}
                <div className="p-5 border-b border-border flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{current.id}</span>
                  <h2 className="font-semibold text-lg">{current.naam}</h2>
                  <CategorieBadge categorie={current.categorie} />
                  <StatusBadge status={current.status} />
                  <VerificatieBadge item={current} />
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Trigger" value={current.trigger} />
                    <Field label="Owner" value={current.owner} />
                    <Field label="Afhankelijkheden" value={current.afhankelijkheden} />
                    <Field label="Laatst geverifieerd" value={
                      current.laatstGeverifieerd
                        ? `${new Date(current.laatstGeverifieerd).toLocaleDateString("nl-NL")} door ${current.geverifieerdDoor}`
                        : "Nooit"
                    } />
                  </div>

                  <div>
                    <p className="label-uppercase mb-1">Systemen</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {current.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
                    </div>
                  </div>

                  <div>
                    <p className="label-uppercase mb-1">Flow stappen</p>
                    <ol className="list-decimal list-inside text-sm text-foreground space-y-0.5">
                      {current.stappen.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>

                  {/* Optional notitie */}
                  <AnimatePresence>
                    {showNotitie && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                      >
                        <p className="label-uppercase mb-1">
                          Notitie ({showNotitie === "twijfel" ? "twijfel" : "verouderd"})
                        </p>
                        <Textarea
                          value={notitie}
                          onChange={(e) => setNotitie(e.target.value)}
                          placeholder="Optioneel: beschrijf wat er mis is..."
                          rows={2}
                          autoFocus
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Actions */}
                <div className="p-5 border-t border-border grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Button
                    onClick={handleVerified}
                    disabled={verifieer.isPending}
                    className="bg-[hsl(var(--status-active))] hover:bg-[hsl(var(--status-active)/0.85)] text-white"
                  >
                    <Check className="h-4 w-4 mr-1" /> Geverifieerd
                  </Button>
                  <Button
                    onClick={handleTwijfel}
                    disabled={verifieer.isPending}
                    variant="outline"
                    className="border-[hsl(var(--status-review))] text-[hsl(var(--status-review))] hover:bg-[hsl(var(--status-review)/0.1)]"
                  >
                    <AlertTriangle className="h-4 w-4 mr-1" /> Twijfel
                  </Button>
                  <Button
                    onClick={handleVerouderd}
                    disabled={verifieer.isPending}
                    variant="outline"
                    className="border-[hsl(var(--status-outdated))] text-[hsl(var(--status-outdated))] hover:bg-[hsl(var(--status-outdated)/0.1)]"
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Verouderd
                  </Button>
                  <Button
                    onClick={() => navigate(`/bewerk/${current.id}`)}
                    variant="outline"
                  >
                    <Pencil className="h-4 w-4 mr-1" /> Bewerken
                  </Button>
                  <Button
                    onClick={handleSkip}
                    variant="ghost"
                    className="text-muted-foreground"
                  >
                    <SkipForward className="h-4 w-4 mr-1" /> Skip
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="geverifieerd" className="mt-4 space-y-3">
          {geverifieerdItems.length === 0 ? (
            <EmptyState emoji="🔍" title="Nog niets geverifieerd" description="Er zijn nog geen recent geverifieerde automatiseringen." />
          ) : (
            geverifieerdItems.map((a) => <AutoListItem key={a.id} item={a} navigate={navigate} onGoToVerify={handleGoToVerify} />)
          )}
        </TabsContent>

        <TabsContent value="verouderd" className="mt-4 space-y-3">
          {verouderdItems.length === 0 ? (
            <EmptyState emoji="✅" title="Niets verouderd" description="Alle geverifieerde automatiseringen zijn nog actueel." />
          ) : (
            verouderdItems.map((a) => <AutoListItem key={a.id} item={a} navigate={navigate} onVerify={handleListVerify} />)
          )}
        </TabsContent>

        <TabsContent value="in-review" className="mt-4 space-y-3">
          {inReviewItems.length === 0 ? (
            <EmptyState emoji="👍" title="Geen openstaande twijfels" description='Er zijn geen automatiseringen met de status "In review".' />
          ) : (
            inReviewItems.map((a) => <AutoListItem key={a.id} item={a} navigate={navigate} onVerify={handleListVerify} />)
          )}
        </TabsContent>

        <TabsContent value="alle" className="mt-4 space-y-3">
          {sorted.map((a) => <AutoListItem key={a.id} item={a} navigate={navigate} onVerify={handleListVerify} />)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AutoListItem({ item: a, navigate, onVerify }: { item: Automatisering; navigate: (path: string) => void; onVerify?: (id: string) => void }) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-outer)] shadow-sm p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
          <span className="font-medium truncate">{a.naam}</span>
          <VerificatieBadge item={a} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CategorieBadge categorie={a.categorie} />
          {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
          <span className="text-xs text-muted-foreground">
            Owner: {a.owner || "—"}
            {a.laatstGeverifieerd && ` · ${new Date(a.laatstGeverifieerd).toLocaleDateString("nl-NL")} door ${a.geverifieerdDoor}`}
          </span>
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {onVerify && (
          <Button size="sm" className="bg-[hsl(var(--status-active))] hover:bg-[hsl(var(--status-active)/0.85)] text-white" onClick={() => onVerify(a.id)}>
            <Check className="h-3.5 w-3.5 mr-1" /> Verifiëren
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => navigate(`/bewerk/${a.id}`)}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Bewerken
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(`/alle?open=${a.id}`)}>
          <ChevronRight className="h-3.5 w-3.5 mr-1" /> Bekijken
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-outer)] p-12 text-center space-y-2">
      <p className="text-3xl">{emoji}</p>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-uppercase mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}
