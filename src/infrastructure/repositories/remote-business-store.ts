import { BusinessPersistenceError, type BusinessUpdater } from "@/src/application/ports/business-store";
import { seedBusinessState, type BusinessState } from "@/src/domain/business-state";
import { messageOf, type ApiClient } from "@/src/infrastructure/client/api";
import { normalizeBusinessState } from "@/src/infrastructure/repositories/local-business-store";

export type BusinessStatus = "loading" | "ready" | "failed";
export type BusinessSnapshot = {
  state: BusinessState;
  status: BusinessStatus;
  loadError: string | null;
  storageError: string | null;
};

type Options = {
  /** Server menjawab 401: sesi tidak aktif, tampilkan layar masuk. */
  onUnauthorized: () => void;
  /** Data lama dari localStorage untuk dipindah ke akun pertama yang belum punya data di server. */
  takeLegacy?: () => unknown | null;
  /** Dipanggil setelah data lama berhasil tersimpan di server, agar tidak terimpor ke akun lain. */
  clearLegacy?: () => void;
};

const UNREACHABLE = "Server tidak dapat dihubungi. Periksa koneksi internet lalu coba lagi.";
const UNSAVED_OFFLINE = "Perubahan belum tersimpan ke server karena koneksi terputus. Data di layar aman dan akan dicoba disimpan lagi; tekan Periksa ulang data bila perlu.";

export function createRemoteBusinessStore(api: ApiClient, options: Options) {
  const serverSnapshot: BusinessSnapshot = { state: seedBusinessState(), status: "loading", loadError: null, storageError: null };
  let snapshot: BusinessSnapshot = serverSnapshot;
  let version = 0;
  let dirty = false;
  let saving = false;
  let loading = false;
  let migrating = false;
  let generation = 0;
  const listeners = new Set<() => void>();

  const publish = (next: BusinessSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  async function resync(message: string | null, gen: number) {
    const response = await api("GET", "/api/business");
    if (gen !== generation) return;
    if (response.status === 401) return options.onUnauthorized();
    if (response.status === 200 && response.body && "state" in response.body && response.body.state !== null) {
      try {
        const state = normalizeBusinessState(response.body.state);
        version = Number(response.body.version) || 0;
        dirty = false;
        return publish({ state, status: "ready", loadError: null, storageError: message });
      } catch {
        /* jatuh ke pesan galat di bawah */
      }
    }
    publish({ ...snapshot, storageError: response.status === 0 ? UNREACHABLE : "Data terbaru tidak dapat dimuat dari server. Muat ulang halaman." });
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
          if (migrating) {
            migrating = false;
            options.clearLegacy?.();
          }
          if (!dirty && snapshot.storageError) publish({ ...snapshot, storageError: null });
          continue;
        }
        if (response.status === 401) return options.onUnauthorized();
        if (response.status === 409) return await resync(messageOf(response, "Data berubah di tempat lain. Perubahan belum disimpan."), gen);
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
      if (response.body.state !== null && response.body.state !== undefined) {
        version = Number(response.body.version) || 0;
        return publish({ state: normalizeBusinessState(response.body.state), status: "ready", loadError: null, storageError: null });
      }
      let legacy: BusinessState | null = null;
      try {
        const raw = options.takeLegacy?.();
        legacy = raw ? normalizeBusinessState(raw) : null;
      } catch {
        legacy = null;
      }
      version = 0;
      publish({ state: legacy ?? seedBusinessState(), status: "ready", loadError: null, storageError: null });
      if (legacy) {
        migrating = true;
        dirty = true;
        void flush();
      }
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
      dirty = false;
      saving = false;
      loading = false;
      migrating = false;
      publish(serverSnapshot);
    },

    reload() {
      if (snapshot.status !== "ready") {
        loading = false;
        return void load();
      }
      if (dirty) return void flush();
      void resync(null, generation);
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
