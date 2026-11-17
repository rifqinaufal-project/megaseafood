import { connection } from "next/server";
import { currentUser } from "@/src/infrastructure/server/auth";
import { failure, json } from "@/src/infrastructure/server/http";

export async function GET() {
  await connection();
  try {
    const user = await currentUser();
    return json(user ? { authenticated: true, username: user.username, createdAt: user.createdAt } : { authenticated: false });
  } catch (error) {
    return failure(error);
  }
}
