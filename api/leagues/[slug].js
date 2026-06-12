const SUPABASE_URL = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Smdw6S4VdvXC7j-GVUiRhw_mzRILb1u';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function toSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');

  let universityName = null;
  let leagueName = null;
  let memberCount = 0;

  if (slug) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/leagues?type=eq.university&select=id,name,university_name&limit=2000`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = await r.json();
      if (Array.isArray(rows)) {
        const match = rows.find(row => toSlug(row.university_name || row.name) === slug);
        if (match) {
          universityName = match.university_name;
          leagueName = match.name;
          try {
            const cr = await fetch(
              `${SUPABASE_URL}/rest/v1/league_members?league_id=eq.${match.id}&select=user_id`,
              {
                headers: {
                  apikey: SUPABASE_KEY,
                  Authorization: `Bearer ${SUPABASE_KEY}`,
                  Prefer: 'count=exact',
                  'Range-Unit': 'items',
                  Range: '0-0',
                }
              }
            );
            const contentRange = cr.headers.get('content-range');
            if (contentRange && contentRange.includes('/')) {
              const total = parseInt(contentRange.split('/')[1]);
              if (!isNaN(total)) memberCount = total;
            }
          } catch {}
        }
      }
    } catch {}
  }

  if (!universityName && !leagueName) {
    res.setHeader('Location', '/leagues');
    res.status(302).end();
    return;
  }

  const displayName = universityName || leagueName;
  const title = `${escapeHtml(displayName)} League — Equations`;
  const desc = `Compete in the ${escapeHtml(displayName)} league on Equations! Solve timed math puzzles and climb the leaderboard.`;
  const img = 'https://equationsgame.com/images/opengraph2.png';
  const pageUrl = `https://equationsgame.com/leagues/${encodeURIComponent(slug)}`;
  const playUrl = `/leagues?universitySlug=${encodeURIComponent(slug)}`;
  const memberText = memberCount > 0
    ? `${memberCount} member${memberCount !== 1 ? 's' : ''} competing`
    : 'Be among the first to join!';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background-image: url('https://equationsgame.com/images/background.png');
    background-repeat: repeat;
    background-size: 300px 300px;
    background-color: #f5f5f5;
    color: #444;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  .card {
    background: #FDFCFB;
    border-radius: 18px;
    padding: 2.5rem 2rem;
    max-width: 420px;
    width: 100%;
    text-align: center;
    box-shadow: 0 4px 24px rgba(0,0,0,0.10);
  }
  .emoji { font-size: 3rem; margin-bottom: 0.6rem; }
  .league-name { font-size: 1.6rem; font-weight: 700; color: #333; margin-bottom: 0.3rem; }
  .sub { font-size: 0.88rem; color: #888; margin-bottom: 1.4rem; }
  .members {
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 1.8rem;
    padding: 0.5rem 1rem;
    background: #f0f0f0;
    border-radius: 8px;
    display: inline-block;
    min-width: 60%;
  }
  .btn-play {
    display: inline-block;
    background: #8DC883;
    color: #fff;
    font-weight: 700;
    font-size: 1.05rem;
    padding: 0.85rem 2.5rem;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-play:hover { opacity: 0.88; }
  .brand { margin-top: 1.5rem; font-size: 0.78rem; color: #aaa; }
  .brand a { color: #aaa; text-decoration: none; }
</style>
</head>
<body>
<script>
  var slug = ${JSON.stringify(slug)};
  function goPlay() { sessionStorage.setItem('pendingUniversitySlug', slug); location.replace('/leagues'); }
  if (sessionStorage.getItem('eqInApp')) goPlay();
</script>
<div class="card">
  <div class="emoji">🏫</div>
  <p class="league-name">${escapeHtml(displayName)}</p>
  <p class="sub">University League &middot; Equations</p>
  <p class="members">${escapeHtml(memberText)}</p>
  <button class="btn-play" onclick="goPlay()">Play &amp; Compete</button>
  <p class="brand"><a href="https://equationsgame.com">equationsgame.com</a></p>
</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}
