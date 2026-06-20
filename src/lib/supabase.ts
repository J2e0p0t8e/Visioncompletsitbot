import { createClient } from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import ws from "ws";
import { config } from "../config.js";

function assertServiceRoleKey(key: string): void {
  try {
    const parts = key.split(".");
    if (parts.length !== 3) return;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as { role?: string };
    if (payload.role === "anon") {
      console.error(
        "[Supabase] ERREUR : SUPABASE_SERVICE_ROLE_KEY contient la clé anon, pas la service role !"
      );
      console.error(
        "  → Supabase Dashboard → Settings → API → service_role (secret)"
      );
    }
  } catch {
    /* ignore decode errors */
  }
}

assertServiceRoleKey(config.supabaseServiceKey);

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseServiceKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      transport: ws as unknown as WebSocketLikeConstructor,
    },
  }
);

export type DiscordMemberRow = {
  discord_id: string;
  username: string;
  display_name: string | null;
  total_xp: number;
  level: number;
  message_count: number;
  voice_minutes: number;
  created_at: string;
  updated_at: string;
};

export type PlayerCodeRow = {
  id: string;
  session_id: string;
  discord_id: string;
  personal_code: string;
  player_id: string | null;
  created_at: string;
  used_at: string | null;
};

export type GameSessionRow = {
  id: string;
  access_code: string;
  is_active: boolean;
  is_started: boolean;
  codes_enabled: boolean;
};
