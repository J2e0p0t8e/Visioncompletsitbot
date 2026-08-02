import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { getLeaderboard } from "../lib/xp-service.js";
import { formatXpAmount } from "../lib/levels.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("classement")
    .setDescription("Top 20 des membres Vision+ par points (VP)"),

  async execute(interaction) {
    await interaction.deferReply();

    const rows = await getLeaderboard(20);

    if (rows.length === 0) {
      await interaction.editReply({
        content: "Aucun point (VP) enregistré pour le moment. Sois le premier actif !",
      });
      return;
    }

    const lines = rows.map((row, i) => {
      const medal = MEDALS[i] ?? `**${i + 1}.**`;
      const name = row.display_name || row.username;
      return `${medal} **${name}** — **${formatXpAmount(row.total_xp)} VP**`;
    });

    await interaction.editReply({
      content: ["**🏆 Classement VP (Vision Points) Vision+**", "", ...lines].join("\n"),
    });
  },
};
