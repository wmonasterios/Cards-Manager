import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

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
const sigOcurrencia = (dia, desde) => {
  let d = diaEnMes(desde.getFullYear(), desde.getMonth(), dia);
  if (d <= desde) d = diaEnMes(desde.getFullYear(), desde.getMonth() + 1, dia);
  return d;
};
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

/* ─────────────────────────── Cálculos del ciclo ─────────────────────────── */
function calcular(t, hoy) {
  const corte = Math.min(Math.max(parseInt(t.dia_corte) || 1, 1), 31);
  const dContado = Math.min(Math.max(parseInt(t.dia_contado) || 1, 1), 31);
  const dMinimo = Math.min(Math.max(parseInt(t.dia_minimo) || dContado, 1), 31);

  const ultimoCorte = ultOcurrencia(corte, hoy);
  const proximoCorte = sigOcurrencia(corte, hoy);
  const venceContado = sigOcurrencia(dContado, ultimoCorte);
  const venceMinimo = sigOcurrencia(dMinimo, ultimoCorte);

  const diasContado = diffDias(venceContado, hoy);
  const diasMinimo = diffDias(venceMinimo, hoy);
  const diasCorte = diffDias(proximoCorte, hoy);

  const venceCompraHoy = sigOcurrencia(dContado, proximoCorte);
  const flotanteHoy = diffDias(venceCompraHoy, hoy);
  const flotanteMax = diffDias(venceCompraHoy, proximoCorte) + diffDias(proximoCorte, ultimoCorte) - 1;
  const mejorDiaCompra = new Date(proximoCorte.getTime() + MS);

  const pagado = t.pagado_hasta === iso(ultimoCorte);
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

function Boton({ children, onClick, variante = "suave", disabled, ...resto }) {
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
      disabled={disabled}
      style={{
        ...estilos, fontFamily: SANS, fontSize: 14, fontWeight: 600, padding: "11px 16px",
        borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", minHeight: 44,
        opacity: disabled ? 0.5 : 1,
      }}
      {...resto}
    >
      {children}
    </button>
  );
}

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
            <Campo etiqueta="Día de corte" valor={t.dia_corte} onChange={set("dia_corte")} tipo="number" />
            <Campo etiqueta="Día pago de contado" valor={t.dia_contado} onChange={set("dia_contado")} tipo="number" />
            <Campo etiqueta="Día pago mínimo" valor={t.dia_minimo} onChange={set("dia_minimo")} tipo="number" />
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

