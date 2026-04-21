import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SUPABASE_URL = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Smdw6S4VdvXC7j-GVUiRhw_mzRILb1u';
const FROM = 'Equations <welcome@equationsgame.com>';
const REPLY_TO = 'equationsgame.contact@gmail.com';
const UNSUBSCRIBE_MAILTO = 'equationsgame.contact@gmail.com';
const UNSUBSCRIBE_BASE = 'https://equationsgame.com/api/unsubscribe';

function signUnsub(userId) {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET not set');
  const sig = crypto.createHmac('sha256', secret).update(userId).digest('base64url').slice(0, 22);
  return `${userId}.${sig}`;
}

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
  let userId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid access token' });
    const user = await userRes.json();
    if (!user || !user.email || user.email.toLowerCase() !== email) {
      return res.status(403).json({ error: 'Token does not match email' });
    }
    userId = user.id;
  } catch {
    return res.status(401).json({ error: 'Could not verify token' });
  }

  let unsubscribeUrl;
  try {
    unsubscribeUrl = `${UNSUBSCRIBE_BASE}?t=${encodeURIComponent(signUnsub(userId))}`;
  } catch (e) {
    console.error('signUnsub failed:', e);
    return res.status(500).json({ error: 'Email service misconfigured' });
  }

  const html = loadTemplate()
    .replace(/\{\{\s*username\s*\}\}/g, escapeHtml(username))
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, escapeHtml(unsubscribeUrl));
  const text =
    `Hi ${username},\n\n` +
    `Thanks for signing up for Equations — really glad you're here.\n\n` +
    `If you want a place to start, the daily puzzle is a good one: https://equationsgame.com/daily. Three new equations every morning, everyone plays the same set, so you can compare how you did with friends.\n\n` +
    `There's also a 60-second timed mode (https://equationsgame.com/timed) with a daily leaderboard, and 1v1 battles (https://equationsgame.com/battle) you can challenge friends to.\n\n` +
    `A few things worth knowing:\n` +
    `- Your daily streak saves across devices once you're signed in\n` +
    `- Finish in the top 3 on the daily leaderboard to earn a medal\n` +
    `- You can rematch a friend right after a battle ends\n\n` +
    `If you have any questions or run into bugs, just reply to this email — it goes straight to me.\n\n` +
    `— Victoria\n\n` +
    `Unsubscribe: ${unsubscribeUrl}`;

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
        reply_to: REPLY_TO,
        subject: `Welcome to Equations, ${username}!`,
        html,
        text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${UNSUBSCRIBE_MAILTO}?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'List-Id': 'Equations Welcome <welcome.equationsgame.com>',
          'X-Entity-Ref-ID': `welcome-${Date.now()}`
        },
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
