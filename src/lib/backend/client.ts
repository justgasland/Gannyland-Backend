import "server-only";
import { createClient } from "@supabase/supabase-js";
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error("NOT_CONFIGURED");
  return value;
}
export function backend() {
  return createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
