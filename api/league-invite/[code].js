const SUPABASE_URL = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Smdw6S4VdvXC7j-GVUiRhw_mzRILb1u';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export default async function handler(req, res) {
  const code = String(req.query.code || '').replace(/[^a-zA-Z0-9]/g, '');
  let leagueName = null;
  if (code) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/leagues?invite_code=eq.${encodeURIComponent(code)}&select=name`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0]) leagueName = rows[0].name;
    } catch {}
  }

  const title = leagueName
    ? `Join "${escapeHtml(leagueName)}" on Equations!`
    : 'Join a league on Equations!';
  const desc = 'Compete in Equations leagues — solve timed puzzles and climb the leaderboard!';
  const img = 'https://equationsgame.com/images/opengraph2.png';
  const pageUrl = `https://equationsgame.com/league-invite/${encodeURIComponent(code)}`;
  const redirect = `/leagues?leagueCode=${encodeURIComponent(code)}`;

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
<p>Loading league...</p>
<p><a href="${redirect}">Tap here if you are not redirected.</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}
