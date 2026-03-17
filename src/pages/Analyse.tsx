import { useMemo } from "react";
import { getAutomatiseringen } from "@/lib/storage";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function Analyse() {
  const data = useMemo(() => getAutomatiseringen(), []);

  const categorieData = groupBy(data, "categorie");
  const statusData = groupBy(data, "status");
  const ownerData = groupBy(data, "owner");

  const systeemData = (() => {
    const counts: Record<string, number> = {};
    data.forEach((a) => a.systemen.forEach((s) => { counts[s] = (counts[s] || 0) + 1; }));
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  })();

  const knelpunten = data.filter((a) => a.afhankelijkheden?.trim()).map((a) => ({
    id: a.id,
    naam: a.naam,
    tekst: a.afhankelijkheden,
  }));

  const COLORS = ["#0f172a", "#0066cc", "#ff7a59", "#ff4a00", "#10b981", "#64748b"];

  return (
    <div className="space-y-10">
      <div className="grid lg:grid-cols-2 gap-8">
        <ChartCard title="Per Categorie" data={categorieData} colors={COLORS} />
        <ChartCard title="Per Systeem" data={systeemData} colors={COLORS} />
        <ChartCard title="Per Owner" data={ownerData} colors={COLORS} />
        <ChartCard title="Per Status" data={statusData} colors={COLORS} />
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Knelpunten Overzicht</h2>
        {knelpunten.length === 0 ? (
          <p className="text-muted-foreground text-sm">Geen knelpunten geregistreerd.</p>
        ) : (
          <div className="space-y-3">
            {knelpunten.map((k) => (
              <div key={k.id} className="bg-card border border-border rounded-[var(--radius-inner)] p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-muted-foreground">{k.id}</span>
                  <span className="font-medium text-sm">{k.naam}</span>
                </div>
                <p className="text-sm text-muted-foreground">{k.tekst}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, data, colors }: { title: string; data: { name: string; count: number }[]; colors: string[] }) {
  return (
    <div className="bg-card border border-border rounded-[var(--radius-outer)] p-6 shadow-sm">
      <p className="label-uppercase mb-4">{title}</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function groupBy(arr: { [key: string]: unknown }[], key: string): { name: string; count: number }[] {
  const counts: Record<string, number> = {};
  arr.forEach((item) => {
    const val = String(item[key] || "Onbekend");
    counts[val] = (counts[val] || 0) + 1;
  });
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}
