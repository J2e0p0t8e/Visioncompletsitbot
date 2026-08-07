// @ts-nocheck
import { SlashCommandBuilder  } from "discord.js";
import { AudioPlayerStatus  } from "@discordjs/voice";
import { skipCurrent, stopQueue  } from "../../lib/music/queueManager.js";
import { sendOrUpdatePanel, finalizePanel  } from "../../lib/music/playerPanel.js";
import { sendPinnedPanel  } from "../../lib/music/pinManager.js";
import { resolveQueueFromInteraction  } from "../../lib/music/queueRegistry.js";

function noVoiceReply() {
  return '❌ Tu dois être dans le salon vocal où je joue !';
}

const skip = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('⏭️ Passe à la chanson suivante'),

  async execute(interaction, client) {
    const { queue, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') return interaction.reply(noVoiceReply());
    if (!queue || (!queue.playing && !queue.processing)) {
      return interaction.reply('❌ Aucune musique en cours dans ton salon vocal.');
    }

    skipCurrent(queue);
    await interaction.reply('⏭️ Chanson passée !');
    await sendOrUpdatePanel(queue);
  },
};

const stop = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('⏹️ Arrête la musique et vide la file'),

  async execute(interaction, client) {
    const { queue, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') return interaction.reply(noVoiceReply());
    if (!queue || !queue.songs.length) {
      return interaction.reply('❌ Aucune musique en cours dans ton salon vocal.');
    }

    await finalizePanel(queue);
    stopQueue(queue, client);

    if (queue.pinned && client.queues.has(queue.voiceChannelId)) {
      await sendPinnedPanel(queue);
      return interaction.reply('⏹️ Musique arrêtée. Je reste épinglé dans ce salon vocal 📌');
    }

    return interaction.reply('⏹️ Musique arrêtée. J\'attends 1 minute avant de quitter le salon.');
  },
};

const pause = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('⏸️ Met la musique en pause'),

  async execute(interaction, client) {
    const { queue, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') return interaction.reply(noVoiceReply());
    if (!queue || queue.player.state.status !== AudioPlayerStatus.Playing) {
      return interaction.reply('❌ Aucune musique en cours de lecture dans ton salon vocal.');
    }

    queue.player.pause();
    await interaction.reply('⏸️ Musique mise en pause.');
    await sendOrUpdatePanel(queue);
  },
};

const resume = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('▶️ Reprend la lecture'),

  async execute(interaction, client) {
    const { queue, error } = await resolveQueueFromInteraction(client, interaction);
    if (error === 'NO_VOICE') return interaction.reply(noVoiceReply());
    if (!queue || queue.player.state.status !== AudioPlayerStatus.Paused) {
      return interaction.reply('❌ La musique n\'est pas en pause dans ton salon vocal.');
    }

    queue.player.unpause();
    await interaction.reply('▶️ Lecture reprise !');
    await sendOrUpdatePanel(queue);
  },
};

export { skip, stop, pause, resume };
