import { endSession } from "@/src/infrastructure/server/auth";
import { failure, json } from "@/src/infrastructure/server/http";

export async function POST() {
  try {
    await endSession();
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
