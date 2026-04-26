const SUPABASE_URL = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Smdw6S4VdvXC7j-GVUiRhw_mzRILb1u';
const FROM = 'Equations <noreply@equationsgame.com>';

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function domainMatches(emailDomain, uniDomains) {
  const d = emailDomain.toLowerCase();
  return uniDomains.some(ud => d === ud.toLowerCase() || d.endsWith('.' + ud.toLowerCase()));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { uniEmail, university_name, domains, accessToken } = body;

  if (!isValidEmail(uniEmail)) return res.status(400).json({ error: 'Invalid email address' });
  if (!accessToken)            return res.status(401).json({ error: 'Missing access token' });
  if (!university_name)        return res.status(400).json({ error: 'Missing university name' });

  // Verify the JWT — just confirm the user is logged in
  let userId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid access token' });
    const user = await userRes.json();
    userId = user?.id;
    if (!userId) return res.status(401).json({ error: 'Could not identify user' });
  } catch {
    return res.status(401).json({ error: 'Could not verify token' });
  }

  // Validate email domain against university's known domains
  const emailDomain = uniEmail.split('@')[1];
  if (!emailDomain) return res.status(400).json({ error: 'Invalid email address' });
  if (Array.isArray(domains) && domains.length > 0) {
    if (!domainMatches(emailDomain, domains)) {
      return res.status(400).json({ error: `That email doesn't match ${university_name}'s domain (${domains.join(', ')})` });
    }
  }

  // Generate 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // Store via SECURITY DEFINER RPC (user's JWT, so auth.uid() is set correctly)
  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_university_otp`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_email: uniEmail.toLowerCase(), p_code: code, p_university_name: university_name })
  });
  if (!rpcRes.ok) {
    const e = await rpcRes.json().catch(() => ({}));
    console.error('create_university_otp failed:', e);
    return res.status(500).json({ error: 'Failed to store verification code' });
  }

  // Send the code via Resend
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:2rem;color:#333">
      <h2 style="color:#8DC883;margin-bottom:0.5rem">Equations — University Verification</h2>
      <p>Your verification code for joining the <strong>${university_name}</strong> league:</p>
      <p style="font-size:2.6rem;font-weight:800;letter-spacing:0.3em;color:#222;margin:1.2rem 0">${code}</p>
      <p style="color:#888;font-size:0.85rem">This code expires in 10 minutes.<br>If you didn't request this, you can safely ignore it.</p>
    </div>
  `;
  const text = `Your Equations verification code for ${university_name}: ${code}\n\nExpires in 10 minutes.`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM, to: [uniEmail], subject: `${code} is your Equations verification code`, html, text })
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      console.error('Resend error:', r.status, data);
      return res.status(502).json({ error: 'Failed to send email' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send-university-otp error:', e);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
