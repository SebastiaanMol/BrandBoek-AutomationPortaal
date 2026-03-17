import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "IBM Plex Sans",
});

let idCounter = 0;

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!chart?.trim()) return;
    const id = `mermaid-${++idCounter}`;
    mermaid
      .render(id, chart)
      .then((result) => {
        setSvg(result.svg);
        setError("");
      })
      .catch(() => {
        setError("Ongeldig Mermaid diagram");
        setSvg("");
      });
  }, [chart]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!svg) return <p className="text-muted-foreground text-sm">Geen diagram beschikbaar</p>;

  return (
    <div
      ref={ref}
      className="mermaid-container [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
