-- ============================================================
-- record_best_score: atomic "update my best score if higher"
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- ============================================================
-- Replaces the client's read-then-write (SELECT existing, then conditional
-- UPSERT) with a single atomic statement — one round trip and race-safe.
-- Requires best_scores to have a unique constraint / PK on user_id.

CREATE OR REPLACE FUNCTION record_best_score(
  p_display_name TEXT,
  p_score        INT,
  p_day          TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO best_scores(user_id, display_name, score, achieved_on, updated_at)
  VALUES (auth.uid(), p_display_name, p_score, p_day::date, now())
  ON CONFLICT (user_id) DO UPDATE
    SET score        = EXCLUDED.score,
        display_name = EXCLUDED.display_name,
        achieved_on  = EXCLUDED.achieved_on,
        updated_at   = now()
    WHERE EXCLUDED.score > best_scores.score;  -- only overwrite when strictly higher
END;
$$;
