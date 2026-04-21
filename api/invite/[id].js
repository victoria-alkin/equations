const SUPABASE_URL = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Smdw6S4VdvXC7j-GVUiRhw_mzRILb1u';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export default async function handler(req, res) {
  const id = String(req.query.id || '').replace(/[^a-zA-Z0-9]/g, '');
  let hostName = null;
  if (id) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/battles?id=eq.${encodeURIComponent(id)}&select=host_name`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0] && rows[0].host_name) hostName = rows[0].host_name;
    } catch {}
  }

  const title = hostName
    ? `${escapeHtml(hostName)} challenged you to a 1v1 battle!`
    : 'Join a 1v1 Equations battle!';
  const desc = 'Who can solve more equations in 60 seconds?';
  const img = 'https://equationsgame.com/images/opengraph2.png';
  const pageUrl = `https://equationsgame.com/invite/${encodeURIComponent(id)}`;
  const redirect = `/battle?battle=${encodeURIComponent(id)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0;url=${redirect}">
<script>location.replace(${JSON.stringify(redirect)});</script>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:3rem;color:#555;}</style>
</head>
<body>
<p>Loading battle...</p>
<p><a href="${redirect}">Tap here if you are not redirected.</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}
