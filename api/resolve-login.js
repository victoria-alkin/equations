// Resolves a username to its login email server-side, using the service-role key.
// This exists so the `profiles.email` column does NOT need to be publicly readable
// via the anon key — which previously allowed anyone to bulk-harvest every
// username→email pair (e.g. GET /rest/v1/profiles?select=username,email).
//
// After all callers use this endpoint, lock the column down (see comment at bottom).
const SUPABASE_URL = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SERVICE_KEY) {
    console.error('resolve-login: SUPABASE_SERVICE_ROLE_KEY not set');
    return res.status(500).json({ error: 'Login is temporarily unavailable' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const username = String(body.username || '').trim();
  if (!username || username.length > 40) return res.status(400).json({ error: 'Invalid username' });

  // Escape ILIKE wildcards so a caller can't pattern-match (e.g. "%") to fish for rows.
  const safe = username.replace(/[\\%_]/g, m => '\\' + m);

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=email&username=ilike.${encodeURIComponent(safe)}&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!r.ok) {
      console.error('resolve-login lookup failed:', r.status);
      return res.status(500).json({ error: 'Lookup failed' });
    }
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows[0]?.email) {
      return res.status(404).json({ error: 'Username not found' });
    }
    return res.status(200).json({ email: rows[0].email });
  } catch (e) {
    console.error('resolve-login error:', e);
    return res.status(500).json({ error: 'Lookup failed' });
  }
}

// Once every caller uses this endpoint, run in the Supabase SQL editor to stop the
// anon key from reading emails directly (service role still can):
//   REVOKE SELECT (email) ON public.profiles FROM anon;
// If users need to read their own email client-side, grant just that:
//   -- (only if needed) keep authenticated able to read their own row's email via RLS
