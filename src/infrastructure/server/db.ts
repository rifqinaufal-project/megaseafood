import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Sql = NeonQueryFunction<false, false>;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL UNIQUE,
    password_salt text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS shared_business_state (
    id smallint PRIMARY KEY CHECK (id = 1),
    data jsonb NOT NULL,
    version integer NOT NULL DEFAULT 1,
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
];

let client: Sql | null = null;
let ready: Promise<void> | null = null;

function connection(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new ConfigError("DATABASE_URL belum diatur");
  return (client ??= neon(url) as Sql);
}

/** Mengembalikan klien SQL setelah tabel dipastikan ada (dijalankan sekali per instance). */
export async function getSql(): Promise<Sql> {
  const sql = connection();
  ready ??= sql
    .transaction(SCHEMA.map((statement) => sql.query(statement)))
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  await ready;
  return sql;
}

export const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
