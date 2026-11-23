/**
 * Adaptador experimental de la interfaz pública anónima, no de la API privada.
 * Formulario observado: argentina.gob.ar/propiedadautomotor/consultar-radicacion-vehiculo
 * Plantillas oficiales: argob/drupal-argentina-distro, ConsultaRadicacionPorDominio.php
 * y templates/response_panel{,_completo}.tpl.php. Drupal documenta selector:null
 * como el wrapper del formulario: api.drupal.org/.../ajax_command_insert/7.x.
 * No ejecuta HTML/JavaScript ni guarda patentes, cookies, tokens o respuestas.
 */
const ORIGIN = 'https://www.argentina.gob.ar';
const FORM_URL = ORIGIN + '/propiedadautomotor/consultar-radicacion-vehiculo';
const AJAX_URL = ORIGIN + '/system/ajax';
const SOURCE = 'Argentina.gob.ar / DNRPA';
const PLATE = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|\d{3}[A-Z]{3}|[A-Z]\d{3}[A-Z]{3})$/;
const LIMIT = 512 * 1024;
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const ENTITIES = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',aacute:'á',eacute:'é',iacute:'í',oacute:'ó',uacute:'ú',ntilde:'ñ',uuml:'ü',Aacute:'Á',Eacute:'É',Iacute:'Í',Oacute:'Ó',Uacute:'Ú',Ntilde:'Ñ',Uuml:'Ü',ordm:'º',ordf:'ª',deg:'°',ndash:'–',mdash:'—'};

function fail(code, status = 503) { return Object.assign(new Error(code), {code, status}); }
function norm(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? whole;
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\ufffd';
  });
}
function normalizePlate(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^[A-Za-z0-9 .-]+$/.test(value)) throw fail('dato_invalido', 400);
  const plate = value.toUpperCase().replace(/[ .-]/g, '');
  if (!PLATE.test(plate)) throw fail('dato_invalido', 400);
  return plate;
}

