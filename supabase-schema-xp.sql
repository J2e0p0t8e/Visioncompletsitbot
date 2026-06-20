-- Vision+ — Schéma XP Discord + liaison quiz
-- Exécuter dans l'éditeur SQL Supabase (même projet que sitewebvision)

-- ─── Membres Discord (XP persistant) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS discord_members (
  discord_id    TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  display_name  TEXT,
  total_xp      NUMERIC(12, 1) NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 1,
  message_count INTEGER NOT NULL DEFAULT 0,
  voice_minutes INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discord_members_total_xp
  ON discord_members (total_xp DESC);

-- ─── Journal XP (audit) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS xp_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id  TEXT NOT NULL REFERENCES discord_members (discord_id) ON DELETE CASCADE,
  amount      NUMERIC(12, 1) NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('message', 'reaction', 'voice', 'quiz', 'bonus')),
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_discord_id ON xp_ledger (discord_id);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_created_at ON xp_ledger (created_at DESC);

-- ─── Cooldowns anti-spam ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS xp_cooldowns (
  discord_id   TEXT NOT NULL,
  action_type  TEXT NOT NULL CHECK (action_type IN ('message', 'reaction')),
  last_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_id, action_type)
);

-- ─── Codes personnels quiz (liaison Discord ↔ site) ─────────────────────────

CREATE TABLE IF NOT EXISTS player_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL,
  discord_id    TEXT NOT NULL REFERENCES discord_members (discord_id) ON DELETE CASCADE,
  personal_code TEXT NOT NULL UNIQUE,
  player_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at       TIMESTAMPTZ,
  UNIQUE (session_id, discord_id)
);

CREATE INDEX IF NOT EXISTS idx_player_codes_personal_code ON player_codes (personal_code);
CREATE INDEX IF NOT EXISTS idx_player_codes_session_id ON player_codes (session_id);

-- ─── Extension table game_sessions (quiz existant) ───────────────────────────

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS codes_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS discord_id TEXT,
  ADD COLUMN IF NOT EXISTS personal_code TEXT;

-- ─── Fonction : créditer XP de manière atomique ─────────────────────────────

CREATE OR REPLACE FUNCTION credit_discord_xp(
  p_discord_id TEXT,
  p_username TEXT,
  p_display_name TEXT,
  p_amount NUMERIC,
  p_source TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (new_total_xp NUMERIC, new_level INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_level INTEGER;
BEGIN
  INSERT INTO discord_members (discord_id, username, display_name, total_xp, level)
  VALUES (p_discord_id, p_username, p_display_name, 0, 1)
  ON CONFLICT (discord_id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    updated_at = now();

  UPDATE discord_members
  SET
    total_xp = total_xp + p_amount,
    message_count = message_count + CASE WHEN p_source = 'message' THEN 1 ELSE 0 END,
    voice_minutes = voice_minutes + CASE WHEN p_source = 'voice' THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE discord_id = p_discord_id
  RETURNING total_xp INTO v_total;

  v_level := GREATEST(1, FLOOR(SQRT(v_total::float / 100)) + 1);

  UPDATE discord_members SET level = v_level WHERE discord_id = p_discord_id;

  INSERT INTO xp_ledger (discord_id, amount, source, metadata)
  VALUES (p_discord_id, p_amount, p_source, p_metadata);

  RETURN QUERY SELECT v_total, v_level;
END;
$$;

-- ─── Permissions (évite "permission denied for table discord_members") ─────

ALTER TABLE discord_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE xp_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE xp_cooldowns DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_codes DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE discord_members TO service_role, postgres;
GRANT ALL ON TABLE xp_ledger TO service_role, postgres;
GRANT ALL ON TABLE xp_cooldowns TO service_role, postgres;
GRANT ALL ON TABLE player_codes TO service_role, postgres;

GRANT EXECUTE ON FUNCTION credit_discord_xp(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) TO service_role, postgres;
