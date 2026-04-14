/**
 * Sends file content to the Anthropic Messages API and returns a 1-2 sentence
 * Dutch description of what the automation does.
 *
 * Requires VITE_ANTHROPIC_API_KEY to be set.
 * The `anthropic-dangerous-request-cors-allow-all` header enables browser-side calls.
 */
export async function generateAiDescription(fileContent: string): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("VITE_ANTHROPIC_API_KEY is niet ingesteld");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-request-cors-allow-all": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Beschrijf in maximaal 2 zinnen wat de volgende automation doet. Antwoord uitsluitend in het Nederlands. Wees concreet en technisch.\n\n${fileContent.slice(0, 4000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API fout (${res.status}): ${body}`);
  }

  const data = await res.json();

  // Runtime guard: ensure data.content[0] exists and has a text property
  if (!Array.isArray(data.content) || data.content.length === 0) {
    throw new Error("Anthropic API: geen content in antwoord ontvangen");
  }

  const content = data.content[0];
  if (typeof content !== "object" || content === null || typeof content.text !== "string") {
    throw new Error("Anthropic API: onverwacht antwoordformaat");
  }

  return content.text;
}
