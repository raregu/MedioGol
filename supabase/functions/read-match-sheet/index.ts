// Lee la foto de una papeleta de partido con Claude (visión) y devuelve los datos para revisión.
// No guarda nada en el partido: eso lo hace apply_match_sheet() cuando el administrador confirma.
//
// Secretos (supabase secrets set ...):
//   ANTHROPIC_API_KEY   clave de la API de Anthropic (obligatoria)
//   MATCH_SHEET_MODEL   opcional, por defecto claude-sonnet-5-5
//   MATCH_SHEET_DAILY_LIMIT opcional, papeletas por usuario cada 24 h (por defecto 60)
//
// Limpieza: en cada llamada borra en segundo plano (lotes chicos) las fotos de papeletas
// NO confirmadas con más de 30 días. Las fotos de papeletas confirmadas se conservan siempre.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/** Base64 sin dependencias externas (por bloques, para no exceder la pila con fotos grandes). */
const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGES = 3;
const PRINTED_ROWS = 24;

interface RosterRow { row: number; player_id: string; name: string }
interface Context {
  match_id: string;
  code: string;
  championship: string;
  series: string | null;
  league: string | null;
  round: number | null;
  home: { team_id: string; name: string; roster: RosterRow[] };
  away: { team_id: string; name: string; roster: RosterRow[] };
}

const teamSchema = {
  type: "object",
  properties: {
    filas: {
      type: "array",
      description: "Solo las filas con alguna marca, número, firma o nombre escrito.",
      items: {
        type: "object",
        properties: {
          fila: { type: "integer", description: "Número de fila impreso (1 = primera fila de la tabla del equipo)." },
          nombre_escrito: { type: ["string", "null"], description: "Solo para filas en blanco: el nombre escrito a mano. null si la fila tenía nombre impreso." },
          numero: { type: ["string", "null"], description: "N° de camiseta escrito en el recuadro N°." },
          firmo: { type: "boolean", description: "Hay una firma o trazo en la columna Firma." },
          goles: { type: "integer", description: "Cantidad de círculos RELLENOS en Goles (un círculo solo contorneado no cuenta)." },
          amarilla: { type: "boolean", description: "Casilla TA marcada." },
          roja: { type: "boolean", description: "Casilla TR marcada." },
          dudoso: { type: "boolean", description: "true si algún dato de esta fila no se lee con seguridad." },
          motivo: { type: ["string", "null"], description: "Qué es dudoso, en pocas palabras y en español." },
        },
        required: ["fila", "nombre_escrito", "numero", "firmo", "goles", "amarilla", "roja", "dudoso", "motivo"],
        additionalProperties: false,
      },
    },
    autogoles_a_favor: { type: "integer", description: "Recuadro 'Autogoles del rival a favor' de este equipo (0 si está vacío)." },
  },
  required: ["filas", "autogoles_a_favor"],
  additionalProperties: false,
};

// Salida estructurada (output_config.format): la respuesta es JSON que cumple este esquema.
const SHEET_SCHEMA = {
  schema: {
    type: "object",
    properties: {
      es_papeleta_mediogol: { type: "boolean", description: "false si la imagen no es una papeleta de MedioGol o es ilegible." },
      codigo_leido: { type: ["string", "null"], description: "Código impreso bajo el QR (formato MG-XXXX-XXXX) si se lee." },
      marcador: {
        type: "object",
        properties: {
          local: { type: ["integer", "null"] },
          visita: { type: ["integer", "null"] },
          dudoso: { type: "boolean" },
          motivo: { type: ["string", "null"] },
        },
        required: ["local", "visita", "dudoso", "motivo"],
        additionalProperties: false,
      },
      wo: { type: "string", enum: ["ninguno", "local", "visita"], description: "Equipo marcado como 'No se presentó (W.O.)'; 'ninguno' si no hay marca." },
      local: teamSchema,
      visita: teamSchema,
      observaciones: { type: ["string", "null"], description: "Texto del recuadro de observaciones del árbitro, transcrito." },
      firmas: {
        type: "object",
        properties: {
          turno: { type: "boolean" },
          arbitro: { type: "boolean" },
          capitan_local: { type: "boolean" },
          capitan_visita: { type: "boolean" },
        },
        required: ["turno", "arbitro", "capitan_local", "capitan_visita"],
        additionalProperties: false,
      },
      advertencias: { type: "array", items: { type: "string" }, description: "Problemas generales: foto cortada, borrosa, hoja doblada, etc." },
    },
    required: ["es_papeleta_mediogol", "codigo_leido", "marcador", "wo", "local", "visita", "observaciones", "firmas", "advertencias"],
    additionalProperties: false,
  },
};

