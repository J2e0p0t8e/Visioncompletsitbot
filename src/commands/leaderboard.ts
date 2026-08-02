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
        .setTitle("🏆 Classement VXPlus Vision+")
        .setDescription("Aucun VXPlus enregistré pour le moment. Sois le premier actif !")
        .setTimestamp();

      await interaction.editReply({ embeds: [emptyEmbed] });
      return;
    }

    const lines: string[] = [];

    rows.forEach((row, i) => {
      const name = (row.display_name || row.username).replace(/[`\\]/g, "");
      const points = formatXpAmount(row.total_xp);

      // Style spécial pour les points (Vert éclatant en ANSI + icônes et crochets)
      const styledPoints = `\u001b[1;32m⚡ 【 ${points} VXPlus 】 ⚡\u001b[0m`;

      let line = "";
      if (i === 0) {
        // 🥇 1er : Nom en Jaune / Doré Brillant (33m)
        line = `🥇 \u001b[1;33m👑 ★ 〘 ${name} 〙 ★\u001b[0m ───► ${styledPoints}`;
      } else if (i === 1) {
        // 🥈 2eme : Nom en Blanc / Argenté Brillant (37m)
        line = `🥈 \u001b[1;37m✨ ◈ 〘 ${name} 〙 ◈\u001b[0m ───► ${styledPoints}`;
      } else if (i === 2) {
        // 🥉 3eme : Nom en Rouge / Bronze Brillant (31m)
        line = `🥉 \u001b[1;31m💫 ◈ 〘 ${name} 〙 ◈\u001b[0m ───► ${styledPoints}`;
      } else {
        // 4eme - 20eme : Numérotation alignée + Nom en Cyan Brillant (36m)
        const rankNum = String(i + 1).padStart(2, "0");
        line = ` #${rankNum} \u001b[1;36m✦ 〘 ${name} 〙\u001b[0m ───► ${styledPoints}`;
      }

      lines.push(line);

      // Séparateur de podium après le 3ᵉ membre
      if (i === 2 && rows.length > 3) {
        lines.push("────────────────────────────────────────────────");
      }
    });

    const description = "```ansi\n" + lines.join("\n") + "\n```";

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed) // Violet vibrant / Thème Vision+
      .setTitle("🏆  CLASSEMENT OFFICIEL VISION+  🏆")
      .setDescription(description)
      .setThumbnail(interaction.guild?.iconURL() ?? LOGO_URL)
      .setFooter({
        text: "✨ Système de Récompense Vision+ • VXPlus",
        iconURL: LOGO_URL,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
