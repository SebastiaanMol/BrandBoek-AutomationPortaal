export function toFriendlyDbError(error: unknown): Error {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  const code = String((error as { code?: string })?.code ?? "");
  const isDuplicateName =
    code === "23505" &&
    (message.includes("automatiseringen_naam") ||
      message.includes("naam_normalized") ||
      message.includes("duplicate key"));

  if (isDuplicateName) {
    return new Error("Er bestaat al een automatisering met (bijna) dezelfde naam.");
  }

  if (
    (message.includes("source") && message.includes("schema cache")) ||
    (message.includes("updated_at") && message.includes("schema cache")) ||
    message.includes("violates row-level security")
  ) {
    return new Error("De custom-pipeline database migration is nog niet toegepast in Supabase.");
  }

  return error instanceof Error ? error : new Error("Databasefout");
}
