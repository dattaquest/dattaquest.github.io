/* DattaQuest. Las credenciales y la comunicación con proveedores viven en el servidor. */
import { consultarCuilAfipSdk } from './proveedores/afipsdk-cuil.mjs';
import { consultarRadicacionChasis } from './proveedores/chasis-radicacion.mjs';
import { argentinaQuotaWindow } from './cuotas.mjs';
export { ConsultaQuota } from './cuotas.mjs';

const services = {
  cuil: { name: 'dni', pattern: /^\d{7,8}$/ },
  radicacion: { name: 'patente', pattern: /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/ },
  prestadores: { name: 'numero', pattern: /^\d{10}$/, variable: 'UPSTREAM_PRESTADORES_URL' },
  'imei/estado': { name: 'imei', pattern: /^\d{15}$/, variable: 'UPSTREAM_IMEI_URL' },
};
const has = value => typeof value === 'string' && value.trim().length > 0;
const fail = (code, status = 503) => Object.assign(new Error(code), { code, status });
const positiveLimit = value => /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= 100000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function httpsEndpoint(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash; }
  catch { return false; }
}
function configured(route, env) {
  if (route === 'cuil') return env.CUIL_PROVIDER === 'afipsdk' &&
    ['AFIPSDK_ACCESS_TOKEN', 'ARCA_CUIT_REPRESENTADA', 'ARCA_CERT', 'ARCA_KEY'].every(key => has(env[key])) && positiveLimit(env.CUIL_DAILY_LIMIT);
  if (route === 'radicacion') return env.RADICACION_PROVIDER === 'chasis' && has(env.CHASIS_API_KEY) && positiveLimit(env.RADICACION_DAILY_LIMIT);
  return httpsEndpoint(env[services[route].variable]) && positiveLimit(env.OTHER_DAILY_LIMIT);
}
function protectedService(env) {
  return typeof env.REQUEST_LIMITER?.limit === 'function' &&
    typeof env.CONSULTA_QUOTA?.idFromName === 'function' && typeof env.CONSULTA_QUOTA?.get === 'function';
}
function reply(status, data, cors = {}, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...cors, ...extra,
  } });
}
async function readBody(request) {
  // Content-Length no es obligatorio ni confiable: también se limita el stream.
  if (Number(request.headers.get('Content-Length') || 0) > 4096) throw fail('demasiados_datos', 413);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw fail('json_requerido', 415);
  if (!request.body) throw fail('json_invalido', 400);
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw fail('demasiados_datos', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw fail('json_invalido', 400); }
}
async function reserveConsultation(request, requestId, route, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limited = await env.REQUEST_LIMITER.limit({ key: ip });
  if (!limited?.success) throw fail('limite_consultas', 429);
  // El UUID identifica un intento para evitar cobros duplicados concurrentes.
  // No autentica al visitante. El consumo se limita por IP y cupo global.
  // La reserva guarda sólo el hash temporal, nunca el UUID, la IP ni la consulta.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([requestId.toLowerCase(), route, ip])));
  const requestHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const counter = env.CONSULTA_QUOTA.get(env.CONSULTA_QUOTA.idFromName('consultas-diarias'));
  const reservation = await counter.fetch('https://quota.internal/reserve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: route, requestHash }),
  });
  if (reservation.status === 409) throw fail('solicitud_duplicada', 409);
  if (reservation.status === 429) {
    const value = reservation.headers.get('Retry-After');
    const retryAfter = /^\d{1,5}$/.test(value || '') && Number(value) > 0 && Number(value) <= 86400
      ? Number(value) : argentinaQuotaWindow().retryAfter;
    throw Object.assign(fail('limite_diario', 429), { retryAfter });
  }
  if (reservation.status !== 204) throw fail('proteccion_sin_configurar');
}
async function optionalProvider(route, input, env, fetchImpl, signal) {
  const variable = services[route].variable;
  const token = env[variable.replace('_URL', '_TOKEN')];
  const response = await fetchImpl(env[variable], { method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(has(token) ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ [services[route].name]: input }),
  });
  if (!response.ok) throw fail('servicio_no_disponible');
  const raw = await response.json();
  if (raw?.verificado !== true) throw fail('respuesta_no_verificada', 502);
  if (route === 'prestadores') {
    if (!has(raw.prestador_actual)) throw fail('respuesta_no_verificada', 502);
    return { verificado: true, prestador_actual: raw.prestador_actual.trim().slice(0, 120),
      ...(typeof raw.portado === 'boolean' ? { portado: raw.portado } : {}) };
  }
  if (!['bloqueado', 'no_reportado', 'desconocido'].includes(raw.estado)) throw fail('respuesta_no_verificada', 502);
  return { verificado: true, estado: raw.estado };
}

