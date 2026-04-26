-- ============================================================
-- UNIVERSITY OTP VERIFICATION SCHEMA
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS university_verifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  code            TEXT        NOT NULL,
  university_name TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE university_verifications ENABLE ROW LEVEL SECURITY;
-- No direct reads (prevents client from reading the stored code).
-- Only allow delete so users can clean up their own rows.
CREATE POLICY "uv_delete_own" ON university_verifications FOR DELETE USING (auth.uid() = user_id);

-- Called by the Vercel function (with user's JWT) to store a new code.
-- Replaces any existing code for this user+email before inserting.
CREATE OR REPLACE FUNCTION create_university_otp(
  p_email         TEXT,
  p_code          TEXT,
  p_university_name TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM university_verifications
  WHERE user_id = auth.uid() AND email = lower(p_email);

  INSERT INTO university_verifications(user_id, email, code, university_name, expires_at)
  VALUES (auth.uid(), lower(p_email), p_code, p_university_name, now() + interval '10 minutes');
END;
$$;

-- Called by the client to verify the entered code.
-- Returns the university_name on success, raises exception on failure.
-- Deletes the record after successful verification (single-use).
CREATE OR REPLACE FUNCTION verify_university_otp(
  p_email TEXT,
  p_code  TEXT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_university TEXT;
BEGIN
  SELECT university_name INTO v_university
  FROM university_verifications
  WHERE user_id    = auth.uid()
    AND email      = lower(p_email)
    AND code       = p_code
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_university IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired code';
  END IF;

  DELETE FROM university_verifications
  WHERE user_id = auth.uid() AND email = lower(p_email);

  RETURN v_university;
END;
$$;
