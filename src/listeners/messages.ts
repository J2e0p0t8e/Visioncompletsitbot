import type { Client, Message } from "discord.js";
import { awardMessageXp } from "../lib/xp-service.js";
import { handleDirectMessage } from "../lib/dm-relay.js";

export function registerMessageListener(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    // Si le message est envoyé en privé (hors d'un serveur), déclencher le relais DM (Modmail)
    if (!message.guild) {
      await handleDirectMessage(client, message);
      return;
    }

    // Dans les salons du serveur Discord (hors commandes) -> Attribuer des VXPlus de participation
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
