import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend@3.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InvitationRequest {
  email: string;
  teamName: string;
  championshipName: string;
  championshipId: string;
  message?: string;
  invitationToken: string;
}

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { email, teamName, championshipName, championshipId, message, invitationToken }: InvitationRequest = await req.json();

    if (!email || !teamName || !championshipName || !invitationToken) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({
          error: "Email service not configured. Please contact the administrator.",
          details: "RESEND_API_KEY is missing"
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const invitationUrl = `${req.headers.get('origin') || 'http://localhost:5173'}/accept-invitation/${invitationToken}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(to right, #10b981, #14b8a6); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0;">Invitación de Equipo</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1f2937; margin-top: 0;">Invitación para registrar equipo</h2>
            <p style="font-size: 16px; color: #4b5563;">
              Has sido invitado a registrar el equipo <strong style="color: #10b981;">${teamName}</strong>
              en el campeonato <strong style="color: #10b981;">${championshipName}</strong>.
            </p>
            ${message ? `
              <div style="background: #e0f2fe; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #075985;"><strong>Mensaje del administrador:</strong></p>
                <p style="margin: 10px 0 0 0; color: #0c4a6e;">${message}</p>
              </div>
            ` : ''}
            <p style="font-size: 16px; color: #4b5563;">
              Para aceptar esta invitación y crear tu equipo, haz clic en el siguiente botón:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${invitationUrl}"
                 style="background-color: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
                Aceptar Invitación
              </a>
            </div>
            <p style="font-size: 14px; color: #6b7280;">
              O copia y pega este enlace en tu navegador:
            </p>
            <p style="background: white; padding: 12px; border-radius: 4px; word-break: break-all; font-size: 13px; color: #3b82f6; border: 1px solid #e5e7eb;">
              ${invitationUrl}
            </p>
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 20px; border-radius: 4px;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                ⏰ Esta invitación expirará en 7 días.
              </p>
            </div>
          </div>
          <div style="text-align: center; padding: 20px; font-size: 12px; color: #9ca3af;">
            <p>Si no esperabas este correo, puedes ignorarlo de forma segura.</p>
          </div>
        </body>
      </html>
    `;

    const resend = new Resend(RESEND_API_KEY);

    const result = await resend.emails.send({
      from: "Campeonatos <onboarding@resend.dev>",
      to: [email],
      subject: `Invitación: Registra tu equipo "${teamName}" en ${championshipName}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", result);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation email sent successfully",
        invitationUrl,
        emailId: result.data?.id,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error sending invitation:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
        details: error.toString()
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
