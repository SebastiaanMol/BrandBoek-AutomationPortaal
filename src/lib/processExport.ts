import { jsPDF } from "jspdf";
import JSZip from "jszip";
import type { SavedProcessStateWithUpdatedAt } from "@/lib/storage/processState";

function getSvgElement(selector: string): SVGSVGElement | null {
  return document.querySelector(selector);
}

function svgToCanvas(svg: SVGSVGElement): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const w = Number(svg.getAttribute("width") ?? svg.viewBox.baseVal.width);
    const h = Number(svg.getAttribute("height") ?? svg.viewBox.baseVal.height);

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    const liveEls = Array.from(svg.querySelectorAll("*"));
    const cloneEls = Array.from(clone.querySelectorAll("*"));
    liveEls.forEach((el, i) => {
      const computed = window.getComputedStyle(el);
      const attrs = ["fill", "stroke", "color", "background-color"];
      attrs.forEach((attr) => {
        const val = computed.getPropertyValue(attr);
        if (val && val !== "none") {
          (cloneEls[i] as SVGElement).style.setProperty(attr, val);
        }
      });
    });

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = "* { font-family: system-ui, Arial, sans-serif !important; }";
    clone.insertBefore(style, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    const b64 = btoa(unescape(encodeURIComponent(xml)));
    const dataUrl = `data:image/svg+xml;base64,${b64}`;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context kon niet worden aangemaakt"));
        return;
      }
      ctx.scale(2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas);
    };
    img.onerror = (e) => {
      console.error("SVG render error:", e);
      reject(new Error("SVG kon niet worden gerenderd"));
    };
    img.src = dataUrl;
  });
}

async function svgToPngBlob(svg: SVGSVGElement): Promise<Blob> {
  const canvas = await svgToCanvas(svg);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG kon niet worden gemaakt"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

async function svgToPdfBlob(svg: SVGSVGElement): Promise<Blob> {
  const canvas = await svgToCanvas(svg);
  const imgData = canvas.toDataURL("image/png");
  const w = canvas.width / 2;
  const h = canvas.height / 2;
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [w, h] });
  pdf.addImage(imgData, "PNG", 0, 0, w, h);
  return pdf.output("blob");
}

export async function exportProcessCanvasPng(selector = ".process-canvas-wrap svg"): Promise<void> {
  const svg = getSvgElement(selector);
  if (!svg) throw new Error("Canvas niet gevonden");

  const a = document.createElement("a");
  a.download = "proceskaart.png";
  a.href = URL.createObjectURL(await svgToPngBlob(svg));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
}

export async function exportProcessCanvasPdf(selector = ".process-canvas-wrap svg"): Promise<void> {
  const svg = getSvgElement(selector);
  if (!svg) throw new Error("Canvas niet gevonden");

  const a = document.createElement("a");
  a.download = "proceskaart.pdf";
  a.href = URL.createObjectURL(await svgToPdfBlob(svg));
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
}

export interface ProcessViewZipExportItem {
  pipelineId: string;
  pipelineName: string;
  state: SavedProcessStateWithUpdatedAt;
  svg?: SVGSVGElement | null;
}

export interface ProcessViewZipFormats {
  json: boolean;
  png: boolean;
  pdf: boolean;
}

export async function exportProcessViewsZip({
  items,
  formats,
  date = new Date(),
}: {
  items: ProcessViewZipExportItem[];
  formats: ProcessViewZipFormats;
  date?: Date;
}): Promise<Blob> {
  if (items.length === 0) {
    throw new Error("Geen pipelines geselecteerd voor export");
  }
  if (!formats.json && !formats.png && !formats.pdf) {
    throw new Error("Kies minstens een exportformaat");
  }

  const zip = new JSZip();
  for (const item of items) {
    const folder = zip.folder(safeFilePart(item.pipelineName) || item.pipelineId);
    if (!folder) continue;

    if (formats.json) {
      folder.file("proces-backup.json", JSON.stringify(buildProcessBackup(item.pipelineName, item.state, date), null, 2));
    }
    if (formats.png && item.svg) {
      folder.file("procesview.png", await svgToPngBlob(item.svg));
    }
    if (formats.pdf && item.svg) {
      folder.file("procesview.pdf", await svgToPdfBlob(item.svg));
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.download = `procesviews-${toDateStamp(date)}.zip`;
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
  return blob;
}

function buildProcessBackup(
  pipelineName: string,
  state: SavedProcessStateWithUpdatedAt,
  date: Date,
) {
  return {
    version: 1,
    pipelineName,
    exportedAt: date.toISOString(),
    state: {
      steps: state.steps,
      connections: state.connections,
      autoLinks: state.autoLinks,
      parkedSteps: state.parkedSteps,
      activeLanes: state.activeLanes,
      customLanes: state.customLanes,
      flowLinks: state.flowLinks,
      attachments: state.attachments ?? [],
      artifacts: state.artifacts ?? [],
    },
  };
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function toDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}
