# Automatiseringsportaal — broncode bundel

## Installatie
```bash
npm i react-router-dom reactflow lucide-react @tanstack/react-query \
  class-variance-authority clsx tailwind-merge tailwindcss-animate
```
Voeg shadcn/ui base toe (`button`, `tooltip`, `sonner`, `toast`).

## Structuur
- `src/index.css` — design tokens (HSL)
- `tailwind.config.ts` — theme
- `src/data/portal.ts` — types + mock data
- `src/lib/{utils,stepKind}.ts` — helpers
- `src/components/portal/*` — overzichtskaart + mini-preview
- `src/components/flow/*` — flow canvas, lijst, detail, header, node
- `src/pages/{Index,ProcessDetail,NotFound}.tsx` — routes
- `src/{App,main}.tsx` — entrypoint

## Routes
- `/` overzicht
- `/process/:id` detail
