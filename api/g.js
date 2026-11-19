/**
 * Vista previa del link de un grupo fijo (/g/:code) para WhatsApp, Facebook, etc.
 *
 * Los navegadores de WhatsApp no ejecutan JavaScript: leen las etiquetas og:* del HTML.
 * Esta función devuelve el mismo index.html de la app pero con título, descripción e imagen
 * del partido de esta semana. La app carga igual que siempre en el navegador.
 *
 * - Respuesta guardada 5 min en la CDN de Vercel (miles de aperturas = pocas consultas).
 * - Si falla cualquier cosa, devuelve el index.html normal (nunca deja el link sin abrir).
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zdlrebelwvofunblcjya.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const TZ = 'America/Santiago';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const when = (iso) => {
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

async function loadGroup(code) {
  if (!SUPABASE_KEY || !/^[a-z0-9]{6,32}$/i.test(code)) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/play_group_view`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_code: code, p_group: null, p_token: null }),
    signal: withTimeout(2500),
  });
  if (!r.ok) return null;
  return r.json();
}

function metaFor(view, url, origin) {
  const { group, session } = view;
  const free = Math.max(session.slots - session.used, 0);
  const played = session.status !== 'open' || new Date(session.starts_at).getTime() <= Date.now();
  const title = `⚽ ${group.name} · ${when(session.starts_at)}`;
  const parts = [];
  if (session.venue) parts.push(`📍 ${session.venue}`);
  if (played) parts.push('Semana jugada. Mira la lista de la próxima.');
  else {
    parts.push(free > 0 ? `Van ${session.used}/${session.slots} · quedan ${free} cupos` : `Lista llena (${session.slots}/${session.slots}) · anótate en la espera`);
    parts.push('Toca para decir si vas.');
  }
  return {
    title,
    description: parts.join(' · '),
    image: `${origin}/og-grupo.png`,
    url,
  };
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
  // Quita las etiquetas genéricas y pone las del partido
  const clean = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(name|property)="(description|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, '');
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
    const view = await loadGroup(code);
    if (view?.group && view?.session) html = inject(html, metaFor(view, `${origin}/g/${code}`, origin));
  } catch {
    /* sin vista previa: el index.html normal */
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.statusCode = 200;
  res.end(html);
}