/* ─────────────────────────── App principal ─────────────────────────── */
export default function App() {
  const [tarjetas, setTarjetas] = useState([]);
  const [usuario, setUsuario] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [listo, setListo] = useState(false);
  const [modo, setModo] = useState("cargando");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [orden, setOrden] = useState("vencimiento");
  const [abierta, setAbierta] = useState(null);
  const [aviso, setAviso] = useState("");
  const [ultimoGuardado, setUltimoGuardado] = useState(null);
  const [sinGuardar, setSinGuardar] = useState(false);
  const temporizador = useRef(null);
  const primera = useRef(true);
  const hoy = useMemo(() => hoyFn(), []);

  // Auth y carga inicial
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (vivo) setUsuario(session?.user || null);
      if (vivo && session?.user) {
        await cargarTarjetas(session.user.id);
      }
      if (vivo) {
        setModo("activo");
        setListo(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const cargarTarjetas = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("tarjetas")
        .select("*")
        .eq("user_id", userId)
        .order("nombre");
      if (error) throw error;
      setTarjetas(data || []);
    } catch (err) {
      console.error("Error cargando tarjetas:", err);
      setAviso("Error al cargar tarjetas.");
    }
  };

  // Guardar automático con debounce
  useEffect(() => {
    if (!listo || !usuario) return;
    if (primera.current) { primera.current = false; return; }
    setSinGuardar(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(guardarAhora, 1000);
  }, [tarjetas, listo, usuario]);

  const guardarAhora = async () => {
    if (!usuario) return;
    try {
      // Borrar las viejas y cargar las nuevas
      await supabase.from("tarjetas").delete().eq("user_id", usuario.id);
      
      const tarjetasParaGuardar = tarjetas.map((t) => ({
        user_id: usuario.id,
        nombre: t.nombre || "",
        banco: t.banco || "",
        dia_corte: t.dia_corte || 1,
        dia_contado: t.dia_contado || 1,
        dia_minimo: t.dia_minimo || 1,
        saldo: num(t.saldo) || 0,
        minimo: num(t.minimo) || 0,
        consumo: num(t.consumo) || 0,
        limite: num(t.limite) || 0,
        tasa: num(t.tasa) || 0,
        nota: t.nota || "",
        pagado_hasta: t.pagado_hasta || null,
      }));

      if (tarjetasParaGuardar.length > 0) {
        const { error } = await supabase
          .from("tarjetas")
          .insert(tarjetasParaGuardar);
        if (error) throw error;
      }

      setSinGuardar(false);
      setUltimoGuardado(new Date());
    } catch (err) {
      console.error("Error guardando:", err);
      setSinGuardar(true);
    }
  };

const login = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
    if (error) throw error;
          window.location.reload();
        } catch (err) {
          console.error("Error en login:", err);
          setAviso("Email o contraseña incorrectos.");
        }
      };

  const logout = async () => {
    await supabase.auth.signOut();
    setUsuario(null);
    setTarjetas([]);
    setEmail("");
  };

  /* Cálculos */
  const conCalculo = useMemo(
    () => tarjetas.map((t) => ({ t, c: calcular(t, hoy) })),
    [tarjetas, hoy]
  );

  const totalPendiente = conCalculo.reduce((s, x) => s + x.c.pendiente, 0);
  const pendientes = conCalculo.filter((x) => !x.c.pagado && x.c.saldo > 0);
  const proximo = [...pendientes].sort((a, b) => a.c.diasContado - b.c.diasContado)[0];
  const limiteTotal = tarjetas.reduce((s, t) => s + num(t.limite), 0);
  const usadoTotal = tarjetas.reduce((s, t) => s + num(t.saldo) + num(t.consumo), 0);
  const utilGlobal = limiteTotal > 0 ? (usadoTotal / limiteTotal) * 100 : null;
  const mejorCompra = useMemo(() => {
    const candidatas = conCalculo.filter((x) => x.c.disponible === null || x.c.disponible > 0);
    return [...candidatas].sort((a, b) => b.c.flotanteHoy - a.c.flotanteHoy)[0];
  }, [conCalculo]);

  /* Filtros */
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

  /* Acciones */
  const actualizar = (t) => {
    setTarjetas((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  };
  const borrar = (id) => {
    setTarjetas((prev) => prev.filter((x) => x.id !== id));
    setAbierta(null);
    setAviso("Tarjeta eliminada.");
  };
  const agregar = () => {
      const t = { id: Date.now() + Math.random(), nombre: "", banco: "", dia_corte: 1, dia_contado: 1, dia_minimo: 1, saldo: 0, minimo: 0, consumo: 0, limite: 0, tasa: 0, nota: "", pagado_hasta: null };
      setTarjetas((prev) => [t, ...prev]);
      setAbierta(t.id);
      setOrden("nombre");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  const alternarPago = (t, c) => {
    actualizar({ ...t, pagado_hasta: c.pagado ? null : iso(c.ultimoCorte) });
  };
  const exportar = () => {
    const cab = [
      "Tarjeta", "Banco", "Dia corte", "Dia pago contado", "Dia pago minimo",
      "Saldo del estado", "Pago minimo", "Consumo desde el corte", "Limite", "Tasa anual %",
      "Proximo corte", "Vence contado", "Vence minimo", "Dias restantes", "Utilizacion %",
      "Estado", "Nota",
    ];
    const filas = conCalculo.map(({ t, c }) => [
      t.nombre, t.banco, t.dia_corte, t.dia_contado, t.dia_minimo, num(t.saldo).toFixed(2),
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

  // Pantalla de login
  if (!usuario) {
    return (
      <div style={{ background: C.paper, minHeight: "100vh", padding: "40px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`
          * { -webkit-tap-highlight-color: transparent; }
          .tj-btn:hover { filter: brightness(0.97); }
          .tj-btn:active { transform: translateY(1px); }
          .tj-input:focus { outline: 2px solid ${C.jade}; outline-offset: 2px; }
        `}</style>
        <div style={{ maxWidth: 380, width: "100%" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, color: C.ink, textAlign: "center", marginBottom: 10 }}>
            Cuándo pagar
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 15, color: C.soft, textAlign: "center", marginBottom: 24 }}>
            Tu gestor de tarjetas con cálculo de flotante automático.
          </p>
          <form onSubmit={login}>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: 12,
                border: `1px solid ${C.line}`, fontFamily: SANS, fontSize: 16, marginBottom: 12,
              }}
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: 12,
                border: `1px solid ${C.line}`, fontFamily: SANS, fontSize: 16, marginBottom: 12,
              }}
              required
            />
            <Boton variante="solido" onClick={login} style={{ width: "100%", textAlign: "center" }}>
              Entrar
            </Boton>
          </form>
          {aviso && (
            <p style={{ fontFamily: SANS, fontSize: 13, color: C.amber, marginTop: 12, textAlign: "center" }}>
              {aviso}
            </p>
          )}
        </div>
      </div>
    );
  }

  // App principal
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
      `}</style>

      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: C.plum, marginBottom: 8 }}>
              Ciclo de facturación · {fmtFechaLarga(hoy)}
            </div>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 40, lineHeight: 1.05, color: C.ink }}>
              Cuándo pagar
            </h1>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: 13, color: C.soft }}>
              {usuario.email}
            </p>
            <Boton variante="fantasma" onClick={logout} style={{ marginTop: 10 }}>
              Salir
            </Boton>
          </div>
        </header>

        <p style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 1.5, color: C.soft, marginBottom: 24 }}>
          Cada tarjeta te presta dinero gratis entre el corte y la fecha de pago de contado.
          Esto te dice hasta qué día puedes esperar sin pagar un centavo de interés.
        </p>

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
              <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: C.soft, marginBottom: 8 }}>
                {x.et}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 27, color: x.color, lineHeight: 1.1 }}>{x.val}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: C.soft, marginTop: 6 }}>{x.sub}</div>
            </div>
          ))}
        </div>

        <p style={{ margin: "0 0 16px", fontFamily: SERIF, fontSize: 19, lineHeight: 1.45, color: colorProximo, padding: "0 2px" }}>
          {!proximo
            ? "No tienes nada pendiente de pago. Todo al día."
            : proximo.c.diasContado < 0
            ? `${proximo.t.nombre} se pasó de la fecha de contado. Págala hoy.`
            : proximo.c.diasContado === 0
            ? `${proximo.t.nombre} vence hoy: ${money(proximo.c.saldo)}.`
            : `Lo más pronto: ${proximo.t.nombre}, ${money(proximo.c.saldo)} el ${fmtFecha(proximo.c.venceContado)} — faltan ${proximo.c.diasContado} días.`}
        </p>

        {mejorCompra && (
          <div style={{ background: C.jadeSoft, border: `1px solid ${C.jade}22`, borderRadius: 16, padding: "16px 18px", marginBottom: 22 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: C.jade, marginBottom: 6 }}>
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

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {[
            ["todas", "Todas"],
            ["porpagar", "Por pagar"],
            ["urgentes", "Urgentes"],
            ["pagadas", "Al día"],
          ].map(([k, l]) => (
            <button
              key={k}
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

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontFamily: SANS, fontSize: 13, color: C.soft, flexWrap: "wrap" }}>
          <span>Ordenar por</span>
          {[
            ["vencimiento", "vencimiento"],
            ["saldo", "saldo"],
            ["flotante", "días de flotante"],
            ["nombre", "nombre"],
          ].map(([k, l]) => (
            <button
              key={k}
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
          <div style={{ background: C.card, border: `1px dashed ${C.line}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontFamily: SANS, fontSize: 13.5, color: C.soft }}>
            {aviso}{" "}
            <button
              onClick={() => setAviso("")}
              style={{ background: "none", border: "none", color: C.jade, cursor: "pointer", fontFamily: SANS, fontSize: 13.5 }}
            >
              Entendido
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, background: C.card, border: `1px solid ${filtro === "todas" ? C.line : C.amberSoft}`, borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: sinGuardar ? C.amber : C.green }} />
            <span style={{ fontFamily: SANS, fontSize: 14.5, color: C.ink, flex: 1, minWidth: 180 }}>
              {sinGuardar ? "Guardando cambios…" : ultimoGuardado ? "Guardado a las " + ultimoGuardado.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }) : "Guardado en la nube."}
            </span>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div style={{ background: C.card, border: `1px dashed ${C.line}`, borderRadius: 16, padding: "34px 22px", textAlign: "center", marginBottom: 24 }}>
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

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 26 }}>
          <Boton onClick={exportar}>Exportar a CSV</Boton>
        </div>

        <p style={{ fontFamily: SANS, fontSize: 12.5, color: C.soft, marginTop: 16, lineHeight: 1.6 }}>
          Verifica siempre las fechas contra tu estado de cuenta: algunos bancos mueven el vencimiento
          cuando cae fin de semana o feriado.
        </p>
      </div>
    </div>
  );
}