import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,sep,extname} from 'node:path';
const root=process.cwd();
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  if(path.endsWith('/radicacion/js/dnrpa-config.js')){
   res.writeHead(200,{'Content-Type':'text/javascript'}).end("window.DATTA_DNRPA_API='https://dnrpa.test/api/radicacion';");return;
  }
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.descarga':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}).end(await readFile(path));
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1360,height:1000}});
 const requests=[];let sessionCounter=0,fail=false,popups=0;
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l6UAAAAASUVORK5CYII=';
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===base){await route.continue();return;}
  if(url.origin!=='https://dnrpa.test'){await route.abort();return;}
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  const body=route.request().postDataJSON();requests.push({path:url.pathname,body});
  const challenge=url.pathname.endsWith('/challenge');
  const payload=challenge?{sesion:'11111111-1111-4111-8111-'+String(++sessionCounter).padStart(12,'0'),imagen:png}:fail?{error:'codigo_incorrecto'}:{verificado:true,patente:body.patente,fuente:'DNRPA',tipoVehiculo:'AUTOMOTOR',registro:'00001 - REGISTRO SINTÉTICO',direccion:'CALLE DE PRUEBA 123',localidad:'LOCALIDAD DE PRUEBA',provincia:'PROVINCIA DE PRUEBA',codigoPostal:'C0000',telefono:'0000-0000',horario:'08:30 a 14:30 hs.',fechaFuente:'23/11/2026',titular:'NO MOSTRAR'};
  await route.fulfill({status:!challenge&&fail?422:200,headers,contentType:'application/json',body:JSON.stringify(payload)});
 });
 const page=await context.newPage();page.on('popup',()=>popups++);
 await page.goto(base+'/otros-servicios/radicacion/nativa.html');
 const submit=page.locator('#dqForm button[type=submit]');
 await page.waitForFunction(()=>!document.querySelector('#dqForm button[type=submit]').disabled);
 assert.equal(await page.locator('iframe').count(),0);
 assert.equal(await page.locator('#dqCaptcha').isVisible(),true);
 await page.locator('#dqValue').fill('ZZZ123');await submit.click();
 await page.waitForFunction(()=>document.querySelector('#dqResult').textContent.includes('Código verificador incompleto'));
 assert.equal(requests.length,1,'No se envía un código incompleto');
 await page.locator('#dqVerifier').fill('00000');await submit.click();
 await page.waitForFunction(()=>document.querySelector('#dqResult').dataset.type==='success');
 assert.equal(await page.locator('#dqResult > strong').textContent(),'Radicación del vehículo');
 assert.match(await page.locator('#dqResult').textContent(),/00001 - REGISTRO SINTÉTICO/);
 assert.doesNotMatch(await page.locator('#dqResult').textContent(),/NO MOSTRAR/);
 assert.equal(popups,0);assert.equal(page.url(),base+'/otros-servicios/radicacion/nativa.html');
 assert.equal(await submit.isDisabled(),true);
 assert.equal(requests.length,2);assert.equal(requests[1].body.verificador,'00000');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/radicacion-nativa-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'test-results/radicacion-nativa-movil.png',fullPage:true});
 await page.locator('#dqRefreshCaptcha').click();await page.waitForFunction(()=>!document.querySelector('#dqForm button[type=submit]').disabled);
 fail=true;await page.locator('#dqVerifier').fill('00000');await submit.click();
 await page.waitForFunction(()=>document.querySelector('#dqResult').textContent.includes('rechazó el código'));
 assert.equal(await submit.isDisabled(),true);
 console.log('Interfaz nativa validada en Chromium: verificador manual, resultado en recuadro, recarga, error y diseño móvil. Respuestas sintéticas, sin consultas oficiales.');
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
