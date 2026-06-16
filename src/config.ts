import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variable manquante : ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function optionalFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function optionalStringList(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  token: required("DISCORD_BOT_TOKEN"),
  clientId: required("DISCORD_CLIENT_ID"),
  guildId: required("DISCORD_GUILD_ID"),
  siteUrl: process.env.SITE_URL?.trim() || "https://vision-plus.tech",
  discordInvite:
    process.env.DISCORD_INVITE_URL?.trim() ||
    "https://discord.gg/83N75v6VRh",
  port: Number(process.env.PORT || 3001),

  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  xp: {
    message: optionalFloat("XP_MESSAGE", 1),
    reaction: optionalFloat("XP_REACTION", 0.5),
    voicePerMinute: optionalFloat("XP_VOICE_PER_MINUTE", 1),
    messageCooldownSec: optionalInt("MESSAGE_COOLDOWN_SECONDS", 60),
    reactionCooldownSec: optionalInt("REACTION_COOLDOWN_SECONDS", 30),
    minMessageLength: optionalInt("MIN_MESSAGE_LENGTH", 3),
  },

  /** IDs de salons vocaux AFK à ignorer (séparés par des virgules) */
  afkChannelIds: optionalStringList("AFK_CHANNEL_IDS"),

  /** Rôles Discord staff optionnels (en plus des usernames Vision+) */
  staffRoleIds: optionalStringList("STAFF_ROLE_IDS"),
} as const;
