# Read-Only Sentry Issues in the Portal Design

## Goal

Show Sentry issues inside the automation portal, linked to the automations they most likely belong to, without sending anything from the portal to Sentry.

This replaces the earlier observability direction for this use case. The portal should use Sentry as a read-only external issue source:

```text
Portal UI -> Supabase Edge Function -> Sentry REST API -> Portal UI
```

The portal must not:

- initialize browser-side Sentry event capture;
- send portal errors, sessions, traces, replays, or source maps to Sentry;
- expose `SENTRY_AUTH_TOKEN` in browser code;
- update, resolve, archive, assign, delete, or mutate Sentry issues;
- require Sentry write scopes.

## Product Behavior

The automation portal should answer: "Which automations currently have Sentry errors?"

V1 shows this in two places:

- **Automation overview**: each automation row can show a red Sentry issue badge/count when unresolved Sentry issues are linked to that automation.
- **Automation detail page**: a read-only Sentry issues card lists the matching issues for that automation, including title, level/status, event count, last seen date, confidence of the match, and a link to open the issue in Sentry.

The UI should make uncertainty explicit. If an issue is matched by exact metadata, show it as a strong match. If it is matched by text/source heuristics, show it as a possible match. Do not silently attach low-confidence issues to an automation.

## Architecture

### Supabase Edge Function

Create a new Supabase Edge Function, for example `sentry-issues`.

Responsibilities:

- Read `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` from Supabase secrets.
- Accept request bodies for:
  - overview mode: list issue summaries for multiple or all known automations;
  - detail mode: list issues for one automation id.
- Call Sentry's organization issues API with a read-only bearer token.
- Request unresolved issues by default.
- Return only sanitized fields needed by the portal.
- Never proxy full stack traces, event payloads, user data, request bodies, cookies, headers, or attachments.

Sentry's current recommended issues endpoint is organization-scoped:

```text
GET /api/0/organizations/{organization_id_or_slug}/issues/
```

The older project issues endpoint exists but is documented as replaced by the organization issues endpoint. The Edge Function should use the organization endpoint and filter to the configured project when the API supports that through query parameters.

### Frontend Data Layer

Add a small Sentry issues client in the frontend storage/query layer. It should call the Supabase Edge Function through the existing Supabase client.

Suggested shape:

```ts
interface PortalSentryIssue {
  id: string;
  shortId?: string;
  title: string;
  culprit?: string;
  level?: string;
  status: string;
  count: number;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  permalink: string;
  matchedAutomationId?: string;
  matchConfidence: "exact" | "strong" | "possible" | "unmatched";
  matchReason: string;
}
```

React Query hooks should cache issue reads briefly, for example 60 seconds. Avoid aggressive polling in V1 to reduce Sentry API usage and rate-limit risk.

## Matching Strategy

Existing backend/Python Sentry usage appears to call `sentry_sdk.capture_exception(...)` frequently, but the repository does not show a reliable existing `automation_id` tag on those events. Therefore V1 must not assume exact tags are always present.

Use a staged matching strategy:

1. **Exact tag match**
   Match if Sentry issue metadata includes `automation_id` equal to the portal automation id.

2. **Strong source identifier match**
   Match against stable identifiers already stored on automations:
   - `externalId`;
   - GitLab endpoint/path/handler;
   - HubSpot workflow id;
   - Zapier zap id;
   - Typeform form id;
   - webhook paths.

3. **Possible text match**
   Match by normalized automation display name, source name, issue title, culprit, and searchable issue metadata.

4. **Unmatched**
   If confidence is low, keep the issue unlinked. It can be shown later in a global observability view, but V1 should not attach it to a specific automation row.

The overview count should include exact and strong matches by default. Possible matches can be shown on the detail page under a separate "Mogelijke matches" section.

## UI Design

### Automation Overview

In `AutomationsPage` / `AlleAutomatiseringen`:

- Add an aggregate stat pill: `N Sentry issues`.
- Add a row badge near the existing source warning area:
  - red badge for exact/strong unresolved issues;
  - muted or amber badge for possible matches if shown.
- Keep rows readable on mobile by using short labels:
  - `2 Sentry`;
  - `Mogelijke Sentry match`.
- Add a filter later only if needed; V1 can start without a dedicated Sentry filter to avoid expanding scope.

### Automation Detail Page

In `AutomationDetailPage`:

- Add a `SentryIssuesCard` below source quality and before source-specific detail templates.
- Show states:
  - loading;
  - no linked Sentry issues;
  - linked issues;
  - possible matches;
  - Edge Function/Sentry read error.
- Each issue row shows:
  - issue title;
  - level/status;
  - count;
  - last seen;
  - match confidence/reason;
  - `Open in Sentry` external link.

The card should be clearly read-only. Do not add resolve/archive/update buttons.

## Security and Privacy

- The Sentry auth token stays only in Supabase secrets.
- Configure the Supabase Edge Function with runtime secrets only:
  - `SENTRY_AUTH_TOKEN`: read-only token;
  - `SENTRY_ORG`: `brand-boekhouders`;
  - `SENTRY_PROJECT`: `automations`.
- The browser receives only sanitized issue summaries.
- The Edge Function must reject unsupported methods and avoid exposing raw upstream error bodies.
- Use only read scopes on the Sentry token, such as issue/event/org/project read scopes.
- Do not store the token in `.env`, Vite/browser variables, local storage, browser code, or GitHub-visible config.
- Do not add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, or `SENTRY_PROJECT` as `VITE_*` variables or expose them to the browser bundle.
- Do not add source-map upload or release upload as part of this feature.

## Error Handling

If Sentry is unavailable or the token is misconfigured:

- overview should degrade silently to no Sentry badges plus an optional small warning in the Sentry stat area;
- detail page should show a non-blocking warning card;
- automations must still load normally.

If the Sentry API returns too many results:

- limit V1 to recent unresolved issues;
- cap returned issues per request;
- show a "resultaat beperkt" note if the cap is reached.

## Testing

Add focused tests for:

- matching exact `automation_id` tags;
- matching stable source identifiers;
- not linking low-confidence text matches as exact;
- Edge Function request validation and sanitized responses;
- overview row badge rendering;
- detail card loading, empty, success, and error states.

Keep tests independent from live Sentry. Use mocked Edge Function responses for frontend tests and mocked Sentry API responses for Edge Function tests where practical.

## Rollout

1. Disable or remove browser-side Sentry event capture from the earlier observability work, because the accepted direction is read-only.
2. Add the read-only Edge Function.
3. Add the frontend storage/query layer.
4. Add overview badges and aggregate count.
5. Add the automation detail Sentry card.
6. Verify locally with mocked data.
7. Verify against live Sentry only after confirming Supabase has the read-only secrets.

## Open Non-Goals

These are intentionally out of scope for V1:

- writing back to Sentry;
- Sentry issue triage inside the portal;
- source-map uploads;
- frontend/browser event capture;
- always-on background sync to Supabase;
- a separate global observability page.
