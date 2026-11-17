import { ConfigError } from "@/src/infrastructure/server/db";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const unauthorized = () => json({ code: "UNAUTHORIZED", message: "Sesi berakhir. Silakan masuk lagi." }, 401);

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Mengubah galat tak terduga menjadi respons generik tanpa membocorkan detail server. */
export function failure(error: unknown) {
  if (error instanceof ConfigError) return json({ code: "NOT_CONFIGURED", message: "Database belum dikonfigurasi di server." }, 503);
  console.error(error);
  return json({ code: "SERVER_ERROR", message: "Server sedang bermasalah. Coba lagi sebentar." }, 500);
}
