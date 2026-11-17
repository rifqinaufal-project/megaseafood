import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSql } from "@/src/infrastructure/server/db";

export const SESSION_COOKIE = "megaseafood_session";
export const SESSION_DAYS = 30;

export type SessionUser = { id: string; username: string; createdAt: string };

const KEY_LENGTH = 32;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key))),
  );

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: (await derive(password, salt)).toString("base64") };
}

export async function verifyPassword(password: string, salt: string, hash: string) {
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Dipakai agar login ke username yang tidak ada memakan waktu sama dengan username yang ada. */
export async function burnPasswordCheck(password: string) {
  await derive(password, Buffer.alloc(16));
}

export async function startSession(userId: string) {
  const sql = await getSql();
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql`DELETE FROM app_sessions WHERE expires_at < now()`;
  await sql`INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${expires.toISOString()})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  if (!token) return;
  const sql = await getSql();
  await sql`DELETE FROM app_sessions WHERE token_hash = ${hashToken(token)}`;
}

/** Pengguna dari cookie sesi, atau null bila tidak ada, tidak dikenal, atau sudah kedaluwarsa. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sql = await getSql();
  const rows = await sql`
    SELECT u.id, u.username, u.created_at
    FROM app_sessions s JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
  const row = rows[0];
  if (!row) return null;
  return { id: String(row.id), username: String(row.username), createdAt: new Date(row.created_at).toISOString() };
}
