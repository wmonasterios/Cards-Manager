// GET /api/auth/google
// Inicia el flujo OAuth de Google: redirige al usuario a la pantalla de consentimiento
// pidiendo permiso de solo lectura sobre Gmail (nunca escribimos ni borramos correos).
import { google } from "googleapis";

export default function handler(req, res) {
  const { state } = req.query;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline", // necesario para recibir refresh_token y no reautenticar cada vez
    prompt: "consent",      // fuerza a Google a reemitir el refresh_token siempre
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    state: state || "",     // lleva el user_id de Supabase para asociar el token en el callback
  });

  res.writeHead(302, { Location: url });
  res.end();
}
