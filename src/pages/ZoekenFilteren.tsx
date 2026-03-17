import { useMemo, useState } from "react";
import { getAutomatiseringen } from "@/lib/storage";
import { CATEGORIEEN, SYSTEMEN, STATUSSEN, Categorie, Systeem, Status } from "@/lib/types";
import { StatusBadge, CategorieBadge, SystemBadge } from "@/components/Badges";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search as SearchIcon } from "lucide-react";

export default function ZoekenFilteren() {
  const data = useMemo(() => getAutomatiseringen(), []);
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("alle");
  const [sysFilter, setSysFilter] = useState<string>("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  const filtered = data.filter((a) => {
    const q = query.toLowerCase();
    const matchesQuery = !q || Object.values(a).some((v) =>
      typeof v === "string" ? v.toLowerCase().includes(q) : Array.isArray(v) ? v.some((x) => String(x).toLowerCase().includes(q)) : false
    );
    const matchesCat = catFilter === "alle" || a.categorie === catFilter;
    const matchesSys = sysFilter === "alle" || a.systemen.includes(sysFilter as Systeem);
    const matchesStatus = statusFilter === "alle" || a.status === statusFilter;
    return matchesQuery && matchesCat && matchesSys && matchesStatus;
  });

  return (
    <div className="space-y-6">
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

      <p className="text-sm text-muted-foreground">{filtered.length} resultaten</p>

      <div className="space-y-3">
        {filtered.map((a) => (
          <div key={a.id} className="bg-card border border-border rounded-[var(--radius-inner)] p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-xs text-muted-foreground shrink-0">{a.id}</span>
              <span className="font-medium truncate">{a.naam}</span>
              <CategorieBadge categorie={a.categorie} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {a.systemen.map((s) => <SystemBadge key={s} systeem={s} />)}
              <StatusBadge status={a.status} />
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-sm">Geen resultaten gevonden.</p>}
      </div>
    </div>
  );
}
