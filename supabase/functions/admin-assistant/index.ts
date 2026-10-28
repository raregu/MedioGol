// Asistente del administrador: responde "cómo hago…" en MedioGol con Claude, basado SOLO en la GUÍA (constante GUIDE).
// No ejecuta acciones: explica los pasos y da enlaces a las pantallas.
//
// Secretos: ANTHROPIC_API_KEY (obligatoria; la misma de las papeletas)
//           ASSISTANT_MODEL (opcional, por defecto claude-haiku-5-5)
//           ASSISTANT_DAILY_LIMIT (opcional, preguntas por usuario cada 24 h; por defecto 50)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED_ROLES = ["admin_sistema", "admin_campeonato", "encargado_turno"];
const ROLE_LABEL: Record<string, string> = {
  admin_sistema: "administrador del sistema",
  admin_campeonato: "administrador de campeonato",
  encargado_turno: "encargado de turno",
};
const MAX_TURNS = 10;
const MAX_CHARS = 800;

interface Turn { role: "user" | "assistant"; content: string }

// Guía de MedioGol para el asistente del administrador.
// Es la ÚNICA fuente de verdad del asistente: si algo no está aquí, el asistente dice que no lo sabe.
// Mantener al día cuando cambien pantallas o botones (los nombres entre comillas son los textos reales).

