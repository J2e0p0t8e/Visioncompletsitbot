import {
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import type { BotCommand } from "./index.js";
import { isStaff, STAFF_DENIED_MESSAGE } from "../lib/permissions.js";
import { supabase } from "../lib/supabase.js";
import { config } from "../config.js";

export const soumissionCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("soumission")
    .setDescription("Gestion des soumissions au Vision Challenge du mois")
    .addSubcommand(
      new SlashCommandSubcommandBuilder()
        .setName("lien")
        .setDescription("Obtenir mon lien personnel et unique de soumission pour le challenge du mois")
    )
    .addSubcommand((sub) =>
      sub
        .setName("open")
        .setDescription("Ouvrir les soumissions pour le Vision Challenge (Staff uniquement)")
        .addStringOption((op) =>
          op
            .setName("titre")
            .setDescription("Nom personnalisé du challenge (Ex: Hackathon IA & Innovation)")
            .setRequired(false)
        )
        .addStringOption((op) =>
          op
            .setName("description")
            .setDescription("Description succincte, thème ou règles pour ce mois")
            .setRequired(false)
        )
    )
    .addSubcommand(
      new SlashCommandSubcommandBuilder()
        .setName("close")
        .setDescription("Fermer les soumissions pour le Vision Challenge (Staff uniquement)")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "open" || sub === "close") {
      if (!interaction.inGuild() || !interaction.member || !isStaff(interaction.member)) {
        await interaction.reply({
          content: STAFF_DENIED_MESSAGE,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply();

      const isOpen = sub === "open";
      const nowMonth = new Date().toISOString().slice(0, 7); // Ex: "2026-08"
      const numericId = parseInt(nowMonth.replace(/[^0-9]/g, ""), 10);
      const customTitle = interaction.options.getString("titre", false)?.trim() || `Vision Challenge — ${nowMonth}`;
      const customDesc = interaction.options.getString("description", false)?.trim();

      if (isOpen) {
        await supabase.from("challenge_settings").update({ is_open: false }).neq("id", 0);
      }

      const updatePayload: Record<string, unknown> = {
        id: numericId,
        is_open: isOpen,
        current_month: nowMonth,
        updated_at: new Date().toISOString(),
      };

      if (isOpen) {
        updatePayload.title = customTitle;
        if (customDesc) updatePayload.description = customDesc;
      }

      const { error } = await supabase
        .from("challenge_settings")
        .upsert(updatePayload);

      if (error) {
        await interaction.editReply({
          content: `❌ Erreur lors de la modification du statut en base de données : ${error.message}`,
        });
        return;
      }

      if (isOpen) {
        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${customTitle} — Soumissions Ouvertes !`)
          .setDescription(
            (customDesc ? `📝 **Thème & Instructions :**\n*${customDesc}*\n\n` : "") +
            `Les soumissions sont officiellement ouvertes pour l'édition de **\`${nowMonth}\`** !\n\n` +
            `👉 Tapez la commande **\`/soumission lien\`** sur Discord pour obtenir votre **accès personnel** et publier votre projet sur la vitrine Web.\n\n` +
            `⚠️ **Règle :** Une seule soumission est autorisée par créateur ce mois-ci !`
          )
          .setColor(0x00e676)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `🔒 Les soumissions pour le **Vision Challenge** sont désormais fermées.`,
        });
      }
      return;
    }

    if (sub === "lien") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // 1. Vérifier si un challenge est actuellement ouvert ou récupérer la dernière session
      const { data: settingsList, error: settingsErr } = await supabase
        .from("challenge_settings")
        .select("is_open, current_month")
        .order("is_open", { ascending: false })
        .order("current_month", { ascending: false })
        .limit(1);

      const settings = settingsList?.[0];

      if (settingsErr || !settings) {
        await interaction.editReply({
          content: "❌ Impossible de vérifier l'état du Vision Challenge pour le moment (Table `challenge_settings` introuvable ou erreur DB).",
        });
        return;
      }

      if (!settings.is_open) {
        await interaction.editReply({
          content: `❌ Les soumissions pour le **Vision Challenge** (\`${settings.current_month}\`) sont actuellement fermées !\nLes administrateurs avertiront le serveur dès l'ouverture de la prochaine session.`,
        });
        return;
      }

      const currentMonth = settings.current_month;
      const discordId = interaction.user.id;
      const discordName = interaction.user.displayName || interaction.user.username;
      const discordAvatar = interaction.user.displayAvatarURL({ extension: "png", size: 256 });

      // 2. Vérifier si le membre a DÉJÀ soumis un projet ce mois-ci
      const { data: existingProject, error: projectErr } = await supabase
        .from("challenge_projects")
        .select("id, title, status")
        .eq("discord_id", discordId)
        .eq("month_year", currentMonth)
        .maybeSingle();

      if (projectErr) {
        await interaction.editReply({
          content: `❌ Erreur de vérification : ${projectErr.message}`,
        });
        return;
      }

      if (existingProject && existingProject.status !== "rejected") {
        await interaction.editReply({
          content: `❌ Tu as déjà un projet **"${existingProject.title}"** (${existingProject.status === "approved" ? "✅ Validé et en ligne" : "⏳ En attente de validation"}) pour l'édition de \`${currentMonth}\` !\n📌 Rappel : **Une seule soumission active est autorisée** par personne et par mois.`,
        });
        return;
      }

      // 3. Générer un jeton unique et sécurisé (ou récupérer l'existant s'il existe et est encore inutilisé)
      const { data: existingToken } = await supabase
        .from("challenge_tokens")
        .select("token, used_at")
        .eq("discord_id", discordId)
        .eq("month_year", currentMonth)
        .is("used_at", null)
        .maybeSingle();

      let token = existingToken?.token;
      if (!token) {
        token = randomUUID();
        const { error: tokenErr } = await supabase
          .from("challenge_tokens")
          .upsert({
            token,
            discord_id: discordId,
            discord_name: discordName,
            discord_avatar: discordAvatar,
            month_year: currentMonth,
            created_at: new Date().toISOString(),
            used_at: null,
          });

        if (tokenErr) {
          await interaction.editReply({
            content: `❌ Erreur lors de la génération de ton lien de soumission : ${tokenErr.message}`,
          });
          return;
        }
      }

      const submitUrl = `${config.siteUrl.replace(/\/$/, "")}/challenges/submit?token=${encodeURIComponent(token)}`;

      const embed = new EmbedBuilder()
        .setTitle(`🚀 Ton lien de soumission — ${currentMonth}`)
        .setDescription(
          `Voici ton accès personnel et unique pour soumettre ton projet technologique au **Showroom Vision Challenge** de ce mois :\n\n` +
          `👉 **[Clique ici pour ouvrir le formulaire de soumission](${submitUrl})**\n\n` +
          `🔒 *Ce lien est rattaché exclusivement à ton compte Discord (\`${discordName}\`) et à ce mois. Ne le partage pas avec d'autres personnes.*\n` +
          `🎁 **Bonus :** Tu recevras automatiquement **+50 VXPlus** dès la publication réussie de ton projet !`
        )
        .setColor(0x3f51b5)
        .setFooter({ text: "Vision+ Showroom Challenge — 1 soumission maximum par mois" });

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
