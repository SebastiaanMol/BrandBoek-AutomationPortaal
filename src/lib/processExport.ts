import { jsPDF } from "jspdf";

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

export async function exportProcessCanvasPng(selector = ".process-canvas-wrap svg"): Promise<void> {
  const svg = getSvgElement(selector);
  if (!svg) throw new Error("Canvas niet gevonden");

  const canvas = await svgToCanvas(svg);
  const a = document.createElement("a");
  a.download = "proceskaart.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}

export async function exportProcessCanvasPdf(selector = ".process-canvas-wrap svg"): Promise<void> {
  const svg = getSvgElement(selector);
  if (!svg) throw new Error("Canvas niet gevonden");

  const canvas = await svgToCanvas(svg);
  const imgData = canvas.toDataURL("image/png");
  const w = canvas.width / 2;
  const h = canvas.height / 2;
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [w, h] });
  pdf.addImage(imgData, "PNG", 0, 0, w, h);
  pdf.save("proceskaart.pdf");
}