const GUIDE = `
# MedioGol — guía para administradores

## Roles
- Administrador del sistema: todo.
- Administrador de campeonato: crea y administra sus campeonatos y ligas.
- Encargado de turno: lo nombra el administrador de un campeonato; sube papeletas, registra pagos en cancha y valida credenciales.
- Capitán / dueño de equipo: administra su equipo, su plantel y su tesorería.

## Menú principal
Inicio, Buscar, Ligas (/leagues), Equipos (/teams), Mis Equipos (/my-teams), Mensajes, Eventos (/live-matches), Mi Credencial, Validar (/validate; administradores y encargados), Administrar (/admin; administradores).

## Administrar (/admin)
- Arriba aparece "Mis ligas": una tarjeta por liga con sus series como botones ("Administrar serie"), y los botones "Ver liga" y "Pagos de la liga". Abajo "Campeonatos sin liga".
- Al elegir una serie o campeonato se abren sus pestañas: Resumen, Equipos, Partidos, Sanciones, Pagos. Enlace directo: /admin?championship=<id>.
- "Crear Campeonato" (botón arriba a la derecha): nombre, deporte, recinto, fechas, etc.
- Resumen: "Editar" (datos del campeonato, bases en PDF, teléfono, imagen) y "Encargados" (nombrar encargados de turno: "Asignar Encargado de Turno").

## Ligas (agrupar series)
- Ligas (/leagues) → "Crear liga" (solo administradores). Datos: nombre, temporada, ubicación, logo, Facebook, sitio web, puntos por partido (G/E/P).
- En la página de la liga, "Administrar liga": agregar los campeonatos que son sus series, definir ruedas (fases) y ajustes de puntos (descuentos o bonificaciones a un club).
- La tabla general de la liga suma los puntos de todas las series por club y se calcula sola.
- En la liga: "Ir a la serie" lleva a cada serie; botón "Pagos" muestra el resumen de cobros de todas las series.

## Equipos de un campeonato
- Administrar → elegir serie → pestaña Equipos → "Crear Equipo".
- Editar o eliminar con los íconos de lápiz y papelera.
- "Asignar Capitán": elige un usuario; el capitán debe confirmar desde Mis Equipos (queda "Pendiente de confirmación").
- Los jugadores los agrega el capitán desde Mis Equipos (agregar jugador existente o invitar).

## Programar partidos
- Administrar → serie → Partidos → "Crear Partido": equipo local, visita, fecha y hora, número de fecha (jornada), complejo deportivo y detalles (cancha).
- Muchos partidos de una vez: Partidos → "Cargar Excel". Columnas: Jornada, Fecha, Hora, Local, Visita, Cancha (botón "Plantilla" para descargar el formato). Los nombres de equipos deben coincidir con los del campeonato.
- Cambiar fecha, hora, cancha o estado (Programado, En Juego, Finalizado, Cancelado): Partidos → lápiz del partido → "Editar Partido". Una fecha suspendida se reprograma cambiando la fecha de cada partido.

## Ingresar resultados, goles y tarjetas
Hay tres formas:
1. Con la papeleta (recomendado, la IA lee la foto):
   - Antes del partido: Administrar → serie → Partidos → elegir "Fecha de las papeletas" → "Descargar papeletas" e imprimir (una hoja A4 por partido con QR).
   - En la cancha: cada jugador escribe su número y firma; el árbitro marca goles (círculos) y tarjetas (TA/TR) y anota observaciones; firman encargado de turno, árbitro y ambos capitanes.
   - Después (en Administrar, NO en la página pública del campeonato): Administrar → serie → pestaña Partidos → "Subir papeleta" en ese partido (o escanear el QR de la hoja) → sacar foto con buena luz y las 4 esquinas visibles → "Leer papeleta" → revisar lo marcado en amarillo → "Confirmar y guardar". Se actualizan resultado, tabla, goleadores, tarjetas, quiénes jugaron y las observaciones del árbitro; la foto queda como respaldo ("Ver papeleta original" en el detalle del partido).
2. A mano (ojo: esto NO está en Administrar, está en la página pública del campeonato): abrir la página del campeonato (enlace /championship/<id> de "Sus datos", o desde Inicio/Buscar → elegir el campeonato) → pestaña Partidos → botón "Registrar Detalles" (o "Editar Detalles" si ya está finalizado) en el partido. Ahí: marcador; "Agregar Gol" (jugador, minuto, tipo Normal/Penalti/Autogol); "Agregar Tarjeta" (amarilla o roja, motivo); "Guardar Detalles". Si el equipo no tiene jugadores cargados, usar "Ingresar marcador directamente". Este botón lo ve el administrador del campeonato.
3. En vivo: menú Eventos (/live-matches) → elegir campeonato y partido → registrar goles, tarjetas y cambios con el minuto mientras se juega.
Los goleadores y la tabla se recalculan solos.

## Sanciones
- En la página del campeonato → "Gestionar Sanciones" → "Nueva Sanción": jugador, tipo (Suspensión, Advertencia, Multa, Expulsión), motivo, fechas de suspensión. Se ven y editan también en Administrar → Sanciones.

## Encargados de turno y validación
- Nombrar: Administrar → serie → Resumen → "Encargados" → "Asignar Encargado de Turno".
- Validar a un jugador en cancha: menú "Validar" y escanear el QR de su credencial (el jugador la ve en "Mi Credencial").

## Planes de organizador (Gratis y Premium)
- Cualquiera puede crear una cuenta de organizador: en "Crear Cuenta" elegir "Organizo una liga" (o desde /organizar → "Activar gratis" si ya tiene cuenta). Queda activa al instante.
- Plan Gratis: publica 1 liga con todas sus series (cada campeonato se crea como serie de esa liga: en "Crear Campeonato" se elige la liga y el nombre de la serie); 6 meses gratis desde que crea la liga; 5 papeletas de prueba con lectura automática.
- Las papeletas de prueba se gastan cuando la IA lee una papeleta de un partido nuevo; volver a leer el mismo partido no gasta otra (máximo 3 lecturas por partido). Al terminar las 5, "Subir papeleta" muestra "Función Premium"; el resultado se puede seguir cargando a mano con "Registrar Detalles".
- Al terminar los 6 meses la liga sigue publicada pero queda en solo lectura (no se cargan partidos ni resultados) hasta activar Premium.
- El avance del plan se ve en Administrar (tarjeta "Plan Gratis"). Premium no tiene límites; hoy se activa escribiendo a MedioGol (todavía no hay pago en línea).

## Pagos del campeonato (lo que cada equipo le debe a la liga)
- Entrar: botón "Pagos" en la página del campeonato o de la liga, o Administrar → pestaña Pagos. /pagos?championship=<id>, liga: /pagos?league=<id>.
- "Configurar cobros": inscripción por equipo (en cuotas con vencimiento), arbitraje por partido o incluido en la inscripción, multas por amarilla, roja y W.O., días para pagar multas y datos para transferir. Marca "Usar estos mismos cobros en todas las series de la liga" para no repetirlo serie por serie.
- Se cargan solos: cuotas de inscripción, arbitraje al finalizar cada partido, multas de tarjetas (también desde la papeleta).
- Estado de cuenta de un equipo: "Registrar pago" (efectivo o transferencia), "Agregar cargo (W.O., garantía…)", aprobar o rechazar comprobantes que envían los capitanes, "Anular" con motivo. Exportar a Excel desde el panel.
- Morosos: solo aviso (en el panel y al subir la papeleta), no bloquea.
- No hay pago en línea por ahora.

## Tesorería interna del equipo (para dueño, capitán y tesoreros de un equipo)
- Mis Equipos → "Tesorería" en el equipo. Pestañas Jugadores, Cobros, Caja, Tesoreros.
- "Nuevo cobro": por ejemplo cuota de temporada por jugador en varias cuotas (incluye arbitraje). "Registrar pago" de cada jugador.
- Caja = recaudado − pagado a campeonatos − otros gastos ("Agregar gasto").
- Tesoreros: el dueño o el capitán marca jugadores del plantel como tesoreros.
- Cada jugador ve solo lo suyo en Mis Equipos → "Mis cuotas". Botón de WhatsApp para recordar deudas.

## Otros
- Playoffs: página del campeonato → "Configurar Playoffs" y luego "Generar Playoffs".
- Sponsors: página del campeonato → "Gestionar Sponsors". Fotos en la pestaña Galería.
- Datos personales (RUT, teléfono) son privados; solo el personal autorizado los ve.

## Lo que MedioGol todavía NO tiene
Pago en línea, mensajes o notificaciones automáticas a jugadores, app móvil nativa, inscripción de equipos con pago incluido.
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "El asistente no está configurado." }, 503);
  const model = Deno.env.get("ASSISTANT_MODEL") || "claude-haiku-5-5";
  const dailyLimit = Number(Deno.env.get("ASSISTANT_DAILY_LIMIT") || "50");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Debes iniciar sesión." }, 401);

  let body: { messages?: Turn[]; page?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === "user" ? MAX_CHARS : 3000) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "Escribe tu pregunta." }, 400);
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sesión inválida." }, 401);
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return json({ error: "El asistente está disponible para administradores y encargados de turno." }, 403);
  }

  // Límite de uso (controla costos)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("assistant_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if ((count ?? 0) >= dailyLimit) return json({ error: `Llegaste al límite de ${dailyLimit} preguntas en 24 horas.` }, 429);

  // Contexto del usuario: sus ligas y campeonatos (para dar enlaces directos)
  const [leaguesRes, champsRes, shiftsRes] = await Promise.all([
    admin.from("leagues").select("id, name").eq("admin_id", userId).limit(20),
    admin.from("championships").select("id, name, series_name, league_id").eq("admin_id", userId).order("created_at", { ascending: false }).limit(30),
    admin.from("shift_manager_assignments").select("championship_id, championships(name)").eq("user_id", userId).eq("is_active", true).limit(20),
  ]);
  const ctxLines: string[] = [];
  (leaguesRes.data || []).forEach((l) => ctxLines.push(`- Liga "${l.name}": /league/${l.id} · pagos /pagos?league=${l.id}`));
  (champsRes.data || []).forEach((c) => ctxLines.push(`- Campeonato "${c.name}": página /championship/${c.id} · administrar /admin?championship=${c.id} · pagos /pagos?championship=${c.id}`));
  (shiftsRes.data || []).forEach((s: { championship_id: string; championships: { name: string } | null }) =>
    ctxLines.push(`- Encargado de turno en "${s.championships?.name ?? "campeonato"}": /championship/${s.championship_id}`));

  const system = `Eres el asistente de MedioGol, una plataforma chilena para administrar campeonatos y ligas de fútbol amateur.
