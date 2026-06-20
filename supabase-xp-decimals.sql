-- Vision+ — XP décimaux (0.5 par réaction, etc.)
-- Exécuter dans Supabase → SQL Editor

-- Supprime l'ancienne version INTEGER si elle existe (évite les doublons)
DROP FUNCTION IF EXISTS public.credit_discord_xp(TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB);

ALTER TABLE discord_members
  ALTER COLUMN total_xp TYPE NUMERIC(12, 1) USING total_xp::numeric;

ALTER TABLE xp_ledger
  ALTER COLUMN amount TYPE NUMERIC(12, 1) USING amount::numeric;

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

GRANT EXECUTE ON FUNCTION credit_discord_xp(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB)
  TO service_role, postgres;