const SYSTEM = `Lees fotos de papeletas de partido de fútbol amateur generadas por MedioGol y respondes con un JSON que registra su contenido.

La papeleta tiene: arriba la competencia y un QR con un código MG-XXXX-XXXX; un recuadro de resultado con dos dígitos por equipo y casillas "No se presentó (W.O.)"; dos tablas (Local a la izquierda, Visita a la derecha) con columnas N° (recuadro donde el jugador escribe su número del día), Jugador (nombre impreso o escrito en filas en blanco), Firma, Goles (4 círculos: se rellena uno por gol), TA y TR (casillas de tarjeta amarilla y roja); un recuadro de autogoles por equipo; observaciones del árbitro; y firmas de encargado de turno, árbitro y capitanes.

Reglas:
- Registra solo lo que se ve. Nunca inventes datos ni completes por lógica deportiva.
- Un círculo de gol cuenta solo si está relleno o tachado claramente; solo contorneado no cuenta.
- La fila se identifica por su posición en la tabla (1 = primera fila bajo el encabezado). Usa la lista de filas impresas que se te entrega para ubicarte; no corrijas nombres impresos.
- En filas en blanco, transcribe el nombre escrito a mano en nombre_escrito.
- Firma: solo indica si hay firma; no transcribas su contenido.
- Si la hoja incluye RUT u otros datos personales escritos, no los transcribas.
- Si un dato es ambiguo (marca entre dos casillas, número ilegible, dígito que puede ser 1 o 7), marca la fila como dudosa y explica el motivo en pocas palabras en español.
- Si el marcador escrito no coincide con los goles marcados, regístralo tal como se ve y agrega una advertencia.`;

const contextText = (c: Context) => {
  const team = (label: string, t: Context["home"]) => {
    const lines = t.roster.map((r) => `  fila ${r.row}: ${r.name}`);
    const first = t.roster.length + 1;
    if (first <= PRINTED_ROWS) lines.push(`  filas ${first} a ${PRINTED_ROWS}: en blanco (para escribir a mano)`);
    return `${label}: ${t.name}\n${lines.join("\n")}`;
  };
  return [
    `Papeleta impresa ${c.code}.`,
    `Competencia: ${[c.league, c.series ?? c.championship].filter(Boolean).join(" · ")}${c.round ? ` · Fecha ${c.round}` : ""}.`,
    team("Tabla LOCAL (izquierda)", c.home),
    team("Tabla VISITA (derecha)", c.away),
    "Responde con el JSON de la papeleta.",
  ].join("\n\n");
};

const PURGE_AFTER_DAYS = 30;
const PURGE_BATCH = 20;

/** Borra fotos de papeletas no confirmadas antiguas. Nunca toca las confirmadas (status 'applied'). */
// deno-lint-ignore no-explicit-any
const purgeOldSheetPhotos = async (admin: any) => {
  try {
    const before = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: old, error } = await admin
      .from("match_sheets")
      .select("id, image_paths")
      .neq("status", "applied")
      .is("images_purged_at", null)
      .lt("created_at", before)
      .order("created_at", { ascending: true })
      .limit(PURGE_BATCH);
    if (error || !old?.length) return;
    const files = old.flatMap((r: { image_paths: string[] | null }) => r.image_paths ?? []);
    if (files.length) {
      const { error: rmError } = await admin.storage.from("match-sheets").remove(files);
      if (rmError) return console.error("purge remove", rmError.message);
    }
    await admin
      .from("match_sheets")
      .update({ images_purged_at: new Date().toISOString() })
      .in("id", old.map((r: { id: string }) => r.id))
      .neq("status", "applied");
  } catch (err) {
    console.error("purge", err);
  }
};

