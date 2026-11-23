/* Cupo global y atómico. Persiste contadores y hashes temporales de verificaciones;
 * nunca tokens originales, documentos, patentes, resultados ni direcciones IP. */
const variables = { cuil: 'CUIL_DAILY_LIMIT', radicacion: 'RADICACION_DAILY_LIMIT', prestadores: 'OTHER_DAILY_LIMIT', 'imei/estado': 'OTHER_DAILY_LIMIT' };
const TOKEN_TTL_MS = 300000;
const EXPIRY_PREFIX = 'turnstile-expiry:';
const expiryKey = timestamp => EXPIRY_PREFIX + String(timestamp).padStart(16, '0') + ':';

async function cleanupExpired(txn, now) {
  // Índice ordenado: hasta 64 hashes por reserva, sin recorrer todos los vigentes.
  const expired = await txn.list({ prefix: EXPIRY_PREFIX, end: expiryKey(now) + '\uffff', limit: 64 });
  if (!expired.size) return;
  const tokenKeys = [...expired.values()];
  const hashes = await txn.get(tokenKeys);
  // Un hash ya renovado no se elimina por una entrada antigua del índice.
  const removable = tokenKeys.filter(key => typeof hashes.get(key) === 'number' && hashes.get(key) <= now);
  await txn.delete([...expired.keys(), ...removable]);
}

export class ConsultaQuota {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/reserve') return new Response(null, { status: 404 });
    let service, tokenHash;
    try { ({ service, tokenHash } = await request.json()); } catch { return new Response(null, { status: 400 }); }
    if (!Object.hasOwn(variables, service)) return new Response(null, { status: 503 });
    if (typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash)) return new Response(null, { status: 400 });
    const limit = Number(this.env[variables[service]]);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000) return new Response(null, { status: 503 });
    const status = await this.ctx.storage.transaction(async txn => {
      const now = Date.now();
      await cleanupExpired(txn, now);
      const tokenKey = 'turnstile:' + tokenHash;
      const usedUntil = await txn.get(tokenKey);
      if (typeof usedUntil === 'number' && usedUntil > now) return 409;
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
      const previous = await txn.get(service);
      const count = previous?.date === date ? previous.count : 0;
      if (count >= limit) return 429;
      const expiresAt = now + TOKEN_TTL_MS;
      await txn.put(tokenKey, expiresAt);
      await txn.put(expiryKey(expiresAt) + tokenHash, tokenKey);
      await txn.put(service, { date, count: count + 1 });
      return 204;
    });
    // Los fallos upstream consumen cupo local: así los reintentos no exceden el presupuesto.
    return new Response(null, { status });
  }
}
