import { useEffect, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useConvexAuth, useMutation } from "convex/react";
import { convexUpsertCurrentUser } from "@/lib/convexFunctions";

const AuthSync = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth0();
  const { isAuthenticated: convexAuthenticated, isLoading: convexLoading } = useConvexAuth();
  const upsertCurrentUser = useMutation(convexUpsertCurrentUser);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      syncedRef.current = false;
      return;
    }
    if (authLoading || convexLoading || !convexAuthenticated || syncedRef.current) {
      return;
    }

    syncedRef.current = true;
    void upsertCurrentUser({});
  }, [authLoading, convexAuthenticated, convexLoading, isAuthenticated, upsertCurrentUser]);

  return null;
};

export default AuthSync;
