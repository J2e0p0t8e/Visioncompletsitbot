import { config } from "../config.js";
import { supabase } from "./supabase.js";

export type XpSource = "message" | "reaction" | "voice" | "quiz" | "bonus";

export type CreditXpResult = {
  newTotalXp: number;
  newLevel: number;
};

/** Vérifie et met à jour le cooldown ; retourne true si l'action est autorisée */
async function checkCooldown(
  discordId: string,
  actionType: "message" | "reaction",
  cooldownSec: number
): Promise<boolean> {
  const now = new Date();
  const { data: existing } = await supabase
    .from("xp_cooldowns")
    .select("last_at")
    .eq("discord_id", discordId)
    .eq("action_type", actionType)
    .maybeSingle();

  if (existing?.last_at) {
    const elapsed =
      (now.getTime() - new Date(existing.last_at).getTime()) / 1000;
    if (elapsed < cooldownSec) return false;
  }

  await supabase.from("xp_cooldowns").upsert(
    {
      discord_id: discordId,
      action_type: actionType,
      last_at: now.toISOString(),
    },
    { onConflict: "discord_id,action_type" }
  );

  return true;
}

export async function creditXp(
  discordId: string,
  username: string,
  displayName: string,
  amount: number,
  source: XpSource,
  metadata?: Record<string, unknown>
): Promise<CreditXpResult | null> {
  if (amount <= 0) return null;

  const { data, error } = await supabase.rpc("credit_discord_xp", {
    p_discord_id: discordId,
    p_username: username,
    p_display_name: displayName,
    p_amount: amount,
    p_source: source,
    p_metadata: metadata ?? null,
  });

  if (error) {
    console.error(`[XP] Erreur credit (${source}) pour ${discordId}:`, error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    newTotalXp: row.new_total_xp as number,
    newLevel: row.new_level as number,
  };
}

export async function awardMessageXp(
  discordId: string,
  username: string,
  displayName: string,
  contentLength: number
): Promise<CreditXpResult | null> {
  if (contentLength < config.xp.minMessageLength) return null;

  const allowed = await checkCooldown(
    discordId,
    "message",
    config.xp.messageCooldownSec
  );
  if (!allowed) return null;

  return creditXp(
    discordId,
    username,
    displayName,
    config.xp.message,
    "message",
    { contentLength }
  );
}

export async function awardReactionXp(
  discordId: string,
  username: string,
  displayName: string
): Promise<CreditXpResult | null> {
  const allowed = await checkCooldown(
    discordId,
    "reaction",
    config.xp.reactionCooldownSec
  );
  if (!allowed) return null;

  return creditXp(discordId, username, displayName, config.xp.reaction, "reaction");
}

export async function awardVoiceXp(
  discordId: string,
  username: string,
  displayName: string
): Promise<CreditXpResult | null> {
  return creditXp(discordId, username, displayName, config.xp.voicePerMinute, "voice", {
    minutes: 1,
  });
}

export async function getMemberProfile(discordId: string) {
  const { data, error } = await supabase
    .from("discord_members")
    .select("*")
    .eq("discord_id", discordId)
    .maybeSingle();

  if (error) {
    console.error("[XP] Erreur lecture profil:", error.message);
    return null;
  }

  return data;
}

export async function getLeaderboard(limit = 10) {
  const { data, error } = await supabase
    .from("discord_members")
    .select("discord_id, username, display_name, total_xp, level, message_count, voice_minutes")
    .order("total_xp", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[XP] Erreur classement:", error.message);
    return [];
  }

  return data ?? [];
}

export async function getMemberRank(discordId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("discord_members")
    .select("discord_id")
    .order("total_xp", { ascending: false });

  if (error || !data) return null;

  const index = data.findIndex((m) => m.discord_id === discordId);
  return index >= 0 ? index + 1 : null;
}
