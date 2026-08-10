// POST /api/actualizar-estado
// Body: { userId, banco }  (banco: "bac" | "aliado" | "davivienda" | "scotiabank")
//
// Flujo: toma el refresh_token de Gmail guardado para ese usuario, busca el correo más
// reciente de estado de cuenta de ese banco, descarga el PDF adjunto, extrae el texto y
// lo parsea con la lógica de api/_lib/parsers.js. Devuelve los datos listos para
// autocompletar el formulario de la tarjeta — no escribe nada en Supabase directamente,
// el usuario confirma en la UI antes de guardar.
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";
import { parseEstadoCuenta } from "./_lib/parsers.js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Remitente y texto de asunto/cuerpo típico de cada banco, usado para buscar en Gmail.
const CONFIG_BANCO = {
  bac: { query: 'from:(pa.baccredomatic.net) subject:("Estado de Cuenta")', filenameHint: "EstadoCta" },
  aliado: { query: 'from:(bancoaliado.com) subject:("Estado de Cuenta")', filenameHint: "" },
  davivienda: { query: 'from:(estados.davivienda.com.pa) subject:("Estado de cuenta")', filenameHint: "" },
  scotiabank: { query: 'from:(scotiabank.com) subject:("Estado de cuenta")', filenameHint: "" },
};

function b64urlToBuffer(data) {
  return Buffer.from(data, "base64");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { userId, banco } = req.body || {};
  if (!userId || !banco) {
    res.status(400).json({ error: "Faltan userId o banco" });
    return;
  }
  const config = CONFIG_BANCO[banco];
  if (!config) {
    res.status(400).json({ error: `Banco no soportado: ${banco}` });
    return;
  }

  try {
    // 1. Recuperar el refresh_token guardado para este usuario.
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from("google_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      res.status(401).json({ error: "no_conectado", message: "Gmail no está conectado todavía." });
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
    );
    oauth2Client.setCredentials({ refresh_token: tokenRow.refresh_token });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // 2. Buscar el correo más reciente que matchee el banco.
    const searchRes = await gmail.users.messages.list({
      userId: "me",
      q: `${config.query} has:attachment newer_than:2m`,
      maxResults: 5,
    });

    const messages = searchRes.data.messages || [];
    if (messages.length === 0) {
      res.status(404).json({ error: "sin_correo", message: `No se encontró un estado de cuenta reciente de ${banco}.` });
      return;
    }

    // Los resultados de Gmail vienen ordenados del más reciente al más antiguo.
    const message = await gmail.users.messages.get({ userId: "me", id: messages[0].id, format: "full" });

    // 3. Encontrar el adjunto PDF dentro del mensaje.
    const parts = message.data.payload?.parts || [];
    const pdfPart = parts.find(
      (p) => p.filename && p.filename.toLowerCase().endsWith(".pdf") && p.body?.attachmentId
    );
    if (!pdfPart) {
      res.status(404).json({ error: "sin_pdf", message: "El correo encontrado no tiene un PDF adjunto." });
      return;
    }

    const attachment = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: message.data.id,
      id: pdfPart.body.attachmentId,
    });

    const pdfBuffer = b64urlToBuffer(attachment.data.data.replace(/-/g, "+").replace(/_/g, "/"));

    // 4. Extraer texto del PDF y parsear según el banco.
    const { text } = await pdfParse(pdfBuffer);
    const datos = parseEstadoCuenta(text, banco);

    res.status(200).json({ ok: true, datos, mensajeId: message.data.id });
  } catch (err) {
    console.error("Error en /api/actualizar-estado:", err);
    res.status(500).json({ error: "error_interno", message: String(err?.message || err) });
  }
}
