// @ts-nocheck
import { SlashCommandBuilder, EmbedBuilder, ChannelType  } from "discord.js";
import { appendSongs, isPlaybackActive  } from "../../lib/music/queueManager.js";
import { sendOrUpdatePanel  } from "../../lib/music/playerPanel.js";
import { searchSuggestions, resolveQuery  } from "../../lib/music/musicSearch.js";
import { getCachedSuggestions, safeAutocompleteRespond  } from "../../lib/music/autocomplete.js";
import { ensureVoiceConnection  } from "../../lib/music/voiceManager.js";
import { resolvePlayVoiceChannel, NO_VOICE_MESSAGE  } from "../../lib/music/memberVoice.js";
import { findBotInVoiceChannel,
  findIdleBot,
  getOccupiedChannel,
  getClientQueueInChannel,
  getSiblings,
 } from "../../lib/music/botRegistry.js";

export const command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎵 Joue une chanson depuis YouTube ou Spotify')
    .addStringOption((opt) =>
      opt
        .setName('recherche')
        .setDescription('Nom, URL YouTube ou URL Spotify')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName('salon')
        .setDescription('Ton salon vocal (si le bot ne te détecte pas)')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    ),

  async autocomplete(interaction) {
    const query = interaction.options.getFocused();

    const cached = getCachedSuggestions(query);
    if (cached?.length) {
      await safeAutocompleteRespond(interaction, cached);
      return;
    }

    let responded = false;
    const respondOnce = async (choices) => {
      if (responded) return;
      responded = await safeAutocompleteRespond(interaction, choices);
    };

    const timeout = setTimeout(() => respondOnce([]), 2800);

    try {
      const choices = await searchSuggestions(query);
      clearTimeout(timeout);
      await respondOnce(choices);
    } catch {
      clearTimeout(timeout);
      await respondOnce([]);
    }
  },

  async execute(interaction, client) {
    try {
      return await executePlay(interaction, client);
    } catch (err) {
      console.error(`[${client.botMeta?.label || 'bot'}] Erreur /play:`, err);
      const detail = err?.message ? `\n\`${err.message.slice(0, 150)}\`` : '';
      const payload = { content: `❌ Erreur lors du /play.${detail}`, flags: 64 };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};

async function executePlay(interaction, client) {
    const query = interaction.options.getString('recherche');
    const { channel: voiceChannel } = await resolvePlayVoiceChannel(interaction, client);

    if (!voiceChannel) {
      console.warn(
        `[${client.botMeta?.label || client.user?.tag}] Vocal introuvable: ` +
        `user=${interaction.user.id} guild=${interaction.guildId} ` +
        `cache=${interaction.guild.voiceStates.cache.size}`
      );
      return interaction.reply({
        content: NO_VOICE_MESSAGE,
        flags: 64,
      });
    }

    await interaction.deferReply();

    const perms = voiceChannel.permissionsFor(client.user);
    if (!perms?.has('Connect') || !perms?.has('Speak')) {
      return interaction.editReply('❌ Je n\'ai pas la permission de rejoindre ou parler dans ce salon !');
    }

    if (getSiblings(client).length) {
      const pinnedHere = getClientQueueInChannel(client, interaction.guildId, voiceChannel.id)?.pinned;

      const siblingInChannel = findBotInVoiceChannel(
        interaction.guildId,
        voiceChannel.id,
        client
      );
      if (siblingInChannel && !pinnedHere) {
        const hint = siblingInChannel.pinned && !siblingInChannel.busy
          ? `📌 **${siblingInChannel.username}** est **épinglé** dans **${voiceChannel.name}**.\n` +
            `→ Utilise **son** \`/play\` pour lancer la musique ici !`
          : `ℹ️ **${siblingInChannel.username}** est déjà dans **${voiceChannel.name}**.\n` +
            `→ Utilise son \`/play\` (ou ses boutons) pour ce salon.\n` +
            `→ \`/status\` pour voir quel DJ est libre.`;
        return interaction.editReply(hint);
      }

      const occupiedElsewhere = getOccupiedChannel(client, interaction.guildId, voiceChannel.id);
      if (occupiedElsewhere) {
        const otherChannel = interaction.guild.channels.cache.get(occupiedElsewhere);
        const idleBot = findIdleBot(interaction.guildId, client);
        const hint = idleBot
          ? `→ Utilise **${idleBot.username}** pour ce salon (\`/status\`).`
          : '→ Tous les DJ sont occupés pour l\'instant (\`/status\`).';
        return interaction.editReply(
          `❌ Je suis déjà actif dans **${otherChannel?.name || 'un autre salon'}**.\n${hint}`
        );
      }
    }

    let songs;
    try {
      songs = await resolveQuery(query, interaction.user.id);
      if (!songs.length) {
        return interaction.editReply('❌ Aucun résultat trouvé sur YouTube ou Spotify.');
      }
    } catch (err) {
      console.error(err);
      return interaction.editReply(`❌ ${err.message}`);
    }

    let queue;

    try {
      ({ queue } = await ensureVoiceConnection(interaction, client, voiceChannel));
    } catch (err) {
      if (err.message === 'PINNED_ELSEWHERE') {
        const pinnedChannel = interaction.guild.channels.cache.get(err.channelId);
        return interaction.editReply(
          `📌 Je suis **épinglé** dans **${pinnedChannel?.name || 'un autre salon'}**.\n` +
          `→ Rejoins ce salon pour lancer la musique, ou demande à un admin de faire \`/unpin\`.`
        );
      }
      console.error(err);
      const status = err.status ? ` (état: ${err.status})` : '';
      return interaction.editReply(
        '❌ Impossible de rejoindre le salon vocal' + status + '.\n' +
        '→ Sois dans un salon vocal (pas un salon stage sans permission)\n' +
        '→ Vérifie que le bot a **Connecter** + **Parler**\n' +
        '→ Relance le bot après `npm install`'
      );
    }

    const wasEmpty = queue.songs.length === 0;
    const { startLength, addedCount } = appendSongs(queue, songs);
    const addedPosition = startLength + 1;
    const firstSong = songs[0];
    const sourceLabel = firstSong.source === 'spotify' ? 'Spotify' : 'YouTube';
    const linkUrl = firstSong.originalUrl || firstSong.url;

    const embed = new EmbedBuilder()
      .setColor(firstSong.source === 'spotify' ? 0x1DB954 : 0xFF0000)
      .setTitle(
        wasEmpty && songs.length === 1
          ? '🎵 Lecture en cours'
          : songs.length === 1
            ? '📋 Ajouté à la file'
            : `📋 ${songs.length} titres ajoutés`
      )
      .setDescription(`**[${firstSong.title}](${linkUrl})**`)
      .addFields(
        { name: '📡 Source', value: sourceLabel, inline: true },
        { name: '⏱️ Durée', value: firstSong.duration || 'Inconnue', inline: true },
        {
          name: '📋 Position',
          value: wasEmpty ? 'Maintenant' : `#${addedPosition}`,
          inline: true,
        }
      )
      .setFooter({
        text: `Demandé par ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL({ size: 64 }),
      });

    if (firstSong.thumbnail) {
      embed.setThumbnail(firstSong.thumbnail);
    }

    if (songs.length > 1) {
      embed.addFields({
        name: '🎶 Playlist',
        value: `${songs.length} titres ajoutés à la file`,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    if (isPlaybackActive(queue)) {
      await sendOrUpdatePanel(queue);
      if (addedPosition > 1) {
        const waiting = addedPosition - 1;
        await queue.textChannel?.send(
          `📋 **${firstSong.title}** ajouté en position **#${addedPosition}** (${waiting} titre(s) avant).`
        ).catch(() => {});
      }
    }
}
