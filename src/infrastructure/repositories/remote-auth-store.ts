import { normalizeUsername, validatePassword, validateRegistration } from "@/src/domain/auth";
import { messageOf, type ApiClient } from "@/src/infrastructure/client/api";

export type AuthSnapshot =
  | { status: "loading" }
  | { status: "anonymous"; expired: boolean }
  | { status: "authenticated"; username: string; createdAt: string }
  | { status: "unavailable"; message: string };
export type AuthResult = { ok: true } | { ok: false; message: string };

const LOADING: AuthSnapshot = { status: "loading" };
const UNREACHABLE = "Server tidak dapat dihubungi. Periksa koneksi internet lalu coba lagi.";

export function createRemoteAuthStore(api: ApiClient) {
  const listeners = new Set<() => void>();
  let snapshot: AuthSnapshot = LOADING;
  let started = false;
  let attempt = 0;

  const publish = (next: AuthSnapshot) => {
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  /** Sinkronkan dengan sesi di server. Sesi tidak aktif langsung berarti layar masuk, bukan galat. */
  async function refresh(): Promise<void> {
    started = true;
    const mine = ++attempt;
    const response = await api("GET", "/api/auth/session");
    if (mine !== attempt) return;
    if (response.status === 200 && response.body?.authenticated === true && typeof response.body.username === "string")
      return publish({
        status: "authenticated",
        username: response.body.username,
        createdAt: typeof response.body.createdAt === "string" ? response.body.createdAt : "",
      });
    if (response.status === 200 || response.status === 401) {
      const wasSignedIn = snapshot.status === "authenticated";
      return publish({ status: "anonymous", expired: wasSignedIn });
    }
    // Saat sedang masuk, kegagalan sementara tidak boleh melempar pengguna keluar.
    if (snapshot.status === "authenticated") return;
    publish({ status: "unavailable", message: response.status === 0 ? UNREACHABLE : messageOf(response, "Server sedang bermasalah.") });
  }

  async function submit(path: string, username: string, password: string): Promise<AuthResult> {
    const response = await api("POST", path, { username: normalizeUsername(username), password });
    if (response.status === 200) {
      await refresh();
      return snapshot.status === "authenticated" ? { ok: true } : { ok: false, message: "Gagal memulai sesi. Coba lagi." };
    }
    if (response.status === 0) return { ok: false, message: UNREACHABLE };
    return { ok: false, message: messageOf(response, "Permintaan gagal. Coba lagi.") };
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: (): AuthSnapshot => {
      if (!started && typeof window !== "undefined") queueMicrotask(() => !started && void refresh());
      return snapshot;
    },
    getServerSnapshot: (): AuthSnapshot => LOADING,
    refresh,

    /** Dipanggil saat server menjawab 401: sesi sudah tidak aktif, tampilkan layar masuk. */
    expire() {
      attempt += 1;
      started = true;
      publish({ status: "anonymous", expired: true });
    },

    register(username: string, password: string): Promise<AuthResult> | AuthResult {
      const invalid = validateRegistration(username, password);
      return invalid ? { ok: false, message: invalid } : submit("/api/auth/register", username, password);
    },

    login(username: string, password: string): Promise<AuthResult> | AuthResult {
      if (!username.trim()) return { ok: false, message: "Username wajib diisi." };
      if (validatePassword(password) === "Password wajib diisi.") return { ok: false, message: "Password wajib diisi." };
      return submit("/api/auth/login", username, password);
    },

    async logout() {
      attempt += 1;
      started = true;
      publish({ status: "anonymous", expired: false });
      await api("POST", "/api/auth/logout");
    },
  };
}

export type RemoteAuthStore = ReturnType<typeof createRemoteAuthStore>;
