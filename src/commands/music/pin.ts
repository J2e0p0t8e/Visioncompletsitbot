// @ts-nocheck
import { SlashCommandBuilder, MessageFlags, ChannelType  } from "discord.js";
import { connectToVoice  } from "../../lib/music/voiceManager.js";
import { pinQueue, unpinQueue, isAdmin  } from "../../lib/music/pinManager.js";
import { getPinnedQueuesInGuild  } from "../../lib/music/queueRegistry.js";
import { getMemberVoiceChannel, resolveVoiceChannel  } from "../../lib/music/memberVoice.js";

const PIN_NO_VOICE =
  '❌ Je ne te détecte pas dans un salon vocal.\n' +
  '→ Choisis ton **salon** dans `/pin` (champ salon)\n' +
  '→ **Quitte puis rejoins** le salon vocal\n' +
  '→ Dans un **salon Stage**, **monte sur scène**';

async function resolvePinVoiceChannel(interaction, client) {
  const manual = interaction.options?.getChannel?.('salon');
  if (manual?.isVoiceBased()) return manual;
  return resolveVoiceChannel(interaction.guild, interaction.user.id, client);
}

const pin = {
  data: new SlashCommandBuilder()
    .setName('pin')
    .setDescription('📌 Épingle le bot dans ton salon vocal (il y reste jusqu\'au désépinglage)')
    .addChannelOption((opt) =>
      opt
        .setName('salon')
        .setDescription('Ton salon vocal (si le bot ne te détecte pas)')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    ),

  async execute(interaction, client) {
    const voiceChannel = await resolvePinVoiceChannel(interaction, client);

    if (!voiceChannel) {
      return interaction.reply({
        content: PIN_NO_VOICE,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      const { queue } = await connectToVoice(
        interaction.guild,
        interaction.member,
        interaction.channel,
        client,
        voiceChannel
      );

      if (queue.pinned) {
        return interaction.editReply(
          `📌 Je suis déjà épinglé dans **${voiceChannel.name}** !`
        );
      }

      await pinQueue(queue, interaction.user.id, interaction.guild);

      return interaction.editReply(
        `📌 **Épinglé** dans **${voiceChannel.name}** ! Je reste ici jusqu\'à ce qu\'un admin utilise \`/unpin\`.\n` +
        `→ Utilise le \`/play\` de **${client.user.username}** pour la musique.`
      );
    } catch (err) {
      if (err.message === 'NO_VOICE') {
        return interaction.editReply('❌ Rejoins un salon vocal !');
      }
      if (err.message === 'PINNED_ELSEWHERE') {
        const pinnedChannel = interaction.guild.channels.cache.get(err.channelId);
        return interaction.editReply(
          `📌 Je suis déjà épinglé dans **${pinnedChannel?.name || 'un autre salon'}**. Un admin doit faire \`/unpin\` d'abord.`
        );
      }
      if (err.message === 'NO_PERMS') {
        return interaction.editReply(
          '❌ Je n\'ai pas la permission de rejoindre ou parler dans ce salon.'
        );
      }
      console.error(err);
      const status = err.status ? ` (${err.status})` : '';
      return interaction.editReply(`❌ Impossible de rejoindre le salon vocal${status}.`);
    }
  },
};

const unpin = {
  data: new SlashCommandBuilder()
    .setName('unpin')
    .setDescription('📍 Désépingle le bot (admin uniquement)'),

  async execute(interaction, client) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Seuls les **admins** peuvent désépingler le bot.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const voiceChannel = await getMemberVoiceChannel(interaction, client);
    const voiceChannelId = voiceChannel?.id;
    let targets = [];

    if (voiceChannelId) {
      const queue = client.queues.get(voiceChannelId);
      if (queue?.pinned) targets = [queue];
    }

    if (!targets.length) {
      targets = getPinnedQueuesInGuild(client, interaction.guildId);
    }

    if (!targets.length) {
      return interaction.reply({
        content: 'ℹ️ Le bot n\'est épinglé dans aucun salon vocal.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const left = [];
    const waiting = [];

    for (const queue of targets) {
      const result = await unpinQueue(queue, client);
      const channel = interaction.guild.channels.cache.get(queue.voiceChannelId);
      const name = channel?.name || 'salon inconnu';
      if (result === 'left') left.push(name);
      else waiting.push(name);
    }

    if (targets.length === 1) {
      if (left.length) {
        return interaction.reply(`📍 **Désépinglé** de **${left[0]}** — j\'ai quitté le salon vocal.`);
      }
      return interaction.reply(
        `📍 **Désépinglé** de **${waiting[0]}** — je quitterai le salon une fois la musique terminée.`
      );
    }

    const parts = [];
    if (left.length) parts.push(`quitté : ${left.map((n) => `**${n}**`).join(', ')}`);
    if (waiting.length) parts.push(`en attente : ${waiting.map((n) => `**${n}**`).join(', ')}`);

    return interaction.reply(`📍 **Désépinglé** dans ${targets.length} salon(s) — ${parts.join(' ; ')}.`);
  },
};

export { pin, unpin };
