import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "./index.js";

export const pingCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Vérifie que le bot Vision+ répond"),
  async execute(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      content: `Pong ! Latence : **${latency} ms**`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
