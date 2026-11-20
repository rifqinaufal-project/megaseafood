import assert from "node:assert/strict";
import { test } from "node:test";
import { seedBusinessState, type BusinessState } from "../src/domain/business-state";
import type { ApiClient, ApiResponse } from "../src/infrastructure/client/api";
import { createRemoteBusinessStore } from "../src/infrastructure/repositories/remote-business-store";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture(initial: BusinessState | null) {
  let stored: BusinessState | null = initial;
  let version = initial ? 1 : 0;
  let mode: "ok" | "expired" | "offline" = "ok";
  let unauthorized = 0;
  const puts: number[] = [];
  let fullReads = 0;
  const api: ApiClient = async (method, path, body): Promise<ApiResponse> => {
    if (mode === "offline") return { status: 0, body: null };
    if (mode === "expired") return { status: 401, body: { code: "UNAUTHORIZED" } };
    if (method === "GET" && path === "/api/business/version") return { status: 200, body: { version, accountsCount: 0 } };
    if (method === "GET") {
      fullReads += 1;
      return { status: 200, body: { state: stored, version } };
    }
    const request = body as { state: BusinessState; baseVersion: number };
    if (request.baseVersion !== version) return { status: 409, body: { message: "Data berubah di perangkat atau tab lain." } };
    stored = request.state;
    version += 1;
    puts.push(version);
    return { status: 200, body: { version } };
  };
  const store = createRemoteBusinessStore(api, { onUnauthorized: () => void (unauthorized += 1) });
  return {
    store,
    puts,
    bump: (next: BusinessState) => { stored = next; version += 1; },
    set: (value: typeof mode) => (mode = value),
    unauthorized: () => unauthorized,
    stored: () => stored,
    fullReads: () => fullReads,
  };
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

test("version checks avoid downloading unchanged data and sync changed data", async () => {
  const f = fixture(seedBusinessState());
  await f.store.load();
  const readsBeforeCheck = f.fullReads();
  await f.store.checkForUpdates();
  assert.equal(f.fullReads(), readsBeforeCheck);

  f.bump({ ...seedBusinessState(), company: { ...seedBusinessState().company, name: "Perangkat lain" } });
  await f.store.checkForUpdates();
  assert.equal(f.store.getSnapshot().state.company.name, "Perangkat lain");
  assert.equal(f.fullReads(), readsBeforeCheck + 1);
});

test("automatic sync never overwrites pending local changes", async () => {
  const f = fixture(seedBusinessState());
  await f.store.load();
  f.set("offline");
  f.store.update(rename("Local belum tersimpan"));
  await tick();
  f.set("ok");
  f.bump({ ...seedBusinessState(), company: { ...seedBusinessState().company, name: "Perangkat lain" } });
  const readsBeforeCheck = f.fullReads();
  await f.store.checkForUpdates();
  assert.equal(f.store.getSnapshot().state.company.name, "Local belum tersimpan");
  assert.equal(f.fullReads(), readsBeforeCheck);
});

test("a brand new account starts empty, with no sample data, and nothing is written until it changes", async () => {
  const f = fixture(null);
  await f.store.load();
  const state = f.store.getSnapshot().state;
  assert.equal(f.store.getSnapshot().status, "ready");
  for (const key of ["invoices", "products", "suppliers", "restaurants", "batches", "operatingExpenses", "commissions"] as const)
    assert.equal(state[key].length, 0, key);
  assert.equal(f.puts.length, 0);
  f.store.update(rename("Toko Baru"));
  await tick();
  await tick();
  assert.equal(f.stored()?.company.name, "Toko Baru");
  assert.equal(f.puts.length, 1);
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

test("a version conflict keeps local changes visible instead of replacing them", async () => {
  const f = fixture(seedBusinessState());
  await f.store.load();
  f.bump({ ...seedBusinessState(), company: { ...seedBusinessState().company, name: "Perangkat lain" } });
  f.store.update(rename("Lokal"));
  await tick();
  await tick();
  assert.equal(f.store.getSnapshot().state.company.name, "Lokal");
  assert.equal(f.stored()?.company.name, "Perangkat lain");
  assert.match(f.store.getSnapshot().storageError ?? "", /Data berubah/);
});

test("reset hides the previous account's data", async () => {
  const f = fixture({ ...seedBusinessState(), company: { ...seedBusinessState().company, name: "Rahasia Akun A" } });
  await f.store.load();
  f.store.reset();
  assert.equal(f.store.getSnapshot().status, "loading");
  assert.notEqual(f.store.getSnapshot().state.company.name, "Rahasia Akun A");
});
