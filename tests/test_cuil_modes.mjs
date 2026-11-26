import assert from 'node:assert/strict';
import test from 'node:test';
import {createConsultaCuitService} from '../backend-consultacuit/service.mjs';

const miss = Object.assign(new Error(), {code:'clave_no_encontrada',status:404});
const outage = Object.assign(new Error(), {code:'servicio_no_disponible',status:503});
for (const [name, first, auth, status, calls] of [
  ['CUIT localizado', {tipoClave:'CUIT'}, true, 200, 0],
  ['CUIL después de ausencia tributaria', miss, true, 200, 1],
  ['ausencia sin acceso A13', miss, false, 404, 0],
  ['falla técnica del padrón', outage, true, 503, 0]
]) {
  test(name, async () => {
    let used = 0;
    const handle = createConsultaCuitService({
      lookup:async () => { if(first instanceof Error) throw first; return first; },
      getCuilCredentials:() => auth ? {accessToken:'testing'} : null,
      cuilLookup:async ({dni,accessToken}) => {
        used++; assert.equal(dni,'12345678');assert.equal(accessToken,'testing');
        return {tipoClave:'CUIL',dni,cuil:'20123456786',verificado:true};
      }
    });
    const r = await handle(new Request('https://example.org/api/cuil',{
      method:'POST',headers:{Origin:'https://dattaquest.github.io','Content-Type':'application/json'},
      body:JSON.stringify({dni:'12345678'})
    }));
    assert.equal(r.status,status); assert.equal(used,calls);
    if(calls) assert.equal((await r.json()).fuente,'ARCA A13');
  });
}

const origin = 'https://dattaquest.github.io';
const endpoint = 'https://example.org/api/cuil';
const dni = '12345678';
const number = '20123456786';
const cuit = {tipoClave:'CUIT', dni, cuit:number, verificado:true, fuente:'ConsultaCUIT'};
const cuil = {tipoClave:'CUIL', dni, cuil:number, verificado:true};
const post = tipoClave => new Request(endpoint, {
  method:'POST', headers:{Origin:origin, 'Content-Type':'application/json'},
  body:JSON.stringify({dni, tipoClave}),
});

test('CUIT explícito consulta solo ConsultaCUIT, también cuando falta el documento', async () => {
  for (const answer of [cuit, miss]) {
    const calls = [];
    const handle = createConsultaCuitService({
      lookup:async ({dni: requested}) => {
        calls.push(requested);
        if (answer === miss) throw miss;
        return answer;
      },
      getCuilCredentials:() => assert.fail('CUIT no requiere credenciales A13'),
      cuilLookup:async () => assert.fail('CUIT no consulta A13'),
    });
    const response = await handle(post('CUIT'));
    assert.equal(response.status, answer === miss ? 404 : 200);
    assert.deepEqual(await response.json(), answer === miss ? {error:'clave_no_encontrada'} : cuit);
    assert.deepEqual(calls, [dni]);
  }
});

test('CUIL explícito consulta solo A13 y distingue acceso ausente, éxito y error del proveedor', async () => {
  for (const [credentials, answer, status, expected] of [
    [null, null, 503, {error:'cuil_no_habilitado'}],
    [{accessToken:'testing'}, cuil, 200, {...cuil, fuente:'ARCA A13'}],
    [{accessToken:'testing'}, outage, 503, {error:'servicio_no_disponible'}],
  ]) {
    const calls = [];
    const handle = createConsultaCuitService({
      lookup:async () => assert.fail('CUIL no consulta el padrón tributario'),
      getCuilCredentials:() => credentials,
      cuilLookup:async ({dni: requested, accessToken, signal}) => {
        calls.push(requested);
        assert.equal(accessToken,'testing');
        assert.ok(signal instanceof AbortSignal);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    });
    const response = await handle(post('CUIL'));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), expected);
    assert.deepEqual(calls, credentials ? [dni] : []);
  }
});

test('rechaza el tipo contrario del proveedor y selectores inválidos', async () => {
  const handle = createConsultaCuitService({
    lookup:async () => cuil, cuilLookup:async () => cuit, getCuilCredentials:() => ({accessToken:'testing'}),
  });
  for (const mode of ['CUIT','CUIL']) {
    const response = await handle(post(mode));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {error:'respuesta_no_verificada'});
  }
  for (const mode of ['cuil', 'CDI', '', false, null, {}]) {
    const response = await handle(post(mode));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {error:'dato_invalido'});
  }
});

test('GET informa solo configuración de CUIL, sin consumir una consulta ni exponer credenciales', async () => {
  for (const credentials of [null, {accessToken:'testing'}]) {
    const calls = [];
    const handle = createConsultaCuitService({
      getCuilCredentials:() => credentials,
      lookup:async () => {calls.push('CUIT'); return cuit;},
      cuilLookup:async () => {calls.push('CUIL'); return cuil;},
    });
    for (let i = 0; i < 9; i++) {
      const response = await handle(new Request(endpoint, {headers:{Origin:origin}}));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await response.json(), {cuilHabilitado:Boolean(credentials)});
    }
    assert.deepEqual(calls, []);
    assert.equal((await handle(post('CUIT'))).status, 200);
    const forbidden = await handle(new Request(endpoint, {headers:{Origin:'https://otro.example'}}));
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.headers.has('Access-Control-Allow-Origin'), false);
  }
});
