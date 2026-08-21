# Sync Review Superseded Design

## Context

The Imports inbox currently shows every `pending` row in `source_sync_change_items`. Live data showed 1803 open review rows for 485 automations, with no duplicate automations on `(source, external_id)`. The high count is caused by old sync-preview rows staying pending across multiple sync runs.

The product intent is that the inbox represents current work, not historical sync output. A review row is a snapshot. When a newer sync produces a newer state for the same automation and same review problem, the older pending snapshot should no longer require user action.

## Goal

Show only current open sync-review work in Imports.

Older pending review rows must be automatically replaced when a newer sync-preview supersedes them. They should remain in the database for audit/history, but should not appear as open work and should not be applyable.

## Non-Goals

- Do not delete historical review rows.
- Do not remove `source_sync_runs`.
- Do not physically remove the old import proposal tables in this change.
- Do not change the direct-apply behavior for current `new_automation` rows except where older duplicates are superseded.

## Status Model

Add a new status to `source_sync_change_items`:

- `pending`: current open review work.
- `applied`: user applied this row.
- `skipped`: user intentionally did not apply this row.
- `failed`: applying this row failed.
- `superseded`: row was pending, but a newer sync-preview made it obsolete.

Only `pending` rows should be listed in the Imports inbox.

## Review Key

Each review row gets a stable review key used to decide whether a newer row replaces an older one.

Base identity:

```text
source + external_id + change_type + review_key
```

Rules:

- For `new_automation`, `metadata_changed`, `route_changed`, and `source_missing`, `review_key` can be the change type.
- For `source_data_incomplete`, `review_key` must identify the specific missing evidence, for example:
  - `hubspot_workflow`
  - `hubspot_triggers`
  - `hubspot_actions`
  - `hubspot_webhook_path`
  - `gitlab_endpoint`
  - `gitlab_handler`
  - `gitlab_call_graph`
  - `zapier_metadata`
  - `zapier_steps`
  - `zapier_webhook_handoff`
  - `typeform_fields`
  - `typeform_active_webhook`

This prevents one warning from overwriting a different warning for the same automation.

## Preview Flow

When a sync-preview runs:

1. Build the current change drafts from the source payload.
2. Compute the review key for each draft.
3. Before inserting the new draft, mark older matching `pending` rows as `superseded`.
4. Insert the new draft as `pending`.
5. After all drafts are known for that source, mark older pending rows for the same source as `superseded` when their review key no longer exists in the latest preview and they belong to automations covered by the latest source snapshot.

The latest sync result becomes the only open truth for that source.

## Existing Data Cleanup

Add a repair path for current accumulated data:

1. Find all `pending` rows.
2. Group rows by `source + external_id + change_type + review_key`.
3. Keep the newest row in each group as `pending`.
4. Mark older rows in each group as `superseded`.
5. Mark `new_automation` rows as `superseded` when an automation already exists with the same `(source, external_id)`.

This should reduce open counts from historical rows to current unique review work.

## Apply Flow

Apply must only process rows that are still `pending`.

If the client sends an ID that is no longer pending:

- `superseded` rows are ignored or counted as skipped with a clear reason.
- `applied`, `skipped`, or `failed` rows are not processed again.

This prevents stale browser state from applying obsolete source snapshots.

## Imports UI

The Imports page continues to query `status = pending`.

Copy should make the count clear:

- Use "actuele open bronwijzigingen" instead of wording that implies historical rows.
- Page selection still applies only to visible current rows.

## Testing

Server/helper tests:

- New preview supersedes older pending rows with the same review key.
- `source_data_incomplete` rows with different evidence keys do not supersede each other.
- A later preview that no longer includes a previous problem supersedes that previous pending row.
- `new_automation` pending row is superseded if the automation already exists.
- Apply ignores or skips `superseded` rows.

Storage/UI tests:

- Imports query only returns `pending`.
- Counts reflect current pending rows after superseded cleanup.
- Page selection and apply use only currently visible pending IDs.

Live verification:

- Run read-only counts before cleanup.
- Run cleanup/repair in a controlled path.
- Confirm duplicate pending review keys drop to zero.
- Confirm Imports open count matches current unique review work.
