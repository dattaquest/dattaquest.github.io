# Integración nativa de radicación DNRPA

Esta rama contiene la interfaz nativa solicitada y el conector separado. No usa iframe ni popups. No se modifica el servicio CUIL.

## Estado y activación

- `otros-servicios/radicacion/nativa.html` conserva el diseño DattaQuest, con patente, código y actualización de la imagen.
- `backend-dnrpa/provider.mjs` reproduce exclusivamente el flujo público observado en el formulario oficial: GET para obtener la imagen PNG y recoger las cookies aplicables, si las hay; POST de los dos campos de formulario con el código escrito manualmente por el usuario, en esa misma sesión. Si la fuente restringe el acceso, el conector se detiene. No interpreta, soluciona ni evita el CAPTCHA.
- El Worker conserva las cookies exclusivamente en almacenamiento efímero por sesión, con TTL de 5 minutos y consumo de una sola vez. Limita solicitudes por visitante. No conserva patentes ni respuestas. No publica HTML de terceros.
- Las pruebas de resultado se basan en el formato de la captura suministrada, con valores sintéticos. Se debe comprobar una consulta completa autorizada antes de sustituir la página publicada. La inspección de un formulario no prueba una consulta.

Para desplegar, revisar autorización de integración con DNRPA y usar el plan gratuito de Workers dentro de sus límites, o adaptar el módulo al alojamiento existente que permita sesiones aisladas y persistentes. El Worker es independiente del servicio CUIL. Desde la raíz, con Cloudflare configurado: `npx wrangler deploy --config backend-dnrpa/wrangler.toml`. Configurar `window.DATTA_DNRPA_API` con la URL HTTPS resultante seguida de `/api/radicacion`. No publicar las credenciales. Probar en la vista nativa con un código resuelto por el visitante; si confirma el resultado, sustituir `index.html` por `nativa.html`, actualizar las pruebas de integración y retirar el iframe experimental. No activar una URL no verificada.

Este proyecto no tiene permiso para modificar el conector Sites desde la sesión de ChatGPT que generó esta rama. Tampoco se presupone que exista cuenta o token Cloudflare. No se contratan servicios ni se inicia facturación.

## Resultado de la comprobación externa

La captura del POST exitoso en Brave y su vista previa muestran que DNRPA puede devolver el registro con los campos `dominio` y `verificador` sin cabecera `Cookie`. En ese caso el conector omite la cabecera. El Worker sigue exigiendo una sesión de DattaQuest de un solo uso por visitante. Queda por verificar una consulta nueva desde el backend desplegado antes de activar la interfaz pública.
