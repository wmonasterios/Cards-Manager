// GET /api/auth/callback/google?code=...
// Recibe el código de autorización de Google, lo cambia por tokens (access_token +
// refresh_token) y guarda el refresh_token en Supabase (tabla google_tokens) asociado
// al usuario logueado, para no tener que repetir el login cada vez que se use el botón
// "Actualizar desde Gmail".
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

// Cliente de Supabase con la service role key: este endpoint corre en el servidor
// (nunca en el navegador), así que puede escribir en la tabla sin pasar por RLS de usuario.
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    res.status(400).send("Falta el código de autorización de Google.");
    return;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
    );

    const { tokens } = await oauth2Client.getToken(code);

    // "state" lleva el user_id de Supabase (lo mandamos al armar la URL de login desde el
    // frontend) para saber a qué usuario de la app pertenece este token de Gmail.
    const userId = state;
    if (!userId) {
      res.status(400).send("Falta el identificador de usuario (state).");
      return;
    }

    if (tokens.refresh_token) {
      // Guarda o actualiza el refresh_token. Solo llega refresh_token la primera vez que
      // el usuario autoriza (o si se fuerza prompt=consent, como hacemos en /api/auth/google).
      await supabaseAdmin
        .from("google_tokens")
        .upsert(
          { user_id: userId, refresh_token: tokens.refresh_token, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    }

    // Redirige de vuelta a la app con un aviso de éxito.
    res.writeHead(302, { Location: "/?gmail=conectado" });
    res.end();
  } catch (err) {
    console.error("Error en callback de Google OAuth:", err);
    res.status(500).send("Error autenticando con Google. Intenta de nuevo.");
  }
}
