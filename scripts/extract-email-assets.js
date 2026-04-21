const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'email', 'WelcomeEmail.html');
const OUT_DIR = path.join(__dirname, '..', 'images', 'email');

const UUIDS = {
  'header.png':  '27e31514-e1ad-4334-b9e7-9f8717bd6339',
  'daily.png':   'eb13a608-0d63-4b20-9f7b-ccfb653e2c6f',
  'timed.png':   'b940c6d6-ebe5-4db4-8e11-f50d1357e99c',
  'battle.png':  '93f7af80-cac2-4ebf-86e8-1130b1988b3b',
  'badges.png':  'f207c62c-b3da-4d34-aec4-4e13d4dfdc40',
};

const html = fs.readFileSync(SOURCE, 'utf8');
const match = html.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
if (!match) { console.error('manifest not found'); process.exit(1); }
const manifest = JSON.parse(match[1]);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [filename, uuid] of Object.entries(UUIDS)) {
  const entry = manifest[uuid];
  if (!entry) { console.warn(`missing ${uuid}`); continue; }
  const buf = Buffer.from(entry.data, 'base64');
  const ext = (entry.mime || '').split('/')[1] || 'png';
  const out = path.join(OUT_DIR, filename.replace(/\.[^.]+$/, '.' + ext));
  fs.writeFileSync(out, buf);
  console.log(`saved ${path.basename(out)}  ${buf.length} bytes  ${entry.mime}`);
}
