import {
  MessageFlags,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ModalActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type User,
  type GuildMember,
} from "discord.js";
import type { BotCommand } from "./index.js";
import { supabase } from "../lib/supabase.js";

function buildTestimonialModal(existingContent?: string, existingRole?: string) {
  const isEditing = Boolean(existingContent && existingContent.trim().length > 0);
  const modal = new ModalBuilder()
    .setCustomId("modal_testimonial")
    .setTitle(isEditing ? "Modifier mon témoignage" : "Nouveau témoignage Vision+");

  const contentInput = new TextInputBuilder()
    .setCustomId("content_input")
    .setLabel("Ton témoignage (expérience sur Discord/site)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      "Ex: Travailler ensemble sur les challenges en cybersécurité et les quiz live m'a beaucoup apporté..."
    )
    .setRequired(true)
    .setMaxLength(450);

  if (existingContent) {
    contentInput.setValue(existingContent);
  }

  const roleInput = new TextInputBuilder()
    .setCustomId("role_input")
    .setLabel("Ton rôle ou domaine (Optionnel)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ex: Membre Actif - Cybersécurité")
    .setRequired(false)
    .setMaxLength(60);

  if (existingRole && existingRole !== "Membre de la Communauté") {
    roleInput.setValue(existingRole);
  }

  const row1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    contentInput
  );
  const row2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
    roleInput
  );

  modal.addComponents(row1, row2);
  return modal;
}

async function handleSaveTestimonial(submitted: ModalSubmitInteraction, user: User) {
  const contentVal = submitted.fields.getTextInputValue("content_input").trim();
  const roleInput = submitted.fields.getTextInputValue("role_input")?.trim();
  const roleVal = roleInput ? roleInput : "Membre de la Communauté";

  const member = submitted.member as GuildMember | null;
  const displayName = member?.displayName || user.displayName || user.username;
  const avatarUrl = user.displayAvatarURL({ size: 256 });

  const { error } = await supabase.from("testimonials").upsert({
    user_id: user.id,
    username: user.username,
    display_name: displayName,
    avatar_url: avatarUrl,
    role: roleVal,
    content: contentVal,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[Témoignage] Erreur Supabase:", error);
    await submitted.reply({
      content:
        "Une erreur technique est survenue lors de l'enregistrement de ton témoignage dans la base de données. Vérifie les privilèges SQL (RLS/GRANT) sur Supabase.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await submitted.reply({
    content:
      "Ton témoignage a été enregistré avec succès ! Il s'affiche en temps réel sur le carrousel du site web officiel Vision+.",
    flags: MessageFlags.Ephemeral,
  });
}

export const temoignageCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("temoignage")
    .setDescription("Soumettre ou modifier ton témoignage officiel pour le site web Vision+"),

  async execute(interaction) {
    const userId = interaction.user.id;

    // Vérification rapide d'un témoignage existant (prend ~50ms sans bloquer l'interaction)
    const { data: existing } = await supabase
      .from("testimonials")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Construction du formulaire (modale) directement pré-rempli s'il existe déjà !
    const modal = buildTestimonialModal(existing?.content, existing?.role);
    await interaction.showModal(modal);

    try {
      // Attente de la soumission de la modale pendant 5 minutes maximum
      const submitted = await interaction.awaitModalSubmit({
        filter: (m) => m.customId === "modal_testimonial" && m.user.id === userId,
        time: 300000,
      });

      await handleSaveTestimonial(submitted, interaction.user);
    } catch {
      // Expiration du délai d'attente lors de la saisie (l'utilisateur a refermé ou annulé la modale)
    }
  },
};
