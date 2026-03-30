import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Types ────────────────────────────────────────────────────────────────────

interface Condition {
  field: string;
  operator: "is_any_of" | "equals" | "not_equals" | "contains";
  value: string | string[];
}

interface ConditionGroup {
  id: string;
  type: "AND" | "OR";
  conditions: Condition[];
}

interface Branch {
  id: string;
  label: string;
  toStepId: string;
  conditionGroups: ConditionGroup[];
  isDefault: boolean;
}

type Payload = Record<string, unknown>;

interface EvaluationResult {
  toStepId: string | null;
  branchId: string | null;
  branchLabel: string | null;
  reason: "condition_match" | "default_fallback" | "no_match";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNestedValue(obj: Payload, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function evaluateCondition(condition: Condition, payload: Payload): boolean {
  const raw = getNestedValue(payload, condition.field);
  const actual = String(raw ?? "").toLowerCase().trim();

  switch (condition.operator) {
    case "equals":
      return actual === String(condition.value).toLowerCase().trim();

    case "not_equals":
      return actual !== String(condition.value).toLowerCase().trim();

    case "contains":
      return actual.includes(String(condition.value).toLowerCase().trim());

    case "is_any_of": {
      const options = Array.isArray(condition.value)
        ? condition.value.map((v) => String(v).toLowerCase().trim())
        : [String(condition.value).toLowerCase().trim()];
      return options.includes(actual);
    }

    default:
      return false;
  }
}

function evaluateGroup(group: ConditionGroup, payload: Payload): boolean {
  if (group.conditions.length === 0) return true;
  if (group.type === "AND") return group.conditions.every((c) => evaluateCondition(c, payload));
  if (group.type === "OR") return group.conditions.some((c) => evaluateCondition(c, payload));
  return false;
}

function evaluateBranch(branch: Branch, payload: Payload): boolean {
  if (branch.isDefault) return false;
  if (branch.conditionGroups.length === 0) return true;
  return branch.conditionGroups.every((g) => evaluateGroup(g, payload));
}

function determineNextStep(branches: Branch[], payload: Payload): EvaluationResult {
  const nonDefaults = branches.filter((b) => !b.isDefault);
  const defaultBranch = branches.find((b) => b.isDefault) ?? null;

  for (const branch of nonDefaults) {
    if (evaluateBranch(branch, payload)) {
      return {
        toStepId: branch.toStepId,
        branchId: branch.id,
        branchLabel: branch.label,
        reason: "condition_match",
      };
    }
  }

  if (defaultBranch) {
    return {
      toStepId: defaultBranch.toStepId,
      branchId: defaultBranch.id,
      branchLabel: defaultBranch.label,
      reason: "default_fallback",
    };
  }

  return { toStepId: null, branchId: null, branchLabel: null, reason: "no_match" };
}

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { automation_id, payload } = await req.json() as {
      automation_id: string;
      payload: Payload;
    };

    if (!automation_id) {
      return Response.json({ error: "automation_id is required" }, { status: 400, headers: corsHeaders });
    }
    if (!payload || typeof payload !== "object") {
      return Response.json({ error: "payload must be an object" }, { status: 400, headers: corsHeaders });
    }

    // Fetch automation from Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("automatiseringen")
      .select("id, naam, branches")
      .eq("id", automation_id)
      .single();

    if (error || !data) {
      return Response.json({ error: "Automation niet gevonden" }, { status: 404, headers: corsHeaders });
    }

    const branches: Branch[] = data.branches ?? [];

    if (branches.length === 0) {
      return Response.json({
        error: "Deze automation heeft geen branches geconfigureerd",
      }, { status: 422, headers: corsHeaders });
    }

    const result = determineNextStep(branches, payload);

    return Response.json(
      {
        automation_id: data.id,
        automation_name: data.naam,
        ...result,
        evaluated_at: new Date().toISOString(),
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("evaluate-automation error:", err);
    return Response.json(
      { error: "Interne fout", detail: String(err) },
      { status: 500, headers: corsHeaders },
    );
  }
});
