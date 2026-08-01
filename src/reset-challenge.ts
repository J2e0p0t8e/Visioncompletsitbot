import { supabase } from "./lib/supabase.js";

async function resetChallenge() {
  console.log("⏳ Suppression de tous les projets soumis et des jetons de soumission...");

  // Suppression de tous les projets du Challenge
  const { error: errProjects } = await supabase
    .from("challenge_projects")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Condition toujours vraie pour vider la table

  if (errProjects) {
    console.error("❌ Erreur lors de la suppression des projets :", errProjects.message);
  } else {
    console.log("✅ Toutes les soumissions ont été supprimées avec succès.");
  }

  // Suppression des jetons uniques d'accès
  const { error: errTokens } = await supabase
    .from("challenge_tokens")
    .delete()
    .neq("token", "00000000-0000-0000-0000-000000000000");

  if (errTokens) {
    console.error("❌ Erreur lors de la suppression des tokens :", errTokens.message);
  } else {
    console.log("✅ Tous les jetons de soumission et quotas ont été réinitialisés.");
  }

  process.exit(0);
}

resetChallenge();
