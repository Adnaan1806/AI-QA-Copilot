import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppSidebar from "./components/AppSidebar";
import AppBreadcrumbs from "./components/AppBreadcrumbs";
import PageTransition from "./motion/PageTransition";
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
import RequirementDetail from "./pages/RequirementDetail";
import RequirementTestCases from "./pages/RequirementTestCases";
import RequirementAutomation from "./pages/RequirementAutomation";
import History from "./pages/History";

function AppShell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <AppBreadcrumbs />
        </header>
        <div className="flex-1">
          <PageTransition>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects/:projectId" element={<ProjectDetail />} />
                <Route path="/suites/:suiteId" element={<TestSuiteDetail />} />
                <Route path="/suites/:suiteId/automation" element={<SuiteAutomation />} />
                <Route path="/requirements/:id" element={<RequirementDetail />} />
                <Route path="/requirements/:id/test-cases" element={<RequirementTestCases />} />
                <Route path="/requirements/:id/automation" element={<RequirementAutomation />} />
                <Route path="/history" element={<History />} />
              </Route>
            </Routes>
          </PageTransition>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <BreadcrumbProvider>
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
      </BreadcrumbProvider>
    </AuthProvider>
  );
}

export default App;
