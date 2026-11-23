/**
 * Adaptador OPCIONAL para una API comercial documentada de radicación.
 *
 * NO lo llamés desde una ruta pública: cada consulta puede consumir créditos.
 * Requiere cuenta, key secreta en el servidor, autenticación de usuarios,
 * límites por cuenta/IP y control de presupuesto. No accede por sí solo a DNRPA.
 *
 * Referencia: https://www.chasis.com.ar/docs#consultas
 */
export async function consultarRadicacionChasis({ patente, apiKey, fetchImpl = fetch, signal } = {}) {
  const normalized = String(patente || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/.test(normalized)) {
    throw new Error('PATENTE_INVALIDA');
  }
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('CHASIS_SIN_CREDENCIALES');
  }
  const res = await fetchImpl('https://www.chasis.com.ar/api/v1/consultas', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ patente: normalized }),
    signal,
  });
  if (!res.ok) {
    // No exponer el cuerpo del error: puede incluir detalles privados.
    throw new Error('CHASIS_HTTP_' + res.status);
  }
  const raw = await res.json();
  const returnedPatente = String(raw?.patente || raw?.dominio || '').toUpperCase();
  const reg = raw?.registro;
  if (raw?.object !== 'consulta' || returnedPatente !== normalized ||
      !reg || typeof reg.nombre !== 'string' || !reg.nombre.trim() ||
      typeof reg.localidad !== 'string' || !reg.localidad.trim()) {
    throw new Error('CHASIS_RESPUESTA_INCOMPLETA');
  }
  // Solo campos de radicación. Jamás enviar datos personales del titular.
  return {
    verificado: true,
    fuente: 'Chasis (proveedor comercial; datos de radicación declarados DNRPA)',
    registro: reg.nombre.trim().slice(0, 140),
    localidad: reg.localidad.trim().slice(0, 100),
    provincia: typeof reg.provincia === 'string' ? reg.provincia.trim().slice(0, 100) : '',
    consultadoEn: typeof raw.consultadoEn === 'string' ? raw.consultadoEn : '',
  };
}
