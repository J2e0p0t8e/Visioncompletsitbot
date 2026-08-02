import {
  MessageFlags,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ModalActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type User,
  type GuildMember,
} from "discord.js";
import type { BotCommand } from "./index.js";
import { supabase } from "../lib/supabase.js";

function buildTestimonialModal(existingContent?: string, existingRole?: string) {
  const modal = new ModalBuilder()
    .setCustomId("modal_testimonial")
    .setTitle("Témoignage Vision+");

  const contentInput = new TextInputBuilder()
    .setCustomId("content_input")
    .setLabel("Ton témoignage (expérience sur Discord/site)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Ex: Travailler ensemble sur les challenges en cybersécurité et les quiz live m'a beaucoup apporté...")
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
        "Une erreur technique est survenue lors de l'enregistrement de ton témoignage dans la base de données. Vérifie auprès des administrateurs que la table testimonials existe.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await submitted.reply({
    content:
      "Ton témoignage a été enregistré avec succès ! Il s'affichera directement sur le carrousel du site web officiel Vision+.",
    flags: MessageFlags.Ephemeral,
  });
}

export const temoignageCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("temoignage")
    .setDescription("Soumettre ou modifier ton témoignage officiel pour le site web Vision+"),

  async execute(interaction) {
    const userId = interaction.user.id;

    // Vérification rapide d'un témoignage existant dans Supabase
    const { data: existing } = await supabase
      .from("testimonials")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing && existing.content) {
      // Le membre possède déjà un témoignage
      const response = await interaction.reply({
        content: `Tu as déjà un témoignage publié sur le site Vision+ :\n> "${existing.content}"\n\nSouhaites-tu modifier ce témoignage ?`,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("edit_testimonial_btn")
              .setLabel("Modifier mon témoignage")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId("cancel_testimonial_btn")
              .setLabel("Annuler")
              .setStyle(ButtonStyle.Secondary)
          ),
        ],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
      });

      try {
        const btnInteraction = await response.awaitMessageComponent({
          filter: (i) => i.user.id === userId,
          time: 60000,
        });

        if (btnInteraction.customId === "cancel_testimonial_btn") {
          await btnInteraction.update({
            content: "Action annulée. Ton témoignage reste inchangé.",
            components: [],
          });
          return;
        }

        if (btnInteraction.customId === "edit_testimonial_btn") {
          const modal = buildTestimonialModal(existing.content, existing.role);
          await btnInteraction.showModal(modal);

          try {
            const submitted = await btnInteraction.awaitModalSubmit({
              filter: (m) => m.customId === "modal_testimonial" && m.user.id === userId,
              time: 300000,
            });

            await handleSaveTestimonial(submitted, interaction.user);
          } catch {
            // Timeout de 5 min lors de la saisie
          }
        }
      } catch {
        // Timeout de 60s sur le bouton modifier
      }
      return;
    }

    // Aucun témoignage existant : on lance directement le formulaire en modal
    const modal = buildTestimonialModal();
    await interaction.showModal(modal);

    try {
      const submitted = await interaction.awaitModalSubmit({
        filter: (m) => m.customId === "modal_testimonial" && m.user.id === userId,
        time: 300000,
      });

      await handleSaveTestimonial(submitted, interaction.user);
    } catch {
      // Timeout lors de la saisie
    }
  },
};
