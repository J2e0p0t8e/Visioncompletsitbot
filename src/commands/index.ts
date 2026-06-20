import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import { adminCommand } from "./admin.js";
import { leaderboardCommand } from "./leaderboard.js";
import { pingCommand } from "./ping.js";
import { quizCommand } from "./quiz.js";
import { rankCommand } from "./rank.js";
import { siteCommand } from "./site.js";

export type BotCommand = {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export const commands: BotCommand[] = [
  pingCommand,
  siteCommand,
  rankCommand,
  leaderboardCommand,
  quizCommand,
  adminCommand,
];
