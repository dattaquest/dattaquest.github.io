/**
 * Consulta de CUIL registrado mediante ARCA A13 y el puente REST de Afip SDK.
 * Sólo servidor: accessToken, cert y key deben provenir de secretos del Worker.
 * No registrar solicitudes, respuestas, documentos ni credenciales.
 *
 * Contrato: https://afipsdk.com/docs/web-services/integracion/api/
 * Producción: https://afipsdk.com/docs/web-services/guias/ir-a-produccion/
 * Métodos: https://afipsdk.com/docs/api-reference/web-services/ws_sr_padron_a13/
 */
const API_BASE = 'https://app.afipsdk.com/api/v1/afip';
const WSID = 'ws_sr_padron_a13';

function failure(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value) {
  if (typeof value === 'string' && /^\d{11}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && /^\d{11}$/.test(String(value))) {
    return String(value);
  }
  return null;
}

function validChecksum(value) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  return (11 - sum % 11) % 11 === Number(value[10]);
}

function normalizedDocument(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== 'string' || !/^\d{1,8}$/.test(value) || /^0+$/.test(value)) return null;
  return value.padStart(8, '0');
}

// Se comprueba el formato PEM. ARCA valida el certificado y su autorización.
function validPem(value, kind) {
  if (typeof value !== 'string' || value.length > 32768) return false;
  const match = value.trim().match(/^-----BEGIN (CERTIFICATE|PRIVATE KEY|RSA PRIVATE KEY)-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END \1-----$/);
  if (!match || (kind === 'cert' ? match[1] !== 'CERTIFICATE' : match[1] === 'CERTIFICATE')) return false;
  const body = match[2].replace(/[\r\n]/g, '');
  return body.length >= 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body);
}

export async function consultarCuilAfipSdk({
  dni, accessToken, cuitRepresentada, cert, key, fetchImpl = fetch, signal, now = Date.now(),
} = {}) {
  if (typeof dni !== 'string' || !/^\d{7,8}$/.test(dni) || /^0+$/.test(dni)) {
    throw failure('dato_invalido', 400);
  }
  const document = normalizedDocument(dni);
  if (typeof accessToken !== 'string' || !accessToken.trim() || /\s/.test(accessToken.trim()) ||
      accessToken.length > 8192 || typeof cuitRepresentada !== 'string' ||
      !identifier(cuitRepresentada) || /^0+$/.test(cuitRepresentada) || !validChecksum(cuitRepresentada) ||
      !validPem(cert, 'cert') || !validPem(key, 'key')) {
    throw failure('proveedor_sin_configurar', 503);
  }
  if (typeof now !== 'number' || !Number.isFinite(now) || Number.isNaN(new Date(now).getTime())) {
    throw failure('respuesta_no_verificada', 502);
  }
  const consultadoEn = new Date(now).toISOString();

  async function request(path, payload) {
    if (signal?.aborted) throw failure('servicio_no_disponible', 503);
    let response;
    try {
      response = await fetchImpl(`${API_BASE}/${path}`, {
        method: 'POST',
        // Workers admite manual; la respuesta se rechaza sin seguir Location.
        redirect: 'manual',
        headers: {
          'Authorization': `Bearer ${accessToken.trim()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch {
      throw failure('servicio_no_disponible', 503);
    }
    if (!response || typeof response.ok !== 'boolean') throw failure('respuesta_no_verificada', 502);
    if (response.redirected) throw failure('respuesta_no_verificada', 502);
    if (response.status >= 300 && response.status < 400) throw failure('servicio_no_disponible', 503);
    if (!response.ok) {
      if (response.status === 402 || response.status === 429) throw failure('limite_consultas', 429);
      if (response.status === 401 || response.status === 403) throw failure('proveedor_sin_configurar', 503);
      throw failure('servicio_no_disponible', 503);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw failure(signal?.aborted ? 'servicio_no_disponible' : 'respuesta_no_verificada', signal?.aborted ? 503 : 502);
    }
    if (signal?.aborted) throw failure('servicio_no_disponible', 503);
    if (!isRecord(body)) throw failure('respuesta_no_verificada', 502);
    return body;
  }

  // Afip SDK ya gestiona el caché del ticket; este adaptador no conserva datos.
  const auth = await request('auth', {
    environment: 'prod',
    tax_id: cuitRepresentada,
    wsid: WSID,
    cert: cert.trim(),
    key: key.trim(),
  });
  if (typeof auth.token !== 'string' || !auth.token.trim() || auth.token.length > 262144 ||
      typeof auth.sign !== 'string' || !auth.sign.trim() || auth.sign.length > 262144) {
    throw failure('respuesta_no_verificada', 502);
  }
  if (auth.expiration !== undefined && (
    typeof auth.expiration !== 'string' || !Number.isFinite(Date.parse(auth.expiration)) ||
    Date.parse(auth.expiration) <= now
  )) {
    throw failure('respuesta_no_verificada', 502);
  }
  const authParams = { token: auth.token, sign: auth.sign, cuitRepresentada };
  const lookup = await request('requests', {
    environment: 'prod',
    wsid: WSID,
    method: 'getIdPersonaListByDocumento',
    params: { ...authParams, documento: dni },
  });
  if (!isRecord(lookup.idPersonaListReturn)) throw failure('respuesta_no_verificada', 502);
  const rawIds = lookup.idPersonaListReturn.idPersona;
  const values = rawIds == null ? [] : Array.isArray(rawIds) ? rawIds : [rawIds];
  const ids = values.map(identifier);
  if (ids.some(id => !id || /^0+$/.test(id) || !validChecksum(id))) throw failure('respuesta_no_verificada', 502);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) throw failure('cuil_no_encontrado', 404);
  if (uniqueIds.length > 1) throw failure('dni_ambiguo', 409);

  const selectedId = uniqueIds[0];
  const details = await request('requests', {
    environment: 'prod',
    wsid: WSID,
    method: 'getPersona',
    params: { ...authParams, idPersona: selectedId },
  });
  const person = details.personaReturn?.persona;
  if (!isRecord(person) || identifier(person.idPersona) !== selectedId) {
    throw failure('respuesta_no_verificada', 502);
  }
  if (person.tipoClave === 'CUIT' || person.tipoClave === 'CDI') throw failure('clave_no_es_cuil', 422);
  if (person.tipoClave !== 'CUIL' || person.tipoPersona !== 'FISICA') {
    throw failure('respuesta_no_verificada', 502);
  }
  if (normalizedDocument(person.numeroDocumento) !== document || selectedId.slice(2, 10) !== document) {
    throw failure('documento_no_coincide', 502);
  }
  // Lista blanca deliberada: no devolver nombres, domicilios ni cuerpos upstream.
  return { verificado: true, cuil: selectedId, dni, tipoClave: 'CUIL', consultadoEn };
}
