// @ts-nocheck
import { SlashCommandBuilder, EmbedBuilder  } from "discord.js";
import { finalizePanel, sendOrUpdatePanel  } from "../../lib/music/playerPanel.js";
import { sendPinnedPanel  } from "../../lib/music/pinManager.js";
import { clearQueue  } from "../../lib/music/queueManager.js";
import { resolveQueueFromInteraction, formatQueueLines  } from "../../lib/music/queueRegistry.js";

function noVoiceReply() {
  return '❌ Tu dois être dans le salon vocal où je joue !';
}

function buildQueueEmbed(q) {
  const upcoming = Math.max(0, q.songs.length - 1);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 File d\'attente')
    .setDescription(formatQueueLines(q.songs))
    .addFields(
      { name: '▶️ En cours', value: q.playing || q.processing ? 'Oui' : 'Non', inline: true },
      { name: '⏳ À venir', value: `${upcoming} titre(s)`, inline: true },
      { name: '🔁 Boucle', value: q.loop ? 'Activée' : 'Désactivée', inline: true },
      { name: '🔀 Aléatoire', value: q.shuffle ? 'Activé' : 'Désactivé', inline: true },
      { name: '🔊 Volume', value: `${q.volume}%`, inline: true },
      { name: '🎵 Total', value: `${q.songs.length} chanson(s)`, inline: true },
    );

  if (q.songs.length > 10) {
    embed.setFooter({ text: `… et ${q.songs.length - 10} de plus` });
  }

  return embed;
}

const queue = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('📋 Affiche la file d\'attente'),

  async execute(interaction, client) {
    const { queue: q, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') return interaction.reply(noVoiceReply());
    if (!q || !q.songs.length) {
      return interaction.reply('📋 La file d\'attente est vide dans ton salon vocal.');
    }

    return interaction.reply({ embeds: [buildQueueEmbed(q)] });
  },
};

const loop = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('🔁 Active/désactive la boucle sur la chanson actuelle'),

  async execute(interaction, client) {
    const { queue: q, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') return interaction.reply(noVoiceReply());
    if (!q || (!q.playing && !q.processing)) {
      return interaction.reply('❌ Aucune musique en cours dans ton salon vocal.');
    }

    q.loop = !q.loop;
    await interaction.reply(`🔁 Boucle **${q.loop ? 'activée' : 'désactivée'}** !`);
    await sendOrUpdatePanel(q);
  },
};

const nowplaying = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('🎵 Affiche la chanson en cours'),

  async execute(interaction, client) {
    const { queue: q, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') return interaction.reply(noVoiceReply());
    if (!q || !q.songs.length || (!q.playing && !q.processing)) {
      return interaction.reply('❌ Aucune musique en cours dans ton salon vocal.');
    }

    const song = q.songs[0];
    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle('🎵 En cours de lecture')
      .setDescription(`**[${song.title}](${song.url})**`)
      .addFields(
        { name: '⏱️ Durée', value: song.duration || 'Inconnue', inline: true },
        { name: '🔊 Volume', value: `${q.volume}%`, inline: true },
        { name: '🔁 Boucle', value: q.loop ? 'Oui' : 'Non', inline: true },
        { name: '🔀 Aléatoire', value: q.shuffle ? 'Oui' : 'Non', inline: true },
        { name: '📋 À venir', value: `${Math.max(0, q.songs.length - 1)} titre(s)`, inline: true },
      )
      .setThumbnail(song.thumbnail)
      .setFooter({ text: `Demandé par ${interaction.guild.members.cache.get(song.requestedBy)?.user.username || 'Inconnu'}` });

    await interaction.reply({ embeds: [embed] });
  },
};

const clearqueue = {
  data: new SlashCommandBuilder()
    .setName('clearqueue')
    .setDescription('🗑️ Supprime des titres de la file d\'attente')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Que supprimer ?')
        .setRequired(false)
        .addChoices(
          { name: 'Toute la file (arrête la lecture)', value: 'all' },
          { name: 'Titres à venir uniquement', value: 'upcoming' }
        )
    ),

  async execute(interaction, client) {
    const { queue: q, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') return interaction.reply(noVoiceReply());
    if (!q || !q.songs.length) {
      return interaction.reply('📋 La file d\'attente est déjà vide dans ton salon vocal.');
    }

    const mode = interaction.options.getString('mode') ?? 'all';
    const keepCurrent = mode === 'upcoming';

    if (keepCurrent && q.songs.length <= 1) {
      return interaction.reply('📋 Aucun titre à venir à supprimer — seule la chanson en cours reste dans la file.');
    }

    const { removed, kept } = clearQueue(q, client, { keepCurrent });

    if (kept > 0) {
      await sendOrUpdatePanel(q);
      return interaction.reply(`🗑️ **${removed}** titre(s) à venir supprimé(s). La lecture en cours continue.`);
    }

    await finalizePanel(q);

    if (q.pinned && client.queues.has(q.voiceChannelId)) {
      await sendPinnedPanel(q);
      return interaction.reply(
        `🗑️ File vidée (**${removed}** titre(s)). Je reste épinglé dans ce salon vocal 📌`
      );
    }

    return interaction.reply(
      `🗑️ File vidée (**${removed}** titre(s)). J'attends 1 minute avant de quitter le salon.`
    );
  },
};

export { queue, loop, nowplaying, clearqueue, buildQueueEmbed };
