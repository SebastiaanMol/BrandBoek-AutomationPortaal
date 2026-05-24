import { useNavigate } from "react-router-dom";
import { PlusCircle, Upload, X } from "lucide-react";

import { AutomatiseringForm } from "@/components/AutomatiseringForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIUpload from "./AIUpload";

export default function NieuweAutomation() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-primary-soft">
        <div className="px-8 py-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PlusCircle className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                  Automations
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Nieuwe automation toevoegen
              </h1>
              <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                Voeg handmatig een automation toe of gebruik AI Upload om automationgegevens uit
                een bestand te halen.
              </p>
            </div>
            <button
              type="button"
              aria-label="Sluit nieuwe automation"
              onClick={() => navigate("/alle")}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="card-elevated p-4 md:p-6">
        <Tabs defaultValue="manual" className="space-y-5">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
            <TabsTrigger value="manual" className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Manual
            </TabsTrigger>
            <TabsTrigger value="ai-upload" className="gap-2">
              <Upload className="h-4 w-4" />
              AI Upload
            </TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <AutomatiseringForm />
          </TabsContent>
          <TabsContent value="ai-upload">
            <AIUpload />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
