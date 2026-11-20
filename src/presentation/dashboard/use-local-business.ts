"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createBusinessCommands } from "@/src/application/use-cases/business-commands";
import { authStore, getAuthUsername, useAuth } from "@/src/presentation/auth/use-auth";
import { browserApi } from "@/src/infrastructure/client/api";
import { createRemoteBusinessStore } from "@/src/infrastructure/repositories/remote-business-store";

const store = createRemoteBusinessStore(browserApi, {
  onUnauthorized: () => authStore.expire(),
});

export function useLocalBusiness() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { snapshot: auth } = useAuth();
  const authenticated = auth.status === "authenticated";

  useEffect(() => {
    if (!authenticated) {
      store.reset();
      return;
    }
    void store.load();
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void store.checkForUpdates();
    };
    const interval = window.setInterval(syncWhenVisible, 5_000);
    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [authenticated]);

  return {
    state: snapshot.state,
    accountUsers: snapshot.accountUsers,
    status: snapshot.status,
    loadError: snapshot.loadError,
    storageError: snapshot.storageError,
    hydrated: snapshot.status === "ready",
    retryStorage: store.reload,
    actions: createBusinessCommands(store.update, () => store.getSnapshot().state, getAuthUsername),
  };
}
