import { useSearchParams } from "react-router-dom";
import { List, PlusCircle, Upload } from "lucide-react";

import { AutomatiseringForm } from "@/components/AutomatiseringForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIUpload from "./AIUpload";
import AlleAutomatiseringen from "./AlleAutomatiseringen";

export default function AutomationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "new" ? "new" : "overview";

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2">
        <p className="label-uppercase">Automations</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Automation beheer</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Bekijk, filter en beheer bestaande automations of voeg direct een nieuwe toe.
        </p>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams);
          if (value === "new") {
            next.set("tab", "new");
          } else {
            next.delete("tab");
          }
          setSearchParams(next, { replace: true });
        }}
        className="space-y-5"
      >
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="overview" className="gap-2">
            <List className="h-4 w-4" />
            Overzicht
          </TabsTrigger>
          <TabsTrigger value="new" className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Nieuwe automation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <AlleAutomatiseringen />
        </TabsContent>

        <TabsContent value="new">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
