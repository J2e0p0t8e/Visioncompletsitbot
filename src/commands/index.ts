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
import { soumissionCommand } from "./soumission.js";
import { temoignageCommand } from "./temoignage.js";

// Music commands
import { command as playCommand } from "./music/play.js";
import { command as iaCommand } from "./music/ia.js";
import { pin as pinCommand, unpin as unpinCommand } from "./music/pin.js";
import { command as statusCommand } from "./music/status.js";
import { command as volumeCommand } from "./music/volume.js";
import { skip, stop, pause, resume } from "./music/controls.js";
import { queue, loop, nowplaying, clearqueue } from "./music/queue.js";

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
  soumissionCommand,
  temoignageCommand,
  // Music
  playCommand as any,
  iaCommand as any,
  pinCommand as any,
  unpinCommand as any,
  statusCommand as any,
  volumeCommand as any,
  skip as any,
  stop as any,
  pause as any,
  resume as any,
  queue as any,
  loop as any,
  nowplaying as any,
  clearqueue as any,
];
