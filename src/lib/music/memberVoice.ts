// @ts-nocheck
import { Routes  } from "discord.js";

function getVoiceChannelIdFromCache(guild, userId) {
  if (!guild || !userId) return null;
  return guild.voiceStates.cache.get(userId)?.channelId ?? null;
}

async function fetchUserVoiceChannelIdViaRest(client, guildId, userId) {
  if (!client?.rest || !guildId || !userId) return null;

  try {
    const state = await client.rest.get(Routes.guildVoiceState(guildId, userId));
    return state?.channel_id ?? null;
  } catch (err) {
    if (err?.status !== 404) {
      console.warn(`REST voice state [${guildId}/${userId}]:`, err.message);
    }
    return null;
  }
}

async function fetchVoiceChannelById(guild, channelId) {
  if (!guild || !channelId) return null;

  const cached = guild.channels.cache.get(channelId);
  if (cached?.isVoiceBased()) return cached;

  try {
    const fetched = await guild.channels.fetch(channelId);
    return fetched?.isVoiceBased() ? fetched : null;
  } catch {
    return null;
  }
}

async function resolveVoiceChannel(guild, userId, client = null) {
  if (!guild || !userId) return null;

  let channelId = getVoiceChannelIdFromCache(guild, userId);

  if (!channelId) {
    try {
      const voiceState = await guild.voiceStates.fetch(userId);
      channelId = voiceState?.channelId ?? null;
    } catch {
      /* ignore */
    }
  }

  if (!channelId) {
    try {
      const member = await guild.members.fetch(userId);
      channelId = member.voice?.channelId ?? null;
    } catch {
      /* ignore */
    }
  }

  if (!channelId && client) {
    channelId = await fetchUserVoiceChannelIdViaRest(client, guild.id, userId);
  }

  return fetchVoiceChannelById(guild, channelId);
}

async function getMemberVoiceChannel(interaction, client = null) {
  return resolveVoiceChannel(interaction.guild, interaction.user.id, client ?? interaction.client);
}

async function resolvePlayVoiceChannel(interaction, client) {
  const direct = interaction.member?.voice?.channel ?? null;
  if (direct?.isVoiceBased?.()) {
    return { channel: direct };
  }

  const autoChannel = await resolveVoiceChannel(
    interaction.guild,
    interaction.user.id,
    client ?? interaction.client
  );
  if (autoChannel) {
    return { channel: autoChannel };
  }

  const manualChannel = interaction.options?.getChannel?.('salon');
  if (manualChannel?.isVoiceBased()) {
    return { channel: manualChannel };
  }

  return { channel: null };
}

const NO_VOICE_MESSAGE =
  '❌ Je ne te détecte pas dans un salon vocal.\n' +
  '→ Choisis ton **salon** dans `/play` (champ salon)\n' +
  '→ **Quitte puis rejoins** le salon vocal\n' +
  '→ Dans un **salon Stage**, **monte sur scène**';

export {
  getMemberVoiceChannel,
  resolvePlayVoiceChannel,
  resolveVoiceChannel,
  getVoiceChannelIdFromCache,
  NO_VOICE_MESSAGE,
};
