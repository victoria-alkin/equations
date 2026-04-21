import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Smdw6S4VdvXC7j-GVUiRhw_mzRILb1u';
const FROM = 'Equations <welcome@equationsgame.com>';

const TEMPLATE_PATH = path.join(process.cwd(), 'email', 'WelcomeEmail.html');
let CACHED_TEMPLATE = null;
function loadTemplate() {
  if (!CACHED_TEMPLATE) CACHED_TEMPLATE = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return CACHED_TEMPLATE;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
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
  const username = (body.username || '').toString().trim().slice(0, 40) || 'there';
  const email = (body.email || '').toString().trim().toLowerCase();
  const accessToken = (body.accessToken || '').toString();

  if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  if (!accessToken) return res.status(401).json({ error: 'Missing access token' });

  // Verify the caller owns this email by checking their Supabase session
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid access token' });
    const user = await userRes.json();
    if (!user || !user.email || user.email.toLowerCase() !== email) {
      return res.status(403).json({ error: 'Token does not match email' });
    }
  } catch {
    return res.status(401).json({ error: 'Could not verify token' });
  }

  const html = loadTemplate().replace(/\{\{\s*username\s*\}\}/g, escapeHtml(username));
  const text =
    `Welcome to Equations, ${username}!\n\n` +
    `We're so glad you're here. Equations is a playful puzzle game about balancing numbers and finding clever solutions.\n\n` +
    `Play the Daily puzzle: https://equationsgame.com/daily\n` +
    `Race the clock in Timed: https://equationsgame.com/timed\n` +
    `Challenge a friend in Battle: https://equationsgame.com/battle\n\n` +
    `Play your first puzzle: https://equationsgame.com/\n\n` +
    `— The Equations team`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: `Welcome to Equations, ${username}!`,
        html,
        text,
        tags: [{ name: 'type', value: 'welcome' }]
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('Resend error:', r.status, data);
      return res.status(502).json({ error: 'Send failed', detail: data?.message || String(r.status) });
    }
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('send-welcome error:', e);
    return res.status(500).json({ error: 'Send failed' });
  }
}
