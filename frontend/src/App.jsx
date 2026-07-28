import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import PageTransition from "./motion/PageTransition";
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
    <>
      <Navbar />
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
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50 text-gray-900 transition-colors dark:bg-slate-950 dark:text-gray-100">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;
