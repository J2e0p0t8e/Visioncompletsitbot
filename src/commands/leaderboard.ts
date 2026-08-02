import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { BotCommand } from "./index.js";
import { getLeaderboard } from "../lib/xp-service.js";
import { formatXpAmount } from "../lib/levels.js";

const LOGO_URL =
  "https://cdn.discordapp.com/attachments/1482108302501609512/1533485361022505081/Vision_logo_upscaled_no_background.png?ex=6a70a908&is=6a6f5788&hm=e817c72655e11fa376af67e65d619a8077b821d596f0d838d08689199b98694e";

export const leaderboardCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("classement")
    .setDescription("Top 20 des membres Vision+ par VXPlus"),

  async execute(interaction) {
    await interaction.deferReply();

    const rows = await getLeaderboard(20);

    if (rows.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0xff3366)
        .setTitle("🏆  CLASSEMENT VISION+  🏆")
        .setDescription("Aucun VXPlus enregistré pour le moment. Sois le premier actif !")
        .setTimestamp();

      await interaction.editReply({ embeds: [emptyEmbed] });
      return;
    }

    const podiumLines: string[] = [];
    const restLines: string[] = [];

    rows.forEach((row, i) => {
      const name = (row.display_name || row.username).replace(/[`*_\\]/g, "");
      const points = formatXpAmount(row.total_xp);

      if (i === 0) {
        podiumLines.push(`> 🥇 **${name}**\n> \` 👑 ${points} VXPlus \``);
      } else if (i === 1) {
        podiumLines.push(`> 🥈 **${name}**\n> \` 💎 ${points} VXPlus \``);
      } else if (i === 2) {
        podiumLines.push(`> 🥉 **${name}**\n> \` 💫 ${points} VXPlus \``);
      } else {
        restLines.push(`**${i + 1}.**  **${name}**  •  \` ${points} VXPlus \``);
      }
    });

    const descriptionParts: string[] = [];

    if (podiumLines.length > 0) {
      descriptionParts.push("### 🌟  PODIUM DES CHAMPIONS\n" + podiumLines.join("\n\n"));
    }

    if (restLines.length > 0) {
      descriptionParts.push("### 🏅  SUITE DU CLASSEMENT\n" + restLines.join("\n"));
    }

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle("🏆  CLASSEMENT OFFICIEL VISION+  🏆")
      .setDescription(descriptionParts.join("\n\n"))
      .setThumbnail(interaction.guild?.iconURL() ?? LOGO_URL)
      .setFooter({
        text: "✨ Système de Récompense Vision+ • VXPlus",
        iconURL: LOGO_URL,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
