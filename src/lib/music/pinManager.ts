// @ts-nocheck
import { PermissionFlagsBits  } from "discord.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle  } from "discord.js";
import { ensurePinnedVoice, clearPinnedReconnect } from "./voiceManager.js";
function isAdmin(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function getPinnedChannelName(queue) {
  const guild = queue.textChannel?.guild;
  if (!guild) return 'inconnu';
  return guild.channels.cache.get(queue.voiceChannelId)?.name || 'inconnu';
}

function buildPinnedEmbed(queue) {
  const channelName = getPinnedChannelName(queue);
  const pinner = queue.pinnedBy
    ? queue.textChannel.guild.members.cache.get(queue.pinnedBy)?.user.username
    : 'Inconnu';

  const inVoice = queue.textChannel.guild.members.me?.voice?.channelId === queue.voiceChannelId;

  return new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('📌 Bot épinglé')
    .setDescription(
      `Je reste dans le salon vocal **${channelName}** jusqu\'à ce qu\'un admin me désépingle.`
    )
    .addFields(
      { name: '🎵 File', value: `${queue.songs.length} titre(s)`, inline: true },
      { name: '👤 Épinglé par', value: pinner, inline: true },
      { name: '🔊 Connecté', value: inVoice ? '✅ Oui' : '⏳ Reconnexion...', inline: true },
      { name: '💡 Astuce', value: 'Utilise `/play` sur **ce bot** pour lancer de la musique !', inline: false }
    );
}

function buildPinnedRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('player:refresh')
        .setLabel('Actualiser')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function sendPinnedPanel(queue) {
  const payload = {
    embeds: [buildPinnedEmbed(queue)],
    components: buildPinnedRows(),
  };

  if (queue.panelMessage) {
    try {
      await queue.panelMessage.edit(payload);
      return;
    } catch {
      queue.panelMessage = null;
    }
  }

  queue.panelMessage = await queue.textChannel.send(payload);
}

async function pinQueue(queue, userId, guild) {
  queue.pinned = true;
  queue.pinnedBy = userId;

  if (guild) {
    try {
      await ensurePinnedVoice(queue, guild);
    } catch (err) {
      console.error('Pin connexion vocale:', err.message);
      throw err;
    }
  }

  await sendPinnedPanel(queue);
}

async function unpinQueue(queue, client, { leaveNow = true } = {}) {
  clearPinnedReconnect(queue.guildId, queue.voiceChannelId);

  queue.pinned = false;
  queue.pinnedBy = null;

  const hasMusic = queue.songs.length > 0 || queue.playing || queue.processing;

  if (!hasMusic && leaveNow) {
    if (queue.panelMessage) {
      try {
        await queue.panelMessage.delete();
      } catch {}
      queue.panelMessage = null;
    }
    if (queue.connection?.state?.status !== 'destroyed') {
      try {
        queue.connection.destroy();
      } catch {}
    }
    client.queues.delete(queue.voiceChannelId);
    return 'left';
  }

  return 'waiting';
}

export {
  isAdmin,
  pinQueue,
  unpinQueue,
  sendPinnedPanel,
  buildPinnedEmbed,
  getPinnedChannelName,
};
