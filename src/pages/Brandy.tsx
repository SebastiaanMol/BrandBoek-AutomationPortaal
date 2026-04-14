// src/pages/Brandy.tsx
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, ThumbsUp, ThumbsDown, AlertCircle, Sparkles, RefreshCw, Search } from "lucide-react";
import {
  askBrandy,
  sendBrandyFeedback,
  fetchBrandyMind,
  runBrandyAnalyse,
  BrandyMessage,
  BrandyFeedbackLabel,
  BrandyMind,
} from "@/lib/brandy";
import { detectSignalen } from "@/lib/signalen";
import { useAutomatiseringen } from "@/lib/hooks";
import { toast } from "sonner";

const SUGGESTED_QUESTIONS = [
  "Waarom is een deal niet doorgestroomd naar het Klantenbestand?",
  "Welke rol speelt SoftwarePortaalCSV?",
  "Wat gebeurt er na 'Offerte geaccepteerd start'?",
  "Waarom zijn er geen productdeals aangemaakt?",
  "Wat is de driehoekstructuur en waarom is die belangrijk?",
  "Hoe werkt de BTW-pipeline?",
];

const ERNST_CLASSES: Record<string, string> = {
  error: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
};

export default function Brandy() {
  const [searchParams] = useSearchParams();
  const { data: automations = [] } = useAutomatiseringen();

  // Mind state
  const [mind, setMind] = useState<BrandyMind | null>(null);
  const [mindFetching, setMindFetching] = useState(true);
  const [mindLoading, setMindLoading] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<BrandyMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"chat" | "inzichten">("chat");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contextId = searchParams.get("context") ?? undefined;
  const contextNaam = searchParams.get("naam") ?? undefined;

  useEffect(() => {
    fetchBrandyMind().then(setMind).finally(() => setMindFetching(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleAnalyse() {
    setMindLoading(true);
    try {
      const signalen = detectSignalen(automations);
      const result = await runBrandyAnalyse(signalen, automations);
      setMind(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analyse mislukt");
    } finally {
      setMindLoading(false);
    }
  }

  async function handleSubmit(vraag?: string) {
    const q = (vraag ?? input).trim();
    if (!q || loading) return;

    const userMsg: BrandyMessage = {
      id: crypto.randomUUID(),
      type: "user",
      content: q,
      timestamp: new Date(),
    };

    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await askBrandy(q, automations, {
        automationId: contextId,
        automationNaam: contextNaam,
      });

      const brandyMsg: BrandyMessage = {
        id: crypto.randomUUID(),
        type: "brandy",
        content: response.antwoord,
        response,
        context: contextId ? { automationId: contextId, automationNaam: contextNaam } : undefined,
        timestamp: new Date(),
      };

      setMessages((m) => [...m, brandyMsg]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Brandy kon geen antwoord geven");
      setMessages((m) => m.filter((msg) => msg.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(msg: BrandyMessage, label: BrandyFeedbackLabel) {
    if (feedbackSent.has(msg.id)) return;
    setFeedbackSent((s) => new Set(s).add(msg.id));
    const userQuestion = [...messages].reverse().find(
      (m) => m.type === "user" && messages.indexOf(m) < messages.indexOf(msg)
    )?.content ?? "";
    await sendBrandyFeedback(userQuestion, msg.content, label);
    toast.success("Feedback ontvangen, dank je!");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSignaalClick(sig: { naam: string; bericht: string }) {
    setActiveTab("chat");
    handleSubmit(`Wat moet ik doen met het signaal "${sig.naam}"? (${sig.bericht})`);
  }

  const showWelcome = messages.length === 0;

  const badgeCount = mind
    ? mind.signalen.filter((s) => s.ernst === "error" || s.ernst === "warning").length
    : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">Brandy</h1>
            <p className="text-xs text-muted-foreground">Procesbrein van Brand Boekhouders</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-6 py-2 border-b border-border bg-card shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          {/* Pill group */}
          <div className="flex bg-[#f0f0f2] rounded-[10px] p-[3px] gap-0.5">
            <button
              onClick={() => setActiveTab("chat")}
              className={
                activeTab === "chat"
                  ? "px-4 py-1.5 rounded-[8px] bg-white shadow-sm ring-1 ring-black/5 text-sm font-semibold text-foreground flex items-center gap-1.5"
                  : "px-4 py-1.5 rounded-[8px] text-sm font-medium text-muted-foreground hover:text-foreground/70 flex items-center gap-1.5 transition-colors"
              }
            >
              💬 Chat
            </button>
            <button
              onClick={() => setActiveTab("inzichten")}
              className={
                activeTab === "inzichten"
                  ? "px-4 py-1.5 rounded-[8px] bg-white shadow-sm ring-1 ring-black/5 text-sm font-semibold text-foreground flex items-center gap-1.5"
                  : "px-4 py-1.5 rounded-[8px] text-sm font-medium text-muted-foreground hover:text-foreground/70 flex items-center gap-1.5 transition-colors"
              }
            >
              ✦ Inzichten
              {badgeCount > 0 && (
                <span className="text-[9px] font-bold bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 leading-none">
                  {badgeCount}
                </span>
              )}
            </button>
          </div>

          {/* Analyseer button */}
          <button
            onClick={handleAnalyse}
            disabled={mindLoading || mindFetching}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {mindLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {mind ? "Analyseer opnieuw" : "Analyseer"}
          </button>
        </div>
      </div>

      {/* Chat tab */}
      {activeTab === "chat" && (
        <>
          {/* Context banner */}
          {(contextId || contextNaam) && (
            <div className="px-6 py-2 bg-card border-b border-border shrink-0">
              <div className="max-w-3xl mx-auto">
                <div className="text-xs text-muted-foreground bg-secondary/60 rounded px-3 py-1.5 inline-block">
                  Context: {contextNaam || contextId}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {showWelcome && (
                <div className="max-w-2xl">
                  <p className="text-sm text-muted-foreground mb-4">
                    Stel een vraag over processen, HubSpot-structuur, automatiseringen of het systeem van Brand Boekhouders.
                  </p>
                  <div className="grid gap-2">
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSubmit(q)}
                        className="text-left text-sm px-4 py-2.5 rounded-md border border-border bg-card hover:bg-secondary/60 transition-colors text-foreground/80"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.type === "user" ? (
                      <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="max-w-[85%] space-y-3">
                        {(() => {
                          const prevBrandy = messages.slice(0, idx).reverse().find(m => m.type === "brandy");
                          const isConclusie = prevBrandy?.response?.diagnose_modus === true && msg.response?.diagnose_modus === false;
                          return isConclusie ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium px-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                              Conclusie
                            </div>
                          ) : null;
                        })()}
                        <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 space-y-3">
                          {msg.response?.diagnose_modus && (
                            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 -mx-1">
                              <Search className="h-3 w-3 shrink-0" />
                              Brandy diagnosticeert{msg.response.stap_nummer ? ` — stap ${msg.response.stap_nummer}` : ""}
                            </div>
                          )}
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          {msg.response && msg.response.entiteiten.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
                              {msg.response.entiteiten.map((e) => (
                                <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-foreground/70 border border-border">
                                  {e}
                                </span>
                              ))}
                            </div>
                          )}
                          {msg.response && msg.response.bronnen.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[10px] text-muted-foreground">Bronnen:</span>
                              {msg.response.bronnen.map((b) => (
                                <span key={b} className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-foreground/70">
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                          {msg.response?.zekerheid === "laag" && (
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                              <AlertCircle className="h-3 w-3" />
                              Brandy is niet volledig zeker van dit antwoord — controleer indien kritisch
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-[10px] text-muted-foreground">Klopt dit?</span>
                          {feedbackSent.has(msg.id) ? (
                            <span className="text-[10px] text-muted-foreground italic">Feedback ontvangen</span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleFeedback(msg, "correct")}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-emerald-600 transition-colors"
                              >
                                <ThumbsUp className="h-3 w-3" /> Klopt
                              </button>
                              <button
                                onClick={() => handleFeedback(msg, "incorrect")}
                                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <ThumbsDown className="h-3 w-3" /> Klopt niet
                              </button>
                              <button
                                onClick={() => handleFeedback(msg, "onvolledig")}
                                className="text-[10px] text-muted-foreground hover:text-amber-600 transition-colors"
                              >
                                ⚠ Onvolledig
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border bg-card px-6 py-4">
            <div className="flex gap-3 items-end max-w-3xl mx-auto">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Stel een vraag aan Brandy..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow max-h-32 overflow-y-auto"
                style={{ minHeight: "42px" }}
              />
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || loading}
                className="h-[42px] w-[42px] shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-2">
              Brandy werkt op basis van portaldata en proceskennis — controleer kritische beslissingen altijd zelf.
            </p>
          </div>
        </>
      )}

      {/* Inzichten tab — placeholder, filled in Task 4 */}
      {activeTab === "inzichten" && (
        <div className="flex-1 overflow-y-auto py-6">
          <div className="max-w-5xl mx-auto px-6">
            <p className="text-sm text-muted-foreground">Inzichten worden hier geladen...</p>
          </div>
        </div>
      )}
    </div>
  );
}
