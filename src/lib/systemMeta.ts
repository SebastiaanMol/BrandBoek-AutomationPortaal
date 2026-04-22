import type { Systeem } from "@/lib/types";

export interface SystemMeta {
  hue: string;   // CSS var name, e.g. "--system-hubspot"
  label: string;
}

const META: Record<Systeem, SystemMeta> = {
  HubSpot:    { hue: "--system-hubspot",    label: "HubSpot" },
  Zapier:     { hue: "--system-zapier",     label: "Zapier" },
  Typeform:   { hue: "--system-typeform",   label: "Typeform" },
  SharePoint: { hue: "--system-sharepoint", label: "SharePoint" },
  WeFact:     { hue: "--system-wefact",     label: "WeFact" },
  Docufy:     { hue: "--system-docufy",     label: "Docufy" },
  Backend:    { hue: "--system-backend",    label: "Backend" },
  "E-mail":   { hue: "--system-email",      label: "E-mail" },
  API:        { hue: "--system-api",        label: "API" },
  GitLab:     { hue: "--system-gitlab",     label: "GitLab" },
  Anders:     { hue: "--system-anders",     label: "Anders" },
};

export function getSystemMeta(systeem: Systeem): SystemMeta {
  return META[systeem] ?? { hue: "--system-anders", label: systeem };
}
