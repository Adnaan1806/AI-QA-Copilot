import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import { DataVersionProvider } from "./context/DataVersionContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppSidebar from "./components/AppSidebar";
import AppBreadcrumbs from "./components/AppBreadcrumbs";
import { Toaster } from "./components/ui/sonner";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Separator } from "./components/ui/separator";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProjectDetail from "./pages/ProjectDetail";
import TestSuiteDetail from "./pages/TestSuiteDetail";
import SuiteAutomation from "./pages/SuiteAutomation";
import RequirementWorkspace from "./pages/RequirementWorkspace";
import AllRequirements from "./pages/AllRequirements";

function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3 md:px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <AppBreadcrumbs />
        </header>
        <main className="flex-1">
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects/:projectId" element={<ProjectDetail />} />
              <Route path="/suites/:suiteId" element={<TestSuiteDetail />} />
              <Route path="/suites/:suiteId/automation" element={<SuiteAutomation />} />
              <Route path="/requirements" element={<AllRequirements />} />
              <Route path="/requirements/:id" element={<RequirementWorkspace tab="review" />} />
              <Route path="/requirements/:id/test-cases" element={<RequirementWorkspace tab="review" />} />
              <Route path="/requirements/:id/automation" element={<RequirementWorkspace tab="automation" />} />
              <Route path="/requirements/:id/report" element={<RequirementWorkspace tab="report" />} />
              <Route path="/history" element={<Navigate to="/requirements" replace />} />
            </Route>
          </Routes>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <BreadcrumbProvider>
        <DataVersionProvider>
          <TooltipProvider>
            <div className="min-h-screen bg-background text-foreground">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/*" element={<AppShell />} />
              </Routes>
            </div>
            <Toaster />
          </TooltipProvider>
        </DataVersionProvider>
      </BreadcrumbProvider>
    </AuthProvider>
  );
}

export default App;
