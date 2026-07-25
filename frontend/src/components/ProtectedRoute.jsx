import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <p className="mx-auto max-w-5xl p-8 text-sm text-gray-400 dark:text-gray-500">
        Loading...
      </p>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
