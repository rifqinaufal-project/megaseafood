import { randomBytes } from "node:crypto";
import { currentUser } from "@/src/infrastructure/server/auth";
import { getSql } from "@/src/infrastructure/server/db";
import { failure, json, readJson, unauthorized } from "@/src/infrastructure/server/http";

export async function POST(request: Request) {
  try {
    if (!(await currentUser())) return unauthorized();
    const body = await readJson(request);
    const id = body?.invoiceId;
    if (typeof id !== "string" || !id || id.length > 200) return json({ message: "Invoice tidak valid." }, 400);
    const sql = await getSql();
    const token = randomBytes(32).toString("base64url");
    const rows = await sql`
      INSERT INTO invoice_public_links (invoice_id, token)
      SELECT ${id}, ${token} FROM shared_business_state s
      WHERE s.id = 1 AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.data->'invoices') AS i WHERE i->>'id' = ${id})
      ON CONFLICT (invoice_id) DO UPDATE SET invoice_id = EXCLUDED.invoice_id
      RETURNING token`;
    if (!rows[0]) return json({ message: "Invoice tidak ditemukan." }, 404);
    return json({ token: String(rows[0].token) });
  } catch (error) {
    return failure(error);
  }
}
