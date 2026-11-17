import assert from "node:assert/strict";
import { test } from "node:test";
import { seedBusinessState, type BusinessState } from "../src/domain/business-state";
import type { ApiClient, ApiResponse } from "../src/infrastructure/client/api";
import { createRemoteBusinessStore } from "../src/infrastructure/repositories/remote-business-store";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture(initial: BusinessState | null, legacy: unknown = null) {
  let stored: BusinessState | null = initial;
  let version = initial ? 1 : 0;
  let mode: "ok" | "expired" | "offline" = "ok";
  let unauthorized = 0;
  let cleared = 0;
  const puts: number[] = [];
  const api: ApiClient = async (method, _path, body): Promise<ApiResponse> => {
    if (mode === "offline") return { status: 0, body: null };
    if (mode === "expired") return { status: 401, body: { code: "UNAUTHORIZED" } };
    if (method === "GET") return { status: 200, body: { state: stored, version } };
    const request = body as { state: BusinessState; baseVersion: number };
    if (request.baseVersion !== version) return { status: 409, body: { message: "Data berubah di perangkat atau tab lain." } };
    stored = request.state;
    version += 1;
    puts.push(version);
    return { status: 200, body: { version } };
  };
  const store = createRemoteBusinessStore(api, { onUnauthorized: () => void (unauthorized += 1), takeLegacy: () => legacy, clearLegacy: () => void (cleared += 1) });
  return { store, puts, bump: (next: BusinessState) => { stored = next; version += 1; }, set: (value: typeof mode) => (mode = value), unauthorized: () => unauthorized, cleared: () => cleared, stored: () => stored };
}
const rename = (name: string) => (state: BusinessState): BusinessState => ({ ...state, company: { ...state.company, name } });

test("loads the saved state from the server", async () => {
  const saved = { ...seedBusinessState(), company: { ...seedBusinessState().company, name: "PT Laut" } };
  const f = fixture(saved);
  assert.equal(f.store.getSnapshot().status, "loading");
  await f.store.load();
  assert.equal(f.store.getSnapshot().status, "ready");
  assert.equal(f.store.getSnapshot().state.company.name, "PT Laut");
});

test("a brand new account starts from the seed and imports legacy browser data once", async () => {
  const legacy = { ...seedBusinessState(), company: { ...seedBusinessState().company, name: "Data Lama" } };
  const f = fixture(null, legacy);
  await f.store.load();
  await tick();
  await tick();
  assert.equal(f.store.getSnapshot().state.company.name, "Data Lama");
  assert.equal(f.stored()?.company.name, "Data Lama");
  assert.equal(f.cleared(), 1);
  const empty = fixture(null);
  await empty.store.load();
  assert.equal(empty.store.getSnapshot().state.company.name, seedBusinessState().company.name);
  assert.equal(empty.puts.length, 0);
});

test("updates apply instantly and are saved to the server in order", async () => {
  const f = fixture(seedBusinessState());
  await f.store.load();
  f.store.update(rename("A"));
  f.store.update(rename("B"));
  assert.equal(f.store.getSnapshot().state.company.name, "B");
  await tick();
  await tick();
  assert.equal(f.stored()?.company.name, "B");
  assert.equal(f.store.getSnapshot().storageError, null);
});

test("an expired session during save sends the user to sign-in instead of showing an error", async () => {
  const f = fixture(seedBusinessState());
  await f.store.load();
  f.set("expired");
  f.store.update(rename("X"));
  await tick();
  await tick();
  assert.equal(f.unauthorized(), 1);
  assert.equal(f.store.getSnapshot().storageError, null);
});

test("an expired session while loading goes to sign-in without a load error", async () => {
  const f = fixture(seedBusinessState());
  f.set("expired");
  await f.store.load();
  assert.equal(f.unauthorized(), 1);
  assert.equal(f.store.getSnapshot().loadError, null);
});

test("offline saves keep the data on screen, warn, and retry", async () => {
  const f = fixture(seedBusinessState());
  await f.store.load();
  f.set("offline");
  f.store.update(rename("Offline"));
  await tick();
  await tick();
  assert.ok(f.store.getSnapshot().storageError);
  assert.equal(f.store.getSnapshot().state.company.name, "Offline");
  f.set("ok");
  f.store.reload();
  await tick();
  await tick();
  assert.equal(f.stored()?.company.name, "Offline");
  assert.equal(f.store.getSnapshot().storageError, null);
});

test("a version conflict reloads the latest server data and reports it", async () => {
  const f = fixture(seedBusinessState());
  await f.store.load();
  f.bump({ ...seedBusinessState(), company: { ...seedBusinessState().company, name: "Perangkat lain" } });
  f.store.update(rename("Lokal"));
  await tick();
  await tick();
  assert.equal(f.store.getSnapshot().state.company.name, "Perangkat lain");
  assert.match(f.store.getSnapshot().storageError ?? "", /Data berubah/);
  f.store.update(rename("Setelah muat ulang"));
  await tick();
  await tick();
  assert.equal(f.stored()?.company.name, "Setelah muat ulang");
});

test("reset hides the previous account's data", async () => {
  const f = fixture({ ...seedBusinessState(), company: { ...seedBusinessState().company, name: "Rahasia Akun A" } });
  await f.store.load();
  f.store.reset();
  assert.equal(f.store.getSnapshot().status, "loading");
  assert.notEqual(f.store.getSnapshot().state.company.name, "Rahasia Akun A");
});
