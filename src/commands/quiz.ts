import {
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import type { BotCommand } from "./index.js";
import { config } from "../config.js";
import {
  activateSessionCodes,
  deactivateSessionCodes,
  getOrCreatePersonalCode,
} from "../lib/quiz-codes.js";
import { isStaff, STAFF_DENIED_MESSAGE } from "../lib/permissions.js";

export const quizCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Quiz Vision+ — codes de liaison et activation")
    .addSubcommand(
      new SlashCommandSubcommandBuilder()
        .setName("activer")
        .setDescription("Active les codes personnels pour une session (staff)")
        .addStringOption((opt) =>
          opt
            .setName("code")
            .setDescription("Code de session du quiz (ex. AB12CD)")
            .setRequired(true)
        )
    )
    .addSubcommand(
      new SlashCommandSubcommandBuilder()
        .setName("desactiver")
        .setDescription("Désactive les codes personnels (staff)")
        .addStringOption((opt) =>
          opt
            .setName("code")
            .setDescription("Code de session du quiz")
            .setRequired(true)
        )
    )
    .addSubcommand(
      new SlashCommandSubcommandBuilder()
        .setName("mon-code")
        .setDescription("Génère ton code personnel pour rejoindre le quiz (privé)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "activer" || sub === "desactiver") {
      if (!interaction.inGuild() || !interaction.member) {
        await interaction.reply({
          content: STAFF_DENIED_MESSAGE,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!isStaff(interaction.member)) {
        await interaction.reply({
          content: STAFF_DENIED_MESSAGE,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const code = interaction.options.getString("code", true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (sub === "activer") {
        const result = await activateSessionCodes(code, interaction.user.id);
        if (!result.ok) {
          await interaction.editReply({ content: `❌ ${result.error}` });
          return;
        }

        await interaction.editReply({
          content: [
            `✅ **Codes personnels activés** pour la session **${result.session.access_code}**`,
            ``,
            `Les joueurs peuvent utiliser \`/quiz mon-code\` pour obtenir leur code privé.`,
            `Lien quiz : ${config.siteUrl}/quiz/play/${result.session.access_code}`,
          ].join("\n"),
        });
        return;
      }

      const result = await deactivateSessionCodes(code);
      if (!result.ok) {
        await interaction.editReply({ content: `❌ ${result.error}` });
        return;
      }

      await interaction.editReply({
        content: `✅ Codes personnels désactivés pour la session **${code.toUpperCase()}**.`,
      });
      return;
    }

    // mon-code
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const displayName =
      interaction.member && "displayName" in interaction.member
        ? interaction.member.displayName
        : interaction.user.username;

    const result = await getOrCreatePersonalCode(
      interaction.user.id,
      interaction.user.username,
      displayName
    );

    if (!result.ok) {
      await interaction.editReply({ content: `❌ ${result.error}` });
      return;
    }

    const { personalCode, session, isNew } = result;
    const playUrl = `${config.siteUrl}/quiz/play/${session.access_code}?pc=${personalCode}`;

    await interaction.editReply({
      content: [
        isNew ? "🎮 **Ton code personnel a été généré !**" : "🎮 **Ton code personnel**",
        ``,
        `Code session : \`${session.access_code}\``,
        `Ton code privé : \`${personalCode}\``,
        ``,
        `⚠️ **Ne partage ce code avec personne.** Il te lie à ton compte Discord.`,
        ``,
        `Joue ici : ${playUrl}`,
        ``,
        `Sur le site, entre ton pseudo puis ton code personnel quand demandé.`,
      ].join("\n"),
    });
  },
};