/** Corre la limpieza sin demorar la respuesta al usuario. */
const runInBackground = (task: Promise<unknown>) => {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(task);
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("MATCH_SHEET_MODEL") || "claude-sonnet-5-5";
  const dailyLimit = Number(Deno.env.get("MATCH_SHEET_DAILY_LIMIT") || "60");

  if (!apiKey) return json({ error: "La lectura con IA no está configurada (falta ANTHROPIC_API_KEY)." }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Debes iniciar sesión." }, 401);

  let body: { match_id?: string; paths?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const matchId = body.match_id ?? "";
  const paths = Array.isArray(body.paths) ? body.paths : [];
  if (!UUID.test(matchId)) return json({ error: "Partido inválido." }, 400);
  if (paths.length < 1 || paths.length > MAX_IMAGES) return json({ error: `Sube entre 1 y ${MAX_IMAGES} fotos.` }, 400);
  if (paths.some((p) => typeof p !== "string" || !p.startsWith(`${matchId}/`) || p.includes(".."))) {
    return json({ error: "Ruta de foto inválida." }, 400);
  }

  // Cliente con los permisos del usuario: match_sheet_contexts() verifica que pueda administrar el partido.
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sesión inválida." }, 401);
  const userId = userData.user.id;

  const { data: ctxRows, error: ctxError } = await userClient.rpc("match_sheet_contexts", { p_match_ids: [matchId] });
  if (ctxError) return json({ error: "No se pudo cargar el partido." }, 500);
  const context = (ctxRows?.[0] ?? null) as Context | null;
  if (!context) return json({ error: "No tienes permiso para este partido." }, 403);

  const admin = createClient(supabaseUrl, serviceKey);
  runInBackground(purgeOldSheetPhotos(admin));

  // Plan del organizador: en Gratis hay 5 papeletas de prueba (y solo lectura si venció el periodo gratis).
  // Se valida antes de llamar a la IA; la lectura exitosa queda en match_sheets y es lo que se cuenta.
  const { data: quota, error: quotaError } = await userClient.rpc("match_sheet_quota", { p_match_id: matchId });
  if (quotaError) {
    // Sin la migración de planes la función no existe: se sigue sin cupo (comportamiento anterior)
    if (quotaError.code !== "PGRST202" && quotaError.code !== "42883") {
      console.error("match_sheet_quota", quotaError);
      return json({ error: "No se pudo revisar el plan de la liga." }, 500);
    }
  } else if (quota && quota.allowed === false) {
    return json({ error: quota.message || "La lectura automática de papeletas es una función Premium.", reason: quota.reason }, 402);
  }

  // Límite de uso por usuario (controla costos)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("match_sheets")
    .select("id", { count: "exact", head: true })
    .eq("uploaded_by", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= dailyLimit) {
    return json({ error: `Llegaste al límite de ${dailyLimit} papeletas en 24 horas.` }, 429);
  }

  const { data: sheet, error: insertError } = await admin
    .from("match_sheets")
    .insert({ match_id: matchId, uploaded_by: userId, image_paths: paths, status: "uploaded", ai_model: model })
    .select("id")
    .single();
  if (insertError || !sheet) return json({ error: "No se pudo registrar la papeleta." }, 500);

  // Al usuario se le muestra un mensaje simple; el detalle técnico queda en match_sheets.error.
  const fail = async (message: string, status = 502, detail?: string) => {
    await admin
      .from("match_sheets")
      .update({ status: "failed", error: detail ? `${message} | ${detail}`.slice(0, 1000) : message })
      .eq("id", sheet.id);
    return json({ error: message, sheet_id: sheet.id }, status);
  };

  try {
    const images = [];
    for (const path of paths) {
      const { data: blob, error } = await admin.storage.from("match-sheets").download(path);
      if (error || !blob) return await fail("No se encontró una de las fotos subidas.", 400);
      const type = ["image/jpeg", "image/png", "image/webp"].includes(blob.type) ? blob.type : "image/jpeg";
      images.push({
        type: "image",
        source: { type: "base64", media_type: type, data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SHEET_SCHEMA.schema } },
        messages: [{ role: "user", content: [...images, { type: "text", text: contextText(context) }] }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Anthropic error", response.status, detail);
      return await fail(
        response.status === 429 ? "El servicio de lectura está ocupado. Intenta en un minuto." : "No se pudo leer la papeleta.",
        502,
        `HTTP ${response.status}: ${detail}`
      );
    }

    const result = await response.json();
    const text = (result.content ?? []).find((b: { type: string }) => b.type === "text")?.text;
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || result.stop_reason === "max_tokens") {
      return await fail("La lectura no devolvió datos completos. Intenta con otra foto.", 502, `stop_reason: ${result.stop_reason}`);
    }
    // "ninguno" → null (el resto de la app espera null cuando no hay W.O.)
    const sheetData = parsed as { wo?: string | null };
    if (sheetData.wo !== "local" && sheetData.wo !== "visita") sheetData.wo = null;

    await admin
      .from("match_sheets")
      .update({ status: "read", ai_result: parsed, ai_usage: result.usage ?? null })
      .eq("id", sheet.id);

    return json({ sheet_id: sheet.id, result: parsed, context });
  } catch (err) {
    console.error("read-match-sheet", err);
    return await fail("Error inesperado al leer la papeleta.", 500, String(err));
  }
});