Ayudas a ${profile.full_name ? profile.full_name.split(" ")[0] : "la persona"}, que es ${ROLE_LABEL[profile.role]}, a USAR la plataforma.

Reglas:
- Responde en español de Chile, cercano y breve. Pasos numerados cortos con los nombres exactos de botones entre comillas.
- Básate SOLO en la GUÍA de abajo. Si algo no está en la guía, di con honestidad que no lo sabes o que MedioGol todavía no lo tiene; nunca inventes botones ni pantallas.
- "Sus datos" es información interna para ti: nunca la nombres; usa sus enlaces directamente.
- Puedes enlazar pantallas con formato markdown [texto](/ruta), usando solo rutas que aparecen en la guía o en "Sus datos". Prefiere el enlace directo a su liga o campeonato cuando corresponda.
- No puedes hacer cambios por la persona ni ver resultados, montos o datos personales: solo explicas cómo hacerlo.
- Si la pregunta no tiene que ver con MedioGol, indícalo amablemente y vuelve al tema.
- Si hay varias formas, recomienda la más simple primero (para resultados y goles: la papeleta).
- Cada vez que menciones una pestaña o botón, deja claro en qué pantalla está (por ejemplo "en Administrar" o "en la página del campeonato"); hay pestañas con el mismo nombre en pantallas distintas. Si tienes el enlace directo en "Sus datos", úsalo.

Página donde está ahora: ${page || "desconocida"}

Sus datos:
${ctxLines.length ? ctxLines.join("\n") : "- (no administra campeonatos todavía)"}

GUÍA:
${GUIDE}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages }),
  });
  if (!response.ok) {
    console.error("Anthropic error", response.status, await response.text());
    return json({ error: response.status === 429 ? "El asistente está ocupado. Intenta en un minuto." : "El asistente no pudo responder. Intenta de nuevo." }, 502);
  }
  const result = await response.json();
  const answer = (result.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();

  await admin.from("assistant_usage").insert({
    user_id: userId,
    question: messages[messages.length - 1].content.slice(0, 500),
    page,
    input_tokens: result.usage?.input_tokens ?? null,
    output_tokens: result.usage?.output_tokens ?? null,
  });

  return json({ answer: answer || "No tengo una respuesta para eso. ¿Puedes contarme qué quieres hacer?" });
});
