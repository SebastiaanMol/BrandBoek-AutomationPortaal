import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vraag, antwoord, label } = await req.json() as {
      vraag: string;
      antwoord: string;
      label: "correct" | "incorrect" | "onvolledig";
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    // Insert feedback — table: brandy_feedback (id uuid, vraag text, antwoord text, label text, created_at timestamptz)
    const { error } = await (db as ReturnType<typeof createClient>)
      .from("brandy_feedback")
      .insert({ vraag, antwoord, label });

    if (error) {
      // Table may not exist yet — log but don't crash
      console.warn("brandy_feedback insert failed (table may not exist):", error.message);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brandy-feedback error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
