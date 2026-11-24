# Integración nativa de radicación DNRPA

Esta rama contiene la interfaz nativa solicitada y el conector separado. No usa iframe ni popups. No se modifica el servicio CUIL.

## Estado y activación

- `otros-servicios/radicacion/verificar.html` conserva el diseño DattaQuest, con patente, código y actualización de la imagen.
- `backend-dnrpa/provider.mjs` reproduce exclusivamente el flujo público observado en el formulario oficial: GET para obtener la imagen PNG y recoger las cookies aplicables, si las hay; POST de los dos campos de formulario con el código escrito manualmente por el usuario, en esa misma sesión. Si la fuente restringe el acceso, el conector se detiene. No interpreta, soluciona ni evita el CAPTCHA.
- El Worker conserva las cookies exclusivamente en almacenamiento efímero por sesión, con TTL de 5 minutos y consumo de una sola vez. Limita solicitudes por visitante. No conserva patentes ni respuestas. No publica HTML de terceros.
- Las pruebas de resultado se basan en el formato de la captura suministrada, con valores sintéticos. Se debe comprobar una consulta completa autorizada antes de sustituir la página publicada. La inspección de un formulario no prueba una consulta.

## Alojamiento de DattaQuest

La página `otros-servicios/radicacion/verificar.html` usa el conector configurado en `js/dnrpa-config.js`. El servidor existente de DattaQuest expone `POST /api/radicacion/challenge` y `POST /api/radicacion/consultar`. Su implementación alojada conserva la sesión en D1, comprueba el visitante y consume el identificador una sola vez. Las sesiones vencen a los cinco minutos y las vencidas se limpian al solicitar otro código.

La prueba de integración comprueba el verificador oficial desde el servidor publicado. La prueba de navegador usa respuestas sintéticas para comprobar el envío y la presentación del registro en la página. La comprobación completa en producción requiere que el visitante ingrese el código de una imagen nueva.
