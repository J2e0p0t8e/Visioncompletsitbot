import type { Client, VoiceState } from "discord.js";
import { Events } from "discord.js";
import { config } from "../config.js";
import { awardVoiceXp } from "../lib/xp-service.js";

type VoiceTracker = {
  channelId: string;
  username: string;
  displayName: string;
};

/** Utilisateurs actuellement en vocal (hors AFK) */
const voiceSessions = new Map<string, VoiceTracker>();

function isAfkChannel(channelId: string, channelName?: string): boolean {
  if (config.afkChannelIds.includes(channelId)) return true;
  if (channelName && /afk/i.test(channelName)) return true;
  return false;
}

function shouldTrackVoice(state: VoiceState): boolean {
  const channel = state.channel;
  if (!channel) return false;
  if (isAfkChannel(channel.id, channel.name)) return false;
  if (state.selfDeaf) return false;
  return true;
}

function syncVoiceState(oldState: VoiceState, newState: VoiceState): void {
  const userId = newState.id;
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const wasTracked = voiceSessions.has(userId);
  const nowTracked = shouldTrackVoice(newState);

  if (!wasTracked && nowTracked) {
    voiceSessions.set(userId, {
      channelId: newState.channel!.id,
      username: member.user.username,
      displayName: member.displayName,
    });
    return;
  }

  if (wasTracked && !nowTracked) {
    voiceSessions.delete(userId);
  } else if (nowTracked) {
    voiceSessions.set(userId, {
      channelId: newState.channel!.id,
      username: member.user.username,
      displayName: member.displayName,
    });
  }
}

async function tickVoiceXp(): Promise<void> {
  const entries = [...voiceSessions.entries()];
  for (const [discordId, tracker] of entries) {
    await awardVoiceXp(discordId, tracker.username, tracker.displayName);
  }
}

export function registerVoiceListener(client: Client): void {
  client.on("voiceStateUpdate", (oldState, newState) => {
    if (oldState.guild.id !== config.guildId) return;
    syncVoiceState(oldState, newState);
  });

  client.once(Events.ClientReady, async () => {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    for (const [, member] of guild.members.cache) {
      if (member.voice.channel && shouldTrackVoice(member.voice)) {
        voiceSessions.set(member.id, {
          channelId: member.voice.channel.id,
          username: member.user.username,
          displayName: member.displayName,
        });
      }
    }

    console.log(`[Vocal] ${voiceSessions.size} membre(s) suivi(s) au démarrage`);
  });

  setInterval(() => {
    void tickVoiceXp();
  }, 60_000);

  console.log("[Vocal] Ticker XP vocal : 1 minute");
}

export function getVoiceSessionCount(): number {
  return voiceSessions.size;
}
