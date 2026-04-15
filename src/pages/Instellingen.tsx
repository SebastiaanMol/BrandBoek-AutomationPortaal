import { useState, useEffect } from "react";
import { useIntegration, useSaveIntegration, useDeleteIntegration, useHubSpotSync, useZapierSync, useTypeformSync, useGitlabSync, usePortalSettings, useSavePortalSettings } from "@/lib/hooks";
import { Integration, PortalSettings, DEFAULT_PORTAL_SETTINGS, STATUSSEN, CATEGORIEEN, VerplichtVeld, VERPLICHTE_VELDEN } from "@/lib/types";
import { UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Link2, Link2Off, AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

function PortaalInstellingenCard() {
  const { data: saved, isLoading } = usePortalSettings();
  const save = useSavePortalSettings();
  const [local, setLocal] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [newSysteem, setNewSysteem] = useState("");
  const [newCategorie, setNewCategorie] = useState("");

  useEffect(() => {
    if (saved) setLocal(saved);
  }, [saved]);

  function toggleStatus(s: typeof STATUSSEN[number]) {
    const next = local.beschikbareStatussen.includes(s)
      ? local.beschikbareStatussen.filter((x) => x !== s)
      : [...local.beschikbareStatussen, s];
    if (next.length === 0) return; // minimaal één
    const newFilter = next.includes(local.standaardStatusFilter as typeof STATUSSEN[number])
      ? local.standaardStatusFilter
      : "alle";
    setLocal({ ...local, beschikbareStatussen: next, standaardStatusFilter: newFilter });
  }

  function toggleCategorie(c: typeof CATEGORIEEN[number]) {
    const next = local.beschikbareCategorieen.includes(c)
      ? local.beschikbareCategorieen.filter((x) => x !== c)
      : [...local.beschikbareCategorieen, c];
    if (next.length === 0) return;
    setLocal({ ...local, beschikbareCategorieen: next });
  }

  function toggleVerplicht(v: VerplichtVeld) {
    const next = local.verplichtVelden.includes(v)
      ? local.verplichtVelden.filter((x) => x !== v)
      : [...local.verplichtVelden, v];
    setLocal({ ...local, verplichtVelden: next });
  }

  function addSysteem() {
    const val = newSysteem.trim();
    if (!val || local.extraSystemen.includes(val)) return;
    setLocal({ ...local, extraSystemen: [...local.extraSystemen, val] });
    setNewSysteem("");
  }

  function addCategorie() {
    const val = newCategorie.trim();
    if (!val || local.extraCategorieen.includes(val)) return;
    setLocal({ ...local, extraCategorieen: [...local.extraCategorieen, val] });
    setNewCategorie("");
  }

  async function handleSave() {
    try {
      await save.mutateAsync(local);
      toast.success("Instellingen opgeslagen");
    } catch (e: any) {
      toast.error(e.message || "Opslaan mislukt");
    }
  }

  const labelClass = "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-3";
  const rowClass = "flex items-start gap-3 mb-3";
  const fieldLabelClass = "w-40 shrink-0 text-sm text-foreground pt-0.5";

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Portaalinstellingen laden...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <h2 className="font-medium text-sm">Portaalinstellingen</h2>

      {/* BEDRIJFSREGELS */}
      <div>
        <p className={labelClass}>Bedrijfsregels</p>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Verificatieperiode</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={365}
              value={local.verificatiePeriodeDagen}
              onChange={(e) => setLocal({ ...local, verificatiePeriodeDagen: Math.max(1, Number(e.target.value)) })}
              className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">dagen</span>
          </div>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Actieve statussen</span>
          <div className="flex flex-wrap gap-2">
            {STATUSSEN.map((s) => (
              <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.beschikbareStatussen.includes(s)}
                  onChange={() => toggleStatus(s)}
                  className="rounded"
                />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Actieve categorieën</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIEEN.map((c) => (
              <label key={c} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.beschikbareCategorieen.includes(c)}
                  onChange={() => toggleCategorie(c)}
                  className="rounded"
                />
                <span className="text-sm">{c}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* WEERGAVE-STANDAARDEN */}
      <div>
        <p className={labelClass}>Weergave-standaarden</p>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Standaard statusfilter</span>
          <select
            value={local.standaardStatusFilter}
            onChange={(e) => setLocal({ ...local, standaardStatusFilter: e.target.value })}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="alle">Alle statussen</option>
            {STATUSSEN.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Standaard sortering</span>
          <select
            value={local.standaardSortering}
            onChange={(e) => setLocal({ ...local, standaardSortering: e.target.value as PortalSettings["standaardSortering"] })}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="created_at">Aanmaakdatum</option>
            <option value="naam">Naam (A–Z)</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* DATAVELDEN */}
      <div>
        <p className={labelClass}>Datavelden</p>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Verplichte velden</span>
          <div className="flex flex-wrap gap-2">
            {VERPLICHTE_VELDEN.map((v) => (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.verplichtVelden.includes(v)}
                  onChange={() => toggleVerplicht(v)}
                  className="rounded"
                />
                <span className="text-sm capitalize">{v}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Extra systemen</span>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newSysteem}
                onChange={(e) => setNewSysteem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSysteem()}
                placeholder="Systeem toevoegen..."
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={addSysteem} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary transition-colors">+</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {local.extraSystemen.map((s) => (
                <span key={s} className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded text-xs">
                  {s}
                  <button onClick={() => setLocal({ ...local, extraSystemen: local.extraSystemen.filter((item) => item !== s) })} className="text-muted-foreground hover:text-foreground">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className={rowClass}>
          <span className={fieldLabelClass}>Extra categorieën</span>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategorie}
                onChange={(e) => setNewCategorie(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategorie()}
                placeholder="Categorie toevoegen..."
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={addCategorie} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary transition-colors">+</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {local.extraCategorieen.map((c) => (
                <span key={c} className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded text-xs">
                  {c}
                  <button onClick={() => setLocal({ ...local, extraCategorieen: local.extraCategorieen.filter((item) => item !== c) })} className="text-muted-foreground hover:text-foreground">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          {save.isPending ? "Opslaan..." : "Instellingen opslaan"}
        </button>
      </div>
    </div>
  );
}

interface IntegrationCardProps {
  type: string;
  label: string;
  description: string;
  badge: string;
  badgeClass: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  tokenHint: string;
  syncMutation: UseMutationResult<{ inserted: number; updated: number; deactivated: number; total: number }, Error, void>;
}

function IntegrationCard({ type, label, description, badge, badgeClass, tokenLabel, tokenPlaceholder, tokenHint, syncMutation }: IntegrationCardProps) {
  const { data: integration, isLoading } = useIntegration(type);
  const saveIntegration = useSaveIntegration();
  const deleteIntegration = useDeleteIntegration();
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const isConnected = !!integration;

  async function handleConnect() {
    if (!token.trim()) { toast.error("Voer een token in"); return; }
    try {
      await saveIntegration.mutateAsync({ type, token: token.trim() });
      setToken("");
      toast.success(`${label} verbonden`);
    } catch (e: any) { toast.error(e.message || "Verbinding mislukt"); }
  }

  async function handleSync() {
    try {
      const result = await syncMutation.mutateAsync();
      toast.success(`Sync voltooid — ${result.inserted} nieuw, ${result.updated} bijgewerkt, ${result.deactivated} gedeactiveerd`);
    } catch (e: any) { toast.error(e.message || "Sync mislukt"); }
  }

  async function handleDisconnect() {
    try {
      await deleteIntegration.mutateAsync(type);
      toast.success(`${label} ontkoppeld`);
    } catch (e: any) { toast.error(e.message || "Ontkoppelen mislukt"); }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${badgeClass}`}>
            <span className="font-bold text-sm">{badge}</span>
          </div>
          <div>
            <h2 className="font-medium text-sm">{label}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isConnected && integration.status === "connected" && (
              <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /><span className="text-xs text-green-600 font-medium">Verbonden</span></>
            )}
            {isConnected && integration.status === "error" && (
              <><AlertCircle className="h-3.5 w-3.5 text-destructive" /><span className="text-xs text-destructive font-medium">Fout</span></>
            )}
            {!isConnected && <span className="text-xs text-muted-foreground">Niet verbonden</span>}
          </div>
        )}
      </div>

      {isConnected && integration.status === "error" && integration.errorMessage && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
          {integration.errorMessage}
        </div>
      )}

      {isConnected && integration.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Laatste sync: {format(new Date(integration.lastSyncedAt), "d MMM yyyy, HH:mm", { locale: nl })}
        </p>
      )}

      {!isLoading && !isConnected && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{tokenLabel}</label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={tokenPlaceholder}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-16 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                {showToken ? "Verberg" : "Toon"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: tokenHint }} />
          </div>
          <button onClick={handleConnect} disabled={saveIntegration.isPending || !token.trim()}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <Link2 className="h-3.5 w-3.5" />
            {saveIntegration.isPending ? "Verbinden..." : "Verbinden"}
          </button>
        </div>
      )}

      {!isLoading && isConnected && (
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={syncMutation.isPending}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Bezig met synchroniseren..." : "Nu synchroniseren"}
          </button>
          <button onClick={handleDisconnect} disabled={deleteIntegration.isPending}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-50 transition-colors">
            <Link2Off className="h-3.5 w-3.5" />
            Ontkoppelen
          </button>
        </div>
      )}
    </div>
  );
}

function GitLabCard() {
  const { data: integration, isLoading } = useIntegration("gitlab");
  const saveIntegration = useSaveIntegration();
  const deleteIntegration = useDeleteIntegration();
  const gitlabSync = useGitlabSync();

  const [pat, setPat] = useState("");
  const [projectId, setProjectId] = useState("");
  const [branch, setBranch] = useState("main");
  const [showPat, setShowPat] = useState(false);
  const isConnected = !!integration;

  async function handleConnect() {
    if (!pat.trim() || !projectId.trim()) {
      toast.error("Voer een PAT en project ID in");
      return;
    }
    try {
      await saveIntegration.mutateAsync({
        type: "gitlab",
        token: JSON.stringify({ pat: pat.trim(), projectId: projectId.trim(), branch: branch.trim() || "main" }),
      });
      setPat("");
      setProjectId("");
      setBranch("main");
      toast.success("GitLab verbonden");
    } catch (e: any) {
      toast.error((e as Error).message || "Verbinding mislukt");
    }
  }

  async function handleSync() {
    try {
      const result = await gitlabSync.mutateAsync();
      toast.success(`Sync voltooid — ${result.inserted} nieuw, ${result.updated} bijgewerkt, ${result.deactivated} gedeactiveerd`);
    } catch (e: any) {
      toast.error((e as Error).message || "Sync mislukt");
    }
  }

  async function handleDisconnect() {
    try {
      await deleteIntegration.mutateAsync("gitlab");
      toast.success("GitLab ontkoppeld");
    } catch (e: any) {
      toast.error((e as Error).message || "Ontkoppelen mislukt");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-orange-50 border border-orange-100 text-orange-600">
            <span className="font-bold text-sm">GL</span>
          </div>
          <div>
            <h2 className="font-medium text-sm">GitLab</h2>
            <p className="text-xs text-muted-foreground">Lees automation-bestanden en genereer AI-beschrijvingen</p>
          </div>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isConnected && integration.status === "connected" && (
              <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /><span className="text-xs text-green-600 font-medium">Verbonden</span></>
            )}
            {isConnected && integration.status === "error" && (
              <><AlertCircle className="h-3.5 w-3.5 text-destructive" /><span className="text-xs text-destructive font-medium">Fout</span></>
            )}
            {!isConnected && <span className="text-xs text-muted-foreground">Niet verbonden</span>}
          </div>
        )}
      </div>

      {isConnected && integration.lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Laatste sync: {format(new Date(integration.lastSyncedAt), "d MMM yyyy, HH:mm", { locale: nl })}
        </p>
      )}

      {!isLoading && !isConnected && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Personal Access Token</label>
            <div className="relative">
              <input
                type={showPat ? "text" : "password"}
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-16 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={() => setShowPat(!showPat)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
                {showPat ? "Verberg" : "Toon"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Maak een <strong>legacy Personal Access Token</strong> aan via GitLab → Profile → Access Tokens. Vink <strong>alleen</strong> <code className="bg-muted px-1 rounded">read_api</code> aan. Gebruik geen Duo/AI-token en geen fine-grained token.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Project ID</label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="12345678"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Te vinden in GitLab → project homepage → Project ID.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Branch</label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleConnect}
            disabled={saveIntegration.isPending || !pat.trim() || !projectId.trim()}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            {saveIntegration.isPending ? "Verbinden..." : "Verbinden"}
          </button>
        </div>
      )}

      {!isLoading && isConnected && (
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={gitlabSync.isPending}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${gitlabSync.isPending ? "animate-spin" : ""}`} />
            {gitlabSync.isPending ? "Bezig met synchroniseren..." : "Nu synchroniseren"}
          </button>
          <button onClick={handleDisconnect} disabled={deleteIntegration.isPending}
            className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-50 transition-colors">
            <Link2Off className="h-3.5 w-3.5" />
            Ontkoppelen
          </button>
        </div>
      )}
    </div>
  );
}

