import type { Client, Message } from "discord.js";
import { awardMessageXp } from "../lib/xp-service.js";

export function registerMessageListener(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.content.startsWith("/")) return;

    const member = message.member;
    if (!member) return;

    await awardMessageXp(
      message.author.id,
      message.author.username,
      member.displayName,
      message.content.trim().length
    );
  });
}
