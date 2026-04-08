import { useEffect, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useConvexAuth, useMutation } from "convex/react";
import { convexUpsertCurrentUser } from "@/lib/convexFunctions";
import { registerApiAuthTokenProvider } from "@/lib/api";

const AuthSync = () => {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0();
  const { isAuthenticated: convexAuthenticated, isLoading: convexLoading } = useConvexAuth();
  const upsertCurrentUser = useMutation(convexUpsertCurrentUser);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      registerApiAuthTokenProvider(null);
      return;
    }

    registerApiAuthTokenProvider(async () => {
      try {
        const response = await getAccessTokenSilently({
          detailedResponse: true,
          cacheMode: "on",
        });
        return response.id_token ?? null;
      } catch {
        return null;
      }
    });

    return () => registerApiAuthTokenProvider(null);
  }, [getAccessTokenSilently, isAuthenticated]);

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
