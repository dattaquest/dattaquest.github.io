# Backend de integración opcional: Cloudflare Workers

Este ejemplo sirve para **conectar** prestadores, CUIL, radicación y estado de IMEI. **No obtiene acceso a las bases oficiales por sí solo**: cada API exige un proveedor habilitado que responda al contrato de `OTROS_SERVICIOS_LEEME.md`.

## Activación cuando tengas acceso a una API autorizada

1. Registrate gratis en Cloudflare y creá un Worker.
2. Instalá Wrangler (`npm install -g wrangler`), iniciá sesión (`wrangler login`) y desde esta carpeta ejecutá `wrangler deploy`.
3. En Cloudflare → Worker → Settings → Variables/Secrets, agregá como variables de entorno solo las URLs HTTPS del proveedor autorizado que poseas, según corresponda:
   - `UPSTREAM_PRESTADORES_URL`
   - `UPSTREAM_CUIL_URL`
   - `UPSTREAM_RADICACION_URL`
   - `UPSTREAM_IMEI_URL`
4. Si el proveedor requiere token, guardalo **como Secret**, respectivamente: `UPSTREAM_PRESTADORES_TOKEN`, `UPSTREAM_CUIL_TOKEN`, `UPSTREAM_RADICACION_TOKEN`, `UPSTREAM_IMEI_TOKEN`.
5. Configurá el origen autorizado mediante `ALLOWED_ORIGIN` (por defecto `https://dattaquest.github.io`).
6. Cambiá `window.DATTA_API_BASE` en `otros-servicios/comun/api-config.js` a `https://<tu-worker>.workers.dev/api`.

**El Worker no es el proveedor de datos**. Requiere que el proveedor contratado tenga el contrato REST JSON indicado. Si su API tiene otro formato, es necesario mapearla exclusivamente en el Worker antes de desplegar, nunca en el navegador.

## Seguridad y privacidad

- Claves privadas nunca dentro del repositorio ni del JavaScript público.
- CORS restringido a tu web. Para producción agregá límite de solicitudes y protección antiabuso, además de política de privacidad.
- Consultas de DNI/IMEI se deben hacer solo con base legal, información al usuario y proveedor habilitado.
- El `ALLOWED_ORIGIN` y CORS no autentican a usuarios: añadí un mecanismo contra el abuso antes de ofrecer consultas pagas o con costo.
- Si no se configura un proveedor, responde HTTP 503; **jamás** genera un resultado ficticio.
- Si el backend recibe datos adicionales, responde únicamente los campos de la lista blanca y no publica información del titular.

Documentación: https://developers.cloudflare.com/workers/ y https://developers.cloudflare.com/workers/configuration/secrets/


## Radicación por API Chasis (opcional y con costo)

La documentación pública del proveedor comercial [Chasis](https://www.chasis.com.ar/docs) confirma `POST https://www.chasis.com.ar/api/v1/consultas`, que recibe `{"patente":"AB123CD"}` y responde el registro, localidad y provincia. **Cada consulta puede descontar créditos**, por lo que NO está conectada al Worker público ni a la web en esta versión.

Se incluye el módulo de servidor `proveedores/chasis-radicacion.mjs` para una futura integración. Se necesita una cuenta aprobada, una API key en secreto `CHASIS_API_KEY`, autorización para la finalidad, autenticación real del usuario, cupos y presupuesto por cuenta, protección antiabuso y validación de origen. El proveedor declara reutilización de resultados durante 15 días. Nunca colocar la API key en GitHub Pages ni activar el endpoint como proxy anónimo.

Este módulo traduce solamente información de radicación y descarta otros datos. El módulo está separado del Worker deliberadamente: **no habilita consultas pagas** ni altera el fallback oficial de DNRPA. Los datos se deben identificar como suministrados por Chasis, y no como acceso directo a DNRPA.
