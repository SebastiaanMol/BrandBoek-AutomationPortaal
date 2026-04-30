# Portal UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the portal's visual language to match the Lovable-built reference design — new colour tokens, component patterns, and page layouts — while keeping all real-data Supabase functionality intact.

**Architecture:** Layer the changes bottom-up: design tokens first (everything else inherits them), then new utility, then components, then pages. The `Flows.tsx` and `FlowDetail.tsx` pages get the biggest change: they adopt the `Index.tsx` / `ProcessDetail.tsx` layout patterns from the reference source, adapted to our `Flow` / `Automatisering` types.

**Tech Stack:** React 18 · TypeScript · Tailwind CSS · shadcn/ui · ReactFlow · Vitest

---

## Reference files

All Lovable source files live at `docs/superpowers/flow/flow/portal-source/`. Do **not** port them directly — adapt to our real types. Key files to read when implementing:

| Reference | Adapts to |
|---|---|
| `src/index.css` | `src/index.css` |
| `tailwind.config.ts` | `tailwind.config.ts` |
| `src/components/portal/MiniFlowPreview.tsx` | `src/components/portal/MiniFlowPreview.tsx` |
| `src/components/portal/ProcessCard.tsx` | `src/components/FlowCard.tsx` |
| `src/components/flow/ProcessHeader.tsx` | `src/components/flows/FlowHeader.tsx` |
| `src/components/flow/AutomationNode.tsx` | `src/components/flows/AutomationNode.tsx` |
| `src/components/flow/ProcessFlowCanvas.tsx` | `src/components/flows/FlowCanvas.tsx` |
| `src/components/flow/AutomationList.tsx` | `src/components/flows/AutomationList.tsx` |
| `src/components/flow/AutomationDetail.tsx` | `src/components/flows/AutomationDetail.tsx` |
| `src/pages/Index.tsx` | `src/pages/Flows.tsx` |
| `src/pages/ProcessDetail.tsx` | `src/pages/FlowDetail.tsx` |

## Type mapping (reference → our types)

| Reference concept | Our type |
|---|---|
| `BusinessProcess` | `Flow` (from `src/lib/types.ts`) |
| `AtomicAutomation` | `Automatisering` |
| `a.system` (SystemKey) | `a.systemen[0]` (first Systeem) |
| `a.steps` (typed InternalStep[]) | `a.stappen` (plain `string[]`) |
| `process.edges` | derived from `auto.koppelingen` per automation in the flow |
| `getProcessesUsingAutomation(id)` | `allFlows.filter(f => f.automationIds.includes(id))` |
| `process.successRate`, `trigger`, `frequency`, `owner` | not available on `Flow` — omit those stat boxes |
| `process.status` (`"active" \| "paused" \| "error"`) | `flow.systemen` + `flow.createdAt` are what we have |
| `SYSTEMS[key].hue` | `getSystemMeta(systeem).hue` from new `src/lib/systemMeta.ts` |

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `tailwind.config.ts` | Modify | Add success/warning/primary-soft/primary-glow colours; gradient/shadow/animation tokens |
| `src/index.css` | Modify | New CSS variables (primary colour, radius, surfaces, shadows, --system-* vars), utility classes |
| `src/lib/systemMeta.ts` | **Create** | Maps `Systeem` → `{ hue: string; label: string }` for CSS var colour lookup |
| `src/components/portal/MiniFlowPreview.tsx` | **Create** | SVG mini flow preview using system CSS vars |
| `src/components/FlowCard.tsx` | Modify (rewrite) | Adopt ProcessCard visual pattern: system dots, mini preview, hover shadow |
| `src/components/flows/AutomationNode.tsx` | **Create** | ReactFlow node: coloured top bar, system label, step count, reuse badge |
| `src/components/flows/FlowCanvas.tsx` | **Create** | ReactFlow canvas: derives edges from koppelingen, BFS layout |
| `src/components/flows/AutomationList.tsx` | **Create** | Numbered list with connector line and system colour circles |
| `src/components/flows/AutomationDetail.tsx` | **Create** | Detail panel: system icon, description, reuse links, plain-text stappen list |
| `src/components/flows/FlowHeader.tsx` | **Create** | Editable gradient-hero header with system badges and stats |
| `src/pages/Flows.tsx` | Modify (rewrite) | Hero header + search filter + proposals + FlowCard grid |
| `src/pages/FlowDetail.tsx` | Modify (rewrite) | ProcessDetail.tsx layout: FlowHeader + 2-col (canvas/list toggle + detail panel) |
| `src/components/AppLayout.tsx` | Modify | Add /flows routes to full-page exception; update top header styling |
| `src/test/systemMeta.test.ts` | **Create** | Unit tests for systemMeta utility |
| `src/test/flowEdges.test.ts` | **Create** | Unit tests for edge-building logic in FlowCanvas |

---

## Task 1: Design tokens

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/index.css`

### What changes (and what stays)

**Keep in tailwind.config.ts:** font families (IBM Plex Sans + JetBrains Mono), all existing lane/hubspot/gitlab/zapier/backend/status/sidebar/dot colours, existing keyframes.

**Add to tailwind.config.ts:** success, warning, primary-soft, primary-glow colour tokens; gradient/shadow backgroundImage/boxShadow extensions; fade-in + pulse-soft animations.

**Keep in index.css:** dark sidebar vars, existing `--hubspot`/`--zapier`/etc. brand vars (still used by badge classes), lane vars, all `.badge-*` utility classes, `.label-uppercase`, `.metric-card`.

**Change in index.css:** primary colour, foreground, card vars, secondary, muted, accent, ring, border, input, background, radius.

**Add to index.css:** primary-soft, primary-glow, success/warning vars, surface vars, shadow vars, gradient vars, `--system-*` vars for every `Systeem` value, `.card-elevated` and `.focus-ring` utility classes, updated ReactFlow CSS from reference.

- [ ] **Step 1: Update tailwind.config.ts**

Replace the existing `tailwind.config.ts` with:

```typescript
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        "primary-soft": "hsl(var(--primary-soft))",
        "primary-glow": "hsl(var(--primary-glow))",
        lane: {
          marketing:   "hsl(var(--lane-marketing))",
          sales:       "hsl(var(--lane-sales))",
          onboarding:  "hsl(var(--lane-onboarding))",
          boekhouding: "hsl(var(--lane-boekhouding))",
          management:  "hsl(var(--lane-management))",
        },
        dot: {
          automation: "hsl(var(--dot-automation))",
        },
        hubspot: "hsl(var(--hubspot))",
        gitlab: "hsl(var(--gitlab))",
        zapier: "hsl(var(--zapier))",
        backend: "hsl(var(--backend))",
        "status-active": "hsl(var(--status-active))",
        "status-disabled": "hsl(var(--status-disabled))",
        "status-review": "hsl(var(--status-review))",
        "status-outdated": "hsl(var(--status-outdated))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backgroundImage: {
        "gradient-hero": "var(--gradient-hero)",
        "gradient-primary": "var(--gradient-primary)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out both",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

