export type ApiResponse = { status: number; body: Record<string, unknown> | null };
export type ApiClient = (method: "GET" | "POST" | "PUT", path: string, body?: unknown) => Promise<ApiResponse>;

/** Status 0 berarti server tidak terjangkau (offline atau jaringan terputus). */
export const browserApi: ApiClient = async (method, path, body) => {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return {
      status: response.status,
      body: parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null,
    };
  } catch {
    return { status: 0, body: null };
  }
};

export const messageOf = (response: ApiResponse, fallback: string) =>
  typeof response.body?.message === "string" ? response.body.message : fallback;
