import crypto from 'crypto';

const SUPABASE_URL = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';

function verifyUnsub(token) {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const userId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!/^[a-f0-9-]{36}$/i.test(userId)) return null;
  const expected = crypto.createHmac('sha256', secret).update(userId).digest('base64url').slice(0, 22);
  if (sig.length !== expected.length) return null;
  let sigBuf, expBuf;
  try { sigBuf = Buffer.from(sig); expBuf = Buffer.from(expected); }
  catch { return null; }
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return userId;
}

async function markUnsubscribed(userId) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set');
    return false;
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ unsubscribed: true })
      }
    );
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('unsubscribe PATCH failed:', r.status, body);
      return false;
    }
    return true;
  } catch (e) {
    console.error('unsubscribe DB error:', e);
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function page(state, token) {
  const safeToken = escapeHtml(token || '');
  const heading = state === 'success'
    ? 'You\u2019ve been unsubscribed'
    : state === 'error'
      ? 'Something went wrong'
      : state === 'invalid'
        ? 'Invalid unsubscribe link'
        : 'Unsubscribe from Equations emails?';
  const message = state === 'success'
    ? 'You will no longer receive emails from Equations. Sorry to see you go \u2014 puzzles are still here whenever you want them.'
    : state === 'error'
      ? 'We couldn\u2019t process your unsubscribe right now. Please try again, or email equationsgame.contact@gmail.com.'
      : state === 'invalid'
        ? 'This unsubscribe link is invalid or expired. If you keep receiving emails you don\u2019t want, please email equationsgame.contact@gmail.com.'
        : 'Click the button below to stop receiving emails from us. You can keep playing without an account, or sign back in any time.';
  const showForm = state === 'confirm';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(heading)} \u2014 Equations</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caprasimo&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:#e9e4d2; font-family:'Nunito',Arial,sans-serif; color:#3a3a4a; }
  .wrap { max-width:520px; margin:48px auto; padding:0 16px; }
  .card { background:#fdfcf5; border:2px solid #2d2d3a; border-radius:18px; padding:36px 32px; text-align:center; }
  h1 { font-family:'Caprasimo',Georgia,serif; font-weight:400; font-size:28px; margin:0 0 14px; }
  p { font-size:16px; line-height:1.55; margin:0 0 20px; }
  button { font-family:'Caprasimo',Georgia,serif; font-size:17px; padding:13px 28px; background:#b8e0a8; color:#3a3a4a; border:2px solid #2d2d3a; border-radius:100px; cursor:pointer; }
  button:hover { background:#a4d293; }
  a { color:#3a3a4a; }
  .home { display:inline-block; margin-top:18px; font-size:14px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    ${showForm ? `<form method="POST" action="/api/unsubscribe?t=${encodeURIComponent(safeToken)}">
      <button type="submit">Confirm unsubscribe</button>
    </form>` : ''}
    <a class="home" href="https://equationsgame.com/">Back to Equations \u2192</a>
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  const token = String((req.query && req.query.t) || '');
  const userId = verifyUnsub(token);

  if (req.method === 'POST') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!userId) return res.status(400).send(page('invalid'));
    const ok = await markUnsubscribed(userId);
    if (!ok) return res.status(500).send(page('error'));
    return res.status(200).send(page('success'));
  }

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!userId) return res.status(400).send(page('invalid'));
    return res.status(200).send(page('confirm', token));
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