// Lector inerte para el marcado concreto del formulario y sus paneles label/p.
// No crea DOM, no sigue enlaces, no evalúa scripts ni procesa comandos Drupal.
function htmlTree(html) {
  const root = {tag:'root', attrs:{}, children:[]}; const stack = [root]; let i = 0, count = 0;
  while (i < html.length) {
    if (++count > 15000 || stack.length > 80) throw fail('respuesta_no_verificada', 502);
    if (html.startsWith('<!--', i)) { const end = html.indexOf('-->', i + 4); if (end < 0) throw fail('respuesta_no_verificada', 502); i = end + 3; continue; }
    if (html[i] !== '<') { let end = html.indexOf('<', i); if (end < 0) end = html.length; stack.at(-1).children.push(decode(html.slice(i, end))); i = end; continue; }
    let end = i + 1, quote = '';
    for (; end < html.length; end++) {
      const c = html[end];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (end === html.length) throw fail('respuesta_no_verificada', 502);
    const raw = html.slice(i + 1, end); i = end + 1;
    if (/^!doctype\b/i.test(raw)) continue;
    const closing = /^\/\s*([a-z][\w:-]*)\s*$/i.exec(raw);
    if (closing) { const tag = closing[1].toLowerCase(); for (let j = stack.length - 1; j > 0; j--) if (stack[j].tag === tag) { stack.length = j; break; } continue; }
    const match = /^([a-z][\w:-]*)([\s\S]*)$/i.exec(raw);
    if (!match) throw fail('respuesta_no_verificada', 502);
    const tag = match[1].toLowerCase(); const attrs = Object.create(null);
    let rest = match[2].replace(/\/\s*$/, '');
    while (rest.trim()) {
      const attr = /^\s+([^\s=<>/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>"'`=]+)))?/.exec(rest);
      if (!attr) throw fail('respuesta_no_verificada', 502);
      const key = attr[1].toLowerCase(); if (Object.hasOwn(attrs, key)) throw fail('respuesta_no_verificada', 502);
      attrs[key] = decode(attr[2] ?? attr[3] ?? attr[4] ?? ''); rest = rest.slice(attr[0].length);
    }
    if (['script','style','noscript','template'].includes(tag)) {
      const close = new RegExp('</' + tag + '\\s*>', 'ig'); close.lastIndex = i; const found = close.exec(html);
      if (!found) throw fail('respuesta_no_verificada', 502);
      i = close.lastIndex; continue;
    }
    const node = {tag, attrs, children:[], parent:stack.at(-1)}; stack.at(-1).children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(raw)) stack.push(node);
  }
  return root;
}
function nodes(root, predicate) {
  const found = [], pending = [root];
  while (pending.length) { const node = pending.pop(); if (typeof node === 'string') continue; if (predicate(node)) found.push(node); pending.push(...node.children.slice().reverse()); }
  return found;
}
function textOf(node) { return typeof node === 'string' ? node : node.children.map(textOf).join(' '); }
function classes(node) { return (node.attrs.class || '').split(/\s+/); }
function restricted(html) {
  if (/cf-chl-|challenge-platform|cf-browser-verification|g-recaptcha|h-captcha|cf-turnstile|recaptcha\/api|hcaptcha\.com/i.test(html)) throw fail('fuente_restringida');
  const tree = htmlTree(html);
  if (nodes(tree, node => /captcha|verificador|turnstile/i.test([node.attrs.name,node.attrs.id,node.attrs.src].filter(Boolean).join(' '))).length) throw fail('fuente_restringida');
  return tree;
}

function parseForm(html) {
  const tree = restricted(html);
  const forms = nodes(tree, n => n.tag === 'form' && n.attrs.id === 'consulta-radicacion-dominio');
  if (forms.length !== 1) throw fail('formulario_cambiado', 502);
  const form = forms[0]; let action;
  try { action = new URL(form.attrs.action, FORM_URL).href; } catch { throw fail('formulario_cambiado', 502); }
  if (action !== FORM_URL || (form.attrs.method || '').toUpperCase() !== 'POST' ||
      nodes(form, n => n.attrs.id === 'contenedor').length !== 1) throw fail('formulario_cambiado', 502);
  const controls = nodes(form, n => ['input','button','select','textarea'].includes(n.tag)); const fields = new Map();
  for (const node of controls) {
    const name = node.attrs.name;
    if (!name || fields.has(name)) throw fail('formulario_cambiado', 502);
    if (!['patente','op','form_build_id','form_id','tarro_de_miel','form_token'].includes(name)) throw fail('formulario_cambiado', 502);
    fields.set(name, node);
  }
  const field = name => fields.get(name)?.attrs;
  if (field('patente')?.type !== 'text' || field('op')?.type !== 'submit' || field('op')?.value !== 'Consultalo' ||
      field('form_build_id')?.type !== 'hidden' || !/^form-[A-Za-z0-9_-]{10,180}$/.test(field('form_build_id')?.value || '') ||
      field('form_id')?.type !== 'hidden' || field('form_id')?.value !== 'consulta_radicacion_dominio' ||
      field('tarro_de_miel')?.type !== 'text' || field('tarro_de_miel')?.value) throw fail('formulario_cambiado', 502);
  const tokens = {form_build_id:field('form_build_id').value, form_id:field('form_id').value};
  if (fields.has('form_token')) {
    if (field('form_token').type !== 'hidden' || !/^[A-Za-z0-9_-]{10,256}$/.test(field('form_token').value || '')) throw fail('formulario_cambiado', 502);
    tokens.form_token = field('form_token').value;
  }
  return tokens;
}

function cookieHeader(response) {
  const headers = response.headers;
  const raw = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() :
    (headers?.get?.('set-cookie') || '').split(/,(?=\s*[^;,\s]+=)/);
  const cookies = [];
  for (const value of raw) {
    if (!value) continue;
    const pair = value.split(';', 1)[0].trim();
    if (!/^[!#$%&'*+.^_`|~\w-]+=[\x21-\x3a\x3c-\x7e]*$/.test(pair) || pair.length > 4096) throw fail('formulario_cambiado', 502);
    const domain = /;\s*domain=([^;]+)/i.exec(value)?.[1].toLowerCase().replace(/^\./, '');
    if (domain && !['argentina.gob.ar','www.argentina.gob.ar'].includes(domain)) throw fail('formulario_cambiado', 502);
    cookies.push(pair);
  }
  if (cookies.length > 20 || cookies.join('; ').length > 8192) throw fail('formulario_cambiado', 502);
  return cookies.join('; ');
}

async function boundedText(response) {
  const length = response.headers?.get?.('content-length');
  if (length && Number(length) > LIMIT) throw fail('respuesta_no_verificada', 502);
  if (!response.body?.getReader) {
    const text = await response.text(); if (new TextEncoder().encode(text).length > LIMIT) throw fail('respuesta_no_verificada', 502); return text;
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', {fatal:true}); let text = '', size = 0;
  try {
    for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > LIMIT) { await reader.cancel(); throw fail('respuesta_no_verificada', 502); } text += decoder.decode(value, {stream:true}); }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

async function withDeadline({fetchImpl = fetch, signal, timeoutMs = 12000} = {}, task) {
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || signal?.aborted) throw fail('fuente_no_disponible');
  const controller = new AbortController(); const abort = () => controller.abort(); let reject;
  const interrupted = new Promise((_, bad) => { reject = bad; });
  const onAbort = () => reject(fail('fuente_no_disponible'));
  controller.signal.addEventListener('abort', onAbort, {once:true}); signal?.addEventListener('abort', abort, {once:true});
  const timer = setTimeout(abort, timeoutMs);
  async function request(url, init, kind) {
    if (controller.signal.aborted) throw fail('fuente_no_disponible');
    let response;
    try { response = await fetchImpl(url, {...init, redirect:'manual', credentials:'omit', cache:'no-store', signal:controller.signal}); }
    catch { throw fail('fuente_no_disponible'); }
    if (controller.signal.aborted) throw fail('fuente_no_disponible');
    if (response?.status === 429) throw fail('limite_consultas', 429);
    if (response?.status === 401 || response?.status === 403) throw fail('fuente_restringida');
    if (response?.status !== 200 || response.ok !== true || response.redirected) throw fail('fuente_no_disponible');
    const mime = response.headers?.get?.('content-type') || '';
    if (!(kind === 'html' ? /^text\/html(?:\s*;|$)/i : /^application\/json(?:\s*;|$)/i).test(mime)) throw fail('respuesta_no_verificada', 502);
    let text;
    try { text = await boundedText(response); } catch (e) { if (e?.code) throw e; throw fail('fuente_no_disponible'); }
    if (controller.signal.aborted) throw fail('fuente_no_disponible');
    return {response,text};
  }
  try { return await Promise.race([task(request), interrupted]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', onAbort); controller.abort(); }
}

const LABELS = {'registro seccional':'registro','direccion':'direccion','localidad':'localidad','provincia':'provincia','codigo postal':'codigoPostal','telefono':'telefono','horario':'horario'};
function safeValue(node, key) {
  const text = textOf(node).replace(/\s+/g, ' ').trim();
  if (!text || /^(?:-|–|—|n\/a|sin datos|no disponible)$/i.test(text)) return null;
  if (text.length > (['registro','direccion'].includes(key) ? 240 : 120) || /[<>\u0000-\u001f\u007f\ufffd]/.test(text)) throw fail('respuesta_no_verificada', 502);
  return text;
}
function parseResult(commands, plate) {
  if (!Array.isArray(commands) || !commands.length || commands.length > 40) throw fail('respuesta_no_verificada', 502);
  const fragments = [];
  for (const command of commands) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) throw fail('respuesta_no_verificada', 502);
    if (command.command === 'redirect') throw fail('fuente_restringida');
    if (command.command !== 'insert' || ![null,'#contenedor'].includes(command.selector)) continue;
    if (typeof command.data !== 'string') throw fail('respuesta_no_verificada', 502);
    const tree = restricted(command.data);
    const message = norm(textOf(tree));
    // El código oficial histórico emite este mensaje también ante HTTP 500.
    if (/no aparece radicado|no es una patente valida|servicio no disponible|error del servicio|acceso denegado/.test(message)) throw fail('fuente_no_disponible');
    if (!['replace','replaceWith','html',null].includes(command.method)) {
      // Drupal puede anteponer mensajes: nunca convertirlos en un resultado.
      if (command.data.trim()) throw fail('respuesta_no_verificada', 502);
      continue;
    }
    const containers = nodes(tree, n => n.attrs.id === 'contenedor');
    if (containers.length !== 1) throw fail('respuesta_no_verificada', 502);
    fragments.push(containers[0]);
  }
  if (fragments.length !== 1) throw fail('respuesta_no_verificada', 502);
  const container = fragments[0];
  const echoes = nodes(container, n => n.tag === 'h2' && norm(textOf(n)).startsWith('informacion del vehiculo de patente'));
  if (echoes.length !== 1 || norm(textOf(echoes[0])) !== 'informacion del vehiculo de patente ' + plate.toLowerCase()) throw fail('respuesta_no_verificada', 502);
  const panels = nodes(container, n => n.tag === 'div' && classes(n).includes('panel-body') &&
    n.children.some(child => typeof child !== 'string' && child.tag === 'h2' && norm(textOf(child)) === 'informacion del registro automotor'));
  if (panels.length !== 1) throw fail('respuesta_no_verificada', 502);
  const values = {registro:null,direccion:null,localidad:null,provincia:null,codigoPostal:null,telefono:null,horario:null}; const seen = new Set();
  for (const label of nodes(panels[0], n => n.tag === 'label')) {
    const key = LABELS[norm(textOf(label)).replace(/:$/, '')]; if (!key) continue;
    if (seen.has(key)) throw fail('respuesta_no_verificada', 502); seen.add(key);
    const siblings = label.parent.children; const next = siblings.slice(siblings.indexOf(label) + 1).find(n => typeof n !== 'string' || n.trim());
    if (!next || typeof next === 'string' || next.tag !== 'p') throw fail('respuesta_no_verificada', 502);
    values[key] = safeValue(next,key);
  }
  for (const key of ['registro','direccion','localidad','provincia']) if (!values[key] || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(values[key])) throw fail('respuesta_no_verificada', 502);
  return {verificado:true,patente:plate,...values,codigoRegistro:null,fuente:SOURCE,consultadoEn:null};
}

/** Health exclusivamente estructural: una sola carga del formulario, ninguna patente. */
export async function comprobarRadicacionArgentina(options = {}) {
  try {
    return await withDeadline(options, async request => {
      const {text} = await request(FORM_URL, {method:'GET',headers:{Accept:'text/html'}}, 'html');
      parseForm(text);
      return {disponible:true,fuente:SOURCE};
    });
  } catch (error) {
    if (['formulario_cambiado','fuente_restringida','fuente_no_disponible','limite_consultas'].includes(error?.code)) throw error;
    throw fail('formulario_cambiado', 502);
  }
}

export async function consultarRadicacionArgentina({patente,...options} = {}) {
  const plate = normalizePlate(patente);
  return withDeadline(options, async request => {
    const loaded = await request(FORM_URL, {method:'GET',headers:{Accept:'text/html'}}, 'html');
    const tokens = parseForm(loaded.text); const cookie = cookieHeader(loaded.response);
    const body = new URLSearchParams({...tokens,patente:plate,op:'Consultalo',tarro_de_miel:'',
      _triggering_element_name:'op',_triggering_element_value:'Consultalo'});
    const headers = {Accept:'application/json','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'};
    if (cookie) headers.Cookie = cookie;
    const {text} = await request(AJAX_URL, {method:'POST',headers,body:body.toString()}, 'json');
    let commands; try { commands = JSON.parse(text); } catch { throw fail('respuesta_no_verificada', 502); }
    return parseResult(commands,plate);
  });
}
