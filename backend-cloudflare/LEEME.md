# DattaQuest v9 · Consultas dentro de la página

> Desde v10, el formulario CUIL/CUIT usa un conector gratuito independiente de ConsultaCUIT. Esta guía corresponde al backend anterior y no es necesaria para activar la nueva consulta. Ver [el conector actual](../backend-consultacuit/LEEME.md).

**Estado de esta entrega: las consultas de producción no están activadas ni se probaron con documentos o patentes.** El código de integración está preparado; faltan las cuentas autorizadas, sus credenciales y el despliegue. Fusionar el PR, por sí solo, no habilita el acceso a los datos.

Los formularios piden solamente **DNI + Consultar CUIL** o **patente + Consultar patente**. El resultado se presenta dentro de DattaQuest, sin selección de sexo, CAPTCHA, código verificador ni enlaces de salida a ANSES/DNRPA. Si el servicio no está habilitado o falla, se informa esa situación sin fabricar un resultado.

## Integraciones

| Ruta | Proveedor | Acceso necesario |
| --- | --- | --- |
| `POST /api/cuil` | ARCA Padrón Alcance 13 mediante Afip SDK | Access token, CUIT representada y certificado con clave privada de producción autorizado para `ws_sr_padron_a13` |
| `POST /api/radicacion` | API comercial de Chasis, `POST /api/v1/consultas` | Cuenta habilitada, API key con permisos de consulta y acceso contratado para el uso de DattaQuest |

Afip SDK es un intermediario comercial. Chasis también es un proveedor comercial, no una API oficial de DNRPA. La integración no utiliza ni omite el código verificador del formulario público de DNRPA.

### CUIL

El servidor obtiene un ticket de ARCA mediante `/afip/auth`, busca con `getIdPersonaListByDocumento` y confirma el detalle mediante `getPersona`, siempre en producción. Publica un único resultado de tipo **CUIL**, con documento e identificador coherentes y dígito verificador válido. No calcula un número para presentarlo como asignado. Varias claves producen `dni_ambiguo`; CUIT/CDI no se presentan como CUIL.

El certificado y la clave deben pertenecer a una cuenta autorizada para usar A13. Se envían desde el Worker a la API de Afip SDK conforme a su contrato; nunca se incluyen en el navegador ni en el repositorio.

### Radicación

Se solicita sólo la consulta básica, sin informe de dominio ni datos de titulares. La respuesta puede contener campos ausentes; la interfaz muestra “Sin información” donde corresponda. Conserva la fecha de consulta original del proveedor. Chasis puede reutilizar resultados durante 15 días y descontar créditos por nuevas consultas.

La interfaz también admite tipo de vehículo, código postal y teléfono del registro si el servidor los proporciona. No inventa esos campos cuando no están disponibles.

## Activación desde GitHub Actions

### 1. Cargar los siete secretos

En el repositorio `dattaquest/dattaquest.github.io`, abrir **Settings → Secrets and variables → Actions → New repository secret** y guardar:

| Nombre exacto | Valor |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token de la cuenta con permisos para desplegar Workers |
| `CLOUDFLARE_ACCOUNT_ID` | Identificador de esa cuenta Cloudflare |
| `AFIPSDK_ACCESS_TOKEN` | Access token de la cuenta Afip SDK |
| `ARCA_CUIT_REPRESENTADA` | CUIT de 11 dígitos autorizada para la integración |
| `ARCA_CERT` | Certificado completo de producción en PEM |
| `ARCA_KEY` | Clave privada completa de ese certificado en PEM |
| `CHASIS_API_KEY` | API key con permiso completo para `POST /consultas` y acceso a las consultas contratadas |

Los PEM deben conservar sus saltos de línea. No usar las credenciales de ejemplo o de homologación. Los secretos se cargan en GitHub; no se pegan en archivos públicos, issues ni conversaciones.

### 2. Elegir los cupos y ejecutar

Con esta versión ya fusionada en `main`:

1. Abrir **Actions → Activar consultas DattaQuest → Run workflow**.
2. Seleccionar la rama **main**.
3. Completar `cuil_diarias` y `radicacion_diarias` con los máximos diarios elegidos, de **1 a 100000**.
4. Ejecutar y revisar el resultado del workflow.

No hay un presupuesto ni un cupo de pago aceptado por defecto. El archivo `wrangler.toml` comienza con límites `0`, que mantienen las rutas cerradas. Elegir un cupo de consultas no expresa un importe monetario: los precios y créditos dependen del proveedor. Cada búsqueda de CUIL puede hacer hasta tres solicitudes HTTP a Afip SDK.

Los cupos se reservan antes de llamar al proveedor y cuentan los intentos, incluidos fallos y respuestas reutilizadas. Se reinician a medianoche de **Argentina**. Esto establece un límite conservador; no se compran créditos ni se activa facturación mediante el workflow.

### 3. Qué hace el workflow

`activar-consultas.yml`:

1. Ejecuta `herramientas/verificar_accesos.mjs` y comprueba que existan los siete secretos y los cupos sean válidos.
2. Solicita un ticket A13 vigente a Afip SDK y consulta `GET /usage` de Chasis. Exige consultas disponibles o modalidad a demanda ya contratada. No consulta ningún DNI ni patente y no imprime las respuestas privadas.
3. Ejecuta las pruebas del proyecto, despliega el Worker y carga sus cinco secretos de proveedor.
4. Comprueba la configuración desplegada mediante `GET /api/status` y exige un Worker v9 con ambos servicios configurados.
5. Guarda la URL efectiva en `otros-servicios/comun/api-config.js`, conserva los cupos en `wrangler.toml` y publica esos cambios en `main`.
6. Solicita una nueva compilación de GitHub Pages y deja un resumen con la dirección del servidor.

