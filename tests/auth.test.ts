import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validatePassword, validateUsername } from "../src/domain/auth";
import { appendAuditLog } from "../src/domain/settings";
import { seedBusinessState } from "../src/domain/business-state";
import type { ApiClient, ApiResponse } from "../src/infrastructure/client/api";
import { createRemoteAuthStore } from "../src/infrastructure/repositories/remote-auth-store";
import AuthGate from "../src/presentation/auth/AuthGate";

type Handler = (method: string, path: string, body?: unknown) => ApiResponse | Promise<ApiResponse>;
const fakeApi = (handler: Handler): ApiClient => async (method, path, body) => handler(method, path, body);
const ok = (body: Record<string, unknown> = {}): ApiResponse => ({ status: 200, body });
const signedIn = ok({ authenticated: true, username: "budi", createdAt: "2026-01-01T00:00:00.000Z" });

test("username and password validation", () => {
  assert.equal(validateUsername("budi.seafood"), null);
  assert.equal(validateUsername("  Budi_1  "), null);
  assert.ok(validateUsername(""));
  assert.ok(validateUsername("ab"));
  assert.ok(validateUsername("nama dengan spasi"));
  assert.equal(validatePassword("rahasia"), null);
  assert.ok(validatePassword("12345"));
  assert.ok(validatePassword(""));
});

test("a valid server session authenticates", async () => {
  const store = createRemoteAuthStore(fakeApi(() => signedIn));
  assert.deepEqual(store.getServerSnapshot(), { status: "loading" });
  await store.refresh();
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, "authenticated");
  if (snapshot.status === "authenticated") assert.equal(snapshot.username, "budi");
});

test("no session or 401 goes straight to the sign-in screen without an error", async () => {
  for (const response of [ok({ authenticated: false }), { status: 401, body: { code: "UNAUTHORIZED" } } as ApiResponse]) {
    const store = createRemoteAuthStore(fakeApi(() => response));
    await store.refresh();
    assert.deepEqual(store.getSnapshot(), { status: "anonymous", expired: false });
  }
});

test("a session that expires while signed in lands on sign-in with the expired flag", async () => {
  let active = true;
  const store = createRemoteAuthStore(fakeApi(() => (active ? signedIn : { status: 401, body: null })));
  await store.refresh();
  assert.equal(store.getSnapshot().status, "authenticated");
  active = false;
  await store.refresh();
  assert.deepEqual(store.getSnapshot(), { status: "anonymous", expired: true });
  const direct = createRemoteAuthStore(fakeApi(() => signedIn));
  await direct.refresh();
  direct.expire();
  assert.deepEqual(direct.getSnapshot(), { status: "anonymous", expired: true });
});

test("a network blip while signed in does not kick the user out", async () => {
  let reachable = true;
  const store = createRemoteAuthStore(fakeApi(() => (reachable ? signedIn : { status: 0, body: null })));
  await store.refresh();
  reachable = false;
  await store.refresh();
  assert.equal(store.getSnapshot().status, "authenticated");
  const fresh = createRemoteAuthStore(fakeApi(() => ({ status: 0, body: null })));
  await fresh.refresh();
  assert.equal(fresh.getSnapshot().status, "unavailable");
});

test("login and register validate locally, then call the server", async () => {
  const calls: string[] = [];
  let authed = false;
  const store = createRemoteAuthStore(
    fakeApi((method, path, body) => {
      calls.push(`${method} ${path}`);
      if (path === "/api/auth/session") return authed ? signedIn : ok({ authenticated: false });
      if ((body as { password: string }).password === "salah-banget") return { status: 401, body: { message: "Username atau password salah." } };
      authed = true;
      return ok({ ok: true });
    }),
  );
  assert.equal((await store.register("x", "rahasia123")).ok, false);
  assert.equal((await store.register("andi", "123")).ok, false);
  assert.equal((await store.login("", "abc")).ok, false);
  assert.equal(calls.length, 0);
  assert.deepEqual(await store.login(" BUDI ", "salah-banget"), { ok: false, message: "Username atau password salah." });
  assert.deepEqual(await store.login(" BUDI ", "rahasia123"), { ok: true });
  assert.equal(store.getSnapshot().status, "authenticated");
  assert.ok(calls.includes("POST /api/auth/login"));
});

test("sign-in surfaces unreachable servers politely", async () => {
  const store = createRemoteAuthStore(fakeApi(() => ({ status: 0, body: null })));
  const result = await store.login("budi", "rahasia123");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /Server tidak dapat dihubungi/);
});

test("logout clears the session immediately", async () => {
  const calls: string[] = [];
  const store = createRemoteAuthStore(fakeApi((method, path) => {
    calls.push(`${method} ${path}`);
    return signedIn;
  }));
  await store.refresh();
  await store.logout();
  assert.deepEqual(store.getSnapshot(), { status: "anonymous", expired: false });
  assert.ok(calls.includes("POST /api/auth/logout"));
});

test("auth gate shows a loading state on the server, never the dashboard", () => {
  const html = renderToStaticMarkup(createElement(AuthGate, null, createElement("p", null, "RAHASIA-DASHBOARD")));
  assert.doesNotMatch(html, /RAHASIA-DASHBOARD/);
  assert.match(html, /Memuat/);
});

test("audit logs record the signed-in username when provided", () => {
  const state = seedBusinessState();
  const named = appendAuditLog(state, "INVOICE_CREATED", "Invoice", "INV/1", "a1", "budi");
  assert.equal(named.auditLogs[0].userName, "budi");
  const fallback = appendAuditLog(state, "INVOICE_CREATED", "Invoice", "INV/1", "a2");
  assert.equal(fallback.auditLogs[0].userName, "Pemilik");
});
