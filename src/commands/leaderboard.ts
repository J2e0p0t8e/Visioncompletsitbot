import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { getLeaderboard } from "../lib/xp-service.js";
import { formatXpAmount } from "../lib/levels.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("classement")
    .setDescription("Top 10 des membres Vision+ par XP"),

  async execute(interaction) {
    await interaction.deferReply();

    const rows = await getLeaderboard(10);

    if (rows.length === 0) {
      await interaction.editReply({
        content: "Aucun XP enregistré pour le moment. Sois le premier actif !",
      });
      return;
    }

    const lines = rows.map((row, i) => {
      const medal = MEDALS[i] ?? `**${i + 1}.**`;
      const name = row.display_name || row.username;
      return `${medal} **${name}** — Niv. ${row.level} · ${formatXpAmount(row.total_xp)} XP`;
    });

    await interaction.editReply({
      content: ["**🏆 Classement XP Vision+**", "", ...lines].join("\n"),
    });
  },
};
