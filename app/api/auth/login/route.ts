import { normalizeUsername, validatePassword } from "@/src/domain/auth";
import { burnPasswordCheck, startSession, verifyPassword } from "@/src/infrastructure/server/auth";
import { getSql } from "@/src/infrastructure/server/db";
import { failure, json, readJson } from "@/src/infrastructure/server/http";

export async function POST(request: Request) {
  const body = await readJson(request);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username.trim()) return json({ code: "INVALID", message: "Username wajib diisi." }, 400);
  if (validatePassword(password) === "Password wajib diisi.") return json({ code: "INVALID", message: "Password wajib diisi." }, 400);
  const failed = () => json({ code: "BAD_CREDENTIALS", message: "Username atau password salah." }, 401);
  try {
    const sql = await getSql();
    const rows = await sql`SELECT id, password_salt, password_hash FROM app_users WHERE username = ${normalizeUsername(username)}`;
    const user = rows[0];
    if (!user) {
      await burnPasswordCheck(password);
      return failed();
    }
    if (!(await verifyPassword(password, String(user.password_salt), String(user.password_hash)))) return failed();
    await startSession(String(user.id));
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
