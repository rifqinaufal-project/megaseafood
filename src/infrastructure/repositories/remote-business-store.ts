import { BusinessPersistenceError, type BusinessUpdater } from "@/src/application/ports/business-store";
import type { AuthAccount } from "@/src/domain/auth-account";
import { emptyBusinessState, type BusinessState } from "@/src/domain/business-state";
import { messageOf, type ApiClient } from "@/src/infrastructure/client/api";
import { normalizeBusinessState } from "@/src/infrastructure/repositories/local-business-store";

export type BusinessStatus = "loading" | "ready" | "failed";
export type BusinessSnapshot = {
  state: BusinessState;
  accountUsers: AuthAccount[];
  status: BusinessStatus;
  loadError: string | null;
  storageError: string | null;
};

type Options = {
  /** Server menjawab 401: sesi tidak aktif, tampilkan layar masuk. */
  onUnauthorized: () => void;
};

const UNREACHABLE = "Server tidak dapat dihubungi. Periksa koneksi internet lalu coba lagi.";
const UNSAVED_OFFLINE = "Perubahan belum tersimpan ke server karena koneksi terputus. Data di layar aman dan akan dicoba disimpan lagi; tekan Periksa ulang data bila perlu.";

function isAuthAccount(value: unknown): value is AuthAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as Record<string, unknown>;
  return typeof account.id === "string" && typeof account.username === "string" && typeof account.createdAt === "string";
}

export function createRemoteBusinessStore(api: ApiClient, options: Options) {
  const serverSnapshot: BusinessSnapshot = { state: emptyBusinessState(), accountUsers: [], status: "loading", loadError: null, storageError: null };
  let snapshot: BusinessSnapshot = serverSnapshot;
  let version = 0;
  let accountsCount = 0;
  let dirty = false;
  let saving = false;
  let loading = false;
  let checking = false;
  let generation = 0;
  const listeners = new Set<() => void>();

  const publish = (next: BusinessSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  async function resync(message: string | null, gen: number, onlyIfClean = false) {
    if (onlyIfClean && (dirty || saving)) return;
    const response = await api("GET", "/api/business");
    if (gen !== generation) return;
    if (response.status === 401) return options.onUnauthorized();
    // A local save may start while the GET is in flight. Never replace it.
    if (onlyIfClean && (dirty || saving)) return;
    if (response.status === 200 && response.body && "state" in response.body) {
      try {
        const state = response.body.state === null ? emptyBusinessState() : normalizeBusinessState(response.body.state);
        version = Number(response.body.version) || 0;
        dirty = false;
        const accountUsers = Array.isArray(response.body.accountUsers) ? response.body.accountUsers.filter(isAuthAccount) : [];
        accountsCount = accountUsers.length;
        return publish({ state, accountUsers, status: "ready", loadError: null, storageError: message });
      } catch {
        /* jatuh ke pesan galat di bawah */
      }
    }
    publish({ ...snapshot, storageError: response.status === 0 ? UNREACHABLE : "Data terbaru tidak dapat dimuat. Coba lagi sebentar." });
  }

  async function flush() {
    if (saving) return;
    saving = true;
    const gen = generation;
    try {
      while (dirty && gen === generation) {
        dirty = false;
        const response = await api("PUT", "/api/business", { state: snapshot.state, baseVersion: version });
        if (gen !== generation) return;
        if (response.status === 200 && typeof response.body?.version === "number") {
          version = response.body.version;
          if (!dirty && snapshot.storageError) publish({ ...snapshot, storageError: null });
          continue;
        }
        if (response.status === 401) return options.onUnauthorized();
        if (response.status === 409) {
          // Keep the local state visible. A refresh must be an explicit action and
          // must never silently discard a change that has not been saved.
          dirty = true;
          return publish({ ...snapshot, storageError: messageOf(response, "Data berubah di perangkat atau tab lain. Perubahan lokal tetap aman dan belum tersimpan.") });
        }
        dirty = true;
        return publish({ ...snapshot, storageError: response.status === 0 ? UNSAVED_OFFLINE : messageOf(response, "Gagal menyimpan ke server. Perubahan belum tersimpan.") });
      }
    } finally {
      if (gen === generation) saving = false;
    }
  }

  async function load() {
    if (loading || snapshot.status === "ready") return;
    loading = true;
    const gen = generation;
    publish({ ...serverSnapshot, status: "loading" });
    const response = await api("GET", "/api/business");
    if (gen !== generation) return;
    loading = false;
    if (response.status === 401) return options.onUnauthorized();
    if (response.status !== 200 || !response.body)
      return publish({ ...serverSnapshot, status: "failed", loadError: response.status === 0 ? UNREACHABLE : messageOf(response, "Data bisnis tidak dapat dimuat.") });
    try {
      version = response.body.state === null || response.body.state === undefined ? 0 : Number(response.body.version) || 0;
      const state = version === 0 ? emptyBusinessState() : normalizeBusinessState(response.body.state);
      const accountUsers = Array.isArray(response.body.accountUsers) ? response.body.accountUsers.filter(isAuthAccount) : [];
      accountsCount = accountUsers.length;
      publish({ state, accountUsers, status: "ready", loadError: null, storageError: null });
    } catch {
      publish({ ...serverSnapshot, status: "failed", loadError: "Data di server tidak dapat dibaca atau formatnya rusak. Penyimpanan diblokir agar data lama tidak tertimpa." });
    }
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    load,

    /** Dipanggil saat keluar atau sesi berakhir agar data satu akun tidak terlihat akun lain. */
    reset() {
      generation += 1;
      version = 0;
      accountsCount = 0;
      dirty = false;
      saving = false;
      loading = false;
      checking = false;
      publish(serverSnapshot);
    },

    /** Retry penyimpanan atau ambil ulang data saat diminta dari pesan error. */
    reload() {
      if (snapshot.status !== "ready") {
        loading = false;
        return void load();
      }
      if (dirty) return void flush();
      void resync(null, generation);
    },

    /** Cek versi ringan; state penuh hanya diambil jika versi server berubah. */
    async checkForUpdates() {
      if (snapshot.status !== "ready" || dirty || saving || loading || checking) return;
      checking = true;
      const gen = generation;
      try {
        const response = await api("GET", "/api/business/version");
        if (gen !== generation) return;
        if (response.status === 401) return options.onUnauthorized();
        if (response.status !== 200 || !response.body) return;
        const remoteVersion = Number(response.body.version);
        const remoteAccountsCount = Number(response.body.accountsCount) || 0;
        if (remoteVersion !== version || remoteAccountsCount !== accountsCount)
          await resync(null, gen, true);
      } finally {
        if (gen === generation) checking = false;
      }
    },

    update(updater: BusinessUpdater) {
      if (snapshot.status !== "ready") throw new BusinessPersistenceError(snapshot.loadError ?? "Data belum selesai dimuat. Coba lagi sebentar.");
      let candidate: BusinessState;
      try {
        candidate = normalizeBusinessState(updater(snapshot.state));
      } catch (error) {
        const message = error instanceof BusinessPersistenceError ? error.message : "Perubahan tidak valid dan belum disimpan; input tetap tersedia.";
        publish({ ...snapshot, storageError: message });
        throw new BusinessPersistenceError(message);
      }
      publish({ ...snapshot, state: candidate, storageError: null });
      dirty = true;
      void flush();
    },
  };
}

export type RemoteBusinessStore = ReturnType<typeof createRemoteBusinessStore>;
