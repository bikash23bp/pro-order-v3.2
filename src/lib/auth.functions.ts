import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

const PERSONAL_BACKEND_URL = "https://cmqqxjfadpfbtvlykcgz.supabase.co";
const PERSONAL_BACKEND_PUBLISHABLE_KEY = "sb_publishable_UD-P5lLzKAcjeS4PO2UDmQ_wLhlpuqO";

export const signInWithPasswordOnServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || PERSONAL_BACKEND_URL;
    const supabaseKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      PERSONAL_BACKEND_PUBLISHABLE_KEY;

    const authClient = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: result, error } = await authClient.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) throw new Error(error.message);
    if (!result.session) throw new Error("Sign-in did not return a session");

    return {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    };
  });