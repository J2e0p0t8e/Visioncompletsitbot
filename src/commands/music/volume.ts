// @ts-nocheck
import { SlashCommandBuilder  } from "discord.js";
import { sendOrUpdatePanel  } from "../../lib/music/playerPanel.js";
import { resolveQueueFromInteraction  } from "../../lib/music/queueRegistry.js";

export const command = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('🔊 Règle le volume (0 à 100)')
    .addIntegerOption(opt =>
      opt.setName('niveau')
        .setDescription('Volume entre 0 et 100')
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const { queue, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') {
      return interaction.reply('❌ Tu dois être dans le salon vocal où je joue !');
    }
    if (!queue || !queue.playing) {
      return interaction.reply('❌ Aucune musique en cours dans ton salon vocal.');
    }

    const vol = interaction.options.getInteger('niveau');
    queue.volume = vol;

    // Applique immédiatement si une ressource est active
    if (queue.currentResource?.volume) {
      queue.currentResource.volume.setVolumeLogarithmic(vol / 100);
    }

    const emoji = vol === 0 ? '🔇' : vol < 40 ? '🔈' : vol < 70 ? '🔉' : '🔊';
    await interaction.reply(`${emoji} Volume réglé à **${vol}%**`);
    await sendOrUpdatePanel(queue);
  },
};
