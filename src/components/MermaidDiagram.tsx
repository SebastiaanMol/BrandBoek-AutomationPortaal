import { useEffect, useRef, useState, useId } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "IBM Plex Sans",
});

/**
 * Expand chained arrows on single lines into separate lines.
 * e.g. "A --> B --> C" becomes "A --> B\n    B --> C"
 */
function sanitizeChart(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      // Escape parentheses inside square-bracket labels [...] to avoid Mermaid parse errors
      return line.replace(/\[([^\]]*)\]/g, (_match, content: string) => {
        const escaped = content.replace(/\(/g, "#40;").replace(/\)/g, "#41;");
        return `[${escaped}]`;
      });
    })
    .flatMap((line) => {
      // Match chains like  X[...] --> Y[...] --> Z[...]
      const parts = line.split(/\s*-->\s*/);
      if (parts.length <= 2) return [line];
      const indent = line.match(/^(\s*)/)?.[1] ?? "    ";
      const lines: string[] = [];
      for (let i = 0; i < parts.length - 1; i++) {
        lines.push(`${indent}${parts[i].trim()} --> ${parts[i + 1].trim()}`);
      }
      return lines;
    })
    .join("\n");
}

let idCounter = 0;

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!chart?.trim()) return;
    const id = `mermaid-${Date.now()}-${++idCounter}`;
    const sanitized = sanitizeChart(chart);

    mermaid
      .render(id, sanitized)
      .then((result) => {
        setSvg(result.svg);
        setError("");
      })
      .catch((err) => {
        console.warn("Mermaid render error:", err);
        setError("Ongeldig Mermaid diagram");
        setSvg("");
      });
  }, [chart]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!svg) return <p className="text-muted-foreground text-sm">Geen diagram beschikbaar</p>;

  return (
    <div
      ref={containerRef}
      className="mermaid-container [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
