import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import {
  getMemberProfile,
  getMemberRank,
} from "../lib/xp-service.js";
import { formatXpBar, formatXpAmount, xpProgress } from "../lib/levels.js";

export const rankCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("rang")
    .setDescription("Affiche ton niveau et ton XP Vision+"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const profile = await getMemberProfile(interaction.user.id);

    if (!profile) {
      await interaction.editReply({
        content:
          "Tu n'as pas encore d'XP. Envoie des messages, réagis aux posts ou reste en vocal pour commencer !",
      });
      return;
    }

    const rank = await getMemberRank(interaction.user.id);
    const progress = xpProgress(profile.total_xp);
    const bar = formatXpBar(progress.percent);

    const lines = [
      `**${interaction.user.displayName}** — Niveau **${progress.level}**`,
      rank ? `Classement serveur : **#${rank}**` : "",
      ``,
      `XP total : **${formatXpAmount(profile.total_xp)}**`,
      `Progression : ${bar} ${progress.percent}%`,
      `(${progress.current.toLocaleString("fr-FR")} / ${progress.needed.toLocaleString("fr-FR")} XP vers le niveau ${progress.level + 1})`,
      ``,
      `Messages : ${profile.message_count} · Vocal : ${profile.voice_minutes} min`,
    ].filter(Boolean);

    await interaction.editReply({ content: lines.join("\n") });
  },
};
