import "server-only";
import { backend } from "./client";
import { requireOwnerIdentity } from "./security";
export async function requireOwner(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = header.slice(7);
  if (token.length > 8192) throw new Error("UNAUTHORIZED");
  const { data, error } = await backend().auth.getUser(token);
  if (error) throw new Error("UNAUTHORIZED");
  return requireOwnerIdentity(data.user?.id ?? null, process.env.OWNER_USER_ID);
}
