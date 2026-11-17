import { connection } from "next/server";
import { normalizeBusinessState } from "@/src/infrastructure/repositories/local-business-store";
import { currentUser } from "@/src/infrastructure/server/auth";
import { getSql } from "@/src/infrastructure/server/db";
import { failure, json, readJson, unauthorized } from "@/src/infrastructure/server/http";

const MAX_STATE_BYTES = 4_000_000;

export async function GET() {
  await connection();
  try {
    const user = await currentUser();
    if (!user) return unauthorized();
    const sql = await getSql();
    const rows = await sql`SELECT data, version FROM shared_business_state WHERE id = 1`;
    const row = rows[0];
    return json(row ? { state: row.data, version: Number(row.version) } : { state: null, version: 0 });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return unauthorized();
    const body = await readJson(request);
    const baseVersion = body?.baseVersion;
    if (!body || typeof baseVersion !== "number" || !Number.isSafeInteger(baseVersion) || baseVersion < 0)
      return json({ code: "INVALID", message: "Permintaan tidak valid." }, 400);
    let state;
    try {
      state = normalizeBusinessState(body.state);
    } catch (error) {
      return json({ code: "INVALID", message: error instanceof Error ? error.message : "Data tidak valid." }, 400);
    }
    const serialized = JSON.stringify(state);
    if (serialized.length > MAX_STATE_BYTES) return json({ code: "TOO_LARGE", message: "Data terlalu besar untuk disimpan." }, 413);
    const sql = await getSql();
    const rows =
      baseVersion === 0
        ? await sql`
            INSERT INTO shared_business_state (id, data, version, updated_by) VALUES (1, ${serialized}::jsonb, 1, ${user.id})
            ON CONFLICT (id) DO NOTHING RETURNING version`
        : await sql`
            UPDATE shared_business_state SET data = ${serialized}::jsonb, version = version + 1, updated_by = ${user.id}, updated_at = now()
            WHERE id = 1 AND version = ${baseVersion} RETURNING version`;
    if (!rows[0])
      return json({ code: "CONFLICT", message: "Data berubah di perangkat atau tab lain. Belum ada perubahan yang disimpan; periksa data terbaru lalu coba lagi." }, 409);
    return json({ version: Number(rows[0].version) });
  } catch (error) {
    return failure(error);
  }
}
