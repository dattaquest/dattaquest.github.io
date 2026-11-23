/* Conector de sólo consulta. No guarda documentos, claves ni respuestas del padrón. */
import { consultarCuitConsultaCuit } from '../backend-cloudflare/proveedores/consultacuit-cuil.mjs';

const ORIGIN = 'https://dattaquest.github.io';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const error = (code, status = 503) => Object.assign(new Error(code), { code, status });

function json(status, data, cors, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...cors, ...extra,
  } });
}

async function readInput(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw error('json_requerido', 415);
  if (Number(request.headers.get('Content-Length') || 0) > 512) throw error('demasiados_datos', 413);
  if (!request.body) throw error('json_invalido', 400);
  const reader = request.body.getReader(); const parts = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 512) { await reader.cancel(); throw error('demasiados_datos', 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { throw error('json_invalido', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.dni !== 'string' ||
      !/^\d{7,8}$/.test(body.dni) || /^0+$/.test(body.dni) ||
      (body.requestId !== undefined && (typeof body.requestId !== 'string' || !UUID.test(body.requestId)))) {
    throw error('dato_invalido', 400);
  }
  return body.dni;
}

// Límite preventivo por instancia: no es autenticación ni un cupo global duradero.
// Las claves son hashes efímeros de la IP del borde; nunca contienen el DNI.
function makeLimiter(now) {
  const visitors = new Map(); let window = -1; let count = 0;
  return async request => {
    const current = Math.floor(now() / 60_000);
    if (current !== window) { visitors.clear(); window = current; count = 0; }
    if (count >= 60) return false;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
      current + ':' + (request.headers.get('CF-Connecting-IP') || 'sin-ip')));
    // Revalidar la ventana después del await, también ante solicitudes concurrentes.
    if (current !== Math.floor(now() / 60_000)) return false;
    const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const used = visitors.get(key) || 0;
    if (count >= 60 || used >= 8) return false;
    visitors.set(key, used + 1); count++;
    return true;
  };
}

export function createConsultaCuitService({fetchImpl = (...args) => fetch(...args), now = Date.now,
  lookup = consultarCuitConsultaCuit} = {}) {
  const reserve = makeLimiter(now);
  return async function handle(request) {
    const path = new URL(request.url).pathname;
    const origin = request.headers.get('Origin') || '';
    const cors = {Vary: 'Origin', ...(origin === ORIGIN ? {
      'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'Retry-After',
      'Access-Control-Max-Age': '600',
    } : {})};
    if (origin && origin !== ORIGIN) return json(403, {error: 'origen_no_permitido'}, cors);
    if (path === '/api/status' && request.method === 'GET') {
      try {
        const response = await fetchImpl('https://consultacuit.fluxorhub.com/v1/health', {
          // Workers admite "manual"; una redirección nunca se sigue.
          headers: {Accept: 'application/json'}, redirect: 'manual', signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw error('servicio_no_disponible');
        const health = await response.json();
        if (health?.ok !== true) throw error('servicio_no_disponible');
        return json(200, {version: 10, proveedor: 'ConsultaCUIT', servicios: {cuil: true},
          consultaPersonalVerificada: false,
          fechaPadron: /^\d{4}-\d{2}-\d{2}$/.test(health.padron_snapshot_date || '') ? health.padron_snapshot_date : null}, cors);
      } catch { return json(503, {error: 'servicio_no_disponible', servicios: {cuil: false}}, cors); }
    }
    if (path !== '/api/cuil') return json(404, {error: 'no_disponible'}, cors);
    if (origin !== ORIGIN) return json(403, {error: 'origen_no_permitido'}, cors);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (request.method !== 'POST') return json(405, {error: 'metodo_no_permitido'}, cors, {Allow: 'POST, OPTIONS'});
    try {
      const dni = await readInput(request);
      if (!await reserve(request)) throw error('limite_consultas', 429);
      const data = await lookup({dni, fetchImpl, signal: request.signal});
      // La adaptación es la única encargada de validar y reducir los datos del proveedor.
      return json(200, data, cors);
    } catch (failure) {
      const code = /^[a-z_]+$/.test(failure?.code || '') ? failure.code : 'servicio_no_disponible';
      const status = [400, 404, 409, 413, 415, 422, 429, 502, 503].includes(failure?.status) ? failure.status : 503;
      return json(status, {error: code}, cors, status === 429 ? {'Retry-After': '60'} : {});
    }
  };
}

export default createConsultaCuitService();
