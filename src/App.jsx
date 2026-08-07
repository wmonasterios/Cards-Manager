import React, { useEffect, useMemo, useRef, useState } from "react";

/* ─────────────────────────── Paleta y tipografía ─────────────────────────── */
const C = {
  paper: "#E9E4DA",
  card: "#FCFAF6",
  ink: "#26221E",
  soft: "#7B7268",
  line: "#DBD4C7",
  jade: "#0F5C56",
  jadeSoft: "#E0EBE9",
  plum: "#7A4B5E",
  red: "#B0261C",
  redSoft: "#F8E3E0",
  amber: "#9C6300",
  amberSoft: "#F7EBD6",
  green: "#3D6A48",
  greenSoft: "#E4EDE4",
};
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = '"Avenir Next", "Segoe UI", Roboto, system-ui, -apple-system, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/* ─────────────────────────── Utilidades de fecha ─────────────────────────── */
const MS = 86400000;
const hoyFn = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const diffDias = (a, b) => Math.round((a - b) / MS);
const diaEnMes = (y, m, dia) => {
  const ultimo = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(dia, ultimo));
};
/** Primera ocurrencia de ese día del mes estrictamente después de `desde`. */
const sigOcurrencia = (dia, desde) => {
  let d = diaEnMes(desde.getFullYear(), desde.getMonth(), dia);
  if (d <= desde) d = diaEnMes(desde.getFullYear(), desde.getMonth() + 1, dia);
  return d;
};
/** Última ocurrencia de ese día del mes en o antes de `desde`. */
const ultOcurrencia = (dia, desde) => {
  let d = diaEnMes(desde.getFullYear(), desde.getMonth(), dia);
  if (d > desde) d = diaEnMes(desde.getFullYear(), desde.getMonth() - 1, dia);
  return d;
};
const iso = (d) => d.toISOString().slice(0, 10);
const fmtFecha = (d) =>
  d.toLocaleDateString("es-PA", { day: "numeric", month: "short" }).replace(".", "");
const fmtFechaLarga = (d) =>
  d.toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" });
const esFinDeSemana = (d) => d.getDay() === 0 || d.getDay() === 6;

