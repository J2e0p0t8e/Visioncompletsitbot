import { Client, EmbedBuilder, TextChannel, NewsChannel } from "discord.js";
import { config } from "../config.js";
import { getLeaderboard } from "./xp-service.js";
import { formatXpAmount } from "./levels.js";

const LOGO_URL =
  "https://cdn.discordapp.com/attachments/1482108302501609512/1533485361022505081/Vision_logo_upscaled_no_background.png?ex=6a70a908&is=6a6f5788&hm=e817c72655e11fa376af67e65d619a8077b821d596f0d838d08689199b98694e";

export async function postDailyLeaderboard(client: Client): Promise<boolean> {
  try {
    const guild =
      client.guilds.cache.get(config.guildId) || client.guilds.cache.first();
    if (!guild) {
      console.error("[Daily Chart] Impossible de trouver le serveur Discord.");
      return false;
    }

    // Recherche flexible du salon par nom (ex: "🔝・vision-chart" ou "vision-chart")
    const channel = guild.channels.cache.find(
      (ch) =>
        ch.name.toLowerCase().includes("vision-chart") ||
        ch.name.toLowerCase().includes("classement-xp")
    );

    if (!channel || (!channel.isTextBased() && !channel.isThread())) {
      console.warn(
        `[Daily Chart] Salon "vision-chart" introuvable dans le serveur ${guild.name}.`
      );
      return false;
    }

    const textCh = channel as TextChannel | NewsChannel;
    const botId = client.user?.id;

    // 1. Supprimer l'ancien message de classement du bot dans le salon
    if (botId) {
      const messages = await textCh.messages.fetch({ limit: 50 }).catch(() => null);
      if (messages && messages.size > 0) {
        const botMessages = messages.filter((msg) => msg.author.id === botId);
        for (const [_, msg] of botMessages) {
          await msg.delete().catch((e) =>
            console.error("[Daily Chart] Erreur suppression ancien message:", e.message)
          );
        }
      }
    }

    // 2. Récupérer le Top 20 (déjà filtré sans les admins exclus)
    const rows = await getLeaderboard(20);

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle("🏆  CLASSEMENT OFFICIEL VISION+  🏆")
      .setThumbnail(guild.iconURL() ?? LOGO_URL)
      .setFooter({
        text: "✨ Classement Quotedien Automatique • VXPlus",
        iconURL: LOGO_URL,
      })
      .setTimestamp();

    if (rows.length === 0) {
      embed.setDescription(
        "Aucun VXPlus enregistré pour le moment. Sois le premier actif !"
      );
    } else {
      const podiumLines: string[] = [];
      const restLines: string[] = [];

      rows.forEach((row, i) => {
        const name = (row.display_name || row.username).replace(/[`*_\\]/g, "");
        const points = formatXpAmount(row.total_xp);

        if (i === 0) {
          podiumLines.push(`> 🥇 **${name}** • \` 👑 ${points} VXPlus \``);
        } else if (i === 1) {
          podiumLines.push(`> 🥈 **${name}** • \` 💎 ${points} VXPlus \``);
        } else if (i === 2) {
          podiumLines.push(`> 🥉 **${name}** • \` 💫 ${points} VXPlus \``);
        } else {
          restLines.push(`**${i + 1}.** **${name}** • \` ${points} VXPlus \``);
        }
      });

      const descriptionParts: string[] = [
        "Voici le classement officiel mis à jour aujourd'hui ! Continuez à participer en vocal, par message et réagissez aux contributions pour monter au sommet. 🚀",
      ];
      if (podiumLines.length > 0) descriptionParts.push(podiumLines.join("\n"));
      if (restLines.length > 0) descriptionParts.push(restLines.join("\n"));

      embed.setDescription(descriptionParts.join("\n\n"));
    }

    await textCh.send({ embeds: [embed] });
    console.log(`[Daily Chart] Classement quotidien envoyé avec succès dans #${textCh.name} !`);
    return true;
  } catch (error) {
    console.error("[Daily Chart] Erreur lors de la mise à jour quotidienne:", error);
    return false;
  }
}

export function setupDailyLeaderboard(client: Client) {
  let lastPostedDate = "";

  const runCheck = async () => {
    const today = new Date().toDateString();

    // Au premier démarrage du bot, vérifions si un message a déjà été posté aujourd'hui dans le salon
    if (!lastPostedDate) {
      const guild =
        client.guilds.cache.get(config.guildId) || client.guilds.cache.first();
      const channel = guild?.channels.cache.find(
        (ch) =>
          ch.name.toLowerCase().includes("vision-chart") ||
          ch.name.toLowerCase().includes("classement-xp")
      );

      if (channel && channel.isTextBased()) {
        const textCh = channel as TextChannel | NewsChannel;
        const messages = await textCh.messages.fetch({ limit: 10 }).catch(() => null);
        const botMsg = messages?.find((msg) => msg.author.id === client.user?.id);

        if (botMsg) {
          const msgDate = new Date(botMsg.createdTimestamp).toDateString();
          if (msgDate === today) {
            console.log(`[Daily Chart] Le classement d'aujourd'hui (${today}) est déjà en ligne dans #${textCh.name}.`);
            lastPostedDate = today;
            return;
          }
        }
      }
    }

    // Si la date a changé (nouveau jour / minuit passé) ou qu'aucun message n'existait pour aujourd'hui
    if (today !== lastPostedDate) {
      console.log(`[Daily Chart] Déclenchement de la mise à jour quotidienne pour le jour : ${today}`);
      const ok = await postDailyLeaderboard(client);
      if (ok) {
        lastPostedDate = today;
      }
    }
  };

  // Vérification initiale au démarrage après 5 secondes le temps du chargement complet du cache
  setTimeout(() => {
    runCheck().catch((err) => console.error("[Daily Chart] Erreur check initial:", err));
  }, 5000);

  // Vérification périodique toutes les 60 secondes pour détecter le changement de jour (minuit)
  setInterval(() => {
    runCheck().catch((err) => console.error("[Daily Chart] Erreur check périodique:", err));
  }, 60000);
}
