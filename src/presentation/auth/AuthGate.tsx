"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, LogIn, UserPlus, Waves } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/src/domain/auth";
import { useAuth } from "@/src/presentation/auth/use-auth";

type Mode = "login" | "register";

function AuthScreen({ expired }: { expired: boolean }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isRegister = mode === "register";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setPassword("");
    setVisible(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const result = await (isRegister ? register : login)(username, password);
    if (!result.ok) {
      setError(result.message);
      setPending(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="auth-logo">
            <Waves size={22} strokeWidth={2.2} />
          </span>
          <strong>megaseafood</strong>
        </div>
        <h1 id="auth-title">{isRegister ? "Buat akun" : "Masuk"}</h1>
        <p className="auth-lead">
          {isRegister
            ? "Cukup username dan password untuk mulai memakai dashboard."
            : expired
              ? "Sesi Anda sudah berakhir. Masuk lagi untuk melanjutkan."
              : "Masuk dengan username dan password Anda."}
        </p>
        <div className="auth-tabs" role="tablist" aria-label="Pilih Masuk atau Daftar">
          <button
            type="button"
            role="tab"
            aria-selected={!isRegister}
            className={!isRegister ? "active" : ""}
            onClick={() => switchMode("login")}
          >
            Masuk
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isRegister}
            className={isRegister ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Daftar
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <label className="auth-field">
            <span>Username</span>
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setError("");
              }}
              placeholder="contoh: budi.seafood"
              aria-invalid={!!error}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <div className="auth-password">
              <input
                name="password"
                type={visible ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                placeholder={isRegister ? `Minimal ${MIN_PASSWORD_LENGTH} karakter` : "Password"}
                aria-invalid={!!error}
              />
              <button
                type="button"
                className="auth-eye"
                aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
                onClick={() => setVisible((value) => !value)}
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button auth-submit" type="submit" disabled={pending}>
            {isRegister ? <UserPlus size={16} /> : <LogIn size={16} />}
            {pending ? "Memproses..." : isRegister ? "Daftar dan masuk" : "Masuk"}
          </button>
        </form>
        <p className="auth-note">
          Akun dan data bisnis tersimpan aman di server, bisa dibuka dari perangkat mana pun.
        </p>
      </section>
    </main>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const { snapshot, retry } = useAuth();
  if (snapshot.status === "loading")
    return (
      <main className="auth-page" aria-busy="true">
        <p className="auth-loading">Memuat...</p>
      </main>
    );
  if (snapshot.status === "anonymous")
    return <AuthScreen expired={snapshot.expired} />;
  if (snapshot.status === "unavailable")
    return (
      <main className="auth-page">
        <section className="auth-card" role="alert">
          <h1>Server belum terhubung</h1>
          <p className="auth-lead">{snapshot.message}</p>
          <button className="primary-button auth-submit" type="button" onClick={() => void retry()}>
            Coba lagi
          </button>
        </section>
      </main>
    );
  return <>{children}</>;
}