// Inyección sólo para pruebas del contrato completo, sin tocar los endpoints de producción.
export function createWorker({ fetchImpl = (...args) => fetch(...args) } = {}) {
  return {
    async fetch(request, env) {
      const allowed = String(env.ALLOWED_ORIGIN || 'https://dattaquest.github.io');
      const origin = request.headers.get('Origin') || '';
      const cors = { Vary: 'Origin', ...(origin === allowed ? {
        'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'Retry-After',
      } : {}) };
      const path = new URL(request.url).pathname.replace(/^\/api\//, '');
      if (request.method === 'GET' && path === 'status') {
        if (origin && origin !== allowed) return reply(403, { error: 'origen_no_permitido' }, cors);
        const servicios = Object.fromEntries(Object.keys(services).map(route =>
          [route, configured(route, env) && protectedService(env)]));
        // Presencia de configuración local: no prueba autorización ni saldo del proveedor.
        const diagnostico = Object.fromEntries(Object.entries(servicios).map(([route, completa]) =>
          [route, { configuracionCompleta: completa, estado: completa ? 'listo_para_verificar' : 'configuracion_requerida' }]));
        return reply(200, { version: 9, servicios, diagnostico }, cors);
      }
      if (origin !== allowed) return reply(403, { error: 'origen_no_permitido' }, cors);
      if (!Object.hasOwn(services, path)) return reply(404, { error: 'no_disponible' }, cors);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method !== 'POST') return reply(405, { error: 'metodo_no_permitido' }, cors, { Allow: 'POST, OPTIONS' });
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const body = await readBody(request); const service = services[path];
        const input = typeof body[service.name] === 'string' ? body[service.name].trim() : '';
        if (!service.pattern.test(input) || typeof body.requestId !== 'string' || !UUID_V4.test(body.requestId)) throw fail('dato_invalido', 400);
        if (!configured(path, env)) throw fail('proveedor_sin_configurar');
        if (!protectedService(env)) throw fail('proteccion_sin_configurar');
        await reserveConsultation(request, body.requestId, path, env);
        let output;
        if (path === 'cuil') output = await consultarCuilAfipSdk({ dni: input,
          accessToken: env.AFIPSDK_ACCESS_TOKEN, cuitRepresentada: env.ARCA_CUIT_REPRESENTADA,
          cert: env.ARCA_CERT, key: env.ARCA_KEY, fetchImpl, signal: controller.signal });
        else if (path === 'radicacion') output = await consultarRadicacionChasis({ patente: input,
          apiKey: env.CHASIS_API_KEY, fetchImpl, signal: controller.signal });
        else output = await optionalProvider(path, input, env, fetchImpl, controller.signal);
        return reply(200, output, cors);
      } catch (error) {
        const code = /^[a-z_]+$/.test(error?.code || '') ? error.code : 'servicio_no_disponible';
        const status = [400, 403, 404, 409, 413, 415, 422, 429, 502, 503].includes(error?.status) ? error.status : 503;
        const retry = Number.isInteger(error?.retryAfter) && error.retryAfter >= 0 && error.retryAfter <= 86400 ? error.retryAfter : 60;
        return reply(status, { error: code }, cors, status === 429 ? { 'Retry-After': String(retry) } : {});
      } finally { clearTimeout(timer); }
    },
  };
}
export default createWorker();
