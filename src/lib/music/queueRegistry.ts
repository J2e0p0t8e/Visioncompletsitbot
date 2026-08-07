// @ts-nocheck
import { getVoiceChannelIdFromCache, resolveVoiceChannel  } from "./memberVoice.js";

async function resolveQueueFromMember(client, member, guild = null) {
  const guildRef = guild ?? member?.guild ?? null;
  const userId = member?.id;

  let voiceChannelId =
    member?.voice?.channelId ?? getVoiceChannelIdFromCache(guildRef, userId);

  if (!voiceChannelId && guildRef && userId) {
    const channel = await resolveVoiceChannel(guildRef, userId, client);
    voiceChannelId = channel?.id ?? null;
  }

  if (!voiceChannelId) {
    return { queue: null, error: 'NO_VOICE' };
  }

  const queue = client.queues.get(voiceChannelId) ?? null;
  return { queue, error: null };
}

async function resolveQueueFromInteraction(client, interaction) {
  return resolveQueueFromMember(client, interaction.member, interaction.guild);
}

function findQueueByMessage(client, messageId) {
  for (const queue of client.queues.values()) {
    if (queue.panelMessage?.id === messageId) return queue;
  }
  return null;
}

function getGuildQueues(client, guildId) {
  return [...client.queues.values()].filter((q) => q.guildId === guildId);
}

function getPinnedQueuesInGuild(client, guildId) {
  return getGuildQueues(client, guildId).filter((q) => q.pinned);
}

function formatQueueLines(songs, { limit = 10 } = {}) {
  return songs
    .slice(0, limit)
    .map((song, i) => {
      const prefix = i === 0 ? '▶️' : `\`${i + 1}.\``;
      const requester = song.requestedBy ? ` — <@${song.requestedBy}>` : '';
      const title = (song.title || 'Titre inconnu').slice(0, 80);
      return `${prefix} **${title}**${requester}`;
    })
    .join('\n');
}

export {
  resolveQueueFromMember,
  resolveQueueFromInteraction,
  findQueueByMessage,
  getGuildQueues,
  getPinnedQueuesInGuild,
  formatQueueLines,
};
