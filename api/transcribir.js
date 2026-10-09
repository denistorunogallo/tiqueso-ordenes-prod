/* Proxy hacia la API de Anthropic para Órdenes de Producción, en STREAMING.
 *
 * Verifica la sesión de Supabase y el rol antes de llamar, le agrega la key desde las variables de
 * entorno de Vercel (la credencial nunca viaja al navegador) y pasa el flujo tal cual al cliente.
 * Mientras lo pasa, lee los eventos para anotar tokens y motivo de cierre en la tabla lecturas_ia.
 *
 * Sin streaming, la función tiene que esperar la respuesta completa y una hoja con varios registros
 * se pasa del tiempo máximo (Vercel corta con 504). Con streaming los bytes fluyen enseguida.
 *
 *   Variables de entorno en Vercel:  ANTHROPIC_API_KEY  (obligatoria)
 */

export const config = {
  runtime: "nodejs",
  /* Si el despliegue se queja de este valor, bajarlo a 60. */
  maxDuration: 300,
};

// ===================== Seguridad y registro (común a las apps Tiqueso) =====================
// 1) Solo usuarios con sesión de Supabase y rol admin/salidas pueden leer con IA.
// 2) Solo se aceptan modelos conocidos o configurados en el panel "Modelos de IA".
// 3) Tope de tokens de salida.
// 4) Cada lectura queda anotada en la tabla lecturas_ia (para el análisis de costos y errores).
// La URL y la key de Supabase son PÚBLICAS por diseño (las mismas que usa la app).
const SUPA_URL = process.env.SUPABASE_URL || "https://semreoutrsebdrpetunf.supabase.co";
const SUPA_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Vm0N0H43ZmWWWkQ0q65ZIw_HTvObUTJ";
const ROLES_IA = ["admin", "salidas"];
const MODELOS_BASE = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"];
const MAX_TOKENS_TOPE = 32000;

function supa(ruta, token, opciones = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  return fetch(SUPA_URL + ruta, {
    ...opciones, signal: ctrl.signal,
    headers: { apikey: SUPA_KEY, Authorization: "Bearer " + token, "content-type": "application/json", ...(opciones.headers || {}) },
  }).finally(() => clearTimeout(t));
}

// Devuelve {user, perfil, token, permitidos} o {status, tipo, mensaje}
async function verificar(req) {
  const h = String(req.headers["authorization"] || "");
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return { status: 401, tipo: "sesion_requerida", mensaje: "Sesión requerida: recargá la página e iniciá sesión." };
  let user;
  try {
    const ru = await supa("/auth/v1/user", token);
    if (!ru.ok) return { status: 401, tipo: "sesion_invalida", mensaje: "La sesión venció o no es válida: recargá la página e iniciá sesión de nuevo." };
    user = await ru.json();
  } catch (e) {
    return { status: 503, tipo: "sin_supabase", mensaje: "No se pudo verificar la sesión (Supabase no respondió). Probá de nuevo." };
  }
  const [rp, rc] = await Promise.all([
    supa("/rest/v1/perfiles?select=rol,nombre&user_id=eq." + encodeURIComponent(user.id), token).catch(() => null),
    supa("/rest/v1/config_app?select=data&clave=eq.modelos", token).catch(() => null),
  ]);
  let perfil = null;
  try { if (rp && rp.ok) perfil = (await rp.json())[0] || null; } catch (e) {}
  if (!perfil || !ROLES_IA.includes(perfil.rol))
    return { status: 403, tipo: "sin_permiso", mensaje: "Tu usuario no tiene permiso para leer con IA (solo admin y salidas)." };
  const permitidos = new Set(MODELOS_BASE);
  try {
    if (rc && rc.ok) {
      const d = ((await rc.json())[0] || {}).data || {};
      ["salidas", "entradas", "ordenes"].forEach(a => { if (d[a]) { if (d[a].principal) permitidos.add(d[a].principal); if (d[a].respaldo) permitidos.add(d[a].respaldo); } });
      Object.keys(d.precios || {}).forEach(k => permitidos.add(k));
    }
  } catch (e) {}
  return { user, perfil, token, permitidos };
}

// Ajusta el cuerpo: modelo permitido y tope de tokens. Devuelve {cuerpo} o {status, tipo, mensaje}
function validarCuerpo(body, permitidos) {
  if (!body || typeof body !== "object") return { status: 400, tipo: "invalid_request_error", mensaje: "Solicitud vacía o inválida." };
  if (!body.model || !permitidos.has(body.model))
    return { status: 400, tipo: "invalid_request_error", mensaje: "model: " + (body.model || "(vacío)") + " no está permitido. Agregalo en el panel Modelos de IA." };
  const cuerpo = { ...body, max_tokens: Math.min(Number(body.max_tokens) || 16000, MAX_TOKENS_TOPE) };
  return { cuerpo };
}

