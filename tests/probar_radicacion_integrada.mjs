import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base = 'otros-servicios/radicacion/';
const html = await readFile(base + 'verificar.html', 'utf8');
assert.doesNotMatch(html, /<iframe\b/i);
for (const id of ['dqForm', 'dqVerifier', 'dqCaptcha', 'dqResult']) {
  assert.ok(html.includes('id="' + id + '"'), id);
}
const config = await readFile(base + 'js/dnrpa-config.js', 'utf8');
const endpoint = config.match(/DATTA_DNRPA_API\s*=\s*'([^']+)'/)[1];
const response = await fetch(endpoint + '/challenge', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', Origin: 'https://dattaquest.github.io'},
  body: '{}',
  signal: AbortSignal.timeout(25000)
});
assert.equal(response.status, 200);
assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://dattaquest.github.io');
const {sesion, imagen} = await response.json();
assert.match(sesion, /^[0-9a-f-]{36}$/i);
assert.match(imagen, /^data:image\/png;base64,iVBORw0KGgo/);
console.log('La página usa el formulario propio y el servidor entrega un verificador oficial.');
