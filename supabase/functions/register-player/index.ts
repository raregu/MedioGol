import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RegisterPlayerRequest {
  full_name: string;
  rut: string;
  phone?: string;
  email?: string;
  base_team_id?: string;
}

function generatePassword(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, "").toUpperCase();
}

function generateEmailFromRut(rut: string): string {
  const cleaned = cleanRut(rut);
  return `${cleaned}@jugador.mediogol.cl`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // Admin client con service role key
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body: RegisterPlayerRequest = await req.json();
    const { full_name, rut, phone, email, base_team_id } = body;

    // Validaciones básicas
    if (!full_name || !rut) {
      return new Response(
        JSON.stringify({ error: "Nombre completo y RUT son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email && !phone) {
      return new Response(
        JSON.stringify({ error: "Se requiere al menos correo o teléfono" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedRut = cleanRut(rut);

    // Verificar si ya existe un perfil con ese RUT
    const { data: existingProfile } = await adminSupabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("rut", cleanedRut)
      .maybeSingle();

    if (existingProfile) {
      // Asegurar que existe en player_profiles también
      await adminSupabase.from("player_profiles").upsert({
        id: existingProfile.id,
        full_name: existingProfile.full_name || full_name,
      }, { onConflict: "id" });

      // Si el jugador ya existe, simplemente agregarlo al equipo si se proporciona base_team_id
      if (base_team_id) {
        // Verificar si ya está en el equipo
        const { data: existing } = await adminSupabase
          .from("base_team_players")
          .select("id")
          .eq("base_team_id", base_team_id)
          .eq("player_id", existingProfile.id)
          .maybeSingle();

        if (!existing) {
          await adminSupabase.from("base_team_players").insert({
            base_team_id,
            player_id: existingProfile.id,
            role: "player",
            status: "active",
            joined_at: new Date().toISOString(),
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          already_exists: true,
          player_id: existingProfile.id,
          full_name: existingProfile.full_name,
          message: "El jugador ya estaba registrado y fue agregado al equipo",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generar email y contraseña
    const playerEmail = email || generateEmailFromRut(cleanedRut);
    const password = generatePassword();
    const isGeneratedEmail = !email;

    // Intentar crear el usuario directamente; si ya existe, manejar el error
    let userId: string;

    const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
      email: playerEmail,
      password,
      email_confirm: true, // No requiere confirmación de email
      user_metadata: {
        full_name,
      },
    });

    if (createError) {
      // Si el email ya existe, buscar el usuario existente por email en profiles
      if (createError.message?.includes("already been registered") || createError.code === "email_exists") {
        const { data: existingByEmail } = await adminSupabase
          .from("profiles")
          .select("id")
          .eq("email", playerEmail)
          .maybeSingle();

        if (existingByEmail) {
          userId = existingByEmail.id;
        } else {
          throw new Error(`Error creando usuario: ${createError.message}`);
        }
      } else {
        throw new Error(`Error creando usuario: ${createError.message}`);
      }
    } else {
      if (!newUser.user) {
        throw new Error("No se pudo crear el usuario");
      }
      userId = newUser.user.id;
    }

    // Esperar brevemente para que el trigger de auth cree el perfil
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 1. Actualizar tabla profiles (perfil general)
    const { error: profileError } = await adminSupabase
      .from("profiles")
      .upsert({
        id: userId,
        full_name,
        rut: cleanedRut,
        phone: phone || null,
        email: email || null,
        role: "usuario",
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (profileError) {
      console.error("Profile upsert error:", profileError);
      // Si el trigger aún no creó el perfil, intentar insert directo
      await adminSupabase.from("profiles").insert({
        id: userId,
        full_name,
        rut: cleanedRut,
        phone: phone || null,
        email: email || null,
        role: "usuario",
      });
    }

    // 2. Crear registro en player_profiles (requerido por base_team_players FK)
    const { error: playerProfileError } = await adminSupabase
      .from("player_profiles")
      .upsert({
        id: userId,
        full_name,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (playerProfileError) {
      console.error("player_profiles upsert error:", playerProfileError);
      // Intentar insert si upsert falla
      const { error: ppInsertError } = await adminSupabase.from("player_profiles").insert({
        id: userId,
        full_name,
      });
      if (ppInsertError) {
        throw new Error(`No se pudo crear el perfil de jugador: ${ppInsertError.message}`);
      }
    }

    // Agregar al equipo base si se proporciona
    let teamAddError: string | null = null;
    if (base_team_id) {
      const { error: teamError } = await adminSupabase.from("base_team_players").insert({
        base_team_id,
        player_id: userId,
        role: "player",
        status: "active",
        joined_at: new Date().toISOString(),
      });

      if (teamError) {
        if (teamError.code === "23505") {
          // Ya estaba en el equipo, no es error
          console.log("Player already in team, skipping");
        } else {
          console.error("Error adding to team:", JSON.stringify(teamError));
          teamAddError = teamError.message;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        player_id: userId,
        full_name,
        generated_email: isGeneratedEmail ? playerEmail : null,
        real_email: email || null,
        password,
        rut: cleanedRut,
        team_add_error: teamAddError,
        message: teamAddError
          ? `Jugador creado pero no se pudo agregar al equipo: ${teamAddError}`
          : "Jugador registrado exitosamente",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in register-player:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
