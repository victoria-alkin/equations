-- ============================================================
-- LEAGUES SCHEMA
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Tables
CREATE TABLE IF NOT EXISTS leagues (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  type            TEXT    NOT NULL CHECK (type IN ('university', 'custom')),
  university_name TEXT,            -- honor-system label for university leagues
  invite_code     TEXT    UNIQUE,  -- 8-char code for custom leagues
  created_by      UUID    REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS league_members (
  league_id    UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id      UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name TEXT    NOT NULL DEFAULT '',
  is_admin     BOOLEAN NOT NULL DEFAULT false,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);

-- Only used for custom leagues (university leagues have no seasons)
CREATE TABLE IF NOT EXISTS league_seasons (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season_number  INTEGER NOT NULL DEFAULT 1,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  winner_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  winner_name    TEXT
);

-- Written by settle_league_points() each night at midnight ET
CREATE TABLE IF NOT EXISTS league_daily_points (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season_id  UUID    REFERENCES league_seasons(id) ON DELETE CASCADE,
  user_id    UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day        DATE    NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  rank       INTEGER NOT NULL,
  points     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (league_id, user_id, day)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_league_members_league   ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_user     ON league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_league_dp_league_day    ON league_daily_points(league_id, day);
CREATE INDEX IF NOT EXISTS idx_league_dp_season        ON league_daily_points(season_id);
CREATE INDEX IF NOT EXISTS idx_league_seasons_league   ON league_seasons(league_id);

-- ── Row-Level Security ────────────────────────────────────────────────────
ALTER TABLE leagues             ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_seasons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_daily_points ENABLE ROW LEVEL SECURITY;

-- leagues: public read; authenticated users can create; admins can update/delete
CREATE POLICY "leagues_read"   ON leagues FOR SELECT USING (true);
CREATE POLICY "leagues_insert" ON leagues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "leagues_update" ON leagues FOR UPDATE USING (
  EXISTS (SELECT 1 FROM league_members WHERE league_id = id AND user_id = auth.uid() AND is_admin)
);
CREATE POLICY "leagues_delete" ON leagues FOR DELETE USING (
  EXISTS (SELECT 1 FROM league_members WHERE league_id = id AND user_id = auth.uid() AND is_admin)
);

-- league_members: public read; users may insert their own row; admins may delete/update
CREATE POLICY "lm_read"          ON league_members FOR SELECT USING (true);
CREATE POLICY "lm_insert_self"   ON league_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lm_update_admin"  ON league_members FOR UPDATE USING (
  EXISTS (SELECT 1 FROM league_members lm2 WHERE lm2.league_id = league_id AND lm2.user_id = auth.uid() AND lm2.is_admin)
  OR auth.uid() = user_id
);
CREATE POLICY "lm_delete_admin"  ON league_members FOR DELETE USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM league_members lm2 WHERE lm2.league_id = league_id AND lm2.user_id = auth.uid() AND lm2.is_admin)
);

-- league_seasons: public read; all writes via SECURITY DEFINER RPCs
CREATE POLICY "ls_read" ON league_seasons FOR SELECT USING (true);
CREATE POLICY "ls_write" ON league_seasons FOR ALL USING (true) WITH CHECK (true);

-- league_daily_points: public read; written by settle RPC (SECURITY DEFINER)
CREATE POLICY "ldp_read"  ON league_daily_points FOR SELECT USING (true);
CREATE POLICY "ldp_write" ON league_daily_points FOR ALL USING (true) WITH CHECK (true);

-- ── RPCs ─────────────────────────────────────────────────────────────────

