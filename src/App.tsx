import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import NieuweAutomatiseringPage from "./pages/NieuweAutomatiseringPage";
import AlleAutomatiseringen from "./pages/AlleAutomatiseringen";
import BPMNViewer from "./pages/BPMNViewer";
import Analyse from "./pages/Analyse";
import Verificatie from "./pages/Verificatie";
import Mindmap from "./pages/Mindmap";
import BewerkAutomatisering from "./pages/BewerkAutomatisering";
import AuthPage from "./pages/AuthPage";
import Instellingen from "./pages/Instellingen";
import KennisGraaf from "./pages/KennisGraaf";
import Proceskaart from "./pages/Proceskaart";
import Processen from "./pages/Processen";
import Imports from "./pages/Imports";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Laden...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/nieuw" element={<NieuweAutomatiseringPage />} />
        <Route path="/alle" element={<AlleAutomatiseringen />} />
        <Route path="/bewerk/:id" element={<BewerkAutomatisering />} />
        <Route path="/bpmn" element={<BPMNViewer />} />
        <Route path="/mindmap" element={<Mindmap />} />
        <Route path="/verificatie" element={<Verificatie />} />
        <Route path="/analyse" element={<Analyse />} />
        <Route path="/instellingen" element={<Instellingen />} />
        <Route path="/kennisgraaf" element={<KennisGraaf />} />
        <Route path="/proceskaart" element={<Proceskaart />} />
        <Route path="/processen" element={<Processen />} />
        <Route path="/imports" element={<Imports />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<AuthRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
