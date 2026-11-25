/**
 * Vista previa del link de la lista de un partido (/c/:code) para WhatsApp.
 * Igual que api/g.js: devuelve el index.html de la app con título, descripción e imagen del partido.
 * Guardada 5 min en la CDN; si algo falla, devuelve el index.html normal.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zdlrebelwvofunblcjya.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const TZ = 'America/Santiago';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (iso) => {
  if (!iso) return 'Fecha por confirmar';
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '').replace('.', '');
  const time = d.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${cap(day)} · ${time}`;
};
const withTimeout = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

async function loadCallup(code) {
  if (!SUPABASE_KEY || !/^[a-z0-9]{6,32}$/i.test(code)) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/callup_view`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: code, p_token: null }),
    signal: withTimeout(2500),
  });
  if (!r.ok) return null;
  return r.json();
}

function metaFor(v, url, origin) {
  const m = v.match || {};
  const rival = (m.is_home ? m.away : m.home) || 'Por definir';
  const going = (v.members || []).filter((x) => x.status === 'yes').length;
  const title = `⚽ ${v.callup.team} vs ${rival} · ${when(m.date)}`;
  const parts = [];
  if (m.venue) parts.push(`📍 ${m.venue}`);
  if (m.championship) parts.push(m.championship);
  parts.push(going ? `Van ${going}` : 'Sé el primero en anotarte');
  parts.push('Toca para decir si vas.');
  return { title, description: parts.join(' · '), image: `${origin}/og-grupo.png`, url };
}

function inject(html, m) {
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="MedioGol" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:url" content="${esc(m.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
  ].join('\n    ');
  const clean = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta\s+(name|property)="(description|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, '');
  return clean.replace(/<head>/i, `<head>\n    ${tags}`);
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;
  const code = String(req.query.code || '').slice(0, 40);

  let html;
  try {
    const r = await fetch(`${origin}/index.html`, { signal: withTimeout(2500) });
    html = await r.text();
  } catch {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    return res.end();
  }
  try {
    const v = await loadCallup(code);
    if (v?.callup && v?.match) html = inject(html, metaFor(v, `${origin}/c/${code}`, origin));
  } catch {
    /* sin vista previa: el index.html normal */
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.statusCode = 200;
  res.end(html);
}
