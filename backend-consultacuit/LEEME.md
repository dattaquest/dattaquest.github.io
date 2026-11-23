# ConsultaCUIT para DattaQuest

## Versión 11: consulta de radicación

El mismo servicio incorpora `POST /api/radicacion`, mediante el formulario público de Argentina.gob.ar. Utiliza el adaptador `../backend-cloudflare/proveedores/argentina-radicacion.mjs`; no utiliza la API privada del Gobierno ni el proveedor pago Chasis.

Admite formatos nacionales de autos y motos. Devuelve exclusivamente los datos del registro seccional y una fecha de **consulta**, que no es la fecha de actualización de la base. Comparte con CUIL los límites preventivos de frecuencia y el origen permitido.

`GET /api/radicacion/status` carga únicamente el formulario: su resultado positivo confirma estructura y acceso, no una consulta completa de patente. Por eso siempre incluye `consultaPatenteVerificada: false`. No se prueba con patentes o documentos de personas.

La configuración pública específica está en `otros-servicios/radicacion/js/config.js`; un endpoint vacío desactiva la consulta. Se mantiene así si la fuente rechaza el acceso normal del conector. No se omiten CAPTCHA ni se siguen redirecciones o destinos enviados por la fuente.

La investigación de cobertura, alternativas gratuitas/con registro, costos y restricciones está en [FUENTES_CONSULTAS_LEEME.md](../FUENTES_CONSULTAS_LEEME.md).

## Consulta por DNI

El formulario recibe sólo DNI y presenta el CUIT personal encontrado en el padrón tributario. El proveedor no distingue un CUIL de ANSES: el conector etiqueta su respuesta como **CUIT**. El frontend también conserva compatibilidad con un CUIL confirmado por el adaptador anterior.

## Funcionamiento

1. El navegador envía el DNI por POST al endpoint de `otros-servicios/cuil/js/config.js`.
2. El conector genera candidatos con prefijos 20, 23, 24 y 27 y dígito verificador válido.
3. Comprueba hasta cuatro candidatos contra la API pública documentada `GET https://consultacuit.fluxorhub.com/v1/cuit/{cuit}`. No usa cuentas, tokens ni suscripciones de ConsultaCUIT.
4. Sólo devuelve una coincidencia si el proveedor confirma su existencia y el identificador coincide con el documento. No devuelve los candidatos calculados ni selecciona arbitrariamente la primera coincidencia.
5. Si varias claves aparecen, informa ambigüedad. Si falta una respuesta, hay una falla o un límite, no lo convierte en ausencia ni en una única coincidencia verificada.

La API de ConsultaCUIT no habilita CORS para GitHub Pages. Por eso este conector está alojado como servicio propio en Sites. No se usan proxies CORS públicos. El sitio de GitHub conserva su dirección y su interfaz.

## Archivos

- `service.mjs`: HTTP, CORS, límite de cuerpo y frecuencia, estado y errores.
- `worker.mjs`: entrada ESM portable para un Worker.
- `../backend-cloudflare/proveedores/consultacuit-cuil.mjs`: validación y filtrado de ConsultaCUIT.
- `../otros-servicios/cuil/js/config.js`: URL pública exclusiva de CUIL/CUIT. No cambia la configuración de radicación.
- `../tests/test_consultacuit_adapter.mjs`, `test_consultacuit_service.mjs`, `test_api_client_endpoints.cjs`: contratos con fixtures locales.

El despliegue Sites usa una copia idéntica de `service.mjs` y del adaptador, conectada a sus rutas `/api/cuil` y `/api/status`. Una modificación de estos archivos en GitHub requiere actualizar también el despliegue del conector; Pages no despliega código de servidor.

## Respuesta y límites

El resultado contiene exclusivamente `verificado`, `tipoClave`, `cuit`, `dni`, `fuente` y `fechaPadron`. No se exponen denominación, domicilios ni situación impositiva. El código no persiste DNI, CUIT ni respuestas. Los POST y sus respuestas llevan `Cache-Control: no-store`; el frontend no guarda consultas en almacenamiento local.

El padrón tributario es una copia periódica: no cubre necesariamente todos los CUIL asignados por ANSES. La fecha mostrada es la informada por el proveedor, no la del reloj del servidor. «Sin datos en esta fuente» no significa que la persona no tenga CUIL.

El conector admite CORS desde `https://dattaquest.github.io`. CORS no autentica personas. El límite preventivo por instancia es 8 consultas/minuto por hash temporal de IP y 60 consultas/minuto por instancia; no es un cupo global persistente. Cada búsqueda hace como máximo cuatro solicitudes, con un plazo total de ocho segundos y sin reintentos automáticos. Los límites del proveedor siguen aplicando.

`GET /api/status` comprueba únicamente `/v1/health`: prueba conectividad, no una consulta personal. `consultaPersonalVerificada: false` documenta esa diferencia. Las pruebas automáticas no envían documentos a servicios externos.

## Referencias

- [API pública de ConsultaCUIT](https://consultacuit.fluxorhub.com/api)
- [Herramienta por DNI](https://consultacuit.fluxorhub.com/cuil-por-dni)
- [Condiciones de integración](https://consultacuit.fluxorhub.com/terminos)

La integración de CUIL/CUIT no requiere ejecutar el workflow antiguo «Activar consultas DattaQuest». Ese workflow conserva su propósito para el backend anterior con Afip SDK y Chasis.
