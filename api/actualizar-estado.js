// POST /api/actualizar-estado
// Body: { userId, banco, ultimos4? }  (banco: "bac" | "aliado" | "davivienda" | "scotiabank")
//
// Flujo: toma el refresh_token de Gmail guardado para ese usuario, busca varios correos
// recientes de estado de cuenta de ese banco (porque puede haber más de una tarjeta del
// mismo banco), descarga y parsea el PDF de cada uno, y elige el que corresponda a la
// tarjeta pedida — matcheando por los últimos 4 dígitos si se proporcionaron. Devuelve los
// datos listos para autocompletar el formulario; no escribe nada en Supabase directamente,
// el usuario confirma en la UI antes de guardar.
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";
import { parseEstadoCuenta } from "./_lib/parsers.js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Remitente y texto de asunto típico de cada banco, usado para buscar en Gmail.
const CONFIG_BANCO = {
  bac: { query: 'from:(pa.baccredomatic.net) subject:("Estado de Cuenta")' },
  aliado: { query: 'from:(bancoaliado.com) subject:("Estado de Cuenta")' },
  davivienda: { query: 'from:(estados.davivienda.com.pa) subject:("Estado de cuenta")' },
  scotiabank: { query: 'from:(scotiabank.com) subject:("Estado de cuenta")' },
};

function b64urlToBuffer(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Encuentra el primer adjunto .pdf dentro de un mensaje de Gmail (recorre subpartes,
// porque algunos correos anidan el adjunto dentro de un multipart/mixed).
function encontrarAdjuntoPDF(payload) {
  const partes = payload?.parts || [];
  for (const p of partes) {
    if (p.filename && p.filename.toLowerCase().endsWith(".pdf") && p.body?.attachmentId) {
      return p;
    }
    if (p.parts) {
      const anidado = encontrarAdjuntoPDF(p);
      if (anidado) return anidado;
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { userId, banco, ultimos4 } = req.body || {};
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

    // 2. Buscar varios correos recientes del banco (puede haber más de una tarjeta).
    const searchRes = await gmail.users.messages.list({
      userId: "me",
      q: `${config.query} has:attachment newer_than:2m`,
      maxResults: 8,
    });

    const messages = searchRes.data.messages || [];
    if (messages.length === 0) {
      res.status(404).json({ error: "sin_correo", message: `No se encontró un estado de cuenta reciente de ${banco}.` });
      return;
    }

    // 3. Descargar y parsear cada correo hasta encontrar el que matchea los últimos 4
    // dígitos pedidos. Si no se pidieron dígitos (tarjeta sin configurar), nos quedamos
    // con el primero (el más reciente) tal como antes.
    const digitosLimpios = (ultimos4 || "").replace(/\D/g, "").slice(-4);
    let elegido = null;
    let candidatosVistos = 0;

    for (const m of messages) {
      const message = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });
      const pdfPart = encontrarAdjuntoPDF(message.data.payload);
      if (!pdfPart) continue;

      const attachment = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: message.data.id,
        id: pdfPart.body.attachmentId,
      });
      const pdfBuffer = b64urlToBuffer(attachment.data.data);
      const { text } = await pdfParse(pdfBuffer);
      const datos = parseEstadoCuenta(text, banco);

      candidatosVistos++;

      if (!digitosLimpios) {
        elegido = datos; // sin dígitos pedidos: nos quedamos con el primer correo válido
        break;
      }
      if (datos.ultimos_4 === digitosLimpios) {
        elegido = datos;
        break;
      }
    }

    if (!elegido) {
      if (digitosLimpios) {
        res.status(404).json({
          error: "sin_match",
          message: `Se revisaron ${candidatosVistos} correos de ${banco} pero ninguno coincide con los últimos 4 dígitos ${digitosLimpios}. Verifica el dato o que el estado de cuenta haya llegado.`,
        });
      } else {
        res.status(404).json({ error: "sin_pdf", message: "No se encontró un PDF legible en los correos recientes." });
      }
      return;
    }

    res.status(200).json({ ok: true, datos: elegido });
  } catch (err) {
    console.error("Error en /api/actualizar-estado:", err);
    res.status(500).json({ error: "error_interno", message: String(err?.message || err) });
  }
}
