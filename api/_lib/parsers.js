// Parsers de estados de cuenta en PDF, traducidos 1:1 desde el script Python
// (_extraer_datos.py) que el usuario ya validó con años de estados de cuenta reales.
// Cada parser recibe el texto plano ya extraído del PDF (via pdf-parse) y devuelve
// los campos que la app necesita para autocompletar una tarjeta: fecha de corte,
// saldo, pago mínimo, pago de contado (si aplica) y las fechas límite de pago.

// "1,234.56", "(400.00)", "95.00-" -> float. Paréntesis o sufijo "-" = negativo.
function parseAmount(s) {
  if (!s) return 0;
  s = s.trim();
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    neg = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  s = s.replace(/\$/g, "").replace(/,/g, "").trim();
  const v = parseFloat(s);
  if (Number.isNaN(v)) return 0;
  return neg ? -v : v;
}

// "18/03/2026" -> "2026-03-18"
function isoFromDDMMYYYY(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || "").trim());
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

// "20/JUL/2026" -> "2026-07-20"
const MESES_ES = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
};
function isoFromDDMESYYYY(s) {
  const m = /^(\d{1,2})\/([A-ZÁÉÍÓÚ]{3})\/(\d{4})$/i.exec((s || "").trim());
  if (!m) return "";
  const [, d, mesAbbr, y] = m;
  const mo = MESES_ES[mesAbbr.toUpperCase()];
  if (!mo) return "";
  return `${y}-${mo}-${d.padStart(2, "0")}`;
}

// "05/07/26" -> "2026-07-05" (asume siglo 20XX)
function isoFromDDMMYY(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec((s || "").trim());
  if (!m) return "";
  const [, d, mo, y] = m;
  const year = parseInt(y, 10) <= 70 ? `20${y}` : `19${y}`;
  return `${year}-${mo}-${d}`;
}

/* ─────────────────────────── Parser BAC ─────────────────────────── */
// Formato "RESUMEN DE ESTADO DE CUENTA": Saldo, Pago Mínimo, Pago de Contado,
// Fecha Límite de Pago de Contado, Fecha Límite de Pago, Fecha de Corte.
function parseBAC(text) {
  const out = { banco: "bac" };

  let m = /Fecha de Corte\s+(\d{2}\/\d{2}\/\d{4})/.exec(text);
  if (m) out.fecha_corte = isoFromDDMMYYYY(m[1]);

  m = /Saldo\s+\$([\d,]+\.\d{2}-?)/.exec(text);
  if (m) out.saldo = parseAmount(m[1]);

  m = /Pago\s*M[íi]nimo\s+\$([\d,]+\.\d{2})/.exec(text);
  if (m) out.pago_minimo = parseAmount(m[1]);

  m = /Pago de Contado\s+\$([\d,]+\.\d{2})/.exec(text);
  if (m) out.pago_contado = parseAmount(m[1]);

  m = /Fecha L[íi]mite de Pago de Contado\s+(\d{1,2}\/[A-ZÁÉÍÓÚ]{3}\/\d{4})/i.exec(text);
  if (m) out.fecha_pago_contado = isoFromDDMESYYYY(m[1]);

  m = /Fecha L[íi]mite de Pago\s+(\d{1,2}\/[A-ZÁÉÍÓÚ]{3}\/\d{4})/i.exec(text);
  if (m) out.fecha_pago_minimo = isoFromDDMESYYYY(m[1]);

  m = /L[íi]mite\s+\$([\d,]+\.\d{2})/.exec(text);
  if (m) out.limite = parseAmount(m[1]);

  m = /Producto\s+(.+?)(?:\s+Pago M[íi]nimo|\s*$)/m.exec(text);
  if (m) out.producto = m[1].trim();

  return out;
}

/* ─────────────────────────── Parser Banco Aliado ─────────────────────────── */
// Formato: "FECHA DE CORTE PAGAR ANTES DE" seguido de las dos fechas en la línea
// siguiente. "SALDO AL CORTE PAGO MINIMO" seguido de los dos montos.
function parseAliado(text) {
  const out = { banco: "aliado" };

  let m = /FECHA DE CORTE\s+PAGAR ANTES DE\s*\n\s*(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})/.exec(text);
  if (m) {
    out.fecha_corte = isoFromDDMMYY(m[1]);
    // Aliado no distingue pago de contado vs mínimo: una sola fecha límite.
    out.fecha_pago_minimo = isoFromDDMMYY(m[2]);
    out.fecha_pago_contado = isoFromDDMMYY(m[2]);
  }

  m = /SALDO AL CORTE\s+PAGO MINIMO\s*\n\s*\$([\d,]+\.\d{2}-?)\s+\$([\d,]+\.\d{2})/.exec(text);
  if (m) {
    out.saldo = parseAmount(m[1]);
    out.pago_minimo = parseAmount(m[2]);
    out.pago_contado = parseAmount(m[1]); // Aliado no ofrece descuento por pago de contado
  }

  m = /LIMITE DE CREDITO\s+CREDITO DISPONIBLE\s*\n\s*\$([\d,]+\.\d{2})/.exec(text);
  if (m) out.limite = parseAmount(m[1]);

  m = /^(VISA[^\n]+|MASTERCARD[^\n]+|AMERICAN EXPRESS[^\n]+)$/m.exec(text);
  if (m) out.producto = m[1].trim();

  return out;
}

/* ─────────────────────────── Parser Scotiabank / Davivienda ─────────────────────────── */
// Mismo formato en ambos bancos. No siempre distinguen pago de contado del mínimo
// (suelen tener una sola fecha límite de pago), así que usamos la misma fecha para ambos
// cuando no hay una segunda fecha explícita.
function parseScotiaDavivienda(text, banco) {
  const out = { banco };

  let m = /Fecha de corte Actual\s*:\s*(\d{2}\/\d{2}\/\d{4})/.exec(text);
  if (m) out.fecha_corte = isoFromDDMMYYYY(m[1]);

  m = /Saldo Actual\s+([\d,]+\.\d{2}-?)/.exec(text);
  if (m) out.saldo = parseAmount(m[1]);

  m = /Pago\s*M[íi]nimo\s+([\d,]+\.\d{2})/.exec(text);
  if (m) out.pago_minimo = parseAmount(m[1]);

  m = /Pagar antes de\s+(\d{2}\/\d{2}\/\d{4})/.exec(text);
  if (m) {
    const fecha = isoFromDDMMYYYY(m[1]);
    out.fecha_pago_minimo = fecha;
    out.fecha_pago_contado = fecha;
    out.pago_contado = out.saldo; // sin distinción de pronto pago en este formato
  }

  m = /L[íi]mite de Cr[eé]dito\s+([\d,]+\.\d{2})/.exec(text);
  if (m) out.limite = parseAmount(m[1]);

  m = /^(VISA[^\n]*?|MASTERCARD[^\n]*?|AMEX[^\n]*?|AMERICAN EXPRESS[^\n]*?|DORADA[^\n]*?|BLUE[^\n]*?)(?:\s+Fecha de corte|$)/m.exec(text);
  if (m) out.producto = m[1].trim();

  return out;
}

/* ─────────────────────────── Orquestador ─────────────────────────── */
// banco: "bac" | "aliado" | "davivienda" | "scotiabank"
export function parseEstadoCuenta(text, banco) {
  if (banco === "bac") return parseBAC(text);
  if (banco === "aliado") return parseAliado(text);
  if (banco === "davivienda" || banco === "scotiabank") return parseScotiaDavivienda(text, banco);
  return { banco, error: `Banco no soportado: ${banco}` };
}
