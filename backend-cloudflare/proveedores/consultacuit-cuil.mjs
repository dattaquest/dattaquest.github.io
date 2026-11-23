/**
 * DNI -> CUIT encontrado en el padrón tributario de ConsultaCUIT.
 * Sólo servidor: el proveedor no publica cabeceras CORS para GitHub Pages.
 * No registra ni conserva documentos, identificadores ni respuestas.
 * Contrato público: https://consultacuit.fluxorhub.com/api
 * Se usa únicamente GET /v1/cuit/{cuit}, documentado y sin credenciales.
 */
const API_BASE = 'https://consultacuit.fluxorhub.com/v1/cuit/';
const PREFIXES = ['20', '23', '24', '27'];
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function failure(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
    : '';
}

function digitFor(body) {
  const sum = WEIGHTS.reduce((total, weight, index) => total + Number(body[index]) * weight, 0);
  return (11 - sum % 11) % 11;
}

function validIdentifier(value) {
  return typeof value === 'string' && /^\d{11}$/.test(value) &&
    digitFor(value.slice(0, 10)) === Number(value[10]);
}

/** Candidatos de consulta, nunca números presentados como verificados. */
export function generarCandidatos(dni) {
  if (typeof dni !== 'string' || !/^\d{7,8}$/.test(dni) || /^0+$/.test(dni)) {
    throw failure('dato_invalido', 400);
  }
  const document = dni.padStart(8, '0');
  return PREFIXES.flatMap(prefix => {
    const body = prefix + document;
    const digit = digitFor(body);
    // Un verificador 10 no es un dígito: se descarta ese prefijo.
    return digit === 10 ? [] : [body + String(digit)];
  });
}

function dateOfSnapshot(body) {
  // El proveedor puede omitir la fecha. No se reemplaza por la fecha actual.
  const value = body.padron_snapshot_date;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw failure('respuesta_no_verificada', 502);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw failure('respuesta_no_verificada', 502);
  }
  return value;
}

function coherentIdentifier(body, candidate) {
  if (body.cuit !== undefined && body.cuit !== candidate) return false;
  if (body.cuit_formateado !== undefined && body.cuit_formateado !==
      `${candidate.slice(0, 2)}-${candidate.slice(2, 10)}-${candidate.slice(10)}`) return false;
  return body.error == null && body.errors == null;
}

function verifiedAbsence(body, candidate) {
  if (!isRecord(body) || !coherentIdentifier(body, candidate) ||
      (body.status !== undefined && body.status !== 404)) return false;
  const title = normalizeText(body.title);
  const detail = normalizeText(body.detail);
  const problemText = `${title} ${detail}`;
  // Un recurso técnico ausente o inaccesible impide consultar el padrón.
  // No contradice la existencia del CUIT, aun si llega encontrado:false.
  if (/\b(?:archivo|fichero|ruta|endpoint|servidor|servicio|tabla|conexion|proxy)\b|\bbase de datos\b/.test(problemText) ||
      /\bpadron\s+(?:no\s+(?:encontrado|disponible|accesible)|ausente|inaccesible)\b/.test(problemText) ||
      /\bno\s+(?:se\s+)?(?:encontro|encuentra|localizo|localiza|existe|hay)\s+(?:(?:el|un)\s+)?padron\b/.test(problemText)) return false;
  if (body.encontrado === false) return true;
  if (body.encontrado !== undefined || body.status !== 404 ||
      typeof body.title !== 'string' || !body.title.trim() ||
      (body.detail !== undefined && typeof body.detail !== 'string') ||
      (body.type !== undefined && (typeof body.type !== 'string' || !body.type.trim()))) return false;
  // OpenAPI describe el 404 como «Sin datos en padrón», sin schema de error.
  // Por eso no basta con palabras sueltas como padrón + no encontrado:
  // el problema debe afirmar explícitamente la ausencia de datos del CUIT.
  const cuitAbsent = /^(?:el\s+)?cuit(?:\s+(?:valido|consultado|solicitado))?\s+(?:sin\s+(?:datos|actividad(?:\s+tributaria)?)|no\s+(?:encontrado|figura|consta|existe))\b/;
  const noDataForCuit = /^(?:sin\s+datos|no\s+(?:hay|se\s+encontraron)\s+datos)\s+(?:para\s+(?:el\s+)?|del\s+)cuit\b/;
  return cuitAbsent.test(title) || noDataForCuit.test(title) ||
    cuitAbsent.test(detail) || noDataForCuit.test(detail);
}