- [ ] **Step 2: Update src/index.css**

Replace the `:root` block and add new utility classes. Keep all existing `.badge-*` classes, `.label-uppercase`, `.metric-card`, `.mermaid-container`. The full new file:

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 220 33% 99%;
    --foreground: 222 25% 12%;
    --card: 0 0% 100%;
    --card-foreground: 222 25% 12%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 25% 12%;

    /* Indigo-blue primary */
    --primary: 230 70% 56%;
    --primary-foreground: 0 0% 100%;
    --primary-soft: 230 90% 97%;
    --primary-glow: 230 80% 70%;

    --secondary: 220 20% 96%;
    --secondary-foreground: 222 25% 18%;

    --muted: 220 20% 96%;
    --muted-foreground: 220 12% 45%;

    --accent: 230 90% 97%;
    --accent-foreground: 230 70% 40%;

    --destructive: 0 75% 55%;
    --destructive-foreground: 0 0% 100%;

    --success: 152 60% 40%;
    --success-foreground: 0 0% 100%;
    --warning: 35 92% 52%;
    --warning-foreground: 0 0% 100%;

    --border: 220 18% 91%;
    --input: 220 18% 91%;
    --ring: 230 70% 56%;
    --radius: 0.75rem;

    /* Surfaces & effects */
    --surface-elevated: 0 0% 100%;
    --surface-sunken: 220 25% 97%;
    --grid-dot: 220 15% 88%;

    --gradient-hero: linear-gradient(135deg, hsl(230 90% 97%) 0%, hsl(220 33% 99%) 60%, hsl(195 80% 96%) 100%);
    --gradient-primary: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary-glow)) 100%);

    --shadow-xs: 0 1px 2px hsl(220 30% 15% / 0.04);
    --shadow-sm: 0 1px 3px hsl(220 30% 15% / 0.06), 0 1px 2px hsl(220 30% 15% / 0.04);
    --shadow-md: 0 4px 12px -2px hsl(220 30% 15% / 0.08), 0 2px 4px hsl(220 30% 15% / 0.04);
    --shadow-lg: 0 16px 40px -8px hsl(220 30% 15% / 0.12), 0 4px 12px hsl(220 30% 15% / 0.06);
    --shadow-glow: 0 8px 30px -8px hsl(var(--primary) / 0.35);

    /* Per-system brand hues (HSL values matching our existing brand colours) */
    --system-hubspot:    12 100% 67%;
    --system-zapier:     84  89% 37%;
    --system-typeform:    0   0% 15%;
    --system-sharepoint: 178  97% 26%;
    --system-wefact:     38  91% 55%;
    --system-docufy:     263  57% 50%;
    --system-backend:    210 100% 40%;
    --system-email:      160  84% 39%;
    --system-api:        215  25% 46%;
    --system-gitlab:      23 100% 49%;
    --system-anders:     220  12% 45%;

    /* Legacy brand vars — kept for existing .badge-* classes */
    --hubspot: 12 100% 67%;
    --zapier: 84 89% 37%;
    --backend: 210 100% 40%;
    --typeform: 0 0% 15%;
    --sharepoint: 178 97% 26%;
    --wefact: 38 91% 55%;
    --docufy: 263 57% 50%;
    --email: 160 84% 39%;
    --api: 215 25% 46%;
    --gitlab: 23 100% 49%;

    --status-active: 160 84% 39%;
    --status-disabled: 215 16% 47%;
    --status-review: 38 92% 50%;
    --status-outdated: 0 84% 60%;

    /* Dark sidebar — intentional brand choice */
    --sidebar-background: 222 47% 11%;
    --sidebar-foreground: 210 40% 98%;
    --sidebar-primary: 230 70% 56%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 222 47% 16%;
    --sidebar-accent-foreground: 210 40% 98%;
    --sidebar-border: 222 47% 16%;
    --sidebar-ring: 230 70% 56%;

    --radius-outer: 12px;
    --radius-inner: 8px;

    --lane-marketing: 280 60% 55%;
    --lane-sales: 215 80% 52%;
    --lane-onboarding: 165 60% 42%;
    --lane-boekhouding: 35 85% 55%;
    --lane-management: 350 65% 55%;
    --dot-automation: 45 95% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
}

@layer components {
  /* ── New design system utilities ── */
  .card-elevated {
    @apply bg-card border border-border rounded-xl;
    box-shadow: var(--shadow-sm);
  }
  .focus-ring {
    @apply outline-none ring-2 ring-ring/40 ring-offset-2 ring-offset-background;
  }

  /* ── Legacy badge utilities (unchanged) ── */
  .badge-hubspot {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--hubspot) / 0.1);
    color: hsl(var(--hubspot));
  }
  .badge-zapier {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--zapier) / 0.1);
    color: hsl(var(--zapier));
  }
  .badge-backend {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--backend) / 0.1);
    color: hsl(var(--backend));
  }
  .badge-typeform {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--typeform) / 0.1);
    color: hsl(var(--typeform));
  }
  .badge-sharepoint {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--sharepoint) / 0.1);
    color: hsl(var(--sharepoint));
  }
  .badge-wefact {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--wefact) / 0.1);
    color: hsl(var(--wefact));
  }
  .badge-docufy {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--docufy) / 0.1);
    color: hsl(var(--docufy));
  }
  .badge-email {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--email) / 0.1);
    color: hsl(var(--email));
  }
  .badge-api {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--api) / 0.1);
    color: hsl(var(--api));
  }
  .badge-gitlab {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--gitlab) / 0.1);
    color: hsl(var(--gitlab));
  }
  .badge-status-active {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--status-active) / 0.1);
    color: hsl(var(--status-active));
  }
  .badge-status-outdated {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--status-outdated) / 0.1);
    color: hsl(var(--status-outdated));
  }
  .badge-status-review {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--status-review) / 0.1);
    color: hsl(var(--status-review));
  }
  .badge-status-disabled {
    @apply rounded-full px-2 py-0.5 text-[10px] font-bold uppercase;
    background: hsl(var(--status-disabled) / 0.1);
    color: hsl(var(--status-disabled));
  }
  .label-uppercase {
    @apply text-[11px] font-bold uppercase tracking-widest text-muted-foreground;
  }
  .metric-card {
    @apply bg-card border border-border p-6 shadow-sm;
    border-radius: var(--radius-outer);
  }
  .mermaid-container {
    @apply bg-secondary border border-border p-4 overflow-hidden hover:overflow-auto transition-all;
    border-radius: var(--radius-inner);
  }
}

