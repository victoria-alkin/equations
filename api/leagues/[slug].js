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

  let leagueId = null;
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
          leagueId = match.id;
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
  /* Shared button styles */
  .btn {
    display: block;
    width: 100%;
    font-weight: 700;
    font-size: 1rem;
    padding: 0.85rem 1rem;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
    margin-bottom: 0.6rem;
  }
  .btn:last-child { margin-bottom: 0; }
  .btn:hover { opacity: 0.88; }
  .btn-green { background: #8DC883; color: #fff; }
  .btn-gray  { background: #f0f0f0; color: #333; }
  /* Auth form */
  .auth-tabs { display: flex; background: #f0f0f0; border-radius: 12px; padding: 3px; margin-bottom: 1.2rem; }
  .auth-tab {
    flex: 1; padding: 0.5rem; border: none; background: none; border-radius: 10px;
    font-weight: 600; font-size: 0.92rem; cursor: pointer; color: #888; transition: all 0.15s;
  }
  .auth-tab.active { background: #fff; color: #333; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
  .auth-form input {
    display: block; width: 100%; padding: 0.7rem 0.9rem; margin-bottom: 0.6rem;
    border: 1.5px solid #e0e0e0; border-radius: 10px; font-size: 0.95rem;
    outline: none; transition: border-color 0.15s;
  }
  .auth-form input:focus { border-color: #8DC883; }
  .auth-msg { font-size: 0.85rem; min-height: 1.2em; margin-bottom: 0.6rem; }
  .auth-msg.err { color: #c0392b; }
  .auth-msg.ok  { color: #27ae60; }
  .divider { font-size: 0.8rem; color: #bbb; margin: 1rem 0; }
  .brand { margin-top: 1.5rem; font-size: 0.78rem; color: #aaa; }
  .brand a { color: #aaa; text-decoration: none; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="card">
  <div class="emoji">🏫</div>
  <p class="league-name">${escapeHtml(displayName)}</p>
  <p class="sub">University League &middot; Equations</p>
  <p class="members">${escapeHtml(memberText)}</p>

  <!-- State: signed in (member or not — SPA handles the distinction) -->
  <div id="stateSignedIn" class="hidden">
    <button class="btn btn-green" onclick="goPlay()">Play &amp; Compete</button>
  </div>

  <!-- State: not signed in -->
  <div id="stateAuth" class="hidden">
    <p style="font-size:0.83rem;color:#888;margin-bottom:1rem">Hint: use your university email for a quicker sign-in experience</p>
    <div class="auth-tabs">
      <button class="auth-tab active" id="tabLogin" onclick="switchTab('login')">Log In</button>
      <button class="auth-tab" id="tabSignup" onclick="switchTab('signup')">Sign Up</button>
    </div>
    <div id="formLogin" class="auth-form">
      <input type="text" id="loginId" placeholder="Username or email" autocomplete="username">
      <input type="password" id="loginPw" placeholder="Password" autocomplete="current-password">
      <p class="auth-msg" id="loginMsg"></p>
      <button class="btn btn-green" id="btnLogin" onclick="doLogin()">Log In</button>
    </div>
    <div id="formSignup" class="auth-form hidden">
      <input type="text" id="signupUsername" placeholder="Username" autocomplete="username">
      <input type="email" id="signupEmail" placeholder="Email" autocomplete="email">
      <input type="password" id="signupPw" placeholder="Password" autocomplete="new-password">
      <p class="auth-msg" id="signupMsg"></p>
      <button class="btn btn-green" id="btnSignup" onclick="doSignup()">Sign Up</button>
    </div>
  </div>

  <p class="brand"><a href="https://equationsgame.com">equationsgame.com</a></p>
</div>

<script>
  var SLUG      = ${JSON.stringify(slug)};
  var LEAGUE_ID = ${JSON.stringify(leagueId)};
  var SB_URL    = 'https://pcyymbfaxacvmkxrvmhx.supabase.co';
  var SB_KEY    = 'sb_publishable_Smdw6S4VdvXC7j-GVUiRhw_mzRILb1u';

  function goPlay() {
    sessionStorage.setItem('pendingUniversitySlug', SLUG);
    location.replace('/leagues');
  }

  function show(id) {
    ['stateSignedIn','stateAuth'].forEach(function(s) {
      document.getElementById(s).classList.toggle('hidden', s !== id);
    });
  }

  function switchTab(tab) {
    document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
    document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
    document.getElementById('formLogin').classList.toggle('hidden', tab !== 'login');
    document.getElementById('formSignup').classList.toggle('hidden', tab !== 'signup');
  }

  function setMsg(id, msg, type) {
    var el = document.getElementById(id);
    el.textContent = msg;
    el.className = 'auth-msg' + (type ? ' ' + type : '');
  }

  async function lookupEmail(identifier) {
    if (identifier.includes('@')) return identifier;
    var ac = new AbortController();
    var t = setTimeout(function() { ac.abort(); }, 5000);
    var r = await fetch(
      SB_URL + '/rest/v1/profiles?select=email&username=ilike.' + encodeURIComponent(identifier) + '&limit=1',
      { headers: { apikey: SB_KEY, Accept: 'application/json' }, signal: ac.signal }
    );
    clearTimeout(t);
    var rows = await r.json();
    return rows && rows[0] && rows[0].email ? rows[0].email : null;
  }

  async function doLogin() {
    var identifier = document.getElementById('loginId').value.trim();
    var password   = document.getElementById('loginPw').value;
    var btn = document.getElementById('btnLogin');
    if (!identifier || !password) { setMsg('loginMsg', 'Please fill in all fields.', 'err'); return; }
    btn.disabled = true; setMsg('loginMsg', 'Logging in...');
    try {
      var email = await lookupEmail(identifier);
      if (!email) { setMsg('loginMsg', 'Username not found.', 'err'); btn.disabled = false; return; }
      var ac = new AbortController();
      var t = setTimeout(function() { ac.abort(); }, 8000);
      var r = await fetch(SB_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
        signal: ac.signal
      });
      clearTimeout(t);
      var data = await r.json();
      if (!r.ok || data.error) { setMsg('loginMsg', data.error_description || data.error || 'Invalid credentials.', 'err'); btn.disabled = false; return; }
      // Write session to localStorage in the format the Supabase JS client expects
      var sessionKey = 'sb-pcyymbfaxacvmkxrvmhx-auth-token';
      localStorage.setItem(sessionKey, JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
        token_type: data.token_type,
        user: data.user
      }));
      setMsg('loginMsg', 'Signed in! Redirecting...', 'ok');
      goPlay();
    } catch(e) {
      setMsg('loginMsg', 'Something went wrong. Please try again.', 'err');
      btn.disabled = false;
    }
  }

  async function doSignup() {
    var username = document.getElementById('signupUsername').value.trim();
    var email    = document.getElementById('signupEmail').value.trim();
    var password = document.getElementById('signupPw').value;
    var btn = document.getElementById('btnSignup');
    if (!username || !email || !password) { setMsg('signupMsg', 'Please fill in all fields.', 'err'); return; }
    btn.disabled = true; setMsg('signupMsg', 'Creating account...');
    try {
      var ac = new AbortController();
      var t = setTimeout(function() { ac.abort(); }, 8000);
      var r = await fetch(SB_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, data: { username: username } }),
        signal: ac.signal
      });
      clearTimeout(t);
      var data = await r.json();
      if (!r.ok || data.error) { setMsg('signupMsg', data.error_description || data.error || 'Sign up failed.', 'err'); btn.disabled = false; return; }
      if (data.access_token) {
        var sessionKey = 'sb-pcyymbfaxacvmkxrvmhx-auth-token';
        localStorage.setItem(sessionKey, JSON.stringify({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
          token_type: data.token_type,
          user: data.user
        }));
      }
      setMsg('signupMsg', 'Account created! Redirecting...', 'ok');
      goPlay();
    } catch(e) {
      setMsg('signupMsg', 'Something went wrong. Please try again.', 'err');
      btn.disabled = false;
    }
  }

  // Enter key support
  document.getElementById('loginPw').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('signupPw').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSignup();
  });

  // Check for any stored session — if a refresh_token exists, the SPA can
  // handle renewal. Don't reject expired access_tokens here; send them to the
  // SPA which calls db.auth.getSession() and refreshes automatically.
  function hasStoredSession() {
    try {
      var raw = localStorage.getItem('sb-pcyymbfaxacvmkxrvmhx-auth-token');
      if (!raw) return false;
      var s = JSON.parse(raw);
      return !!(s && s.refresh_token);
    } catch(e) { return false; }
  }

  // Determine which state to show — synchronous, no async calls
  (function() {
    if (sessionStorage.getItem('eqInApp')) { goPlay(); return; }
    if (hasStoredSession()) { goPlay(); return; }
    show('stateAuth');
  })();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}
