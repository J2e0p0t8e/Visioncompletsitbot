import {
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import type { BotCommand } from "./index.js";
import { isStaff, STAFF_DENIED_MESSAGE } from "../lib/permissions.js";
import { resetAllMemberStats, resetMemberStats } from "../lib/xp-service.js";

function requireStaff(interaction: Parameters<BotCommand["execute"]>[0]) {
  if (!interaction.inGuild() || !interaction.member) return false;
  return isStaff(interaction.member);
}

export const adminCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Commandes staff Vision+ (administration)")
    .addSubcommand(
      new SlashCommandSubcommandBuilder()
        .setName("reinitialiser-stats")
        .setDescription("Remet à zéro l'XP et les stats Discord")
        .addStringOption((opt) =>
          opt
            .setName("portee")
            .setDescription("Cibler un membre ou tout le serveur")
            .setRequired(true)
            .addChoices(
              { name: "Un membre", value: "membre" },
              { name: "Tout le serveur", value: "tous" }
            )
        )
        .addUserOption((opt) =>
          opt
            .setName("membre")
            .setDescription("Membre à réinitialiser (si portée = un membre)")
        )
        .addBooleanOption((opt) =>
          opt
            .setName("confirmer")
            .setDescription(
              "Obligatoire à true pour réinitialiser tout le serveur"
            )
        )
    ),

  async execute(interaction) {
    if (!requireStaff(interaction)) {
      await interaction.reply({
        content: STAFF_DENIED_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "reinitialiser-stats") {
      const scope = interaction.options.getString("portee", true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (scope === "membre") {
        const target = interaction.options.getUser("membre");
        if (!target) {
          await interaction.editReply({
            content:
              "❌ Indique le membre à réinitialiser (`membre`) pour la portée « Un membre ».",
          });
          return;
        }

        const result = await resetMemberStats(target.id);
        if (!result.ok) {
          await interaction.editReply({ content: `❌ ${result.error}` });
          return;
        }

        await interaction.editReply({
          content: [
            `✅ Stats réinitialisées pour **${target.displayName}**`,
            ``,
            `• XP, niveau, messages et vocal remis à zéro`,
            `• Historique XP et cooldowns supprimés`,
          ].join("\n"),
        });
        return;
      }

      const confirmed = interaction.options.getBoolean("confirmer");
      if (confirmed !== true) {
        await interaction.editReply({
          content:
            "❌ Pour réinitialiser **tout le serveur**, relance avec `confirmer: Oui`.",
        });
        return;
      }

      const result = await resetAllMemberStats();
      if (!result.ok) {
        await interaction.editReply({ content: `❌ ${result.error}` });
        return;
      }

      if (result.scope !== "all") {
        await interaction.editReply({ content: "❌ Erreur inattendue." });
        return;
      }

      await interaction.editReply({
        content: [
          `✅ **Stats réinitialisées pour tout le serveur**`,
          ``,
          `• ${result.membersAffected} profil(s) remis à zéro`,
          `• Historique XP et cooldowns effacés`,
        ].join("\n"),
      });
    }
  },
};
