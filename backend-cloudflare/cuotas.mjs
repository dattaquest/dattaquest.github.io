/* Cupo global y atómico. Persiste contadores y hashes temporales de solicitudes;
 * nunca UUID originales, documentos, patentes, resultados ni direcciones IP. */
const variables = { cuil: 'CUIL_DAILY_LIMIT', radicacion: 'RADICACION_DAILY_LIMIT', prestadores: 'OTHER_DAILY_LIMIT', 'imei/estado': 'OTHER_DAILY_LIMIT' };
const REQUEST_TTL_MS = 300000;
const EXPIRY_PREFIX = 'request-expiry:';
const expiryKey = timestamp => EXPIRY_PREFIX + String(timestamp).padStart(16, '0') + ':';
const argentinaClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const localParts = now => Object.fromEntries(argentinaClock.formatToParts(new Date(now)).map(({ type, value }) => [type, value]));

export function argentinaQuotaWindow(now = Date.now()) {
  const { year, month, day } = localParts(now);
  const nextLocalDay = Date.UTC(Number(year), Number(month) - 1, Number(day) + 1);
  let nextMidnight = nextLocalDay;
  // Resolver la medianoche con la zona IANA, sin depender de la zona del servidor.
  for (let i = 0; i < 3; i++) {
    const local = localParts(nextMidnight);
    const represented = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day),
      Number(local.hour), Number(local.minute), Number(local.second));
    const difference = nextLocalDay - represented;
    if (difference === 0) break;
    nextMidnight += difference;
  }
  return { date: `${year}-${month}-${day}`, retryAfter: Math.max(1, Math.ceil((nextMidnight - now) / 1000)) };
}

async function cleanupExpired(txn, now) {
  // Índice ordenado: hasta 64 hashes por reserva, sin recorrer todos los vigentes.
  const expired = await txn.list({ prefix: EXPIRY_PREFIX, end: expiryKey(now) + '\uffff', limit: 64 });
  if (!expired.size) return;
  const requestKeys = [...expired.values()];
  const hashes = await txn.get(requestKeys);
  // Un hash ya renovado no se elimina por una entrada antigua del índice.
  const removable = requestKeys.filter(key => typeof hashes.get(key) === 'number' && hashes.get(key) <= now);
  await txn.delete([...expired.keys(), ...removable]);
}

export class ConsultaQuota {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/reserve') return new Response(null, { status: 404 });
    let service, requestHash;
    try { ({ service, requestHash } = await request.json()); } catch { return new Response(null, { status: 400 }); }
    if (!Object.hasOwn(variables, service)) return new Response(null, { status: 503 });
    if (typeof requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(requestHash)) return new Response(null, { status: 400 });
    const limit = Number(this.env[variables[service]]);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000) return new Response(null, { status: 503 });
    const result = await this.ctx.storage.transaction(async txn => {
      const now = Date.now();
      await cleanupExpired(txn, now);
      const requestKey = 'request:' + requestHash;
      const usedUntil = await txn.get(requestKey);
      if (typeof usedUntil === 'number' && usedUntil > now) return { status: 409 };
      const { date, retryAfter } = argentinaQuotaWindow(now);
      const previous = await txn.get(service);
      const count = previous?.date === date ? previous.count : 0;
      if (count >= limit) return { status: 429, retryAfter };
      const expiresAt = now + REQUEST_TTL_MS;
      await txn.put(requestKey, expiresAt);
      await txn.put(expiryKey(expiresAt) + requestHash, requestKey);
      await txn.put(service, { date, count: count + 1 });
      return { status: 204 };
    });
    // Los fallos upstream consumen cupo local: así los reintentos no exceden el presupuesto.
    return new Response(null, { status: result.status,
      headers: result.status === 429 ? { 'Retry-After': String(result.retryAfter) } : {},
    });
  }
}