**Límites de la comprobación:** el preflight comprueba autenticación de Afip SDK/ARCA y Chasis y la disponibilidad declarada de consultas en ese momento. Si no quedan consultas, sólo continúa cuando Chasis devuelve `aDemanda: true`; esa modalidad debe estar contratada previamente y puede generar cargos. El script no la activa. El acceso a `/usage` no prueba que la key tenga el permiso completo necesario para `POST /consultas`. La autenticación de Cloudflare se comprueba al desplegar. `/api/status` informa versión, configuración y protecciones; no confirma una consulta exitosa ni la vigencia de todos los permisos.

La activación debe cerrarse comprobando desde la página un documento propio y una patente autorizada. Esa consulta puede consumir créditos. Hasta entonces, no debe describirse el servicio como probado en producción.

Si el Worker ya se desplegó y configuró por otra vía, la conexión pública puede generarse desde la raíz del repositorio con:

```sh
node herramientas/configurar_api.mjs https://TU-WORKER.workers.dev/api
```

El script sólo comprueba `/api/status` y rechaza servidores v8; no carga credenciales ni despliega el servidor. El cambio generado debe publicarse en GitHub Pages.

## Contrato del navegador

El cliente genera un UUID `requestId` automáticamente. No pide otro dato al visitante y no carga un servicio CAPTCHA.

```json
{"dni":"<DNI de 7 u 8 dígitos>","requestId":"<UUID v4 automático>"}
```

```json
{"patente":"<patente normalizada>","requestId":"<UUID v4 automático>"}
```

El resultado de CUIL contiene `verificado`, `cuil`, `dni`, `tipoClave` y `consultadoEn`. El de radicación contiene `verificado`, `patente`, `tipoVehiculo`, `registro`, `codigoRegistro`, `direccion`, `localidad`, `provincia`, `consultadoEn`, `vigenteHasta` y `reutilizada`; los campos incompletos pueden ser `null`. `tipoVehiculo` se obtiene del tipo informado por Chasis.

`verificado` expresa validación del contrato y coherencia de identificadores, no una constancia oficial. Las respuestas tienen `Cache-Control: no-store` y sólo incluyen los campos permitidos.

| HTTP | Código | Significado |
| --- | --- | --- |
| 400 | `dato_invalido`, `json_invalido` | Entrada o solicitud inválida |
| 403 | `origen_no_permitido` | Origen distinto de DattaQuest |
| 404 | `cuil_no_encontrado`, `radicacion_no_encontrada` | El proveedor no devolvió el dato solicitado |
| 409 | `dni_ambiguo`, `consulta_en_curso`, `solicitud_duplicada` | Resultado ambiguo, consulta pendiente o envío repetido |
| 422 | `clave_no_es_cuil` | La clave recibida no está identificada como CUIL |
| 429 | `limite_consultas` | Límite de frecuencia alcanzado |
| 429 | `limite_diario` | Cupo diario agotado; `Retry-After` indica los segundos hasta medianoche en Argentina |
| 502 | `respuesta_no_verificada`, `documento_no_coincide` | Respuesta inconsistente que no debe publicarse |
| 503 | `proveedor_sin_configurar`, `proveedor_no_autorizado`, `proteccion_sin_configurar`, `cupo_agotado`, `servicio_no_disponible` | Configuración incompleta, acceso insuficiente o indisponibilidad |

## Controles de consumo

El Worker mantiene límite por IP, cupos globales atómicos y deduplicación por `requestId`, ruta e IP durante 300 segundos. **Un UUID no autentica a la persona**; sirve para detectar el mismo envío repetido. CORS tampoco sustituye la autorización del proveedor.

Se persisten contadores y hashes temporales de solicitudes, nunca el UUID original, el DNI, la patente, el resultado ni la IP en claro. Los hashes vencidos se limpian en nuevas reservas. Los cuerpos se limitan a 4096 bytes, no hay reintentos automáticos de solicitudes pagas y la observabilidad del Worker está desactivada.

El namespace de rate limiting `1008` debe ser exclusivo en la cuenta Cloudflare para evitar compartir contadores con otro Worker.

## Pruebas y documentación

Desde la raíz:

```sh
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
```

Compilación sin despliegue:

```sh
npm ci --prefix backend-cloudflare
npm run check --prefix backend-cloudflare
```

`npm test` incluye `tests/test_activacion.mjs`, que comprueba el preflight y la conexión con un Worker v9 mediante respuestas simuladas. `Verificar servicios DattaQuest` ejecuta también Chromium y guarda capturas de escritorio/móvil en el artefacto `dattaquest-v9-capturas` de Actions. Estas pruebas no validan credenciales ni datos de producción.

- [Afip SDK: API REST](https://afipsdk.com/docs/web-services/integracion/api/) y [búsqueda por DNI](https://afipsdk.com/docs/web-services/guias/datos-contribuyentes/obtener-cuit-desde-dni/)
- [ARCA: manual A13](https://ftp.afip.gov.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.4.pdf) y [certificados](https://www.afip.gob.ar/ws/programadores/certificados-digitales.asp)
- [Chasis: contrato de API](https://www.chasis.com.ar/docs) y [condiciones](https://www.chasis.com.ar/terminos)
- [Cloudflare: rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) y [secretos](https://developers.cloudflare.com/workers/configuration/secrets/)
