import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageLoading } from "./StatusMessages";

export default function ProtectedRoute() {
  const { token, loading } = useAuth();

  if (loading) {
    return <PageLoading className="min-h-[80vh]" />;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
