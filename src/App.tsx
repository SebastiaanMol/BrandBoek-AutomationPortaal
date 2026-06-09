import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Route, Routes, Navigate, Outlet } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import AutomationsPage from "./pages/AutomationsPage";
import AutomationDetailPage from "./pages/AutomationDetailPage";
import NieuweAutomation from "./pages/NieuweAutomation";
import Analyse from "./pages/Analyse";
import BewerkAutomatisering from "./pages/BewerkAutomatisering";
import AuthPage from "./pages/AuthPage";
import Instellingen from "./pages/Instellingen";
import Processen from "./pages/Processen";
import Imports from "./pages/Imports";
import Systems from "./pages/Systems";
import Owners from "./pages/Owners";
import SystemenEnEigenaren from "./pages/SystemenEnEigenaren";
import Brandy from "./pages/Brandy";
import Flows from "./pages/Flows";
import FlowDetail from "./pages/FlowDetail";
import FlowSuggestionDetail from "./pages/FlowSuggestionDetail";
import ProcessJourneyReview from "./pages/ProcessJourneyReview";
import GitLabEndpointCheck from "./pages/GitLabEndpointCheck";
import Procesviewer from "./pages/Procesviewer";
import Pipelines from "./pages/Pipelines";
import PipelineDetail from "./pages/PipelineDetail";
import RuntimeExplorer from "./pages/RuntimeExplorer";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/nieuw" element={<NieuweAutomation />} />
        <Route path="/alle" element={<AutomationsPage />} />
        <Route path="/automations/:id" element={<AutomationDetailPage />} />
        <Route path="/bewerk/:id" element={<BewerkAutomatisering />} />
        <Route path="/analyse" element={<Analyse />} />
        <Route path="/gitlab-endpoint-check" element={<GitLabEndpointCheck />} />
        <Route path="/instellingen" element={<Instellingen />} />
        <Route path="/processen" element={<Processen />} />
        <Route path="/procesviewer" element={<Procesviewer />} />
        <Route path="/imports" element={<Imports />} />
        <Route path="/systemen-eigenaren" element={<SystemenEnEigenaren />} />
        <Route path="/systems" element={<Systems />} />
        <Route path="/owners" element={<Owners />} />
        <Route path="/brandy" element={<Brandy />} />
        <Route path="/flows" element={<Flows />} />
        <Route path="/flows/review" element={<ProcessJourneyReview />} />
        <Route path="/flows/suggesties/:id" element={<FlowSuggestionDetail />} />
        <Route path="/flows/:id" element={<FlowDetail />} />
        <Route path="/pipelines" element={<Pipelines />} />
        <Route path="/pipelines/:id" element={<PipelineDetail />} />
        <Route path="/runtime" element={<RuntimeExplorer />} />
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

const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      { path: "/login", element: <AuthRoute /> },
      { path: "/*", element: <ProtectedRoutes /> },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <RouterProvider router={router} />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