function verifiedMatch(body, candidate, document, dni) {
  if (!isRecord(body) || body.encontrado !== true || body.cuit !== candidate ||
      !validIdentifier(body.cuit) || body.cuit.slice(2, 10) !== document ||
      !coherentIdentifier(body, candidate) || (body.status !== undefined && body.status !== 200)) {
    throw failure('respuesta_no_verificada', 502);
  }
  const humanTypes = new Set(['persona humana', 'persona fisica', 'humana', 'fisica']);
  for (const key of ['tipo_persona', 'tipoPersona']) {
    if (body[key] !== undefined && !humanTypes.has(normalizeText(body[key]))) {
      throw failure('respuesta_no_verificada', 502);
    }
  }
  // Lista blanca: ni denominación, ni domicilios, ni situación fiscal.
  return {
    verificado: true, tipoClave: 'CUIT', cuit: candidate, dni,
    fuente: 'ConsultaCUIT', fechaPadron: dateOfSnapshot(body),
  };
}

/**
 * Devuelve una sola coincidencia verificada, o Error con code/status.
 * fechaPadron es YYYY-MM-DD o null cuando el proveedor no informa la fecha.
 * timeoutMs acota toda la consulta (hasta cuatro GET), incluida lectura de JSON.
 */
export async function consultarCuitConsultaCuit({
  dni, fetchImpl = fetch, signal, timeoutMs = 8000,
} = {}) {
  const candidates = generarCandidatos(dni);
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw failure('servicio_no_disponible', 503);
  }
  if (signal?.aborted) throw failure('servicio_no_disponible', 503);
  const document = dni.padStart(8, '0');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  let rejectAborted;
  const interrupted = new Promise((_, reject) => { rejectAborted = reject; });
  const onAbort = () => rejectAborted(failure('servicio_no_disponible', 503));
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(cancel, timeoutMs);

  async function request(candidate) {
    if (controller.signal.aborted) throw failure('servicio_no_disponible', 503);
    let response;
    try {
      response = await fetchImpl(API_BASE + candidate, {
        // Workers no implementa redirect:error. manual + rechazo de 3xx
        // mantiene la solicitud dentro del origen fijo sin seguir Location.
        method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: controller.signal,
      });
    } catch {
      throw failure('servicio_no_disponible', 503);
    }
    if (controller.signal.aborted) throw failure('servicio_no_disponible', 503);
    if (!response || typeof response.ok !== 'boolean' || !Number.isInteger(response.status) || response.redirected) {
      throw failure('respuesta_no_verificada', 502);
    }
    if (response.status === 429) throw failure('limite_consultas', 429);
    if (response.status === 400) throw failure('respuesta_no_verificada', 502);
    if (response.status !== 200 && response.status !== 404) throw failure('servicio_no_disponible', 503);
    if (response.ok !== (response.status === 200)) throw failure('respuesta_no_verificada', 502);
    const mediaType = response.headers?.get?.('content-type') ?? '';
    if (!/^application\/(?:json|problem\+json)(?:\s*;|$)/i.test(mediaType)) {
      throw failure('respuesta_no_verificada', 502);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw failure(controller.signal.aborted ? 'servicio_no_disponible' : 'respuesta_no_verificada', controller.signal.aborted ? 503 : 502);
    }
    if (controller.signal.aborted) throw failure('servicio_no_disponible', 503);
    if (response.status === 404) {
      if (!verifiedAbsence(body, candidate)) throw failure('respuesta_no_verificada', 502);
      return null;
    }
    return verifiedMatch(body, candidate, document, dni);
  }

  try {
    const outcomes = await Promise.race([
      Promise.allSettled(candidates.map(request)), interrupted,
    ]);
    if (controller.signal.aborted) throw failure('servicio_no_disponible', 503);
    const matches = outcomes.filter(outcome => outcome.status === 'fulfilled' && outcome.value !== null)
      .map(outcome => outcome.value);
    if (matches.length > 1) throw failure('dni_ambiguo', 409);
    const errors = outcomes.filter(outcome => outcome.status === 'rejected').map(outcome => outcome.reason);
    if (errors.length) {
      // Una consulta incompleta no permite afirmar ausencia ni unicidad.
      for (const code of ['limite_consultas', 'servicio_no_disponible', 'respuesta_no_verificada']) {
        const error = errors.find(value => value?.code === code);
        if (error) throw error;
      }
      throw failure('respuesta_no_verificada', 502);
    }
    if (!matches.length) throw failure('clave_no_encontrada', 404);
    return matches[0];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
