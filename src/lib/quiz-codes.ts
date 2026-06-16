import { supabase, type GameSessionRow } from "./supabase.js";

function generatePersonalCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function findSessionByAccessCode(
  accessCode: string
): Promise<GameSessionRow | null> {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("id, access_code, is_active, is_started, codes_enabled")
    .eq("access_code", accessCode.toUpperCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[Quiz] Erreur recherche session:", error.message);
    return null;
  }

  return data;
}

/** Active la génération de codes personnels pour une session */
export async function activateSessionCodes(
  accessCode: string,
  activatedByDiscordId: string
): Promise<{ ok: true; session: GameSessionRow } | { ok: false; error: string }> {
  const session = await findSessionByAccessCode(accessCode);
  if (!session) {
    return { ok: false, error: "Aucune session active avec ce code." };
  }

  const { error } = await supabase
    .from("game_sessions")
    .update({ codes_enabled: true })
    .eq("id", session.id);

  if (error) {
    console.error("[Quiz] Erreur activation codes:", error.message);
    return { ok: false, error: "Impossible d'activer les codes pour cette session." };
  }

  console.log(
    `[Quiz] Codes activés pour session ${session.access_code} par ${activatedByDiscordId}`
  );

  return {
    ok: true,
    session: { ...session, codes_enabled: true },
  };
}

/** Session active avec codes activés (la plus récente) */
export async function getActiveCodeSession(): Promise<GameSessionRow | null> {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("id, access_code, is_active, is_started, codes_enabled")
    .eq("is_active", true)
    .eq("codes_enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Quiz] Erreur session active:", error.message);
    return null;
  }

  return data;
}

/** Génère ou retourne le code personnel d'un membre pour la session active */
export async function getOrCreatePersonalCode(
  discordId: string,
  username: string,
  displayName: string
): Promise<
  | { ok: true; personalCode: string; session: GameSessionRow; isNew: boolean }
  | { ok: false; error: string }
> {
  const session = await getActiveCodeSession();
  if (!session) {
    return {
      ok: false,
      error:
        "Aucune partie n'accepte de codes pour le moment. Attends que le staff lance `/quiz activer`.",
    };
  }

  const { data: existing } = await supabase
    .from("player_codes")
    .select("personal_code, used_at")
    .eq("session_id", session.id)
    .eq("discord_id", discordId)
    .maybeSingle();

  if (existing) {
    if (existing.used_at) {
      return {
        ok: false,
        error: "Tu as déjà utilisé ton code pour cette partie.",
      };
    }
    return {
      ok: true,
      personalCode: existing.personal_code,
      session,
      isNew: false,
    };
  }

  // S'assurer que le membre existe dans discord_members
  await supabase.from("discord_members").upsert(
    {
      discord_id: discordId,
      username,
      display_name: displayName,
    },
    { onConflict: "discord_id" }
  );

  for (let attempt = 0; attempt < 5; attempt++) {
    const personalCode = generatePersonalCode();
    const { error } = await supabase.from("player_codes").insert({
      session_id: session.id,
      discord_id: discordId,
      personal_code: personalCode,
    });

    if (!error) {
      return { ok: true, personalCode, session, isNew: true };
    }

    if (error.code !== "23505") {
      console.error("[Quiz] Erreur création code:", error.message);
      return { ok: false, error: "Impossible de générer ton code. Réessaie." };
    }
  }

  return { ok: false, error: "Impossible de générer un code unique. Réessaie." };
}

export async function deactivateSessionCodes(
  accessCode: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await findSessionByAccessCode(accessCode);
  if (!session) {
    return { ok: false, error: "Session introuvable." };
  }

  const { error } = await supabase
    .from("game_sessions")
    .update({ codes_enabled: false })
    .eq("id", session.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
