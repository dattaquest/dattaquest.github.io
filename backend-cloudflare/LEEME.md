# DattaQuest v8 · API de CUIL y radicación

Esta versión conecta las rutas del Worker a dos contratos de proveedor concretos. **El código está implementado; la activación requiere las cuentas, autorizaciones y secretos del titular del sitio.** El repositorio no contiene credenciales ni una URL de Worker inventada.

| Ruta | Integración | Requisito de producción |
| --- | --- | --- |
| `POST /api/cuil` | ARCA Padrón Alcance 13 a través de la API REST de Afip SDK | Token Afip SDK, CUIT representada, certificado y clave privada de producción, certificado autorizado para `ws_sr_padron_a13` |
| `POST /api/radicacion` | API comercial de Chasis, `POST /api/v1/consultas` | Cuenta con acceso a consultas, clave con permisos y condiciones comerciales que permitan el uso del sitio |

Chasis no es una API oficial de DNRPA. La vía de web services oficial exige un convenio y credenciales institucionales; la documentación pública no proporciona un endpoint abierto que podamos activar sin ese acceso. Afip SDK también es un intermediario comercial: la autorización de A13 se tramita en ARCA.

## 1. Obtener los accesos

### CUIL

1. Obtener un access token en la cuenta de [Afip SDK](https://afipsdk.com/).
2. Generar certificado y clave privada de producción para la CUIT que operará el servicio.
3. Autorizar el certificado para **Padrón Alcance 13 (`ws_sr_padron_a13`)** en el Administrador de Relaciones de ARCA. La CUIT representada debe estar autorizada.
4. Conservar certificado y clave en PEM. No usar la CUIT de ejemplo ni credenciales de homologación.

El adaptador hace `/afip/auth` y luego `getIdPersonaListByDocumento` y `getPersona`, siempre con `environment: "prod"`. Publica sólo un resultado único de tipo **CUIL**, con documento y dígito verificador coherentes. Una clave CUIT/CDI no se presenta como CUIL. Varias claves producen `dni_ambiguo`; la falta de resultado en A13 no demuestra ausencia de CUIL en ANSES.

### Radicación

Crear una API key en el panel empresarial de [Chasis](https://www.chasis.com.ar/empresas/panel). Confirmar que el acceso contratado permite mostrar los resultados a los usuarios de DattaQuest. La consulta básica puede descontar créditos y reutiliza resultados durante 15 días; se conserva `consultadoEn` del proveedor. Este proyecto no pide informes de dominio, no compra créditos ni activa facturación.

Los cupos del Worker cuentan **intentos**, incluyendo respuestas almacenadas por Chasis y fallos, para establecer un límite conservador de consumo. No son una estimación del importe facturado; consultar las condiciones de la cuenta, especialmente si tiene modalidad a demanda.

## 2. Preparar Cloudflare y Turnstile

Desde esta carpeta, con Node.js 22 o posterior:

```sh
npm ci
npx wrangler login
```

En Cloudflare, crear un widget **Turnstile Managed** para el dominio `dattaquest.github.io`. La **sitekey** es pública; la **secret key** es privada. El cliente carga el widget al consultar y el Worker valida resultado, hostname y acción. No se usa CORS como sustituto de esa verificación.

En `wrangler.toml`, asignar los cupos diarios elegidos para `CUIL_DAILY_LIMIT` y `RADICACION_DAILY_LIMIT`. Su valor inicial `0` mantiene cerradas las rutas. Se reinician al cambiar de día en Argentina. Cada consulta CUIL puede requerir hasta tres solicitudes HTTP al proveedor.

Ejecutar el primer despliegue, todavía sin credenciales:

```sh
npm run check
npm run deploy
```

Wrangler crea el Worker, el límite de 10 solicitudes por minuto e IP y el objeto de cupos globales. Si la cuenta ya usa el namespace de rate limiting `1008` para otro servicio, elegir un entero libre en `wrangler.toml` para no compartir contadores.

## 3. Guardar secretos en el Worker

Cargar desde el administrador de secretos de Cloudflare o con estos comandos interactivos:

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put AFIPSDK_ACCESS_TOKEN
npx wrangler secret put ARCA_CUIT_REPRESENTADA
npx wrangler secret put CHASIS_API_KEY
```

Para los PEM, usar archivos locales fuera del repositorio:

```sh
npx wrangler secret put ARCA_CERT < /ruta/privada/certificado.pem
npx wrangler secret put ARCA_KEY < /ruta/privada/clave.pem
```

La clave privada se envía desde el Worker al endpoint de autenticación de Afip SDK, según su contrato. Debe usarse una cuenta y un certificado cuya delegación a ese intermediario esté autorizada. Nunca pegar estos valores en el JavaScript público, un commit, un issue o una conversación.

Si se cambiaron cupos o variables del archivo, volver a ejecutar `npm run deploy` para aplicarlos. Los secretos se conservan al desplegar.

## 4. Conectar GitHub Pages al Worker

Copiar la URL que devuelve Wrangler y, desde la raíz del repositorio, ejecutar:

```sh
node herramientas/configurar_api.mjs https://TU-WORKER.workers.dev/api TU_SITEKEY_PUBLICA
```

El script comprueba `GET /api/status` antes de escribir `otros-servicios/comun/api-config.js`. No hace consultas de documentos ni patentes. Publicar ese cambio en GitHub Pages conecta ambos formularios al backend.

`/status` confirma presencia de configuración, cupos y protecciones; **no verifica la vigencia de certificados, el contrato comercial ni el saldo**. La comprobación final se hace desde la página con un documento propio y una patente autorizada. Esa prueba puede consumir el cupo del proveedor. No hay una prueba de producción exitosa registrada en esta entrega, porque no se proporcionaron los accesos.

## Contratos que recibe el navegador

Ambos formularios envían JSON con `turnstileToken` más `dni` o `patente`. Las respuestas llevan `Cache-Control: no-store`. Las claves de los proveedores nunca viajan al navegador.

CUIL:

```json
{
  "verificado": true,
  "cuil": "<11 dígitos confirmados>",
  "dni": "<DNI consultado>",
  "tipoClave": "CUIL",
  "consultadoEn": "<fecha ISO>"
}
```

Radicación:

```json
{
  "verificado": true,
  "patente": "<patente consultada>",
  "registro": "<nombre o null>",
  "codigoRegistro": "<código o null>",
  "direccion": "<dirección del registro o null>",
  "localidad": "<localidad o null>",
  "provincia": "<provincia o null>",
  "consultadoEn": "<fecha ISO o null>",
  "vigenteHasta": "<fecha ISO o null>",
  "reutilizada": false
}
```

`verificado` indica validación del contrato y coherencia de identificadores del proveedor. No equivale a una constancia de ANSES ni a una certificación de DNRPA. En radicación se admite información parcial y cada campo ausente se muestra como “Sin información”. No se devuelven nombres de titulares, domicilios particulares ni cuerpos completos de proveedores.

| Estado | Ejemplos de `error` | Comportamiento |
| --- | --- | --- |
| 400 | `dato_invalido`, `json_invalido` | Corregir entrada |
| 403 | `verificacion_requerida`, `origen_no_permitido` | Repetir verificación desde el sitio autorizado |
| 404 | `cuil_no_encontrado`, `radicacion_no_encontrada` | El servicio no devolvió el dato pedido |
| 409 | `dni_ambiguo`, `consulta_en_curso` | No elegir ni inventar un resultado |
| 422 | `clave_no_es_cuil` | La clave recibida no es un CUIL |
| 429 | `limite_consultas` | Esperar según el límite aplicable |
| 502 | `respuesta_no_verificada`, `documento_no_coincide` | No publicar la respuesta inconsistente |
| 503 | `proveedor_sin_configurar`, `cupo_agotado`, `servicio_no_disponible` | Falta de configuración o indisponibilidad, no ausencia del dato |

El Worker no reintenta automáticamente solicitudes pagas. El contador global reserva cupo antes de acceder al proveedor y rechaza el mismo token de verificación durante 300 segundos. Sólo conserva contadores y hashes temporales de esos tokens; nunca el token original, el DNI ni la patente. Los hashes vencidos se limpian al recibir nuevas reservas. Los cuerpos están limitados a 4096 bytes incluso sin `Content-Length`. No se registran datos de consulta y la observabilidad del Worker está desactivada.

## Otros servicios

Prestadores originales, prefijos y TAC continúan usando archivos locales. El prestador actual y el bloqueo de IMEI siguen siendo conectores opcionales propios, mediante `UPSTREAM_PRESTADORES_URL` / `UPSTREAM_IMEI_URL` y sus correspondientes secretos `_TOKEN`. Si se habilitan, configurar `OTHER_DAILY_LIMIT` (cupo independiente para cada una de esas rutas) y agregar las rutas a `DATTA_API_SERVICES`. No se atribuyen capacidades adicionales a las dos integraciones nuevas.

Los resultados de los seis servicios presentan campos separados. Fuentes, nombres de archivos y explicaciones técnicas se mantienen fuera del resultado. La atribución de licencia del conjunto TAC se conserva fuera de la consulta.

## Verificación reproducible

Desde la raíz:

```sh
node --test tests/test_cuil_adapter.mjs tests/test_chasis_adapter.mjs tests/test_worker.mjs
node tests/test_frontend.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

Desde esta carpeta:

```sh
npm ci
npm run check
```

Las pruebas de proveedores utilizan respuestas simuladas y datos sintéticos; no validan accesos de producción. La prueba `node tests/test_browser.cjs` requiere `npm ci` y `npx playwright install chromium` desde la raíz; usa un servidor local y guarda capturas en `test-results/`. El workflow `Verificar servicios DattaQuest` ejecuta también esta prueba en cada PR y conserva las capturas como artefactos.

## Documentación de los contratos

- [Afip SDK: API REST](https://afipsdk.com/docs/web-services/integracion/api/)
- [Afip SDK: búsqueda por DNI](https://afipsdk.com/docs/web-services/guias/datos-contribuyentes/obtener-cuit-desde-dni/)
- [ARCA: manual Padrón A13 v1.4](https://ftp.afip.gov.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.4.pdf)
- [ARCA: certificados y autorizaciones](https://www.afip.gob.ar/ws/programadores/certificados-digitales.asp)
- [Chasis: documentación](https://www.chasis.com.ar/docs) y [condiciones](https://www.chasis.com.ar/terminos)
- [DNRPA: acceso institucional a web services](https://www.dnrpa.gov.ar/portal_dnrpa/web_services/web_services.html)
- [Cloudflare: validación Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) y [secretos](https://developers.cloudflare.com/workers/configuration/secrets/)
