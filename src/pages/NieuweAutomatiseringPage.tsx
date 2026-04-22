import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlusCircle, Upload } from "lucide-react";
import { AutomatiseringForm } from "@/components/AutomatiseringForm";
import AIUpload from "./AIUpload";

export default function NieuweAutomatiseringPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">New Automation</h1>
      <Tabs defaultValue="manual">
        <TabsList>
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
  );
}
