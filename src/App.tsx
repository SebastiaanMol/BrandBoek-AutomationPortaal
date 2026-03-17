import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import NieuweAutomatisering from "./pages/NieuweAutomatisering";
import AlleAutomatiseringen from "./pages/AlleAutomatiseringen";

import BPMNViewer from "./pages/BPMNViewer";
import AIUpload from "./pages/AIUpload";
import Analyse from "./pages/Analyse";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/nieuw" element={<NieuweAutomatisering />} />
            <Route path="/alle" element={<AlleAutomatiseringen />} />
            <Route path="/bpmn" element={<BPMNViewer />} />
            <Route path="/ai-upload" element={<AIUpload />} />
            <Route path="/analyse" element={<Analyse />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
