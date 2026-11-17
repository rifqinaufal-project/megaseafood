import { normalizeUsername, validateRegistration } from "@/src/domain/auth";
import { hashPassword, startSession } from "@/src/infrastructure/server/auth";
import { getSql, isUniqueViolation } from "@/src/infrastructure/server/db";
import { failure, json, readJson } from "@/src/infrastructure/server/http";

export async function POST(request: Request) {
  const body = await readJson(request);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const invalid = validateRegistration(username, password);
  if (invalid) return json({ code: "INVALID", message: invalid }, 400);
  try {
    const sql = await getSql();
    const { salt, hash } = await hashPassword(password);
    const rows = await sql`
      INSERT INTO app_users (username, password_salt, password_hash)
      VALUES (${normalizeUsername(username)}, ${salt}, ${hash})
      RETURNING id`;
    await startSession(String(rows[0].id));
    return json({ ok: true });
  } catch (error) {
    if (isUniqueViolation(error)) return json({ code: "TAKEN", message: "Username sudah dipakai. Pilih username lain." }, 409);
    return failure(error);
  }
}
