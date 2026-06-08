# Gateway Top-Entry Routing — Design Spec

**Date:** 2026-06-08  
**Status:** Approved

---

## Probleem

Wanneer een taak direct boven een gateway (decision diamond) staat, loopt de verbinding via de rechterzijde van de taak naar de linkerzijde van de gateway — een omweg die er visueel verkeerd uitziet.

## Gewenste routing

Wanneer de bron duidelijk boven de gateway staat (`fy < ty - DECISION_H`), moet de verbinding:

1. **Vertrekken** vanuit het midden-onderkant van de bronnode (`fx, edgeDown(from)`)
2. **Recht omlaag** lopen naar het bovenpunt van de gateway (`tx, ty - DECISION_H`)
3. Bij identieke kolommen: perfecte verticale lijn
4. Bij kleine X-offset: recht omlaag met een kort boogje van max 8px onderaan om aan te sluiten op het gateway-bovenpunt
5. **Pijl zichtbaar**: `markerEnd` op het pad, zodat de pijl uitkomt op het bovenpunt van de ruit

## Pad-formule

```
Als |fx - tx| < 4 (zelfde kolom):
  M fx startY L tx endY

Anders (kleine X-offset):
  M fx startY V (endY - r) Q fx endY (fx + dx) endY H tx
```

Waarbij:
- `startY = edgeDown(from, fy)` — onderkant bronnode
- `endY = ty - DECISION_H` — bovenpunt gateway
- `r = 8` — boogradius
- `dx = sign(tx - fx) * r` — richting van de horizontale offset

## Scope

- `src/components/process/ProcessCanvas.tsx` — edit mode
- `src/components/procesviewer/ProcessviewerCanvas.tsx` — view mode (`ConnectorLine`)

## Out of scope

- Gateway als bron (onderkant vertrek) — apart besluit
- Meerdere gateways in een keten
