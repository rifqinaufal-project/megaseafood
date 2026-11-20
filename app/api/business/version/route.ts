import { connection } from "next/server";
import { currentUser } from "@/src/infrastructure/server/auth";
import { getSql } from "@/src/infrastructure/server/db";
import { failure, json, unauthorized } from "@/src/infrastructure/server/http";

export async function GET() {
  await connection();
  try {
    if (!(await currentUser())) return unauthorized();
    const sql = await getSql();
    const rows = await sql`
      SELECT
        COALESCE((SELECT version FROM shared_business_state WHERE id = 1), 0) AS version,
        (SELECT COUNT(*)::int FROM app_users) AS accounts_count`;
    return json({
      version: Number(rows[0]?.version) || 0,
      accountsCount: Number(rows[0]?.accounts_count) || 0,
    });
  } catch (error) {
    return failure(error);
  }
}
