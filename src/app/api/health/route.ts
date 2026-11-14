import { json } from "@/lib/backend/http";
export async function GET() {
  return json({ service: "gannyland-backend", status: "ok" });
}