const num = (v) => (typeof v === "number" ? v : parseFloat(v) || 0);
const money = (n) =>
  "$" + num(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─────────────────────────── Almacenamiento ─────────────────────────── */
const LLAVE = "tarjetas-credito:v1";

/** Comprueba de verdad si se puede escribir, no solo si el objeto existe. */
async function probarAlmacenamiento() {
  try {
    if (typeof window === "undefined" || !window.storage) return false;
    await window.storage.set(LLAVE + ":prueba", "1");
    return true;
  } catch {
    return false;
  }
}
async function cargar() {
  try {
    if (typeof window === "undefined" || !window.storage) return null;
    const r = await window.storage.get(LLAVE);
    return r && r.value ? JSON.parse(r.value) : null;
  } catch {
    return null; // la llave todavía no existe
  }
}
/** Devuelve true si de verdad guardó. */
async function guardar(datos) {
  try {
    if (typeof window === "undefined" || !window.storage) return false;
    const r = await window.storage.set(LLAVE, JSON.stringify(datos));
    return r !== null && r !== undefined;
  } catch {
    return false;
  }
}

/* ─────────────────────────── Datos de ejemplo ─────────────────────────── */
const EJEMPLOS = [
  {
    id: "ej1",
    nombre: "Visa Infinite",
    banco: "Banco General",
    diaCorte: 15,
    diaContado: 5,
    diaMinimo: 10,
    saldo: 1842.6,
    minimo: 92.13,
    consumo: 310.4,
    limite: 12000,
    tasa: 22.9,
    pagadoHasta: null,
    nota: "Millas 2x en restaurantes",
    ejemplo: true,
  },
  {
    id: "ej2",
    nombre: "Mastercard Black",
    banco: "BAC Credomatic",
    diaCorte: 25,
    diaContado: 15,
    diaMinimo: 20,
    saldo: 640.25,
    minimo: 38,
    consumo: 0,
    limite: 8000,
    tasa: 24.5,
    pagadoHasta: null,
    nota: "",
    ejemplo: true,
  },
  {
    id: "ej3",
    nombre: "Amex Gold",
    banco: "Banistmo",
    diaCorte: 2,
    diaContado: 22,
    diaMinimo: 27,
    saldo: 415.8,
    minimo: 25,
    consumo: 155,
    limite: 6000,
    tasa: 25.9,
    pagadoHasta: null,
    nota: "Cashback gasolina",
    ejemplo: true,
  },
];

const nuevaTarjeta = () => ({
  id: "t" + Date.now() + Math.random().toString(36).slice(2, 6),
  nombre: "Tarjeta nueva",
  banco: "",
  diaCorte: 1,
  diaContado: 20,
  diaMinimo: 20,
  saldo: 0,
  minimo: 0,
  consumo: 0,
  limite: 0,
  tasa: 0,
  pagadoHasta: null,
  nota: "",
  ejemplo: false,
});

/* ─────────────────────────── Cálculos del ciclo ─────────────────────────── */
function calcular(t, hoy) {
  const corte = Math.min(Math.max(parseInt(t.diaCorte) || 1, 1), 31);
  const dContado = Math.min(Math.max(parseInt(t.diaContado) || 1, 1), 31);
  const dMinimo = Math.min(Math.max(parseInt(t.diaMinimo) || dContado, 1), 31);

  const ultimoCorte = ultOcurrencia(corte, hoy);
  const proximoCorte = sigOcurrencia(corte, hoy);
  const venceContado = sigOcurrencia(dContado, ultimoCorte);
  const venceMinimo = sigOcurrencia(dMinimo, ultimoCorte);

  const diasContado = diffDias(venceContado, hoy);
  const diasMinimo = diffDias(venceMinimo, hoy);
  const diasCorte = diffDias(proximoCorte, hoy);

  // Una compra de hoy cae en el corte que viene y se paga en el vencimiento siguiente.
  const venceCompraHoy = sigOcurrencia(dContado, proximoCorte);
  const flotanteHoy = diffDias(venceCompraHoy, hoy);
  // El flotante máximo se logra comprando el día después del corte.
  const flotanteMax = diffDias(venceCompraHoy, proximoCorte) + diffDias(proximoCorte, ultimoCorte) - 1;
  const mejorDiaCompra = new Date(proximoCorte.getTime() + MS);

  const pagado = t.pagadoHasta === iso(ultimoCorte);
  const saldo = num(t.saldo);
  const pendiente = pagado ? 0 : saldo;

  let estado = "gracia";
  if (pagado) estado = "pagado";
  else if (saldo <= 0) estado = "sinsaldo";
  else if (diasContado < 0 && diasMinimo < 0) estado = "vencida";
  else if (diasContado < 0) estado = "solominimo";
  else if (diasContado <= 3) estado = "urgente";
  else if (diasContado <= 7) estado = "pronto";

  const nivel =
    estado === "vencida" || estado === "urgente" || estado === "solominimo"
      ? "rojo"
      : estado === "pronto"
      ? "ambar"
      : "normal";

  const limite = num(t.limite);
  const usado = saldo + num(t.consumo);
  const utilizacion = limite > 0 ? (usado / limite) * 100 : null;
  const disponible = limite > 0 ? Math.max(limite - usado, 0) : null;
  const proyeccionCorte = num(t.consumo);
  // Costo aproximado de pagar solo el mínimo un mes.
  const costoMinimo = Math.max(saldo - num(t.minimo), 0) * (num(t.tasa) / 100 / 12);

  const ventana = Math.max(diffDias(venceContado, ultimoCorte), 1);
  const avance = Math.min(Math.max(diffDias(hoy, ultimoCorte) / ventana, 0), 1);
  const marcaMinimo = diffDias(venceMinimo, ultimoCorte) / ventana;

  return {
    ultimoCorte, proximoCorte, venceContado, venceMinimo, diasContado, diasMinimo,
    diasCorte, venceCompraHoy, flotanteHoy, flotanteMax, mejorDiaCompra, pagado,
    pendiente, estado, nivel, utilizacion, disponible, proyeccionCorte, costoMinimo,
    avance, marcaMinimo, saldo,
  };
}

const ETIQUETA = {
  pagado: "Pagada este ciclo",
  sinsaldo: "Sin saldo",
  gracia: "En periodo de gracia",
  pronto: "Vence pronto",
  urgente: "Paga ya",
  solominimo: "Solo queda el mínimo",
  vencida: "Vencida",
};

/* ─────────────────────────── Piezas de UI ─────────────────────────── */
function Chip({ nivel, children }) {
  const map = {
    rojo: { bg: C.redSoft, fg: C.red },
    ambar: { bg: C.amberSoft, fg: C.amber },
    verde: { bg: C.greenSoft, fg: C.green },
    normal: { bg: C.jadeSoft, fg: C.jade },
  };
  const s = map[nivel] || map.normal;
  return (
    <span
      style={{
        background: s.bg, color: s.fg, fontFamily: SANS, fontSize: 12, fontWeight: 600,
        letterSpacing: 0.2, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Campo({ etiqueta, valor, onChange, tipo = "text", ancho = "1 1 140px", sufijo }) {
  return (
    <label style={{ flex: ancho, display: "block" }}>
      <span
        style={{
          display: "block", fontFamily: SANS, fontSize: 11, letterSpacing: 0.6,
          textTransform: "uppercase", color: C.soft, marginBottom: 6,
        }}
      >
        {etiqueta}
      </span>
      <span style={{ position: "relative", display: "block" }}>
        <input
          className="tj-input"
          type={tipo}
          inputMode={tipo === "number" ? "decimal" : undefined}
          value={valor === null || valor === undefined ? "" : valor}
          onChange={(e) => onChange(tipo === "number" ? e.target.value : e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", padding: "12px 14px",
            paddingRight: sufijo ? 34 : 14, borderRadius: 10, border: `1px solid ${C.line}`,
            background: "#fff", color: C.ink, fontFamily: tipo === "number" ? MONO : SANS,
            fontSize: 16,
          }}
        />
        {sufijo && (
          <span
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              fontFamily: MONO, fontSize: 13, color: C.soft,
            }}
          >
            {sufijo}
          </span>
        )}
      </span>
    </label>
  );
}

function Boton({ children, onClick, variante = "suave", ...resto }) {
  const estilos = {
    solido: { background: C.jade, color: "#fff", border: `1px solid ${C.jade}` },
    suave: { background: "#fff", color: C.ink, border: `1px solid ${C.line}` },
    peligro: { background: "#fff", color: C.red, border: `1px solid ${C.redSoft}` },
    fantasma: { background: "transparent", color: C.soft, border: "1px solid transparent" },
  }[variante];
  return (
    <button
      className="tj-btn"
      onClick={onClick}
      style={{
        ...estilos, fontFamily: SANS, fontSize: 14, fontWeight: 600, padding: "11px 16px",
        borderRadius: 10, cursor: "pointer", minHeight: 44,
      }}
      {...resto}
    >
      {children}
    </button>
  );
}

/** La firma visual: la ventana de pago dibujada del corte al vencimiento. */
function Ventana({ c }) {
  const color = c.nivel === "rojo" ? C.red : c.nivel === "ambar" ? C.amber : C.jade;
  const pagado = c.pagado || c.saldo <= 0;
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          position: "relative", height: 8, borderRadius: 999,
          background: pagado ? C.greenSoft : "#EFE9DE", overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${(pagado ? 1 : c.avance) * 100}%`,
            background: pagado ? C.green : color, borderRadius: 999, opacity: pagado ? 0.5 : 0.85,
          }}
        />
        {c.marcaMinimo > 1 && (
          <span
            style={{
              position: "absolute", left: "100%", top: -3, width: 2, height: 14,
              background: C.line, transform: "translateX(6px)",
            }}
          />
        )}
        {!pagado && (
          <span
            style={{
              position: "absolute", left: `${c.avance * 100}%`, top: -4, width: 16, height: 16,
              marginLeft: -8, borderRadius: 999, background: "#fff", border: `3px solid ${color}`,
            }}
          />
        )}
      </div>
      <div
        style={{
          display: "flex", justifyContent: "space-between", marginTop: 8,
          fontFamily: MONO, fontSize: 11.5, color: C.soft,
        }}
      >
        <span>Corte {fmtFecha(c.ultimoCorte)}</span>
        <span style={{ color: pagado ? C.green : color, fontWeight: 600 }}>
          Paga de contado {fmtFecha(c.venceContado)}
        </span>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, color }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: 120 }}>
      <div
        style={{
          fontFamily: SANS, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase",
          color: C.soft, marginBottom: 4,
        }}
      >
        {etiqueta}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 15, color: color || C.ink }}>{valor}</div>
    </div>
  );
}

/* ─────────────────────────── Fila de tarjeta ─────────────────────────── */
function Tarjeta({ t, c, abierta, onAbrir, onCambio, onBorrar, onPagar }) {
  const [confirmando, setConfirmando] = useState(false);
  const borde = c.nivel === "rojo" ? C.red : c.nivel === "ambar" ? C.amber : c.pagado ? C.green : C.line;
  const set = (campo) => (v) => onCambio({ ...t, [campo]: v });

  const frase =
    c.estado === "pagado"
      ? "Ya la pagaste. El próximo corte es el " + fmtFecha(c.proximoCorte) + "."
      : c.estado === "sinsaldo"
      ? "Nada que pagar en este estado de cuenta."
      : c.estado === "vencida"
      ? "Se pasó la fecha. Paga hoy mismo para frenar intereses y recargos."
      : c.estado === "solominimo"
      ? `Ya pasó el pago de contado. El mínimo vence ${c.diasMinimo === 0 ? "hoy" : "en " + c.diasMinimo + " días"}.`
      : c.diasContado === 0
      ? "Vence hoy. Este es el día de pagar."
      : `Págala el ${fmtFecha(c.venceContado)} — faltan ${c.diasContado} días. Antes de eso, el dinero rinde más en tu cuenta.`;

  return (
    <article
      style={{
        background: C.card, borderRadius: 16, border: `1px solid ${C.line}`,
        borderLeft: `5px solid ${borde}`, marginBottom: 14, overflow: "hidden",
      }}
    >
      <div
        className="tj-fila"
        role="button"
        tabIndex={0}
        onClick={onAbrir}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir())}
        style={{ padding: "18px 18px 16px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 21, color: C.ink, lineHeight: 1.2 }}>
              {t.nombre || "Sin nombre"}
            </h3>
            <div style={{ fontFamily: SANS, fontSize: 13, color: C.soft, marginTop: 3 }}>
              {t.banco || "Banco sin definir"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: MONO, fontSize: 22, color: c.pagado ? C.soft : C.ink }}>
              {money(c.saldo)}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: C.soft, marginTop: 2 }}>
              mín {money(t.minimo)} · {fmtFecha(c.venceMinimo)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <Chip nivel={c.pagado ? "verde" : c.nivel}>{ETIQUETA[c.estado]}</Chip>
        </div>

        <Ventana c={c} />

        <p style={{ margin: "12px 0 0", fontFamily: SANS, fontSize: 14.5, lineHeight: 1.5, color: C.ink }}>
          {frase}
        </p>
        {!c.pagado && esFinDeSemana(c.venceContado) && c.diasContado >= 0 && (
          <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: 13, color: C.amber }}>
            Ojo: cae {c.venceContado.getDay() === 6 ? "sábado" : "domingo"}. Paga el día hábil anterior.
          </p>
        )}
        <div style={{ marginTop: 10, fontFamily: SANS, fontSize: 12.5, color: C.soft }}>
          {abierta ? "Toca para cerrar" : "Toca para editar y ver el detalle"}
        </div>
      </div>

      {abierta && (
        <div style={{ padding: "4px 18px 20px", borderTop: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            <Campo etiqueta="Nombre" valor={t.nombre} onChange={set("nombre")} ancho="2 1 200px" />
            <Campo etiqueta="Banco" valor={t.banco} onChange={set("banco")} ancho="1 1 160px" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
            <Campo etiqueta="Día de corte" valor={t.diaCorte} onChange={set("diaCorte")} tipo="number" />
            <Campo etiqueta="Día pago de contado" valor={t.diaContado} onChange={set("diaContado")} tipo="number" />
            <Campo etiqueta="Día pago mínimo" valor={t.diaMinimo} onChange={set("diaMinimo")} tipo="number" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
            <Campo etiqueta="Saldo del estado" valor={t.saldo} onChange={set("saldo")} tipo="number" sufijo="$" />
            <Campo etiqueta="Pago mínimo" valor={t.minimo} onChange={set("minimo")} tipo="number" sufijo="$" />
            <Campo etiqueta="Consumo desde el corte" valor={t.consumo} onChange={set("consumo")} tipo="number" sufijo="$" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
            <Campo etiqueta="Límite" valor={t.limite} onChange={set("limite")} tipo="number" sufijo="$" />
            <Campo etiqueta="Tasa anual" valor={t.tasa} onChange={set("tasa")} tipo="number" sufijo="%" />
            <Campo etiqueta="Nota" valor={t.nota} onChange={set("nota")} ancho="2 1 200px" />
          </div>

          <div
            style={{
              display: "flex", flexWrap: "wrap", gap: 18, marginTop: 22, padding: "16px 0 0",
              borderTop: `1px dashed ${C.line}`,
            }}
          >
            <Dato etiqueta="Próximo corte" valor={fmtFecha(c.proximoCorte) + ` · ${c.diasCorte}d`} />
            <Dato
              etiqueta="Si compras hoy"
              valor={`pagas el ${fmtFecha(c.venceCompraHoy)} · ${c.flotanteHoy}d`}
            />
            <Dato
              etiqueta="Flotante máximo"
              valor={`${c.flotanteMax}d comprando el ${fmtFecha(c.mejorDiaCompra)}`}
              color={C.jade}
            />
            <Dato
              etiqueta="Va el próximo estado"
              valor={money(c.proyeccionCorte)}
            />
            <Dato
              etiqueta="Utilización"
              valor={c.utilizacion === null ? "—" : c.utilizacion.toFixed(0) + "%"}
              color={c.utilizacion !== null && c.utilizacion > 30 ? C.amber : C.ink}
            />
            <Dato etiqueta="Disponible" valor={c.disponible === null ? "—" : money(c.disponible)} />
            {c.costoMinimo > 0 && (
              <Dato
                etiqueta="Si pagas solo el mínimo"
                valor={"≈ " + money(c.costoMinimo) + " de interés al mes"}
                color={C.red}
              />
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
            <Boton variante={c.pagado ? "suave" : "solido"} onClick={onPagar}>
              {c.pagado ? "Marcar como no pagada" : "Marcar como pagada"}
            </Boton>
            {confirmando ? (
              <>
                <Boton variante="peligro" onClick={onBorrar}>Sí, eliminar</Boton>
                <Boton variante="fantasma" onClick={() => setConfirmando(false)}>Cancelar</Boton>
              </>
            ) : (
              <Boton variante="fantasma" onClick={() => setConfirmando(true)}>Eliminar tarjeta</Boton>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────── App ─────────────────────────── */
export default function GestorTarjetas() {
  const [tarjetas, setTarjetas] = useState(EJEMPLOS);
  const [listo, setListo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [orden, setOrden] = useState("vencimiento");
  const [abierta, setAbierta] = useState(null);
  const [aviso, setAviso] = useState("");
  const [modo, setModo] = useState("cargando"); // cargando | activo | nodisponible
  const [ultimoGuardado, setUltimoGuardado] = useState(null);
  const [sinGuardar, setSinGuardar] = useState(false);
  const [respaldo, setRespaldo] = useState("");
  const primera = useRef(true);
  const temporizador = useRef(null);
  const hoy = useMemo(() => hoyFn(), []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const puede = await probarAlmacenamiento();
      const d = await cargar();
      if (!vivo) return;
      if (Array.isArray(d)) setTarjetas(d); // respeta también una lista vacía
      setModo(puede ? "activo" : "nodisponible");
      setListo(true);
    })();
    return () => { vivo = false; };
  }, []);

  // Guardado automático con pausa: espera a que dejes de escribir.
  useEffect(() => {
    if (!listo) return;
    if (primera.current) { primera.current = false; return; }
    if (modo === "nodisponible") { setSinGuardar(true); return; }
    setSinGuardar(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      const ok = await guardar(tarjetas);
      setSinGuardar(!ok);
      if (ok) setUltimoGuardado(new Date());
      else setModo("nodisponible");
    }, 900);
    return () => clearTimeout(temporizador.current);
  }, [tarjetas, listo, modo]);

  const guardarAhora = async () => {
    clearTimeout(temporizador.current);
    const ok = await guardar(tarjetas);
    setSinGuardar(!ok);
    if (ok) {
      setModo("activo");
      setUltimoGuardado(new Date());
      setAviso("Guardado.");
    } else {
      setModo("nodisponible");
      setAviso("No se pudo guardar. Copia el respaldo de abajo para no perder nada.");
    }
  };

  const restaurar = () => {
    try {
      const d = JSON.parse(respaldo);
      if (!Array.isArray(d)) throw new Error("formato");
      setTarjetas(d.map((t) => ({ ...nuevaTarjeta(), ...t })));
      setRespaldo("");
      setAviso("Datos restaurados desde el respaldo.");
    } catch {
      setAviso("Ese texto no es un respaldo válido. Pega el JSON completo, con corchetes incluidos.");
    }
  };

  const conCalculo = useMemo(
    () => tarjetas.map((t) => ({ t, c: calcular(t, hoy) })),
    [tarjetas, hoy]
  );

  /* Resumen */
  const totalPendiente = conCalculo.reduce((s, x) => s + x.c.pendiente, 0);
  const totalMinimo = conCalculo.reduce((s, x) => s + (x.c.pagado ? 0 : num(x.t.minimo)), 0);
  const pendientes = conCalculo.filter((x) => !x.c.pagado && x.c.saldo > 0);
  const proximo = [...pendientes].sort((a, b) => a.c.diasContado - b.c.diasContado)[0];
  const limiteTotal = tarjetas.reduce((s, t) => s + num(t.limite), 0);
  const usadoTotal = tarjetas.reduce((s, t) => s + num(t.saldo) + num(t.consumo), 0);
  const utilGlobal = limiteTotal > 0 ? (usadoTotal / limiteTotal) * 100 : null;

  const mejorCompra = useMemo(() => {
    const candidatas = conCalculo.filter((x) => x.c.disponible === null || x.c.disponible > 0);
    return [...candidatas].sort((a, b) => b.c.flotanteHoy - a.c.flotanteHoy)[0];
  }, [conCalculo]);

  /* Filtros y orden */
  const visibles = useMemo(() => {
    let l = conCalculo.filter(({ t }) => {
      const q = busqueda.trim().toLowerCase();
      if (!q) return true;
      return (t.nombre + " " + t.banco + " " + t.nota).toLowerCase().includes(q);
    });
    if (filtro === "porpagar") l = l.filter((x) => !x.c.pagado && x.c.saldo > 0);
    if (filtro === "urgentes") l = l.filter((x) => x.c.nivel !== "normal" && !x.c.pagado);
    if (filtro === "pagadas") l = l.filter((x) => x.c.pagado || x.c.saldo <= 0);
    const cmp = {
      vencimiento: (a, b) => a.c.diasContado - b.c.diasContado,
      saldo: (a, b) => b.c.saldo - a.c.saldo,
      nombre: (a, b) => (a.t.nombre || "").localeCompare(b.t.nombre || ""),
      flotante: (a, b) => b.c.flotanteHoy - a.c.flotanteHoy,
    }[orden];
    return [...l].sort(cmp);
  }, [conCalculo, busqueda, filtro, orden]);

  /* Agenda de los próximos 45 días */
  const agenda = useMemo(() => {
    const hasta = new Date(hoy.getTime() + 45 * MS);
    const evs = [];
    const ayer = new Date(hoy.getTime() - MS);
    for (const { t } of conCalculo) {
      const tipos = [
        ["Corte", parseInt(t.diaCorte) || 1, C.plum],
        ["Pago de contado", parseInt(t.diaContado) || 1, C.jade],
        ["Pago mínimo", parseInt(t.diaMinimo) || 1, C.soft],
      ];
      for (const [tipo, dia, color] of tipos) {
        let d = sigOcurrencia(dia, ayer);
        while (d <= hasta) {
          evs.push({ tipo, fecha: d, color, nombre: t.nombre });
          d = sigOcurrencia(dia, d);
        }
      }
    }
    return evs.sort((a, b) => a.fecha - b.fecha).slice(0, 12);
  }, [conCalculo, hoy]);

  /* Acciones */
  const actualizar = (t) => setTarjetas((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  const borrar = (id) => {
    setTarjetas((prev) => prev.filter((x) => x.id !== id));
    setAbierta(null);
    setAviso("Tarjeta eliminada.");
  };
  const agregar = () => {
    const t = nuevaTarjeta();
    setTarjetas((prev) => [...prev, t]);
    setAbierta(t.id);
    setFiltro("todas");
    setBusqueda("");
  };
  const alternarPago = (t, c) =>
    actualizar({ ...t, pagadoHasta: c.pagado ? null : iso(c.ultimoCorte) });
  const limpiarEjemplos = () => {
    setTarjetas((prev) => prev.filter((t) => !t.ejemplo));
    setAviso("Ejemplos borrados. Agrega tus tarjetas reales.");
  };
  const hayEjemplos = tarjetas.some((t) => t.ejemplo);

  const exportar = () => {
    const cab = [
      "Tarjeta", "Banco", "Dia corte", "Dia pago contado", "Dia pago minimo",
      "Saldo del estado", "Pago minimo", "Consumo desde el corte", "Limite", "Tasa anual %",
      "Proximo corte", "Vence contado", "Vence minimo", "Dias restantes", "Utilizacion %",
      "Estado", "Nota",
    ];
    const filas = conCalculo.map(({ t, c }) => [
      t.nombre, t.banco, t.diaCorte, t.diaContado, t.diaMinimo, num(t.saldo).toFixed(2),
      num(t.minimo).toFixed(2), num(t.consumo).toFixed(2), num(t.limite).toFixed(2), t.tasa,
      iso(c.proximoCorte), iso(c.venceContado), iso(c.venceMinimo), c.diasContado,
      c.utilizacion === null ? "" : c.utilizacion.toFixed(1), ETIQUETA[c.estado], t.nota,
    ]);
    const csv = [cab, ...filas]
      .map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tarjetas-${iso(hoy)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const nivelProximo = proximo ? proximo.c.nivel : "normal";
  const colorProximo = nivelProximo === "rojo" ? C.red : nivelProximo === "ambar" ? C.amber : C.ink;

  return (
    <div style={{ background: C.paper, minHeight: "100vh", padding: "28px 16px 64px" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        .tj-btn:hover { filter: brightness(0.97); }
        .tj-btn:active { transform: translateY(1px); }
        .tj-input:focus, .tj-btn:focus-visible, .tj-fila:focus-visible {
          outline: 2px solid ${C.jade}; outline-offset: 2px;
        }
        .tj-fila:hover { background: rgba(255,255,255,0.5); }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        {/* Encabezado */}
        <header style={{ marginBottom: 26 }}>
          <div
            style={{
              fontFamily: MONO, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase",
              color: C.plum, marginBottom: 8,
            }}
          >
            Ciclo de facturación · {fmtFechaLarga(hoy)}
          </div>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 40, lineHeight: 1.05, color: C.ink }}>
            Cuándo pagar
          </h1>
          <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: 15.5, lineHeight: 1.5, color: C.soft }}>
            Cada tarjeta te presta dinero gratis entre el corte y la fecha de pago de contado.
            Esto te dice hasta qué día puedes esperar sin pagar un centavo de interés.
          </p>
        </header>

        {/* Resumen */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          {[
            { et: "A pagar este ciclo", val: money(totalPendiente), sub: `${pendientes.length} de ${tarjetas.length} tarjetas`, color: C.ink },
            {
              et: "Próximo vencimiento",
              val: proximo ? (proximo.c.diasContado < 0 ? "vencido" : proximo.c.diasContado + " días") : "—",
              sub: proximo ? `${proximo.t.nombre} · ${fmtFecha(proximo.c.venceContado)}` : "nada pendiente",
              color: colorProximo,
            },
            {
              et: "Utilización global",
              val: utilGlobal === null ? "—" : utilGlobal.toFixed(0) + "%",
              sub: limiteTotal > 0 ? `${money(usadoTotal)} de ${money(limiteTotal)}` : "sin límites cargados",
              color: utilGlobal !== null && utilGlobal > 30 ? C.amber : C.ink,
            },
          ].map((x) => (
            <div
              key={x.et}
              style={{
                flex: "1 1 200px", background: C.card, border: `1px solid ${C.line}`,
                borderRadius: 16, padding: "18px 18px 16px",
              }}
            >
              <div
                style={{
                  fontFamily: SANS, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase",
                  color: C.soft, marginBottom: 8,
                }}
              >
                {x.et}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 27, color: x.color, lineHeight: 1.1 }}>{x.val}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.soft, marginTop: 6 }}>{x.sub}</div>
            </div>
          ))}
        </div>

        {/* Frase de urgencia */}
        <p
          style={{
            margin: "0 0 16px", fontFamily: SERIF, fontSize: 19, lineHeight: 1.45,
            color: colorProximo, padding: "0 2px",
          }}
        >
          {!proximo
            ? "No tienes nada pendiente de pago. Todo al día."
            : proximo.c.diasContado < 0
            ? `${proximo.t.nombre} se pasó de la fecha de contado. Págala hoy.`
            : proximo.c.diasContado === 0
            ? `${proximo.t.nombre} vence hoy: ${money(proximo.c.saldo)}.`
            : `Lo más pronto: ${proximo.t.nombre}, ${money(proximo.c.saldo)} el ${fmtFecha(
                proximo.c.venceContado
              )} — faltan ${proximo.c.diasContado} días.`}
        </p>

        {/* Mejor tarjeta para comprar hoy */}
        {mejorCompra && (
          <div
            style={{
              background: C.jadeSoft, border: `1px solid ${C.jade}22`, borderRadius: 16,
              padding: "16px 18px", marginBottom: 22,
            }}
          >
            <div
              style={{
                fontFamily: SANS, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase",
                color: C.jade, marginBottom: 6,
              }}
            >
              Si vas a comprar hoy
            </div>
            <div style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 1.5, color: C.ink }}>
              Usa la <strong>{mejorCompra.t.nombre}</strong>: entra al corte del{" "}
              {fmtFecha(mejorCompra.c.proximoCorte)} y no la pagas hasta el{" "}
              <strong>{fmtFecha(mejorCompra.c.venceCompraHoy)}</strong> — {mejorCompra.c.flotanteHoy} días
              de financiamiento sin interés.
            </div>
          </div>
        )}

        {/* Controles */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <input
            className="tj-input"
            placeholder="Buscar tarjeta o banco"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              flex: "2 1 220px", padding: "12px 14px", borderRadius: 10,
              border: `1px solid ${C.line}`, background: "#fff", fontFamily: SANS, fontSize: 16,
              color: C.ink, minHeight: 44, boxSizing: "border-box",
            }}
          />
          <Boton variante="solido" onClick={agregar}>+ Agregar tarjeta</Boton>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {[
            ["todas", "Todas"],
            ["porpagar", "Por pagar"],
            ["urgentes", "Urgentes"],
            ["pagadas", "Al día"],
          ].map(([k, l]) => (
            <button
              key={k}
              className="tj-btn"
              onClick={() => setFiltro(k)}
              style={{
                fontFamily: SANS, fontSize: 13.5, fontWeight: 600, padding: "9px 14px",
                borderRadius: 999, minHeight: 40, cursor: "pointer",
                border: `1px solid ${filtro === k ? C.jade : C.line}`,
                background: filtro === k ? C.jade : "#fff",
                color: filtro === k ? "#fff" : C.soft,
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 18,
            fontFamily: SANS, fontSize: 13, color: C.soft, flexWrap: "wrap",
          }}
        >
          <span>Ordenar por</span>
          {[
            ["vencimiento", "vencimiento"],
            ["saldo", "saldo"],
            ["flotante", "días de flotante"],
            ["nombre", "nombre"],
          ].map(([k, l]) => (
            <button
              key={k}
              className="tj-btn"
              onClick={() => setOrden(k)}
              style={{
                background: "none", border: "none", padding: "6px 2px", cursor: "pointer",
                fontFamily: SANS, fontSize: 13, color: orden === k ? C.jade : C.soft,
                fontWeight: orden === k ? 700 : 400,
                textDecoration: orden === k ? "underline" : "none",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {aviso && (
          <div
            style={{
              background: C.card, border: `1px dashed ${C.line}`, borderRadius: 12,
              padding: "10px 14px", marginBottom: 14, fontFamily: SANS, fontSize: 13.5, color: C.soft,
            }}
          >
            {aviso}{" "}
            <button
              className="tj-btn"
              onClick={() => setAviso("")}
              style={{ background: "none", border: "none", color: C.jade, cursor: "pointer", fontFamily: SANS, fontSize: 13.5 }}
            >
              Entendido
            </button>
          </div>
        )}

        {/* Lista */}
        {visibles.length === 0 ? (
          <div
            style={{
              background: C.card, border: `1px dashed ${C.line}`, borderRadius: 16,
              padding: "34px 22px", textAlign: "center", marginBottom: 24,
            }}
          >
            <p style={{ margin: 0, fontFamily: SERIF, fontSize: 19, color: C.ink }}>
              {tarjetas.length === 0 ? "Aún no hay tarjetas" : "Ninguna tarjeta coincide"}
            </p>
            <p style={{ margin: "8px 0 16px", fontFamily: SANS, fontSize: 14.5, color: C.soft }}>
              {tarjetas.length === 0
                ? "Agrega una con su día de corte y su fecha de pago de contado; el resto lo calculo yo."
                : "Cambia el filtro o borra la búsqueda."}
            </p>
            <Boton variante="solido" onClick={tarjetas.length === 0 ? agregar : () => { setFiltro("todas"); setBusqueda(""); }}>
              {tarjetas.length === 0 ? "Agregar mi primera tarjeta" : "Ver todas"}
            </Boton>
          </div>
        ) : (
          visibles.map(({ t, c }) => (
            <Tarjeta
              key={t.id}
              t={t}
              c={c}
              abierta={abierta === t.id}
              onAbrir={() => setAbierta(abierta === t.id ? null : t.id)}
              onCambio={actualizar}
              onBorrar={() => borrar(t.id)}
              onPagar={() => alternarPago(t, c)}
            />
          ))
        )}

        {/* Agenda */}
        {agenda.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontFamily: SERIF, fontSize: 24, color: C.ink, margin: "0 0 4px" }}>
              Lo que viene
            </h2>
            <p style={{ fontFamily: SANS, fontSize: 14, color: C.soft, margin: "0 0 14px" }}>
              Cortes y vencimientos de los próximos 45 días.
            </p>
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden" }}>
              {agenda.map((e, i) => {
                const d = diffDias(e.fecha, hoy);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex", gap: 12, alignItems: "center", padding: "13px 16px",
                      borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO, fontSize: 12.5, color: C.soft, width: 62, flexShrink: 0,
                      }}
                    >
                      {fmtFecha(e.fecha)}
                    </span>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: e.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: SANS, fontSize: 14.5, color: C.ink, flex: 1, minWidth: 0 }}>
                      {e.tipo} · {e.nombre}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.soft, flexShrink: 0 }}>
                      {d === 0 ? "hoy" : d + "d"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Cómo se usa */}
        <details style={{ marginTop: 28, background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 18px" }}>
          <summary style={{ cursor: "pointer", fontFamily: SERIF, fontSize: 19, color: C.ink }}>
            Las tres reglas del flotante
          </summary>
          <ul style={{ fontFamily: SANS, fontSize: 14.5, lineHeight: 1.65, color: C.ink, paddingLeft: 20, marginBottom: 0 }}>
            <li style={{ marginTop: 10 }}>
              <strong>Compra justo después del corte.</strong> Esa compra entra al estado siguiente y no la
              pagas hasta el vencimiento del mes que viene: es el máximo de días sin interés.
            </li>
            <li style={{ marginTop: 10 }}>
              <strong>Paga el día del vencimiento de contado, no antes</strong> (deja uno o dos días hábiles
              si el pago no es inmediato). Pagar antes no te da ningún beneficio; solo te quita liquidez.
            </li>
            <li style={{ marginTop: 10 }}>
              <strong>Paga de contado, siempre.</strong> El pago mínimo vence después, pero al no pagar el
              total pierdes el periodo de gracia: los intereses corren desde la fecha de cada compra.
            </li>
            <li style={{ marginTop: 10 }}>
              Excepción: si te interesa que el buró reporte poca deuda, haz un abono
              <em> antes</em> del corte para que el saldo del estado salga bajo.
            </li>
          </ul>
        </details>

        {/* Estado del guardado */}
        <div
          style={{
            marginTop: 30, background: modo === "nodisponible" ? C.amberSoft : C.card,
            border: `1px solid ${modo === "nodisponible" ? C.amber + "55" : C.line}`,
            borderRadius: 16, padding: "16px 18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                width: 9, height: 9, borderRadius: 999, flexShrink: 0,
                background:
                  modo === "cargando" ? C.soft : modo === "nodisponible" ? C.amber : sinGuardar ? C.amber : C.green,
              }}
            />
            <span style={{ fontFamily: SANS, fontSize: 14.5, color: C.ink, flex: 1, minWidth: 180 }}>
              {modo === "cargando"
                ? "Revisando el guardado…"
                : modo === "nodisponible"
                ? "El guardado automático no está funcionando en esta sesión."
                : sinGuardar
                ? "Cambios sin guardar…"
                : ultimoGuardado
                ? "Guardado a las " + ultimoGuardado.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" })
                : "Guardado automático activo."}
            </span>
            <Boton variante={sinGuardar || modo === "nodisponible" ? "solido" : "suave"} onClick={guardarAhora}>
              Guardar ahora
            </Boton>
          </div>
          {modo === "nodisponible" && (
            <p style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.55, color: C.ink, margin: "12px 0 0" }}>
              Tus tarjetas siguen funcionando aquí, pero se pierden al cerrar. Copia el respaldo de abajo
              y guárdalo en una nota; al volver, lo pegas y recuperas todo.
            </p>
          )}
        </div>

        {/* Respaldo manual */}
        <details style={{ marginTop: 14, background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 18px" }}>
          <summary style={{ cursor: "pointer", fontFamily: SERIF, fontSize: 18, color: C.ink }}>
            Respaldo y restauración
          </summary>
          <p style={{ fontFamily: SANS, fontSize: 13.5, color: C.soft, lineHeight: 1.55, marginTop: 10 }}>
            Copia este texto para tener tus tarjetas fuera del artefacto. Para recuperarlas, pega el texto
            aquí mismo y toca Restaurar.
          </p>
          <textarea
            className="tj-input"
            value={respaldo || JSON.stringify(tarjetas)}
            onChange={(e) => setRespaldo(e.target.value)}
            rows={4}
            style={{
              width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 10,
              border: `1px solid ${C.line}`, fontFamily: MONO, fontSize: 12, color: C.ink,
              background: "#fff", resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <Boton
              onClick={() => {
                try { navigator.clipboard.writeText(JSON.stringify(tarjetas)); setAviso("Respaldo copiado."); }
                catch { setAviso("Selecciona el texto y cópialo a mano."); }
              }}
            >
              Copiar respaldo
            </Boton>
            <Boton variante="solido" onClick={restaurar} disabled={!respaldo}>Restaurar</Boton>
          </div>
        </details>

        {/* Pie */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          <Boton onClick={exportar}>Exportar a CSV</Boton>
          {hayEjemplos && <Boton variante="peligro" onClick={limpiarEjemplos}>Borrar las tarjetas de ejemplo</Boton>}
        </div>
        <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.soft, marginTop: 16, lineHeight: 1.6 }}>
          Verifica siempre las fechas contra tu estado de cuenta: algunos bancos mueven el vencimiento
          cuando cae fin de semana o feriado.
        </p>
      </div>
    </div>
  );
}