/* ── React Flow styles (updated for new design) ── */
.react-flow__attribution { display: none !important; }
.react-flow__edge-path {
  stroke: hsl(var(--border));
  stroke-width: 1.75;
}
.react-flow__edge.animated .react-flow__edge-path {
  stroke: hsl(var(--primary) / 0.55);
  stroke-dasharray: 6 4;
}
.react-flow__handle {
  width: 8px;
  height: 8px;
  background: hsl(var(--background));
  border: 1.5px solid hsl(var(--border));
}
.react-flow__background {
  background-color: hsl(var(--surface-sunken));
}
/* Legacy hover glow (used by Processen canvas) */
.react-flow__edge:hover .react-flow__edge-path {
  stroke-width: 5 !important;
  opacity: 1 !important;
  filter: drop-shadow(0 0 8px currentColor) drop-shadow(0 0 16px currentColor) !important;
}
.react-flow__edge:hover .react-flow__edge-textbg {
  fill-opacity: 1 !important;
}
.react-flow__edge:hover .react-flow__edge-text {
  font-size: 11px !important;
}
```

- [ ] **Step 3: Run tests — confirm 0 regressions**

```bash
cd "c:/Users/SebastiaanMol/Desktop/Nieuwe map/automation-navigator"
npx vitest run
```

Expected: all existing tests pass (CSS/token changes have no impact on logic tests).

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts src/index.css
git commit -m "feat(design): adopt Lovable design token system — new primary colour, radius, shadows, system vars"
```

---

## Task 2: systemMeta utility

**Files:**
- Create: `src/lib/systemMeta.ts`
- Create: `src/test/systemMeta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/systemMeta.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getSystemMeta } from "@/lib/systemMeta";
import type { Systeem } from "@/lib/types";

describe("getSystemMeta", () => {
  it("returns correct hue var name for HubSpot", () => {
    expect(getSystemMeta("HubSpot").hue).toBe("--system-hubspot");
  });

  it("returns correct hue for E-mail (special char in key)", () => {
    expect(getSystemMeta("E-mail").hue).toBe("--system-email");
  });

  it("returns correct label for Zapier", () => {
    expect(getSystemMeta("Zapier").label).toBe("Zapier");
  });

  it("covers all Systeem values without throwing", () => {
    const all: Systeem[] = ["HubSpot", "Zapier", "Typeform", "SharePoint", "WeFact", "Docufy", "Backend", "E-mail", "API", "GitLab", "Anders"];
    for (const s of all) {
      const meta = getSystemMeta(s);
      expect(meta.hue).toMatch(/^--system-/);
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npx vitest run src/test/systemMeta.test.ts
```

Expected: FAIL — `getSystemMeta` not found.

- [ ] **Step 3: Create src/lib/systemMeta.ts**

```typescript
import type { Systeem } from "@/lib/types";

export interface SystemMeta {
  hue: string;   // CSS var name, e.g. "--system-hubspot"
  label: string;
}

const META: Record<Systeem, SystemMeta> = {
  HubSpot:    { hue: "--system-hubspot",    label: "HubSpot" },
  Zapier:     { hue: "--system-zapier",     label: "Zapier" },
  Typeform:   { hue: "--system-typeform",   label: "Typeform" },
  SharePoint: { hue: "--system-sharepoint", label: "SharePoint" },
  WeFact:     { hue: "--system-wefact",     label: "WeFact" },
  Docufy:     { hue: "--system-docufy",     label: "Docufy" },
  Backend:    { hue: "--system-backend",    label: "Backend" },
  "E-mail":   { hue: "--system-email",      label: "E-mail" },
  API:        { hue: "--system-api",        label: "API" },
  GitLab:     { hue: "--system-gitlab",     label: "GitLab" },
  Anders:     { hue: "--system-anders",     label: "Anders" },
};

export function getSystemMeta(systeem: Systeem): SystemMeta {
  return META[systeem] ?? { hue: "--system-anders", label: systeem };
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npx vitest run src/test/systemMeta.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/systemMeta.ts src/test/systemMeta.test.ts
git commit -m "feat(design): add systemMeta utility — maps Systeem to CSS var hue name"
```

---

## Task 3: FlowCard rewrite + MiniFlowPreview

**Files:**
- Create: `src/components/portal/MiniFlowPreview.tsx`
- Modify: `src/components/FlowCard.tsx`

MiniFlowPreview is adapted from `docs/superpowers/flow/flow/portal-source/src/components/portal/MiniFlowPreview.tsx`. Key difference: instead of reading from `ATOMIC_AUTOMATIONS[id].system`, it receives an `autoMap` and reads `auto.systemen[0]`.

FlowCard is adapted from ProcessCard.tsx. Key differences: `Flow` has no `status` or `successRate`, so use `hasUpdate` as the status indicator; no category field, so omit that badge.

- [ ] **Step 1: Create src/components/portal/MiniFlowPreview.tsx**