export default function Instellingen() {
  const hubspotSync = useHubSpotSync();
  const zapierSync = useZapierSync();
  const typeformSync = useTypeformSync();

  const { data: hubspotInt } = useIntegration("hubspot");
  const { data: zapierInt } = useIntegration("zapier");
  const { data: typeformInt } = useIntegration("typeform");
  const { data: gitlabInt } = useIntegration("gitlab");

  const cards = [
    {
      key: "hubspot",
      connected: !!hubspotInt,
      node: (
        <IntegrationCard
          type="hubspot"
          label="HubSpot"
          description="Importeer workflows automatisch via de HubSpot API"
          badge="HS"
          badgeClass="bg-orange-50 border border-orange-100 text-orange-600"
          tokenLabel="Private App Token"
          tokenPlaceholder="pat-eu1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          tokenHint='Maak een Private App aan in HubSpot met de <code class="bg-muted px-1 rounded">automation</code> scope.'
          syncMutation={hubspotSync}
        />
      ),
    },
    {
      key: "zapier",
      connected: !!zapierInt,
      node: (
        <IntegrationCard
          type="zapier"
          label="Zapier"
          description="Importeer Zaps automatisch via de Zapier API"
          badge="ZP"
          badgeClass="bg-orange-50 border border-orange-100 text-orange-500"
          tokenLabel="API Key"
          tokenPlaceholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          tokenHint='Ga naar <strong>zapier.com</strong> → Developer Platform → je app → API Key.'
          syncMutation={zapierSync}
        />
      ),
    },
    {
      key: "typeform",
      connected: !!typeformInt,
      node: (
        <IntegrationCard
          type="typeform"
          label="Typeform"
          description="Importeer formulieren automatisch via de Typeform API"
          badge="TF"
          badgeClass="bg-blue-50 border border-blue-100 text-blue-600"
          tokenLabel="Personal Access Token"
          tokenPlaceholder="tfp_xxxxxxxxxxxxxxxxxxxxxxxx"
          tokenHint='Ga naar <strong>typeform.com</strong> → Account → Developer apps → Personal tokens.'
          syncMutation={typeformSync}
        />
      ),
    },
    {
      key: "gitlab",
      connected: !!gitlabInt,
      node: <GitLabCard />,
    },
  ].sort((a, b) => Number(b.connected) - Number(a.connected));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Instellingen</h1>
        <p className="text-sm text-muted-foreground mt-1">Beheer portaalinstellingen en koppelingen met externe systemen</p>
      </div>

      <Tabs defaultValue="portaal">
        <TabsList>
          <TabsTrigger value="portaal">Portaalinstellingen</TabsTrigger>
          <TabsTrigger value="koppelingen">Externe systemen</TabsTrigger>
        </TabsList>

        <TabsContent value="portaal" className="mt-4">
          <PortaalInstellingenCard />
        </TabsContent>

        <TabsContent value="koppelingen" className="mt-4 space-y-6">
          {cards.map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
