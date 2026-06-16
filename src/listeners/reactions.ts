import type { Client, MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import { awardReactionXp } from "../lib/xp-service.js";

async function handleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }

  const message = reaction.message;
  if (!message.guild) return;
  if (message.author?.id === user.id) return;

  const member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const username = user.username ?? member.user.username;
  await awardReactionXp(user.id, username, member.displayName);
}

export function registerReactionListener(client: Client): void {
  client.on("messageReactionAdd", handleReaction);
}
