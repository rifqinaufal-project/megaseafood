"use client";

import { useSyncExternalStore } from "react";
import { browserApi } from "@/src/infrastructure/client/api";
import { createRemoteAuthStore } from "@/src/infrastructure/repositories/remote-auth-store";

export const authStore = createRemoteAuthStore(browserApi);

/** Username akun yang sedang masuk, dipakai untuk mencatat pelaku di audit log. */
export function getAuthUsername(): string | undefined {
  const snapshot = authStore.getSnapshot();
  return snapshot.status === "authenticated" ? snapshot.username : undefined;
}

export function useAuth() {
  const snapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getServerSnapshot);
  return { snapshot, login: authStore.login, register: authStore.register, logout: authStore.logout, retry: authStore.refresh };
}
