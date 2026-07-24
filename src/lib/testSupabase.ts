import { supabase } from "./supabase";

export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("❌ Supabase Connection Failed:", error);
      return;
    }

    console.log("✅ Successfully connected to Supabase!");
    console.log("Session:", data);
  } catch (err) {
    console.error("❌ Unexpected Error:", err);
  }
}