function metaDe(req) {
  try { return JSON.parse(decodeURIComponent(String(req.headers["x-tiqueso-meta"] || ""))) || {}; } catch (e) { return {}; }
}
function appDe(req, porDefecto) {
  const a = String(req.headers["x-tiqueso-app"] || porDefecto || "").toLowerCase();
  return ["salidas", "entradas", "ordenes"].includes(a) ? a : (porDefecto || "desconocida");
}
// cuenta renglones y largo de notas si la respuesta es el JSON esperado (no es obligatorio)
function analizarTexto(texto) {
  const out = { lineas: null, notas_chars: null, resp_chars: (texto || "").length };
  try {
    const i = texto.indexOf("{"), j = texto.lastIndexOf("}");
    if (i >= 0 && j > i) {
      const o = JSON.parse(texto.slice(i, j + 1));
      if (Array.isArray(o.lineas)) out.lineas = o.lineas.length;
      if (o.notas != null) out.notas_chars = JSON.stringify(o.notas).length;
    }
  } catch (e) {}
  return out;
}
async function registrar(ctx, fila) {
  try {
    await supa("/rest/v1/lecturas_ia", ctx.token, {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: ctx.user.id, usuario: ctx.perfil.nombre, ...fila }),
    });
  } catch (e) { /* el registro nunca frena la lectura */ }
}
function errorJSON(res, status, tipo, mensaje) {
  return res.status(status).json({ type: "error", error: { type: tipo, message: mensaje } });
}
// ===================== fin de la parte común =====================


export default async function handler(req, res) {
  if (req.method !== "POST") return errorJSON(res, 405, "metodo", "Solo se acepta POST.");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return errorJSON(res, 500, "config", "Falta la variable ANTHROPIC_API_KEY en el proyecto de Vercel.");

  const ctx = await verificar(req);
  if (ctx.status) return errorJSON(res, ctx.status, ctx.tipo, ctx.mensaje);
  const v = validarCuerpo(req.body, ctx.permitidos);
  if (v.status) return errorJSON(res, v.status, v.tipo, v.mensaje);

  const meta = metaDe(req), t0 = Date.now();
  const base = { app: "ordenes", modelo: v.cuerpo.model, rol: meta.rol || null, motivo: meta.motivo || null };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ ...v.cuerpo, stream: true }),
    });

    if (!r.ok) {
      const texto = await r.text();
      let det = ""; try { det = (JSON.parse(texto).error || {}).message || ""; } catch (e) {}
      await registrar(ctx, { ...base, ok: false, status: r.status, error: (det || texto).slice(0, 300), ms: Date.now() - t0 });
      return res.status(r.status).setHeader("content-type", "application/json; charset=utf-8").send(texto);
    }

    /* Pasamos el flujo tal cual: el cliente arma el texto a medida que llega.
       En paralelo se leen los eventos para el registro (tokens, cierre, largo del texto). */
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");

    const uso = { in_tok: 0, cache_w: 0, cache_r: 0, out_tok: 0, stop: null };
    let chars = 0, pendiente = "";
    const dec = new TextDecoder();
    const anotar = linea => {
      if (!linea.startsWith("data:")) return;
      try {
        const ev = JSON.parse(linea.slice(5).trim());
        if (ev.type === "message_start" && ev.message && ev.message.usage) {
          const u = ev.message.usage;
          uso.in_tok = u.input_tokens || 0; uso.cache_w = u.cache_creation_input_tokens || 0; uso.cache_r = u.cache_read_input_tokens || 0;
        } else if (ev.type === "message_delta") {
          if (ev.usage && ev.usage.output_tokens != null) uso.out_tok = ev.usage.output_tokens;
          if (ev.delta && ev.delta.stop_reason) uso.stop = ev.delta.stop_reason;
        } else if (ev.type === "content_block_delta" && ev.delta && typeof ev.delta.text === "string") {
          chars += ev.delta.text.length;
        }
      } catch (e) {}
    };

    const lector = r.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      res.write(Buffer.from(value));
      pendiente += dec.decode(value, { stream: true });
      const partes = pendiente.split("\n"); pendiente = partes.pop();
      partes.forEach(anotar);
    }
    if (pendiente) anotar(pendiente);
    await registrar(ctx, { ...base, ...uso, resp_chars: chars, ok: true, status: 200, ms: Date.now() - t0 });
    res.end();
  } catch (e) {
    await registrar(ctx, { ...base, ok: false, status: 502, error: String(e.message || "sin detalle").slice(0, 300), ms: Date.now() - t0 });
    /* Si ya se empezó a escribir, no se puede cambiar el código de estado. */
    if (res.headersSent) {
      res.write("\nevent: error\ndata: " +
        JSON.stringify({ error: { message: e.message || "sin detalle" } }) + "\n\n");
      return res.end();
    }
    errorJSON(res, 502, "servidor", "No se pudo contactar a Anthropic: " + (e.message || "sin detalle"));
  }
}
