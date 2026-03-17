import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlusCircle, Upload } from "lucide-react";
import NieuweAutomatisering from "./NieuweAutomatisering";
import AIUpload from "./AIUpload";

export default function NieuweAutomatiseringPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="handmatig">
        <TabsList>
          <TabsTrigger value="handmatig" className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Handmatig
          </TabsTrigger>
          <TabsTrigger value="ai-upload" className="gap-2">
            <Upload className="h-4 w-4" />
            AI Upload
          </TabsTrigger>
        </TabsList>
        <TabsContent value="handmatig">
          <NieuweAutomatisering />
        </TabsContent>
        <TabsContent value="ai-upload">
          <AIUpload />
        </TabsContent>
      </Tabs>
    </div>
  );
}
