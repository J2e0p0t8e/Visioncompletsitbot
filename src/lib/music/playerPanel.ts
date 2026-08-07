// @ts-nocheck
import { ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags, } from "discord.js";
import { AudioPlayerStatus } from "@discordjs/voice";
import { findQueueByMessage, resolveQueueFromInteraction, formatQueueLines } from "./queueRegistry.js";
import { skipCurrent, stopQueue, shuffleUpcoming } from "./queueManager.js";
import { sendPinnedPanel } from "./pinManager.js";



function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getStatusLabel(queue) {
  if (queue.processing) return '⏳ Préparation...';
  if (queue.player.state.status === AudioPlayerStatus.Paused) return '⏸️ En pause';
  if (queue.playing) return '▶️ En lecture';
  return '⏹️ Arrêté';
}

function buildPlayerEmbed(queue) {
  const song = queue.songs[0];
  if (!song) return null;

  const linkUrl = song.originalUrl || song.url;
  const requester =
    queue.textChannel.guild?.members.cache.get(song.requestedBy)?.user.username || 'Inconnu';

  return new EmbedBuilder()
    .setColor(queue.shuffle ? 0x9B59B6 : 0x5865F2)
    .setTitle('🎛️ Lecteur musical')
    .setDescription(`**[${song.title}](${linkUrl})**`)
    .addFields(
      { name: 'État', value: getStatusLabel(queue), inline: true },
      { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
      { name: '📋 File', value: `${queue.songs.length} titre(s) (${Math.max(0, queue.songs.length - 1)} à venir)`, inline: true },
      { name: '🔁 Boucle', value: queue.loop ? '✅ ON' : '❌ OFF', inline: true },
      { name: '🔀 Aléatoire', value: queue.shuffle ? '✅ ON' : '❌ OFF', inline: true },
      { name: '📌 Épinglé', value: queue.pinned ? '✅ Oui' : '❌ Non', inline: true },
      {
        name: '🎧 Salon',
        value: queue.textChannel.guild.channels.cache.get(queue.voiceChannelId)?.name || 'Inconnu',
        inline: true,
      },
      { name: '⏱️ Durée', value: song.duration || 'Inconnue', inline: true }
    )
    .setThumbnail(song.thumbnail || null)
    .setFooter({ text: `Demandé par ${requester}` });
}

function buildControlRows(queue, disabled = false) {
  const isPaused = queue.player.state.status === AudioPlayerStatus.Paused;
  const canControl = (queue.playing || queue.processing || isPaused) && !disabled;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('player:pause')
      .setLabel(isPaused ? 'Reprendre' : 'Pause')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canControl),
    new ButtonBuilder()
      .setCustomId('player:skip')
      .setLabel('Skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canControl),
    new ButtonBuilder()
      .setCustomId('player:stop')
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canControl && queue.songs.length === 0),
    new ButtonBuilder()
      .setCustomId('player:loop')
      .setLabel(queue.loop ? 'Boucle ON' : 'Boucle')
      .setEmoji('🔁')
      .setStyle(queue.loop ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canControl),
    new ButtonBuilder()
      .setCustomId('player:shuffle')
      .setLabel(queue.shuffle ? 'Aléatoire ON' : 'Aléatoire')
      .setEmoji('🔀')
      .setStyle(queue.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(queue.songs.length < 2 && !queue.shuffle)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('player:vol_down')
      .setLabel('Vol -')
      .setEmoji('🔉')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canControl),
    new ButtonBuilder()
      .setCustomId('player:vol_up')
      .setLabel('Vol +')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canControl),
    new ButtonBuilder()
      .setCustomId('player:queue')
      .setLabel('File')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(queue.songs.length === 0),
    new ButtonBuilder()
      .setCustomId('player:refresh')
      .setLabel('Actualiser')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(queue.songs.length === 0)
  );

  return [row1, row2];
}

async function sendOrUpdatePanel(queue) {
  if (!queue.songs.length) return;

  const embed = buildPlayerEmbed(queue);
  if (!embed) return;

  const payload = { embeds: [embed], components: buildControlRows(queue) };

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

async function finalizePanel(queue) {
  if (!queue.panelMessage) return;

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ File terminée')
    .setDescription('À bientôt 👋');

  try {
    await queue.panelMessage.edit({
      embeds: [embed],
      components: buildControlRows({ ...queue, songs: [], playing: false, processing: false }, true),
    });
  } catch {
    /* message supprimé */
  }
  queue.panelMessage = null;
}

function setVolume(queue, delta) {
  queue.volume = Math.max(0, Math.min(100, queue.volume + delta));
  if (queue.currentResource?.volume) {
    queue.currentResource.volume.setVolumeLogarithmic(queue.volume / 100);
  }
}

function buildQueueEmbed(queue) {
  const upcoming = Math.max(0, queue.songs.length - 1);

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 File d\'attente')
    .setDescription(formatQueueLines(queue.songs) || 'Vide')
    .addFields({ name: '⏳ À venir', value: `${upcoming} titre(s)`, inline: true })
    .setFooter({
      text: queue.songs.length > 10 ? `… et ${queue.songs.length - 10} de plus` : `${queue.songs.length} titre(s)`,
    });
}

async function handlePlayerButton(interaction, client) {

  const queue =
    findQueueByMessage(client, interaction.message.id) ??
    (await resolveQueueFromInteraction(client, interaction)).queue;

  if (!queue || (!queue.songs.length && !queue.pinned)) {
    return interaction.reply({
      content: '❌ Aucune musique en cours.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const action = interaction.customId.split(':')[1];

  if (action === 'queue') {
    if (!queue.songs.length) {
      return interaction.reply({
        content: '📋 La file est vide.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      embeds: [buildQueueEmbed(queue)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (action === 'refresh' && queue.pinned && !queue.songs.length) {
    await interaction.deferUpdate();

    await sendPinnedPanel(queue);
    return;
  }

  if (!queue.songs.length) {
    return interaction.reply({
      content: '❌ Aucune musique en cours.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

  switch (action) {
    case 'pause':
      if (queue.player.state.status === AudioPlayerStatus.Playing) {
        queue.player.pause();
      } else if (queue.player.state.status === AudioPlayerStatus.Paused) {
        queue.player.unpause();
      }
      break;

    case 'skip':
      if (queue.playing || queue.processing || queue._playLock) skipCurrent(queue);
      break;

    case 'stop':
      stopQueue(queue, client);
      await finalizePanel(queue);
      if (queue.pinned && client.queues.has(queue.voiceChannelId)) {

        await sendPinnedPanel(queue);
      }
      return;

    case 'loop':
      queue.loop = !queue.loop;
      break;

    case 'shuffle':
      queue.shuffle = !queue.shuffle;
      if (queue.shuffle) shuffleUpcoming(queue);
      break;

    case 'vol_down':
      setVolume(queue, -10);
      break;

    case 'vol_up':
      setVolume(queue, 10);
      break;

    case 'refresh':
      break;

    default:
      return;
  }

  if (client.queues.has(queue.voiceChannelId)) {
    await sendOrUpdatePanel(queue);
  }
}

export {
  sendOrUpdatePanel,
  finalizePanel,
  handlePlayerButton,
  shuffleArray,
};