-- Create a league + auto-join creator as admin
CREATE OR REPLACE FUNCTION create_league(
  p_name            TEXT,
  p_type            TEXT,
  p_university_name TEXT    DEFAULT NULL,
  p_invite_code     TEXT    DEFAULT NULL,
  p_display_name    TEXT    DEFAULT ''
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_id UUID;
BEGIN
  INSERT INTO leagues(name, type, university_name, invite_code, created_by)
  VALUES (p_name, p_type, p_university_name, p_invite_code, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO league_members(league_id, user_id, display_name, is_admin)
  VALUES (new_id, auth.uid(), p_display_name, true);

  RETURN new_id;
END;
$$;

-- Join a custom league via invite code
CREATE OR REPLACE FUNCTION join_league_by_code(
  p_invite_code  TEXT,
  p_display_name TEXT DEFAULT ''
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE target_id UUID;
BEGIN
  SELECT id INTO target_id FROM leagues WHERE invite_code = p_invite_code;
  IF target_id IS NULL THEN RAISE EXCEPTION 'League not found'; END IF;

  INSERT INTO league_members(league_id, user_id, display_name, is_admin)
  VALUES (target_id, auth.uid(), p_display_name, false)
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN target_id;
END;
$$;

-- Join a university league (open join by league id)
CREATE OR REPLACE FUNCTION join_university_league(
  p_league_id    UUID,
  p_display_name TEXT DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO league_members(league_id, user_id, display_name, is_admin)
  VALUES (p_league_id, auth.uid(), p_display_name, false)
  ON CONFLICT (league_id, user_id) DO NOTHING;
END;
$$;

-- Start (or restart) a season for a custom league — admin only
CREATE OR REPLACE FUNCTION start_league_season(p_league_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_season_id UUID;
  next_num      INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = auth.uid() AND is_admin
  ) THEN RAISE EXCEPTION 'Not an admin'; END IF;

  -- End any active season first
  UPDATE league_seasons
  SET ended_at = now(),
      winner_id   = (
        SELECT user_id FROM league_daily_points
        WHERE season_id = league_seasons.id
        GROUP BY user_id ORDER BY SUM(points) DESC LIMIT 1
      ),
      winner_name = (
        SELECT lm.display_name FROM league_daily_points ldp
        JOIN league_members lm ON lm.league_id = ldp.league_id AND lm.user_id = ldp.user_id
        WHERE ldp.season_id = league_seasons.id
        GROUP BY ldp.user_id, lm.display_name ORDER BY SUM(ldp.points) DESC LIMIT 1
      )
  WHERE league_id = p_league_id AND ended_at IS NULL;

  SELECT COALESCE(MAX(season_number), 0) + 1 INTO next_num
  FROM league_seasons WHERE league_id = p_league_id;

  INSERT INTO league_seasons(league_id, season_number, started_at)
  VALUES (p_league_id, next_num, now())
  RETURNING id INTO new_season_id;

  RETURN new_season_id;
END;
$$;

-- Remove a league member (self-leave or admin kick)
CREATE OR REPLACE FUNCTION remove_league_member(p_league_id UUID, p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() = p_user_id OR EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = auth.uid() AND is_admin
  ) THEN
    DELETE FROM league_members WHERE league_id = p_league_id AND user_id = p_user_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;

-- Promote a member to admin
CREATE OR REPLACE FUNCTION promote_league_member(p_league_id UUID, p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = auth.uid() AND is_admin
  ) THEN RAISE EXCEPTION 'Not an admin'; END IF;

  UPDATE league_members SET is_admin = true
  WHERE league_id = p_league_id AND user_id = p_user_id;
END;
$$;

-- ── Nightly settle: call this alongside settle_past_leaderboard_days() ────
-- Awards points to league members based on yesterday's best timed scores.
-- Points scale: N = min(member_count, 10); 1st gets N, 2nd N-1, ... Nth gets 1.
-- Only players who actually played (score > 0) receive points.
CREATE OR REPLACE FUNCTION settle_league_points()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  yesterday_est DATE := (NOW() AT TIME ZONE 'America/New_York')::DATE - 1;
  yesterday_str TEXT := yesterday_est::TEXT;
  league_rec    RECORD;
  member_count  INTEGER;
  n             INTEGER;
  season_id_var UUID;
  rank_val      INTEGER;
  season_days   INTEGER;
  member_rec    RECORD;
BEGIN
  FOR league_rec IN SELECT * FROM leagues LOOP
    -- Skip if already settled for this day
    IF EXISTS (
      SELECT 1 FROM league_daily_points
      WHERE league_id = league_rec.id AND day = yesterday_est LIMIT 1
    ) THEN CONTINUE; END IF;

    -- Custom leagues: require an active season
    season_id_var := NULL;
    IF league_rec.type = 'custom' THEN
      SELECT id INTO season_id_var FROM league_seasons
      WHERE league_id = league_rec.id AND ended_at IS NULL
      ORDER BY started_at DESC LIMIT 1;
      IF season_id_var IS NULL THEN CONTINUE; END IF;
    END IF;

    SELECT COUNT(*) INTO member_count FROM league_members WHERE league_id = league_rec.id;
    n := LEAST(member_count, 10);

    rank_val := 1;
    FOR member_rec IN (
      SELECT lm.user_id, lm.display_name,
             COALESCE(MAX(ts.score), 0) AS best_score
      FROM league_members lm
      LEFT JOIN timed_scores ts
        ON ts.user_id = lm.user_id AND ts.day = yesterday_str
      WHERE lm.league_id = league_rec.id
      GROUP BY lm.user_id, lm.display_name
      ORDER BY COALESCE(MAX(ts.score), 0) DESC, lm.joined_at ASC
    ) LOOP
      INSERT INTO league_daily_points(league_id, season_id, user_id, day, best_score, rank, points)
      VALUES (
        league_rec.id,
        season_id_var,
        member_rec.user_id,
        yesterday_est,
        member_rec.best_score,
        rank_val,
        CASE WHEN member_rec.best_score > 0 AND rank_val <= n THEN n - rank_val + 1 ELSE 0 END
      )
      ON CONFLICT (league_id, user_id, day) DO NOTHING;
      rank_val := rank_val + 1;
    END LOOP;

    -- End custom season after 7 settled days
    IF league_rec.type = 'custom' AND season_id_var IS NOT NULL THEN
      SELECT COUNT(DISTINCT day) INTO season_days
      FROM league_daily_points WHERE season_id = season_id_var;

      IF season_days >= 7 THEN
        UPDATE league_seasons
        SET ended_at    = now(),
            winner_id   = (
              SELECT user_id FROM league_daily_points
              WHERE season_id = season_id_var
              GROUP BY user_id ORDER BY SUM(points) DESC LIMIT 1
            ),
            winner_name = (
              SELECT lm.display_name FROM league_daily_points ldp
              JOIN league_members lm
                ON lm.league_id = ldp.league_id AND lm.user_id = ldp.user_id
              WHERE ldp.season_id = season_id_var
              GROUP BY ldp.user_id, lm.display_name
              ORDER BY SUM(ldp.points) DESC LIMIT 1
            )
        WHERE id = season_id_var AND ended_at IS NULL;
      END IF;
    END IF;
  END LOOP;
END;
$$;
