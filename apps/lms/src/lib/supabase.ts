import { createSharedSupabaseClient } from "@strategy-school/shared-db/client";

const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

export const supabase = useMock
  ? (null as any) // In mock mode, supabase client is not used
  : createSharedSupabaseClient(supabaseUrl, supabaseAnonKey);
