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
5. Configurá el origen autorizado mediante `ALLOWED_ORIGIN` (por defecto `https://tomiaf98.github.io`).
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
