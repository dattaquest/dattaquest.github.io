/**
 * Consulta de radicación mediante la API comercial de Chasis.
 * La clave se mantiene en el servidor; el Worker controla acceso y consumo.
 * «verificado» valida el contrato y la patente, no certifica datos ante DNRPA.
 * Contrato: https://www.chasis.com.ar/docs (POST /consultas, objeto Consulta).
 */
const ENDPOINT = 'https://www.chasis.com.ar/api/v1/consultas';
const PATENTE = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;

function fail(code, status, retryAfter) {
  const error = new Error(code);
  error.name = 'ChasisError';
  error.code = code;
  error.status = status;
  if (retryAfter !== undefined) error.retryAfter = retryAfter;
  return error;
}

function normalizePatente(value) {
  // Sólo los separadores admitidos por el proveedor. No borrar basura arbitraria.
  if (typeof value !== 'string' || value.length > 32 || !/^[A-Za-z0-9 .-]+$/.test(value)) return null;
  const normalized = value.toUpperCase().replace(/[ .-]/g, '');
  return PATENTE.test(normalized) ? normalized : null;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nullableText(value, limit) {
  if (value == null) return null;
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) {
    throw fail('respuesta_no_verificada', 502);
  }
  return value.trim().slice(0, limit) || null;
}

function registryCode(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string') {
    const code = value.trim();
    if (!code) return null;
    if (/^\d{1,12}$/.test(code) && Number(code) > 0) return code;
  }
  throw fail('respuesta_no_verificada', 502);
}

function vehicleType(value) {
  if (value == null) return null;
  // Enum documentado de Consulta; no inferir el tipo por la patente.
  if (value === 'automotor') return 'Automotor';
  if (value === 'moto') return 'Motovehículo';
  throw fail('respuesta_no_verificada', 502);
}

function isoDate(value) {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, offsetHour = '0', offsetMinute = '0'] = parts;
  const leapYear = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days[Number(month) - 1] ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      Number(offsetHour) > 23 || Number(offsetMinute) > 59) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function retrySeconds(response) {
  const value = response.headers?.get?.('Retry-After');
  // No reenviar headers arbitrarios del proveedor ni fechas de interpretación ambigua.
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value.trim())) return undefined;
  const seconds = Number(value.trim());
  return seconds <= 86400 ? seconds : undefined;
}

function upstreamError(response) {
  const status = response?.status;
  if (status === 400) return fail('dato_invalido', 400);
  if (status === 401 || status === 403) return fail('proveedor_no_autorizado', 503);
  if (status === 402) return fail('cupo_agotado', 503);
  if (status === 404) return fail('radicacion_no_encontrada', 404);
  if (status === 409) return fail('consulta_en_curso', 409);
  if (status === 429) return fail('limite_consultas', 429, retrySeconds(response));
  if (status === 408 || (status >= 500 && status <= 599)) return fail('servicio_no_disponible', 503);
  return fail('respuesta_no_verificada', 502);
}

export async function consultarRadicacionChasis({ patente, apiKey, fetchImpl = fetch, signal } = {}) {
  const normalized = normalizePatente(patente);
  if (!normalized) throw fail('dato_invalido', 400);
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key || /[^\x21-\x7e]/.test(key) || typeof fetchImpl !== 'function') {
    throw fail('proveedor_sin_configurar', 503);
  }

  let response;
  try {
    // Un solo POST: reintentarlo podría consumir créditos. No seguir redirecciones.
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ patente: normalized }),
      signal,
    });
  } catch {
    // No propagar mensajes de red que puedan contener claves o datos del proveedor.
    throw fail('servicio_no_disponible', 503);
  }
  if (response?.ok !== true) throw upstreamError(response);
  if (response.status !== 200) throw fail('respuesta_no_verificada', 502);

  let raw;
  try {
    raw = await response.json();
  } catch {
    throw signal?.aborted ? fail('servicio_no_disponible', 503) : fail('respuesta_no_verificada', 502);
  }
  if (!record(raw) || raw.object !== 'consulta') throw fail('respuesta_no_verificada', 502);
  const identities = [raw.patente, raw.dominio].filter(value => value != null);
  if (!identities.length || identities.some(value => normalizePatente(value) !== normalized)) {
    throw fail('respuesta_no_verificada', 502);
  }
  if (raw.registro != null && !record(raw.registro)) throw fail('respuesta_no_verificada', 502);
  if (raw.reutilizada != null && typeof raw.reutilizada !== 'boolean') throw fail('respuesta_no_verificada', 502);
  const tipoVehiculo = vehicleType(raw.tipo);

  const reg = raw.registro || {};
  // Lista blanca: nunca devolver titulares, documentos ni otros campos extra.
  const location = {
    registro: nullableText(reg.nombre, 140),
    codigoRegistro: registryCode(reg.codigo),
    direccion: nullableText(reg.direccion, 200),
    localidad: nullableText(reg.localidad, 100),
    provincia: nullableText(reg.provincia, 100),
  };
  if (!Object.values(location).some(value => value !== null)) throw fail('radicacion_no_encontrada', 404);

  return {
    verificado: true,
    patente: normalized,
    tipoVehiculo,
    ...location,
    consultadoEn: isoDate(raw.consultadoEn),
    vigenteHasta: isoDate(raw.vigenteHasta),
    reutilizada: raw.reutilizada === true,
  };
}
