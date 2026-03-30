# Phase 2: Data Completeness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 02-data-completeness
**Areas discussed:** Phase (fasen) assignment, Owner assignment, Completeness gate at approval

---

## Phase (fasen) Assignment

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-select in ProposalCard | Add fasen multi-select to field grid — reuses KlantFase values, consistent with existing editing pattern | |
| AI-suggested with override | Sync edge function / Python backend guesses fasen from workflow name/category; reviewer confirms or changes | ✓ |
| Required only after approval | No change to import flow — reviewer assigns later via BewerkAutomatisering | |

**User's choice:** AI-suggested with override

---

**Follow-up: Where should suggestion logic live?**

| Option | Description | Selected |
|--------|-------------|----------|
| In the hubspot-sync Edge Function | Add fasenSuggest() to existing edge function — runs at sync time, TypeScript, no extra hop | |
| In the Python backend mapper | Call Python FastAPI backend from edge function — more powerful, adds network dependency | ✓ |

**User's choice:** Python backend mapper

---

**Follow-up: Should fasen be required before approving?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — block approval if fasen is empty | Enforce DATA-03: Approve button disabled until at least one phase assigned | ✓ |
| No — advisory only | Warning but allow approval without fasen | |

**User's choice:** Hard block — fasen required before approval

---

## Owner Assignment

**How should owner be assigned?**

| Option | Description | Selected |
|--------|-------------|----------|
| Free-text input in ProposalCard | Add owner text field to editable field grid | ✓ |
| Dropdown of known staff | Hardcoded or configurable list of staff names | |

**User's choice:** Free-text input in ProposalCard

---

**Should owner be required before approving?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — block approval if owner is empty | Enforce DATA-03 consistently with fasen | |
| No — advisory only | Show warning/badge but allow approval without owner | ✓ |

**User's choice:** Advisory only (no hard block)

---

## Completeness Gate at Approval

**What happens when reviewer clicks Approve with missing fields?**

| Option | Description | Selected |
|--------|-------------|----------|
| Block with inline warning | Approve button disabled; reviewer must fill fields first | |
| Warn but allow | Confirmation dialog listing missing fields; reviewer can override | ✓ |
| Silent — confidence badges only | No change — existing ConfBadge sufficient | |

**User's choice:** Warn but allow (confirmation dialog)

---

**Which fields trigger the warning?**

| Option | Description | Selected |
|--------|-------------|----------|
| fasen (lifecycle phase) | Warning if no KlantFase assigned | (overridden by hard block from earlier decision) |
| trigger_beschrijving | Warning if trigger empty | |
| owner | Warning if no owner | |
| stappen (at least 1) | Warning if zero steps | ✓ |

**User's choice:** Only `stappen === 0` triggers the warning dialog. `fasen` empty is a hard block (per earlier decision). `owner` and `trigger_beschrijving` remain advisory only.

---

## Claude's Discretion

- Exact shadcn/ui component for fasen multi-select
- Dutch wording of the stappen warning dialog
- Whether to add a pending count badge to the Imports sidebar nav item

## Deferred Ideas

- Manual entry tracking for non-HubSpot automations — not selected for discussion
- Zapier/Typeform sync — v2, out of scope
- Batch approve/reject — not in requirements
