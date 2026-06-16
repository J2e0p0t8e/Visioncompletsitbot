import { SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import type { BotCommand } from "./index.js";

export const siteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("site")
    .setDescription("Liens officiels Vision+ (site, blog, quiz)"),
  async execute(interaction) {
    const { siteUrl } = config;
    await interaction.reply({
      content: [
        "**Vision+ — liens officiels**",
        `Site : ${siteUrl}`,
        `Blog : ${siteUrl}/blog`,
        `Quiz : ${siteUrl}/quiz`,
        `Communauté sur le site : ${siteUrl}/#talents`,
      ].join("\n"),
    });
  },
};