```tsx
import type { Automatisering } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";

interface MiniFlowPreviewProps {
  automationIds: string[];
  autoMap: Map<string, Automatisering>;
  className?: string;
}

/**
 * Tiny stylised flow preview for cards.
 * Shows up to 6 dots coloured by the automation's primary system.
 */
export const MiniFlowPreview = ({ automationIds, autoMap, className = "" }: MiniFlowPreviewProps) => {
  const ids = automationIds.slice(0, 6);
  const overflow = automationIds.length - ids.length;

  return (
    <div className={`relative h-14 w-full ${className}`}>
      <svg
        viewBox="0 0 240 56"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="line-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="hsl(var(--border))" />
            <stop offset="100%" stopColor="hsl(var(--border))" />
          </linearGradient>
        </defs>
        <path
          d="M 16 28 Q 60 8 100 28 T 180 28 L 224 28"
          fill="none"
          stroke="url(#line-grad)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        {ids.map((id, i) => {
          const auto = autoMap.get(id);
          if (!auto) return null;
          const primarySysteem = auto.systemen[0] ?? "Anders";
          const meta = getSystemMeta(primarySysteem);
          const t = ids.length === 1 ? 0.5 : i / (ids.length - 1);
          const cx = 16 + t * 208;
          const cy = 28 + Math.sin(i * 1.2) * 10;
          const hue = `hsl(var(${meta.hue}))`;
          return (
            <g key={id}>
              <circle cx={cx} cy={cy} r={7} fill="hsl(var(--card))" />
              <circle cx={cx} cy={cy} r={5} fill={hue} opacity={0.18} />
              <circle cx={cx} cy={cy} r={3.5} fill={hue} />
            </g>
          );
        })}
      </svg>
      {overflow > 0 && (
        <span className="absolute right-1 bottom-0 text-[10px] font-mono text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Rewrite src/components/FlowCard.tsx**

```tsx
import { Link } from "react-router-dom";
import type { Automatisering, Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { MiniFlowPreview } from "@/components/portal/MiniFlowPreview";
import { ArrowUpRight } from "lucide-react";

interface FlowCardProps {
  flow: Flow;
  autoMap: Map<string, Automatisering>;
  hasUpdate?: boolean;
}

export function FlowCard({ flow, autoMap, hasUpdate }: FlowCardProps): React.ReactNode {
  const uniqueSystems = [...new Set(flow.systemen)];

  return (
    <Link
      to={`/flows/${flow.id}`}
      className="group block rounded-xl bg-card border border-border shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200 focus-ring"
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground tracking-wide">
            {flow.automationIds.length} automations
          </span>
          {hasUpdate ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-warning">
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              Update beschikbaar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Actief
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
            {flow.naam}
          </h3>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all flex-shrink-0 mt-0.5" />
        </div>
        {flow.beschrijving && (
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {flow.beschrijving}
          </p>
        )}

        <div className="mt-4">
          <MiniFlowPreview automationIds={flow.automationIds} autoMap={autoMap} />
        </div>

        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-1">
            {uniqueSystems.slice(0, 5).map((s) => {
              const meta = getSystemMeta(s);
              return (
                <span
                  key={s}
                  title={meta.label}
                  className="w-5 h-5 rounded-full border-2 border-card -ml-1 first:ml-0"
                  style={{ background: `hsl(var(${meta.hue}))` }}
                />
              );
            })}
            {uniqueSystems.length > 5 && (
              <span className="text-[10px] font-mono text-muted-foreground ml-1">
                +{uniqueSystems.length - 5}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {new Date(flow.createdAt).toLocaleDateString("nl-NL")}
          </p>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Update Flows.tsx to pass autoMap to FlowCard**

In `src/pages/Flows.tsx`, find every `<FlowCard ... />` usage and add the `autoMap` prop:

Old:
```tsx
<FlowCard key={flow.id} flow={flow} hasUpdate={hasUpdate} />
```

New:
```tsx
<FlowCard key={flow.id} flow={flow} autoMap={autoMap} hasUpdate={hasUpdate} />
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run
```

Expected: all pass (no test covers FlowCard directly).

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/MiniFlowPreview.tsx src/components/FlowCard.tsx src/pages/Flows.tsx
git commit -m "feat(design): rewrite FlowCard and add MiniFlowPreview — adopt ProcessCard visual pattern"
```

---

## Task 4: Flow detail components

**Files:**
- Create: `src/components/flows/AutomationNode.tsx`
- Create: `src/components/flows/FlowCanvas.tsx`
- Create: `src/components/flows/AutomationList.tsx`
- Create: `src/components/flows/AutomationDetail.tsx`
- Create: `src/components/flows/FlowHeader.tsx`
- Create: `src/test/flowEdges.test.ts`

These five components replace the current bare-bones inline rendering in `FlowDetail.tsx`. Read the reference implementations at `docs/superpowers/flow/flow/portal-source/src/components/flow/` before starting. Key adaptations are noted per component.

### 4a. Edge-building logic test

- [ ] **Step 1: Write the failing test**

Create `src/test/flowEdges.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildFlowEdges } from "@/components/flows/FlowCanvas";
import type { Automatisering } from "@/lib/types";

function makeAuto(id: string, targets: string[] = []): Automatisering {
  return {
    id,
    naam: id,
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: targets.map((t) => ({ doelId: t, label: "" })),
    fasen: [],
    createdAt: "",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
  };
}

describe("buildFlowEdges", () => {
  it("builds edges from koppelingen within the flow", () => {
    const ids = ["a", "b", "c"];
    const autoMap = new Map([
      ["a", makeAuto("a", ["b"])],
      ["b", makeAuto("b", ["c"])],
      ["c", makeAuto("c")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ from: "a", to: "b" });
    expect(edges[1]).toMatchObject({ from: "b", to: "c" });
  });

  it("ignores koppelingen pointing outside the flow", () => {
    const ids = ["a", "b"];
    const autoMap = new Map([
      ["a", makeAuto("a", ["b", "external"])],
      ["b", makeAuto("b")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ from: "a", to: "b" });
  });

  it("falls back to sequential chain when no koppelingen", () => {
    const ids = ["x", "y", "z"];
    const autoMap = new Map([
      ["x", makeAuto("x")],
      ["y", makeAuto("y")],
      ["z", makeAuto("z")],
    ]);
    const edges = buildFlowEdges(ids, autoMap);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({ from: "x", to: "y" });
    expect(edges[1]).toMatchObject({ from: "y", to: "z" });
  });

  it("returns empty for single automation", () => {
    const ids = ["solo"];
    const autoMap = new Map([["solo", makeAuto("solo")]]);
    expect(buildFlowEdges(ids, autoMap)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npx vitest run src/test/flowEdges.test.ts
```

Expected: FAIL — `buildFlowEdges` not exported.

### 4b. Create FlowCanvas.tsx

- [ ] **Step 3: Create src/components/flows/FlowCanvas.tsx**

```tsx
import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import type { Automatisering, Flow } from "@/lib/types";
import { AutomationNode } from "./AutomationNode";

const nodeTypes = { automation: AutomationNode };

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
}

/**
 * Derives edges from koppelingen. Only includes edges between automations
 * that are members of the flow. If no koppelingen exist, falls back to a
 * sequential chain (automationIds order).
 */
export function buildFlowEdges(
  automationIds: string[],
  autoMap: Map<string, Automatisering>,
): FlowEdge[] {
  const flowSet = new Set(automationIds);
  const edges: FlowEdge[] = [];

  for (const id of automationIds) {
    const auto = autoMap.get(id);
    if (!auto) continue;
    for (const k of auto.koppelingen ?? []) {
      if (flowSet.has(k.doelId)) {
        edges.push({ from: id, to: k.doelId, label: k.label });
      }
    }
  }

  if (edges.length === 0 && automationIds.length > 1) {
    for (let i = 0; i < automationIds.length - 1; i++) {
      edges.push({ from: automationIds[i], to: automationIds[i + 1], label: "" });
    }
  }

  return edges;
}

function layout(
  automationIds: string[],
  edges: FlowEdge[],
): Record<string, { x: number; y: number }> {
  const COL_W = 320;
  const ROW_H = 200;

  const incoming: Record<string, string[]> = {};
  automationIds.forEach((id) => (incoming[id] = []));
  edges.forEach((e) => {
    if (incoming[e.to]) incoming[e.to].push(e.from);
  });

  const level: Record<string, number> = {};
  const visit = (id: string): number => {
    if (level[id] !== undefined) return level[id];
    const ins = incoming[id];
    if (!ins.length) return (level[id] = 0);
    level[id] = Math.max(...ins.map(visit)) + 1;
    return level[id];
  };
  automationIds.forEach(visit);

  const byLevel: Record<number, string[]> = {};
  automationIds.forEach((id) => {
    const l = level[id] ?? 0;
    (byLevel[l] = byLevel[l] || []).push(id);
  });

  const maxWidth = Math.max(...Object.values(byLevel).map((arr) => arr.length));
  const totalWidth = maxWidth * COL_W;
  const positions: Record<string, { x: number; y: number }> = {};

  Object.entries(byLevel).forEach(([lvl, ids]) => {
    const y = Number(lvl) * ROW_H;
    const rowWidth = ids.length * COL_W;
    const offset = (totalWidth - rowWidth) / 2;
    ids.forEach((id, i) => {
      positions[id] = { x: offset + i * COL_W, y };
    });
  });

  return positions;
}

interface FlowCanvasProps {
  flow: Flow;
  autoMap: Map<string, Automatisering>;
  allFlows: Flow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const FlowCanvas = ({ flow, autoMap, allFlows, selectedId, onSelect }: FlowCanvasProps) => {
  const { nodes, edges } = useMemo(() => {
    const flowEdges = buildFlowEdges(flow.automationIds, autoMap);
    const positions = layout(flow.automationIds, flowEdges);

    const ns: Node[] = flow.automationIds.map((id, i) => {
      const auto = autoMap.get(id);
      const reusedCount = auto
        ? allFlows.filter((f) => f.id !== flow.id && f.automationIds.includes(id)).length
        : 0;
      return {
        id,
        type: "automation",
        position: positions[id] ?? { x: 0, y: i * 200 },
        data: { automation: auto, index: i, reusedCount },
        selected: id === selectedId,
      };
    });

    const es: Edge[] = flowEdges.map((e) => ({
      id: `${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label || undefined,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" },
      labelStyle: { fontSize: 11, fill: "hsl(var(--muted-foreground))", fontWeight: 600 },
      labelBgStyle: { fill: "hsl(var(--background))" },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    }));

    return { nodes: ns, edges: es };
  }, [flow, autoMap, allFlows, selectedId]);

  return (
    <div className="h-full w-full rounded-xl border border-border overflow-hidden bg-[hsl(var(--surface-sunken))]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => onSelect(n.id)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.4}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="hsl(var(--grid-dot))"
        />
        <Controls
          showInteractive={false}
          className="!shadow-sm !border !border-border !rounded-lg overflow-hidden"
        />
      </ReactFlow>
    </div>
  );
};
```

- [ ] **Step 4: Run edge test — confirm it passes**

```bash
npx vitest run src/test/flowEdges.test.ts
```

Expected: PASS (4 tests).

### 4c. Create AutomationNode.tsx

- [ ] **Step 5: Create src/components/flows/AutomationNode.tsx**

```tsx
import { Handle, Position, type NodeProps } from "reactflow";
import type { Automatisering } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { Layers } from "lucide-react";

export interface AutomationNodeData {
  automation: Automatisering | undefined;
  index: number;
  reusedCount: number;
}

const statusDot = (status: Automatisering["status"]) => {
  if (status === "Actief") return "bg-success";
  if (status === "Uitgeschakeld") return "bg-destructive";
  return "bg-warning"; // "In review" | "Verouderd"
};

export const AutomationNode = ({ data, selected }: NodeProps<AutomationNodeData>) => {
  const { automation: auto, index, reusedCount } = data;
  if (!auto) return null;

  const primarySysteem = auto.systemen[0] ?? "Anders";
  const sys = getSystemMeta(primarySysteem);

  return (
    <div
      className={`group relative w-[280px] rounded-xl bg-card border transition-all duration-200 ${
        selected
          ? "border-primary shadow-glow"
          : "border-border shadow-sm hover:shadow-md hover:-translate-y-0.5"
      }`}
      style={{ ["--sys" as string]: `hsl(var(${sys.hue}))` }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="h-1 w-full rounded-t-xl" style={{ background: "var(--sys)" }} />
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold flex-shrink-0"
              style={{
                background: `color-mix(in oklab, var(--sys) 14%, transparent)`,
                color: "var(--sys)",
              }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
              {sys.label}
            </span>
          </div>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot(auto.status)} flex-shrink-0`} />
        </div>

        <h3 className="text-sm font-semibold text-foreground leading-snug mb-1.5">
          {auto.naam}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {auto.doel}
        </p>

        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Layers className="w-3 h-3" />
            {auto.stappen.length} stap{auto.stappen.length === 1 ? "" : "pen"}
          </span>
          {reusedCount > 0 && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary-soft text-primary font-semibold"
              title={`Hergebruikt in ${reusedCount} andere flow${reusedCount === 1 ? "" : "s"}`}
            >
              ↻ {reusedCount}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};
```

### 4d. Create AutomationList.tsx

- [ ] **Step 6: Create src/components/flows/AutomationList.tsx**

```tsx
import type { Automatisering, Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { ChevronRight } from "lucide-react";

interface AutomationListProps {
  flow: Flow;
  autoMap: Map<string, Automatisering>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const AutomationList = ({ flow, autoMap, selectedId, onSelect }: AutomationListProps) => {
  return (
    <ol className="relative">
      <span className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
      {flow.automationIds.map((id, i) => {
        const auto = autoMap.get(id);
        if (!auto) return null;
        const primarySysteem = auto.systemen[0] ?? "Anders";
        const sys = getSystemMeta(primarySysteem);
        const active = id === selectedId;
        return (
          <li key={id} className="relative pl-12 pr-2 py-1.5">
            <span
              className="absolute left-2 top-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-card border-2 transition-colors text-[11px] font-bold"
              style={{
                borderColor: active ? `hsl(var(${sys.hue}))` : "hsl(var(--border))",
                color: `hsl(var(${sys.hue}))`,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => onSelect(id)}
              className={`w-full text-left rounded-lg px-3 py-2 transition-all duration-200 ${
                active
                  ? "bg-primary-soft border border-primary/30"
                  : "border border-transparent hover:bg-secondary"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold text-foreground leading-snug">
                    {auto.naam}
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {auto.doel}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: `hsl(var(${sys.hue}))` }}
                    />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {sys.label}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-[11px] text-muted-foreground">
                      {auto.stappen.length} stap{auto.stappen.length === 1 ? "" : "pen"}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
                    active ? "translate-x-0.5 text-primary" : ""
                  }`}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
};
```

### 4e. Create AutomationDetail.tsx

- [ ] **Step 7: Create src/components/flows/AutomationDetail.tsx**

`stappen` are plain `string[]`, not typed InternalStep objects — render as a numbered `<ol>` without step-kind icons.

```tsx
import { Link } from "react-router-dom";
import type { Automatisering, Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { ExternalLink, Repeat2, X } from "lucide-react";

interface AutomationDetailProps {
  automationId: string | null;
  currentFlowId: string;
  autoMap: Map<string, Automatisering>;
  allFlows: Flow[];
  onClose: () => void;
}

export const AutomationDetail = ({
  automationId,
  currentFlowId,
  autoMap,
  allFlows,
  onClose,
}: AutomationDetailProps) => {
  if (!automationId) return null;
  const auto = autoMap.get(automationId);
  if (!auto) return null;

  const primarySysteem = auto.systemen[0] ?? "Anders";
  const sys = getSystemMeta(primarySysteem);
  const reusedIn = allFlows.filter(
    (f) => f.id !== currentFlowId && f.automationIds.includes(automationId),
  );

  const description =
    auto.aiDescription ||
    (auto.beschrijvingInSimpeleTaal?.[0]) ||
    auto.doel;

  return (
    <div className="card-elevated p-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
            style={{
              background: `color-mix(in oklab, hsl(var(${sys.hue})) 14%, transparent)`,
              color: `hsl(var(${sys.hue}))`,
            }}
          >
            <span className="text-xs font-bold">{sys.label.slice(0, 2).toUpperCase()}</span>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Automation · {sys.label}
            </p>
            <h3 className="text-base font-semibold text-foreground leading-tight truncate">
              {auto.naam}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-ring flex-shrink-0"
          aria-label="Sluiten"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-sm text-foreground leading-relaxed">{description}</p>

      {reusedIn.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-primary-soft border border-primary/20">
          <div className="flex items-center gap-1.5 text-primary mb-2">
            <Repeat2 className="w-3.5 h-3.5" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">
              Ook gebruikt in
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {reusedIn.map((f) => (
              <Link
                key={f.id}
                to={`/flows/${f.id}`}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-card border border-primary/20 text-xs font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
              >
                {f.naam}
              </Link>
            ))}
          </div>
        </div>
      )}

      {auto.stappen.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Interne stappen ({auto.stappen.length})
          </p>
          <ol className="relative space-y-0.5">
            <span
              className="absolute left-[15px] top-3 bottom-3 w-px bg-border"
              aria-hidden
            />
            {auto.stappen.map((stap, idx) => (
              <li key={idx} className="relative pl-10 py-1.5">
                <span
                  className="absolute left-1 top-2 inline-flex items-center justify-center w-7 h-7 rounded-full bg-card border border-border text-[10px] font-mono font-bold"
                  style={{ color: `hsl(var(${sys.hue}))` }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <p className="text-xs text-foreground leading-relaxed">{stap}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-border">
        <Link
          to={`/alle?open=${auto.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Open in portaal
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
```

### 4f. Create FlowHeader.tsx

- [ ] **Step 8: Create src/components/flows/FlowHeader.tsx**

Editable version of ProcessHeader. Uses `gradient-hero` background. Omits trigger/frequency/lastRun/owner since `Flow` doesn't have those fields. Shows system badges, automation count, and creation date.

```tsx
import { Link } from "react-router-dom";
import type { Flow } from "@/lib/types";
import { getSystemMeta } from "@/lib/systemMeta";
import { ChevronRight, Layers } from "lucide-react";

interface FlowHeaderProps {
  flow: Flow;
  automationCount: number;
  naam: string;
  beschrijving: string;
  setNaam: (v: string) => void;
  setBeschrijving: (v: string) => void;
  isDirty: boolean;
  onSave: () => void;
  isSaving: boolean;
}

export const FlowHeader = ({
  flow,
  automationCount,
  naam,
  beschrijving,
  setNaam,
  setBeschrijving,
  isDirty,
  onSave,
  isSaving,
}: FlowHeaderProps) => {
  const uniqueSystems = [...new Set(flow.systemen)];

  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero">
      <div className="relative px-8 py-7">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
          <Link to="/flows" className="hover:text-foreground transition-colors">
            Flows
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{flow.naam}</span>
        </nav>

        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <input
              className="text-3xl font-semibold tracking-tight text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-border focus:outline-none w-full pb-0.5"
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
            />
            <textarea
              className="mt-3 w-full max-w-2xl text-[15px] leading-relaxed text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-border focus:outline-none resize-none"
              rows={2}
              value={beschrijving}
              onChange={(e) => setBeschrijving(e.target.value)}
              placeholder="Beschrijving..."
            />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {uniqueSystems.map((s) => {
                const meta = getSystemMeta(s);
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-xs font-medium text-foreground/80"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: `hsl(var(${meta.hue}))` }} />
                    {meta.label}
                  </span>
                );
              })}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border text-xs font-medium text-foreground/80">
                <Layers className="w-3 h-3" />
                {automationCount} automations
              </span>
            </div>
          </div>

          {isDirty && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:shadow-glow transition-shadow focus-ring disabled:opacity-50"
              >
                {isSaving ? "Opslaan..." : "Opslaan"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 max-w-xs">
          <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Aangemaakt
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {new Date(flow.createdAt).toLocaleDateString("nl-NL")}
            </p>
          </div>
          <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Automations
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{automationCount}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
```

- [ ] **Step 9: Run all tests**

```bash
npx vitest run
```

Expected: PASS (all existing tests + 4 new flowEdges tests).

- [ ] **Step 10: Commit**

```bash
git add src/components/flows/ src/test/flowEdges.test.ts
git commit -m "feat(flows): add AutomationNode, FlowCanvas, AutomationList, AutomationDetail, FlowHeader components"
```

---

## Task 5: Flows.tsx page rewrite

**Files:**
- Modify: `src/pages/Flows.tsx`

Adopts the `Index.tsx` hero/filter/grid pattern. Keeps all real-data logic (proposals, saving, confirm dialog). Adds a text search filter. The confirm dialog and loading overlay are unchanged.

- [ ] **Step 1: Rewrite src/pages/Flows.tsx**

```tsx
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, Workflow } from "lucide-react";
import {
  useAutomatiseringen,
  useFlows,
  useAllConfirmedAutomationLinks,
  useCreateFlow,
} from "@/lib/hooks";
import { nameFlow } from "@/lib/supabaseStorage";
import { detectFlows } from "@/lib/detectFlows";
import type { Automatisering, Systeem } from "@/lib/types";
import { FlowCard } from "@/components/FlowCard";
import { FlowConfirmDialog } from "@/components/FlowConfirmDialog";

interface ConfirmState {
  automationIds: string[];
  aiName: string;
  aiBeschrijving: string;
  aiError: boolean;
  loading: boolean;
}

export default function Flows(): React.ReactNode {
  const { data: automations = [], refetch: refetchAutomations } = useAutomatiseringen();
  const { data: flows = [] } = useFlows();
  const { data: confirmedLinks = [] } = useAllConfirmedAutomationLinks();
  const createFlow = useCreateFlow();

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [query, setQuery] = useState("");

  const autoMap = useMemo(
    () => new Map(automations.map((a) => [a.id, a])),
    [automations],
  );

  const proposals = useMemo(
    () => detectFlows(automations, confirmedLinks),
    [automations, confirmedLinks],
  );

  const savedFlowSets = useMemo(
    () => flows.map((f) => new Set(f.automationIds)),
    [flows],
  );

  const newProposals = useMemo(
    () =>
      proposals.filter((p) => {
        const pSet = new Set(p.automationIds);
        return !savedFlowSets.some(
          (fSet) => fSet.size === pSet.size && [...pSet].every((id) => fSet.has(id)),
        );
      }),
    [proposals, savedFlowSets],
  );

  const flowsWithUpdateFlag = useMemo(
    () =>
      flows.map((flow) => ({
        flow,
        hasUpdate: proposals.some((p) => {
          const pSet = new Set(p.automationIds);
          return (
            flow.automationIds.every((id) => pSet.has(id)) &&
            pSet.size > flow.automationIds.length
          );
        }),
      })),
    [flows, proposals],
  );

  const filteredFlows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flowsWithUpdateFlag;
    return flowsWithUpdateFlag.filter(
      ({ flow }) =>
        flow.naam.toLowerCase().includes(q) ||
        flow.beschrijving.toLowerCase().includes(q),
    );
  }, [flowsWithUpdateFlag, query]);

  async function handleBevestig(automationIds: string[]): Promise<void> {
    setConfirmState({ automationIds, aiName: "", aiBeschrijving: "", aiError: false, loading: true });
    const autos = automationIds.map((id) => autoMap.get(id)).filter((a): a is Automatisering => a !== undefined);
    try {
      const result = await nameFlow(autos);
      setConfirmState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      setConfirmState((prev) => (prev ? { ...prev, aiError: true, loading: false } : null));
    }
  }

  async function handleRetryAi(): Promise<void> {
    if (!confirmState) return;
    setConfirmState((prev) => (prev ? { ...prev, aiError: false, loading: true } : null));
    const autos = confirmState.automationIds.map((id) => autoMap.get(id)).filter((a): a is Automatisering => a !== undefined);
    try {
      const result = await nameFlow(autos);
      setConfirmState((prev) =>
        prev ? { ...prev, aiName: result.naam, aiBeschrijving: result.beschrijving, loading: false } : null,
      );
    } catch {
      setConfirmState((prev) => (prev ? { ...prev, aiError: true, loading: false } : null));
    }
  }

  async function handleSave(naam: string, beschrijving: string): Promise<void> {
    if (!confirmState) return;
    const autos = confirmState.automationIds.map((id) => autoMap.get(id)).filter((a): a is Automatisering => a !== undefined);
    const systemen = [...new Set(autos.flatMap((a) => a.systemen))] as Systeem[];
    try {
      await createFlow.mutateAsync({ naam, beschrijving, systemen, automationIds: confirmState.automationIds });
      setConfirmState(null);
      toast.success("Flow opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  const totalSystems = new Set(flows.flatMap((f) => f.systemen)).size;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero mb-8">
          <div className="px-8 py-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <Workflow className="w-4 h-4" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-primary">
                Automatiseringsportaal
              </span>
            </div>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">Flows</h1>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                  Overzicht van alle gedetecteerde flows. Elke flow is een keten van automations die
                  samenwerken via koppelingen.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:border-primary/40 transition-colors focus-ring"
                onClick={() => refetchAutomations()}
              >
                Detecteer flows
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <StatBadge label="Flows" value={flows.length} />
              <StatBadge label="Automations" value={automations.length} />
              <StatBadge label="Systemen" value={totalSystems} />
            </div>
          </div>
        </header>

        {/* Proposals */}
        {newProposals.length > 0 && (
          <div className="mb-8">
            <p className="label-uppercase mb-3">Nieuwe voorstellen</p>
            <div className="space-y-2">
              {newProposals.map((proposal) => {
                const names = proposal.automationIds.map((id) => autoMap.get(id)?.naam ?? id);
                return (
                  <div
                    key={proposal.automationIds.join("|")}
                    className="card-elevated p-4 flex items-center justify-between gap-4"
                  >
                    <p className="text-sm text-muted-foreground truncate">{names.join(" → ")}</p>
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shrink-0 focus-ring"
                      onClick={() => handleBevestig(proposal.automationIds)}
                    >
                      Bevestig
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search */}
        {flows.length > 0 && (
          <div className="card-elevated p-4 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek op naam of beschrijving…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus-ring"
              />
            </div>
          </div>
        )}

        {/* Grid */}
        {filteredFlows.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {filteredFlows.length} flow{filteredFlows.length === 1 ? "" : "s"} gevonden
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredFlows.map(({ flow, hasUpdate }) => (
                <FlowCard key={flow.id} flow={flow} autoMap={autoMap} hasUpdate={hasUpdate} />
              ))}
            </div>
          </>
        ) : flows.length === 0 ? (
          <div className="card-elevated p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Geen flows gevonden. Voeg koppelingen toe aan je automatiseringen om flows te detecteren.
            </p>
          </div>
        ) : (
          <div className="card-elevated p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Geen flows gevonden met deze zoekopdracht.
            </p>
          </div>
        )}
      </div>

      {confirmState && !confirmState.loading && (
        <FlowConfirmDialog
          automations={confirmState.automationIds.map((id) => autoMap.get(id)!).filter(Boolean)}
          initialName={confirmState.aiName}
          initialBeschrijving={confirmState.aiBeschrijving}
          aiError={confirmState.aiError}
          onRetryAi={handleRetryAi}
          onSave={handleSave}
          onCancel={() => setConfirmState(null)}
          saving={createFlow.isPending}
        />
      )}

      {confirmState?.loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20">
          <div className="bg-card border border-border rounded-xl px-6 py-4 text-sm shadow-lg">
            Naam genereren...
          </div>
        </div>
      )}
    </div>
  );
}

const StatBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-2.5">
    <p className="text-xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
  </div>
);
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Flows.tsx
git commit -m "feat(flows): rewrite Flows page — hero header, search filter, FlowCard grid"
```

---

## Task 6: FlowDetail.tsx page rewrite

**Files:**
- Modify: `src/pages/FlowDetail.tsx`

Adopts the `ProcessDetail.tsx` two-column layout: left = canvas with flow/steps toggle, right = selected automation detail + full automation list. Keeps all existing CRUD (save, delete, remove automation).

- [ ] **Step 1: Rewrite src/pages/FlowDetail.tsx**

```tsx
import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Info, LayoutGrid, ListOrdered } from "lucide-react";
import {
  useFlows,
  useAutomatiseringen,
  useUpdateFlow,
  useDeleteFlow,
} from "@/lib/hooks";
import type { Automatisering, Systeem } from "@/lib/types";
import { FlowHeader } from "@/components/flows/FlowHeader";
import { FlowCanvas } from "@/components/flows/FlowCanvas";
import { AutomationList } from "@/components/flows/AutomationList";
import { AutomationDetail } from "@/components/flows/AutomationDetail";

type View = "flow" | "steps";

export default function FlowDetail(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: flows = [], isLoading: flowsLoading } = useFlows();
  const { data: automations = [] } = useAutomatiseringen();
  const updateFlow = useUpdateFlow();
  const deleteFlow = useDeleteFlow();

  const flow = useMemo(() => flows.find((f) => f.id === id), [flows, id]);
  const autoMap = useMemo(
    () => new Map(automations.map((a) => [a.id, a])),
    [automations],
  );

  const [naam, setNaam] = useState("");
  const [beschrijving, setBeschrijving] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("flow");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const initializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (flow && initializedRef.current !== flow.id) {
      initializedRef.current = flow.id;
      setNaam(flow.naam);
      setBeschrijving(flow.beschrijving);
      setSelectedId(flow.automationIds[0] ?? null);
    }
  }, [flow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = flow !== undefined && (naam !== flow.naam || beschrijving !== flow.beschrijving);

  if (flowsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Flow niet gevonden.</p>
      </div>
    );
  }

  async function handleSave(): Promise<void> {
    try {
      await updateFlow.mutateAsync({ id: flow!.id, naam, beschrijving });
      toast.success("Opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteFlow.mutateAsync(flow!.id);
      toast.success("Flow verwijderd");
      navigate("/flows");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  async function handleRemoveAutomation(autoId: string): Promise<void> {
    const newIds = flow!.automationIds.filter((i) => i !== autoId);
    const remainingAutos = newIds
      .map((i) => autoMap.get(i))
      .filter((a): a is Automatisering => a !== undefined);
    const newSystemen = [...new Set(remainingAutos.flatMap((a) => a.systemen))] as Systeem[];
    try {
      await updateFlow.mutateAsync({ id: flow!.id, automationIds: newIds, systemen: newSystemen });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 space-y-6 animate-fade-in">
        <FlowHeader
          flow={flow}
          automationCount={flow.automationIds.length}
          naam={naam}
          beschrijving={beschrijving}
          setNaam={setNaam}
          setBeschrijving={setBeschrijving}
          isDirty={isDirty}
          onSave={handleSave}
          isSaving={updateFlow.isPending}
        />

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

            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-primary-soft border border-primary/20 text-xs text-foreground/80 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
              <p>
                {view === "flow"
                  ? "Klik op een node voor de interne stappen. Zie aan de ↻ badge of een automation ook in andere flows wordt hergebruikt."
                  : "Alle automations in volgorde. Klik op een stap om rechts de details te zien."}
              </p>
            </div>

            <div className="card-elevated overflow-hidden h-[680px]">
              {view === "flow" ? (
                <FlowCanvas
                  flow={flow}
                  autoMap={autoMap}
                  allFlows={flows}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : (
                <div className="h-full overflow-y-auto p-5">
                  <AutomationList
                    flow={flow}
                    autoMap={autoMap}
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
              currentFlowId={flow.id}
              autoMap={autoMap}
              allFlows={flows}
              onClose={() => setSelectedId(null)}
            />

            <div className="card-elevated p-4">
              <p className="px-1 pb-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Alle automations in deze flow
              </p>
              <AutomationList
                flow={flow}
                autoMap={autoMap}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              {flow.automationIds.some((id) => !autoMap.get(id)) && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {flow.automationIds
                    .filter((id) => !autoMap.get(id))
                    .map((id) => (
                      <div key={id} className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground truncate">{id} — niet meer beschikbaar</p>
                        <button
                          type="button"
                          className="text-xs text-destructive hover:underline shrink-0"
                          onClick={() => handleRemoveAutomation(id)}
                        >
                          Verwijder
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="card-elevated p-4">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted-foreground">Flow verwijderen?</p>
                  <button
                    type="button"
                    className="text-sm text-destructive font-medium hover:underline disabled:opacity-50"
                    onClick={handleDelete}
                    disabled={deleteFlow.isPending}
                  >
                    Ja, verwijder
                  </button>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-sm text-destructive hover:text-destructive/80 transition-colors"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Flow verwijderen
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

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
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
      active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    {icon}
    {label}
  </button>
);
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/FlowDetail.tsx
git commit -m "feat(flows): rewrite FlowDetail — ProcessDetail layout with ReactFlow canvas and detail panel"
```

---

## Task 7: AppLayout update

**Files:**
- Modify: `src/components/AppLayout.tsx`

Two changes:
1. Add `/flows` and `/flows/` routes to the full-page exception (so pages manage their own padding/max-width).
2. Update the top header to use new shadow and border styling.

- [ ] **Step 1: Update AppLayout.tsx**

Find the `main` element className logic:

Old:
```tsx
<main className={`flex-1 w-full ${
  location.pathname === "/processen" || location.pathname === "/brandy" ? "p-0" : "p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto"
}`}>
```

New:
```tsx
<main className={`flex-1 w-full ${
  location.pathname === "/processen" ||
  location.pathname === "/brandy" ||
  location.pathname === "/flows" ||
  location.pathname.startsWith("/flows/")
    ? "p-0"
    : "p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto"
}`}>
```

Also update the top header to use the new shadow token:

Old:
```tsx
<header className="h-12 flex items-center border-b border-border px-4 bg-card sticky top-0 z-30">
```

New:
```tsx
<header className="h-12 flex items-center border-b border-border px-4 bg-card sticky top-0 z-30" style={{ boxShadow: "var(--shadow-xs)" }}>
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "feat(layout): add /flows routes to full-page exception; update header shadow"
```

---

## Self-review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| New primary colour (blue-violet 230 70% 56%) | Task 1 |
| New radius (0.75rem) | Task 1 |
| New shadow system | Task 1 |
| New gradient tokens | Task 1 |
| fade-in + pulse-soft animations | Task 1 |
| `--system-*` CSS vars for all Systeem values | Task 1 |
| `.card-elevated` + `.focus-ring` utility classes | Task 1 |
| `systemMeta.ts` maps Systeem → hue + label | Task 2 |
| MiniFlowPreview component | Task 3 |
| FlowCard adopts ProcessCard pattern (system dots, preview, hover shadow) | Task 3 |
| AutomationNode (coloured top bar, step count, reuse badge) | Task 4 |
| FlowCanvas (ReactFlow, derives edges from koppelingen, BFS layout) | Task 4 |
| AutomationList (numbered, connector, system colour) | Task 4 |
| AutomationDetail (plain-text stappen, reuse links, external link) | Task 4 |
| FlowHeader (gradient-hero, editable, system badges, stats) | Task 4 |
| Flows.tsx hero + search + proposals + grid | Task 5 |
| FlowDetail.tsx two-column layout (canvas toggle + detail panel) | Task 6 |
| All existing CRUD (save, delete, remove automation) retained | Task 6 |
| AppLayout routing exceptions for new pages | Task 7 |
| Dark sidebar preserved | Task 1 (sidebar vars unchanged) |

### Placeholder check

None found. All steps contain full code.

### Type consistency

- `AutomationNodeData.automation: Automatisering | undefined` — handled with early null check in `AutomationNode`
- `buildFlowEdges` exported from `FlowCanvas.tsx` — imported in test as `@/components/flows/FlowCanvas`
- `getSystemMeta` used identically in all 5 components (MiniFlowPreview, FlowCard, AutomationNode, AutomationList, AutomationDetail, FlowHeader)
- `autoMap: Map<string, Automatisering>` passed consistently through FlowCanvas → AutomationNode data, AutomationList, AutomationDetail, FlowHeader
- `allFlows: Flow[]` passed to FlowCanvas and AutomationDetail for reuse detection
