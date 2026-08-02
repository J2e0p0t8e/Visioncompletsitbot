import { Client, Message, EmbedBuilder } from "discord.js";

// ID Discord des deux administrateurs en charge : Jaye et Ecksoner
export const ADMIN_IDS = [
  "1467547346064773191", // jayeahf_79219 (Jaye:-:★)
  "946109748246356050",  // ecksoner (Mr Eckson with the vibes)
];

interface RelayedMessage {
  userId: string;
  userName: string;
  adminMessages: { [adminId: string]: { channelId: string; messageId: string } };
  handledBy?: string;
}

// Carte en mémoire : ID du message reçu par un admin -> Données de la requête
const relayMap = new Map<string, RelayedMessage>();

// Carte : ID de l'admin -> Dernière requête active pour envoi continu de messages sans répliquer le bouton Répondre
const activeConversationMap = new Map<string, RelayedMessage>();

/**
 * Gère les messages privés (MP/DM) envoyés directement au bot.
 */
export async function handleDirectMessage(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;

  const isSenderAdmin = ADMIN_IDS.includes(message.author.id);

  if (isSenderAdmin) {
    await handleAdminReply(client, message);
  } else {
    await handleUserMessage(client, message);
  }
}

/**
 * Lorsqu'un utilisateur normal écrit en MP au bot -> Transmission à Jaye et Ecksoner.
 */
async function handleUserMessage(client: Client, message: Message): Promise<void> {
  const sender = message.author;

  // Créer l'embed de transmission pour les admins
  const relayEmbed = new EmbedBuilder()
    .setColor(0x00a8ff) // Bleu cyan
    .setAuthor({
      name: `📩 Nouveau MP de ${sender.displayName} (@${sender.username})`,
      iconURL: sender.displayAvatarURL(),
    })
    .setDescription(message.content || "*[Aucun texte / Pièce jointe uniquement]*")
    .setFooter({
      text: `User ID: ${sender.id} • Pour lui répondre : faites "Répondre" (Reply) sur ce message`,
    })
    .setTimestamp();

  const attachmentUrls = Array.from(message.attachments.values()).map((a) => a.url);

  const relayedData: RelayedMessage = {
    userId: sender.id,
    userName: sender.displayName || sender.username,
    adminMessages: {},
  };

  // Envoyer aux administrateurs
  for (const adminId of ADMIN_IDS) {
    try {
      const adminUser = await client.users.fetch(adminId);
      const sentMsg = await adminUser.send({
        embeds: [relayEmbed],
        files: attachmentUrls.length > 0 ? attachmentUrls : undefined,
      });

      relayedData.adminMessages[adminId] = {
        channelId: sentMsg.channel.id,
        messageId: sentMsg.id,
      };

      // Indexer par l'ID du message généré dans le salon MP de l'admin
      relayMap.set(sentMsg.id, relayedData);
    } catch (err) {
      console.error(`[DM Relay] Erreur d'envoi du MP relayé à l'admin ${adminId}:`, err);
    }
  }

  // Accusé de réception pour l'utilisateur
  await message.reply({
    content:
      "✅ Votre message a été automatiquement relayé aux administrateurs Vision+ (**@Jaye:-:★** et **@Mr Eckson with the vibes**). Vous recevrez leur réponse directement ici dans quelques instants !",
  });
}

/**
 * Lorsqu'un des administrateurs (Jaye ou Ecksoner) répond en MP au bot -> Transmission au membre et alerte de l'autre admin.
 */
