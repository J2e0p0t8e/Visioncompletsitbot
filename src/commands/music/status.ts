// @ts-nocheck
import { SlashCommandBuilder, EmbedBuilder  } from "discord.js";
import { getGuildSnapshot  } from "../../lib/music/botRegistry.js";

export const command = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('🤖 Affiche quels DJ sont libres ou occupés sur ce serveur'),

  async execute(interaction, client) {
    const bots = getGuildSnapshot(interaction.guildId);

    if (bots.length <= 1) {
      const me = bots[0];
      if (!me?.voiceChannelName) {
        return interaction.reply('🟢 Je suis libre — aucun salon vocal pour l\'instant.');
      }
      return interaction.reply(
        me.busy
          ? `🔴 Occupé dans **${me.voiceChannelName}** (${me.songCount} titre(s) en file)`
          : `🟡 Dans **${me.voiceChannelName}**` + (me.pinned ? ' (épinglé)' : '')
      );
    }

    const lines = bots.map((bot) => {
      if (!bot.voiceChannelName) {
        return `🟢 **${bot.username}** — libre`;
      }
      if (bot.busy) {
        return `🔴 **${bot.username}** — **${bot.voiceChannelName}** (${bot.songCount} titre(s))`;
      }
      return `🟡 **${bot.username}** — **${bot.voiceChannelName}**` + (bot.pinned ? ' 📌' : '');
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🤖 État des DJ')
      .setDescription(lines.join('\n'))
      .setFooter({
        text: 'Utilise le /play du bot libre, ou celui déjà dans ton salon vocal.',
      });

    await interaction.reply({ embeds: [embed] });
  },
};
