import { jsPDF } from "jspdf";
import type { WorkflowMatrixAnalysis } from "@/lib/workflowMatrixAnalysis";

export function exportWorkflowMatrixAnalysisPdf(
  analysis: WorkflowMatrixAnalysis,
  date = new Date(),
): void {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  let y = 42;

  const write = (text: string, options: { size?: number; bold?: boolean; gap?: number } = {}) => {
    pdf.setFontSize(options.size ?? 10);
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    const lines = splitText(text, options.size && options.size >= 14 ? 82 : 105);
    for (const line of lines) {
      if (y > 780) {
        pdf.addPage?.();
        y = 42;
      }
      pdf.text(line, 42, y);
      y += options.gap ?? 14;
    }
  };

  write("WorkflowMatrix beheeranalyse", { size: 18, bold: true, gap: 22 });
  write(`Gegenereerd op ${date.toLocaleDateString("nl-NL")}`, { size: 10, gap: 18 });

  write("Samenvatting", { size: 13, bold: true, gap: 18 });
  write(`Totaal workflows: ${analysis.kpis.totalWorkflows}`);
  write(`Gekoppelde workflows: ${analysis.kpis.linkedWorkflows}`);
  write(`Ongekoppelde workflows: ${analysis.kpis.unlinkedWorkflows}`);
  write(`Actieve workflows: ${analysis.kpis.activeWorkflows}`);
  write(`Uitgeschakelde workflows: ${analysis.kpis.disabledWorkflows}`);
  write(`Actieve pipelines: ${analysis.kpis.activePipelines}`);
  write(`Inactieve pipelines: ${analysis.kpis.inactivePipelines}`);
  write(`Lege actieve stages: ${analysis.kpis.emptyActiveStages}`, { gap: 20 });

  write("Risicosignalen", { size: 13, bold: true, gap: 18 });
  writeRiskSection("Actieve pipeline met inactieve workflows", analysis.risks.activePipelineInactiveWorkflows.map((item) =>
    `${item.pipeline.naam} / ${item.stage.label}: ${item.automation.naam}`,
  ), write);
  writeRiskSection("Inactieve pipeline met actieve workflows", analysis.risks.inactivePipelineActiveWorkflows.map((item) =>
    `${item.pipeline.naam} / ${item.stage.label}: ${item.automation.naam}`,
  ), write);
  writeRiskSection("Actieve stages zonder actieve triggers", analysis.risks.emptyActiveStages.map((item) =>
    `${item.pipeline.naam}: ${item.stage.label}`,
  ), write);
  writeRiskSection("Multi-stage workflows", analysis.risks.multiStageWorkflows.map((item) =>
    `${item.automation.naam}: ${item.rawStageIds.join(", ")}`,
  ), write);
  writeRiskSection("Fallback-matches", analysis.risks.fallbackMatchedWorkflows.map((item) =>
    `${item.automation.naam}: ${item.matches.map((match) => `${match.stage.label} (${match.matchType})`).join(", ")}`,
  ), write);
  writeRiskSection("Niet-gematchte stage IDs", analysis.risks.unmatchedStageWorkflows.map((item) =>
    `${item.automation.naam}: ${item.rawStageIds.join(", ")}`,
  ), write);
  writeRiskSection("Geen recente run-data", analysis.risks.missingRunDataWorkflows.map((item) =>
    `${item.automation.naam}: ${item.reason}`,
  ), write);

  write("Pipeline-overzicht", { size: 13, bold: true, gap: 18 });
  for (const summary of analysis.pipelineSummaries) {
    write([
      `${summary.pipeline.naam} (${summary.pipeline.isActive ? "Actief" : "Inactief"})`,
      `${summary.stageCount} stages`,
      `${summary.activeWorkflowCount} actieve workflows`,
      `${summary.inactiveWorkflowCount} inactieve workflows`,
      `${summary.emptyStageCount} lege stages`,
      summary.recommendedAction,
    ].join(" - "));
  }

  pdf.save(`workflow-matrix-analyse-${toDateStamp(date)}.pdf`);
}

function writeRiskSection(
  title: string,
  rows: string[],
  write: (text: string, options?: { size?: number; bold?: boolean; gap?: number }) => void,
) {
  write(title, { bold: true });
  if (rows.length === 0) {
    write("Geen bevindingen.");
    return;
  }
  for (const row of rows.slice(0, 20)) write(`- ${row}`);
  if (rows.length > 20) write(`- plus ${rows.length - 20} extra items`);
}

function splitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function toDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}
