// @ts-nocheck
import { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags  } from "discord.js";
import { appendSongs  } from "../../lib/music/queueManager.js";
import { sendOrUpdatePanel  } from "../../lib/music/playerPanel.js";
import { resolveAiTracks  } from "../../lib/music/musicSearch.js";
import { generatePlaylist, isGroqConfigured  } from "../../lib/music/groqClient.js";
import { ensureVoiceConnection  } from "../../lib/music/voiceManager.js";
import { resolvePlayVoiceChannel, NO_VOICE_MESSAGE  } from "../../lib/music/memberVoice.js";

export const command = {
  data: new SlashCommandBuilder()
    .setName('ia')
    .setDescription('🤖 Décris ce que tu veux (texte libre) — l\'IA fait un son ou une playlist')
    .addStringOption((opt) =>
      opt
        .setName('demande')
        .setDescription('Texte libre : artiste, style, ambiance, ou un paragraphe (ex: "j\'ai le cafard, motive-moi")')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('nombre')
        .setDescription('Nombre de titres (1 à 25). Laisse vide pour laisser l\'IA décider')
        .setMinValue(1)
        .setMaxValue(25)
    )
    .addChannelOption((opt) =>
      opt
        .setName('salon')
        .setDescription('Ton salon vocal (si le bot ne te détecte pas)')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    ),

  async execute(interaction, client) {
    try {
      return await executeIa(interaction, client);
    } catch (err) {
      console.error(`[${client.botMeta?.label || 'bot'}] Erreur /ia:`, err);
      const detail = err?.message ? `\n\`${err.message.slice(0, 150)}\`` : '';
      const payload = { content: `❌ Erreur lors de la génération IA.${detail}`, flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};

async function executeIa(interaction, client) {
  if (!isGroqConfigured()) {
    return interaction.reply({
      content:
        '❌ L\'IA n\'est pas configurée.\n' +
        '→ Ajoute `GROQ_API_KEY=...` dans le fichier `.env` (clé gratuite sur console.groq.com), puis relance le bot.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const prompt = interaction.options.getString('demande');
  const count = interaction.options.getInteger('nombre') ?? null;

  const { channel: voiceChannel } = await resolvePlayVoiceChannel(interaction, client);
  if (!voiceChannel) {
    return interaction.reply({ content: NO_VOICE_MESSAGE, flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();

  const perms = voiceChannel.permissionsFor(client.user);
  if (!perms?.has('Connect') || !perms?.has('Speak')) {
    return interaction.editReply('❌ Je n\'ai pas la permission de rejoindre ou parler dans ce salon !');
  }

  let playlist;
  try {
    playlist = await generatePlaylist(prompt, { count });
  } catch (err) {
    return interaction.editReply(`❌ ${err.message}`);
  }

  const isSingle = playlist.mode === 'single';
  await interaction.editReply(
    isSingle
      ? `🤖 Je cherche le titre **${playlist.name}** sur YouTube...`
      : `🤖 **${playlist.name}** — je recherche **${playlist.songs.length}** titres sur YouTube...`
  );

  const songs = await resolveAiTracks(playlist.songs, interaction.user.id);
  if (!songs.length) {
    return interaction.editReply(
      isSingle
        ? '❌ Le titre proposé par l\'IA est introuvable sur YouTube. Reformule ta demande.'
        : '❌ Aucun titre de la playlist IA n\'a pu être trouvé sur YouTube. Reformule ta demande.'
    );
  }

  let queue;
  try {
    ({ queue } = await ensureVoiceConnection(interaction, client, voiceChannel));
  } catch (err) {
    if (err.message === 'PINNED_ELSEWHERE') {
      const pinnedChannel = interaction.guild.channels.cache.get(err.channelId);
      return interaction.editReply(
        `📌 Je suis **épinglé** dans **${pinnedChannel?.name || 'un autre salon'}**.\n` +
        `→ Rejoins ce salon, ou demande à un admin de faire \`/unpin\`.`
      );
    }
    console.error(err);
    const status = err.status ? ` (état: ${err.status})` : '';
    return interaction.editReply(`❌ Impossible de rejoindre le salon vocal${status}.`);
  }

  const wasEmpty = queue.songs.length === 0;
  appendSongs(queue, songs);

  const notFound = playlist.songs.length - songs.length;

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setFooter({ text: `Demandé par ${interaction.user.username} • via Groq` });

  if (isSingle) {
    embed
      .setTitle('🤖 Son trouvé par l\'IA')
      .setDescription(`**${songs[0].title}**`)
      .addFields(
        { name: '🎧 Salon', value: voiceChannel.name, inline: true },
        { name: '▶️ Lecture', value: wasEmpty ? 'Maintenant' : 'À la suite', inline: true },
      );
  } else {
    const preview = songs
      .slice(0, 10)
      .map((s, i) => `\`${i + 1}.\` ${s.title}`)
      .join('\n');

    embed
      .setTitle(`🤖 ${playlist.name}`)
      .setDescription(preview + (songs.length > 10 ? `\n… et ${songs.length - 10} de plus` : ''))
      .addFields(
        { name: '🎵 Ajoutés', value: `${songs.length} titre(s)`, inline: true },
        { name: '🎧 Salon', value: voiceChannel.name, inline: true },
        { name: '▶️ Lecture', value: wasEmpty ? 'Maintenant' : 'À la suite', inline: true },
      );

    if (notFound > 0) {
      embed.addFields({ name: '⚠️ Introuvables', value: `${notFound} titre(s) non trouvé(s) sur YouTube`, inline: false });
    }
  }

  await interaction.editReply({ content: '', embeds: [embed] });

  if (!wasEmpty) {
    await sendOrUpdatePanel(queue).catch(() => {});
  }
}
