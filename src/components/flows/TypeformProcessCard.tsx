import {
  Check,
  Circle,
  EyeOff,
  Hash,
  Layers,
  ListChecks,
  Mail,
  PenLine,
  Send,
  ShieldCheck,
  SquareCheck,
  Type,
} from "lucide-react";
import type { Automatisering } from "@/lib/types";

interface TypeformProcessCardProps {
  automation: Automatisering;
}

type TypeformField = {
  id: string;
  ref?: string;
  title: string;
  type: string;
  choices?: string[];
};

export function TypeformProcessCard({ automation }: TypeformProcessCardProps): React.ReactNode {
  const typeform = automation.importProposal?.typeform;
  if (automation.source !== "typeform" || !typeform) return null;

  const form = typeform.form;
  const process = typeform.process;
  const fields = (form?.fields ?? []) as TypeformField[];
  const hiddenFields = form?.hidden_fields ?? [];
  const webhooks = typeform.webhooks ?? [];
  const activeWebhooks = webhooks.filter((webhook) => webhook.enabled);
  const previewFields = fields.slice(0, 12);
  const previewFieldIds = new Set(previewFields.map((field) => field.id));
  const choiceFieldsOutsidePreview = fields.filter((field) => isChoiceField(field) && !previewFieldIds.has(field.id));
  const remainingFieldCount = Math.max(0, fields.length - previewFields.length);

  let questionNumber = 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/20 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Typeform enquête-preview
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {form?.title ?? automation.naam}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {process?.trigger ?? automation.trigger} {process?.outcome ?? ""}
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Read-only import
          </span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <InfoTile label="Vragen" value={fields.length ? `${fields.length} bekend` : "Geen velden uitgelezen"} />
          <InfoTile label="Webhookstatus" value={activeWebhooks.length ? "Actief" : "Geen actieve webhook"} />
          <InfoTile label="Formulier-id" value={form?.id ?? automation.externalId ?? "Onbekend"} />
        </div>
      </div>

      {hiddenFields.length > 0 && (
        <div className="border-b border-border bg-background px-5 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex min-w-36 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <EyeOff className="h-3.5 w-3.5" />
              Hidden fields
            </div>
            <div className="flex flex-wrap gap-1.5">
              {hiddenFields.map((field) => (
                <span key={field} className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">
                  {field}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-background p-5">
        {previewFields.length > 0 ? (
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Formulierweergave
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Zo leest het formulier als vragenlijst. Antwoorden worden niet geïmporteerd.
              </p>
            </div>
            <div className="divide-y divide-border">
              {previewFields.map((field) => {
                if (isSectionField(field)) {
                  return <SurveySection key={field.id} field={field} />;
                }

                questionNumber += 1;
                return <SurveyQuestion key={field.id} field={field} questionNumber={questionNumber} />;
              })}
            </div>
            {remainingFieldCount > 0 && (
              <div className="border-t border-border bg-muted/20 px-5 py-3 text-sm text-muted-foreground">
                Nog {remainingFieldCount} extra {remainingFieldCount === 1 ? "veld" : "velden"} in dit formulier.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
            De formulierstructuur is nog niet uitgelezen.
          </div>
        )}

        {choiceFieldsOutsidePreview.length > 0 && (
          <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Meerkeuzevragen</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Dit zijn de antwoordopties die uit de Typeform-formulierstructuur zijn gelezen.
              </p>
            </div>
            <div className="divide-y divide-border">
              {choiceFieldsOutsidePreview.map((field) => (
                <ChoiceQuestionSummary key={field.id} field={field} />
              ))}
            </div>
          </div>
        )}

        {activeWebhooks.length > 0 && (
          <div className="mx-auto mt-5 max-w-3xl rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Na verzenden doorgestuurd</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Typeform stuurt ingevulde formulieren automatisch door. De technische route staat alleen in Logica en bewijs.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ChoiceQuestionSummary({ field }: { field: TypeformField }): React.ReactNode {
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <FieldIcon type={field.type} />
        <p className="text-sm font-semibold leading-snug text-foreground">{field.title}</p>
      </div>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{friendlyFieldType(field.type)}</p>
      <div className="mt-3">
        <AnswerPreview field={field} />
      </div>
    </div>
  );
}

function SurveySection({ field }: { field: TypeformField }): React.ReactNode {
  return (
    <div className="bg-muted/20 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
          <Layers className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sectie</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{field.title}</p>
        </div>
      </div>
    </div>
  );
}

function SurveyQuestion({ field, questionNumber }: { field: TypeformField; questionNumber: number }): React.ReactNode {
  return (
    <div className="px-5 py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="inline-flex min-h-9 w-fit shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-3 text-xs font-semibold text-primary">
          Vraag {questionNumber}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FieldIcon type={field.type} />
            <p className="text-base font-semibold leading-snug text-foreground">{field.title}</p>
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{friendlyFieldType(field.type)}</p>
          <div className="mt-4">
            <AnswerPreview field={field} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AnswerPreview({ field }: { field: TypeformField }): React.ReactNode {
  const type = field.type.toLowerCase();
  const choices = field.choices ?? [];

  if (["multiple_choice", "dropdown", "picture_choice"].includes(type)) {
    if (choices.length === 0) {
      return <MutedAnswerBox label="Antwoordopties niet uitgelezen" />;
    }

    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((choice) => (
          <div key={choice} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>{choice}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === "yes_no") {
    return (
      <div className="flex flex-wrap gap-2">
        {["Ja", "Nee"].map((choice) => (
          <div key={choice} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground">
            <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {choice}
          </div>
        ))}
      </div>
    );
  }

  if (type === "legal") {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
        <SquareCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
        Akkoord
      </div>
    );
  }

  if (["opinion_scale", "rating"].includes(type)) {
    return (
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <span key={value} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold text-muted-foreground">
            {value}
          </span>
        ))}
      </div>
    );
  }

  if (type === "number") return <MutedAnswerBox label="0" icon={<Hash className="h-4 w-4" />} />;
  if (type === "email") return <MutedAnswerBox label="naam@voorbeeld.nl" icon={<Mail className="h-4 w-4" />} />;
  if (type === "short_text") return <MutedAnswerBox label="Kort antwoord" icon={<Type className="h-4 w-4" />} />;
  if (type === "long_text") return <MutedAnswerBox label="Lang antwoord" tall icon={<PenLine className="h-4 w-4" />} />;

  return <MutedAnswerBox label={friendlyFieldType(type)} />;
}

function MutedAnswerBox({ label, tall = false, icon }: { label: string; tall?: boolean; icon?: React.ReactNode }): React.ReactNode {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground ${tall ? "min-h-20" : "min-h-11"}`}>
      {icon ?? <Check className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{label}</span>
    </div>
  );
}

function FieldIcon({ type }: { type: string }): React.ReactNode {
  const normalized = type.toLowerCase();
  const className = "h-4 w-4 shrink-0 text-muted-foreground";
  if (normalized.includes("choice") || normalized === "dropdown") return <ListChecks className={className} />;
  if (normalized === "number") return <Hash className={className} />;
  if (normalized === "email") return <Mail className={className} />;
  if (normalized === "legal") return <SquareCheck className={className} />;
  if (normalized.includes("text")) return <Type className={className} />;
  return <PenLine className={className} />;
}

function InfoTile({ label, value }: { label: string; value: string }): React.ReactNode {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">
        {value}
      </p>
    </div>
  );
}

function isSectionField(field: TypeformField): boolean {
  return ["group", "statement"].includes(field.type.toLowerCase());
}

function isChoiceField(field: TypeformField): boolean {
  return ["multiple_choice", "dropdown", "picture_choice"].includes(field.type.toLowerCase());
}

function friendlyFieldType(type: string): string {
  const normalized = type.toLowerCase();
  const labels: Record<string, string> = {
    short_text: "Kort antwoord",
    long_text: "Lang antwoord",
    email: "E-mailadres",
    number: "Getal",
    phone_number: "Telefoonnummer",
    multiple_choice: "Meerkeuze",
    dropdown: "Keuzelijst",
    picture_choice: "Keuze met beeld",
    yes_no: "Ja/nee",
    legal: "Akkoordverklaring",
    group: "Sectie",
    statement: "Tekstblok",
    date: "Datum",
    file_upload: "Bestand uploaden",
    website: "Website",
    opinion_scale: "Schaalvraag",
    rating: "Beoordeling",
  };
  return labels[normalized] ?? "Vraagveld";
}
