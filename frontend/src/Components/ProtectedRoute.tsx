import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useConvexAuth } from "convex/react";

const LoadingScreen = () => (
  <div className="flex items-center justify-center min-h-screen text-white pointer-events-auto">
    <div className="flex items-center gap-3">
      <span className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-300">Checking your account...</span>
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth0();
  const { isLoading: convexLoading } = useConvexAuth();

  if (authLoading || convexLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
