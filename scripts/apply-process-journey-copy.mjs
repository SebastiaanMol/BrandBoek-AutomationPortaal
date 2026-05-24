#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DRY_RUN_ONLY = !process.argv.includes("--apply");
const DEFAULT_SOURCE = "tmp/process-journey-copy-all.json";
const AUTH_STATE_PATH = "tmp/playwright-auth-state.json";

function readEnv() {
  if (!existsSync(".env")) {
    throw new Error("Geen .env gevonden. Dit script heeft VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY nodig.");
  }

  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index),
          line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function readApprovedItem() {
  const id = argValue("--id");
  if (!id) throw new Error("Geef precies een procesreis op met --id <flow-id>.");

  const sourcePath = argValue("--source") ?? DEFAULT_SOURCE;
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const item = source.items?.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Geen voorstel gevonden voor flow ${id} in ${sourcePath}.`);
  if (!item.nieuweNaam || !item.nieuweTekst) {
    throw new Error(`Voorstel ${id} mist nieuweNaam of nieuweTekst.`);
  }

  return {
    sourcePath,
    item,
    payload: {
      naam: item.nieuweNaam,
      beschrijving: item.nieuweTekst,
    },
  };
}

function readAuthState() {
  if (!existsSync(AUTH_STATE_PATH)) {
    throw new Error("Geen tmp/playwright-auth-state.json gevonden. Log eerst lokaal in of maak een Playwright storageState.");
  }

  const state = JSON.parse(readFileSync(AUTH_STATE_PATH, "utf8"));
  const origin = state.origins?.find((candidate) =>
    candidate.localStorage?.some((entry) => entry.name.includes("auth-token"))
  );
  const authEntry = origin?.localStorage?.find((entry) => entry.name.includes("auth-token"));
  if (!origin || !authEntry) throw new Error("Geen Supabase auth-token gevonden in tmp/playwright-auth-state.json.");

  return { state, authEntry, session: JSON.parse(authEntry.value) };
}

async function refreshSessionIfNeeded(env) {
  const auth = readAuthState();
  const expiresAtMs = (auth.session.expires_at ?? 0) * 1000;
  if (auth.session.access_token && expiresAtMs > Date.now() + 60_000) {
    return auth.session.access_token;
  }

  if (!auth.session.refresh_token) {
    throw new Error("Sessie is verlopen en bevat geen refresh_token.");
  }

  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: auth.session.refresh_token }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase sessie vernieuwen mislukt (${res.status}): ${text}`);

  const refreshed = JSON.parse(text);
  auth.authEntry.value = JSON.stringify(refreshed);
  writeFileSync(AUTH_STATE_PATH, JSON.stringify(auth.state, null, 2), "utf8");
  return refreshed.access_token;
}

async function supabaseRequest(env, token, path, options = {}) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase request mislukt (${res.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const env = readEnv();
  const token = await refreshSessionIfNeeded(env);
  const { sourcePath, item, payload } = readApprovedItem();
  const path = `flows?id=eq.${encodeURIComponent(item.id)}&select=id,naam,beschrijving`;

  if (DRY_RUN_ONLY) {
    console.log(JSON.stringify({ DRY_RUN_ONLY, sourcePath, id: item.id, payload }, null, 2));
    return;
  }

  const updated = await supabaseRequest(env, token, path, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });

  const verified = await supabaseRequest(env, token, path);
  console.log(JSON.stringify({ DRY_RUN_ONLY, updated, verified }, null, 2));
}

await main();
