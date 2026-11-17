"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createBusinessCommands } from "@/src/application/use-cases/business-commands";
import { authStore, getAuthUsername, useAuth } from "@/src/presentation/auth/use-auth";
import { browserApi } from "@/src/infrastructure/client/api";
import { BUSINESS_STORAGE_KEY } from "@/src/infrastructure/repositories/local-business-store";
import { createRemoteBusinessStore } from "@/src/infrastructure/repositories/remote-business-store";

const readLegacy = () => {
  try {
    const raw = window.localStorage.getItem(BUSINESS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
};

const store = createRemoteBusinessStore(browserApi, {
  onUnauthorized: () => authStore.expire(),
  takeLegacy: readLegacy,
  clearLegacy: () => {
    try {
      window.localStorage.removeItem(BUSINESS_STORAGE_KEY);
    } catch {
      /* data lama tetap ada di browser, tidak masalah */
    }
  },
});

export function useLocalBusiness() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { snapshot: auth } = useAuth();
  const authenticated = auth.status === "authenticated";

  useEffect(() => {
    if (authenticated) void store.load();
    else store.reset();
  }, [authenticated]);

  return {
    state: snapshot.state,
    status: snapshot.status,
    loadError: snapshot.loadError,
    storageError: snapshot.storageError,
    hydrated: snapshot.status === "ready",
    retryStorage: store.reload,
    actions: createBusinessCommands(store.update, () => store.getSnapshot().state, getAuthUsername),
  };
}