async function handleAdminReply(client: Client, message: Message): Promise<void> {
  let relayedData: RelayedMessage | undefined = undefined;

  // 1. Vérifier si l'admin a utilisé la fonction "Répondre" de Discord sur un message relayé
  if (message.reference?.messageId) {
    relayedData = relayMap.get(message.reference.messageId);

    // Si pas en mémoire (ex: reboot bot), tenter de lire le footer de l'embed
    if (!relayedData) {
      try {
        const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
        const footerText = repliedMsg.embeds[0]?.footer?.text;
        if (footerText) {
          const match = footerText.match(/User ID:\s*(\d+)/);
          if (match && match[1]) {
            relayedData = {
              userId: match[1],
              userName: `Membre (${match[1]})`,
              adminMessages: {},
            };
          }
        }
      } catch (e) {
        console.warn("[DM Relay] Impossible de récupérer le message de référence après reboot:", e);
      }
    }
  }

  // 2. Sinon, vérifier la conversation active de cet admin
  if (!relayedData) {
    relayedData = activeConversationMap.get(message.author.id);
  }

  // Si impossible de déterminer le destinataire
  if (!relayedData) {
    await message.reply({
      content:
        "⚠️ **Impossible d'identifier à quel membre envoyer ce message.** Veuillez utiliser l'option **« Répondre » (Reply)** de Discord directement sur l'un des messages relayés du membre !",
    });
    return;
  }

  // Enregistrer comme conversation active pour cet admin
  activeConversationMap.set(message.author.id, relayedData);

  // 3. Envoyer la réponse de l'admin à l'utilisateur ciblé
  try {
    const targetUser = await client.users.fetch(relayedData.userId);
    const attachmentUrls = Array.from(message.attachments.values()).map((a) => a.url);

    const replyEmbed = new EmbedBuilder()
      .setColor(0x7c3aed) // Violet Vision+
      .setAuthor({
        name: `💬 Réponse de l'équipe Vision+ (${message.author.displayName})`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setDescription(message.content || "*[Pièce jointe de l'administration]*")
      .setTimestamp();

    await targetUser.send({
      embeds: [replyEmbed],
      files: attachmentUrls.length > 0 ? attachmentUrls : undefined,
    });

    // Confirmation visuelle rapide pour l'admin qui écrit
    await message.react("✅").catch(() => {});
  } catch (err) {
    await message.reply({
      content: `❌ **Impossible d'envoyer le message à @${relayedData.userName}.** L'utilisateur a peut-être fermé ses messages privés avec le bot ou quitté le serveur.`,
    });
    return;
  }

  // 4. Avertir l'AUTRE administrateur qu'une réponse a été apportée et qu'il ne faut plus répondre !
  if (!relayedData.handledBy || relayedData.handledBy !== message.author.id) {
    relayedData.handledBy = message.author.id;

    // Trier les autres administrateurs à prévenir
    const otherAdminIds = ADMIN_IDS.filter((id) => id !== message.author.id);

    for (const otherId of otherAdminIds) {
      try {
        const otherAdmin = await client.users.fetch(otherId);

        // Envoyer un MP d'alerte à l'autre administrateur
        const alertEmbed = new EmbedBuilder()
          .setColor(0xffa500) // Orange / Alerte
          .setTitle(`🛑 Pris en charge par @${message.author.displayName}`)
          .setDescription(
            `**@${message.author.displayName}** vient d'apporter la réponse suivante à **@${relayedData.userName}** :\n\n> "${message.content}"\n\n👉 **Vous n'avez plus besoin d'y répondre !**`
          )
          .setTimestamp();

        await otherAdmin.send({ embeds: [alertEmbed] });

        // Mise à jour visuelle du message original chez l'autre admin si on a ses références
        const otherMsgRef = relayedData.adminMessages[otherId];
        if (otherMsgRef) {
          try {
            const otherChannel = await client.channels.fetch(otherMsgRef.channelId);
            if (otherChannel && "messages" in otherChannel) {
              const originalMsg = await otherChannel.messages.fetch(otherMsgRef.messageId);
              const origEmbed = originalMsg.embeds[0];
              if (origEmbed) {
                const updatedEmbed = EmbedBuilder.from(origEmbed)
                  .setColor(0x808080) // Gris - Terminé
                  .setTitle(`[✅ TRAITÉ PAR ${message.author.displayName.toUpperCase()}]`);
                await originalMsg.edit({ embeds: [updatedEmbed] });
              }
            }
          } catch (editErr) {
            // Pas grave si la modification du message échoue
          }
        }
      } catch (notifyErr) {
        console.error(`[DM Relay] Impossible de prévenir l'autre admin (${otherId}):`, notifyErr);
      }
    }
  }
}
