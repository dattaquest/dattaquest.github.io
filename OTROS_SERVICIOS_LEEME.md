# DattaQuest · Otros servicios · v11

Sitio: https://dattaquest.github.io/otros-servicios/index.html

Repositorio: `dattaquest/dattaquest.github.io`.

**CUIL/CUIT utiliza ahora ConsultaCUIT, sin credenciales ni suscripción de ese proveedor.** Se conecta mediante su endpoint exclusivo en `otros-servicios/cuil/js/config.js`. El conector de servidor resuelve CORS y devuelve sólo una clave verificada. La comprobación de estado y las pruebas sintéticas no sustituyen una consulta final con un DNI propio.

**Radicación tiene conectado el formulario público de Argentina.gob.ar, pero no se ha verificado una consulta completa exitosa.** El caso aportado por el usuario falla también en el formulario oficial: la fuente devuelve una respuesta ambigua. El estado técnico distingue formulario accesible de consulta operativa; no anuncia disponibilidad sólo porque la página cargue. Su activación se controla desde `otros-servicios/radicacion/js/config.js`: un endpoint vacío la deshabilita y evita recurrir automáticamente a Chasis.

## Qué cambia en v11

- Adaptador del formulario público de radicación, sin API key: carga y envía los controles normales del sitio, interpreta la respuesta y devuelve sólo los datos de la oficina registral.
- Autos y motos, bloqueo de doble envío y estados accesibles. Los resultados admiten fuente y horario; la fecha de acceso se llama «Consultado».
- Restricciones, desafíos, cambios de formulario y errores no se convierten en resultados ni en una afirmación de patente inexistente.
- Compatibilidad de los adaptadores opcionales de Afip SDK y Chasis con Cloudflare; continúan sin activar.
- Investigación y requisitos de otras fuentes de CUIL: [FUENTES_CONSULTAS_LEEME.md](FUENTES_CONSULTAS_LEEME.md). No se incorpora una fuente nueva de CUIL sin credenciales ni se modifica el tipo de clave devuelto por ConsultaCUIT.

## Qué cambia en v10

- DNI y un botón para consultar CUIT o CUIL personal, con validación de documento, prefijo y dígito verificador.
- Nueva API gratuita de ConsultaCUIT a través de un conector propio, sin claves de ARCA o AFIP SDK.
- Nunca se muestran los candidatos calculados como claves asignadas. Varias coincidencias, fallas parciales y ausencia de datos tienen resultados distintos.
- Se muestra la fecha del padrón cuando el proveedor la informa. Un resultado vacío no significa que el CUIL no exista.
- Guía de código, despliegue y límites: [backend-consultacuit/LEEME.md](backend-consultacuit/LEEME.md).

## Qué cambia en v9

- CUIL conserva únicamente DNI y botón; radicación, patente y botón.
- Los resultados se presentan dentro de DattaQuest, sin selección de sexo, CAPTCHA, código verificador ni enlaces de salida a ANSES/DNRPA.
- Las entradas con letras o símbolos inválidos se rechazan antes de consultar. Se admiten los separadores habituales.
- Cuando falta configuración o hay una falla, se informa sin presentar un dato supuesto.
- Se elimina la dependencia de un widget de verificación. El cliente crea un `requestId` automático y el servidor mantiene límites de frecuencia, cupos diarios y detección de dobles envíos.
- Se agrega la activación manual desde GitHub Actions para desplegar el Worker y conectar su URL con GitHub Pages.

## Estado por servicio

| Servicio | Funcionamiento |
| --- | --- |
| Prestadores | Asignación original del bloque desde archivos locales. Marca comercial asociada cuando se reconoce. El operador actual sólo se muestra si una API habilitada lo confirma. |
| Prefijos | Consulta de códigos y localidades desde los archivos locales. |
| Dólar | Cotizaciones mediante DolarAPI; conserva caché local y muestra la fecha de los datos. |
| CUIL / CUIT | ConsultaCUIT, mediante conector propio y sin credenciales del proveedor. Cobertura tributaria parcial; no es una constancia de ANSES. |
| Radicación | Formulario oficial conectado, con fallo de consulta reproducido en la propia fuente. El estado estructural no confirma disponibilidad. Chasis queda sin activar. |
| IMEI | Validación del formato y dígito; marca/modelo por TAC en catálogos locales. El bloqueo sigue siendo un conector opcional y no se deduce del TAC. |

Los seis servicios presentan etiquetas y valores por líneas. Radicación incluye atribución de su fuente cuando está informada. La atribución de licencia del catálogo TAC se conserva fuera de la consulta.

## Backend anterior de Afip SDK y Chasis (opcional)

**Estos pasos no son necesarios para los conectores públicos nuevos.** Los archivos específicos `cuil/js/config.js` y `radicacion/js/config.js` tienen prioridad, incluso si el endpoint está vacío, y no los sobrescribe el configurador antiguo.

La guía completa está en [backend-cloudflare/LEEME.md](backend-cloudflare/LEEME.md).

1. Obtener los accesos autorizados de Afip SDK/ARCA y Chasis.
2. En **Settings → Secrets and variables → Actions**, cargar estos siete secretos: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `AFIPSDK_ACCESS_TOKEN`, `ARCA_CUIT_REPRESENTADA`, `ARCA_CERT`, `ARCA_KEY` y `CHASIS_API_KEY`.
3. Con v9 en `main`, abrir **Actions → Activar consultas DattaQuest → Run workflow**, seleccionar `main` y elegir los cupos diarios de CUIL y radicación.
4. Revisar el resultado del workflow y comprobar desde la página un dato propio o autorizado.

No se asigna presupuesto por defecto ni se compran créditos. Los límites iniciales son `0`; el workflow exige elegir valores positivos. Las consultas pueden consumir el cupo o los créditos del proveedor.

El preflight verifica un ticket vigente de Afip SDK/ARCA y el estado de consultas de Chasis **sin consultar DNI ni patentes**. Chasis debe informar consultas disponibles o modalidad a demanda ya contratada; el script no activa esa facturación. La key también debe tener permiso completo para `POST /consultas`, que el preflight no puede confirmar. `GET /api/status` sólo comprueba versión y configuración; exige v9. Ninguno sustituye la comprobación final de una consulta autorizada desde la página.

El workflow despliega el Worker, guarda sus secretos, configura la URL efectiva, publica los cambios de configuración en `main` y solicita la compilación de GitHub Pages. Los secretos nunca se escriben en el código público.

## Archivos y publicación

- `otros-servicios/comun/`: presentación, navegación y cliente API compartidos.
- `otros-servicios/<servicio>/`: HTML, estilos, lógica y archivos de datos de cada servicio.
- `backend-cloudflare/`: rutas, adaptadores de proveedor y controles de consumo.
- `backend-consultacuit/`: servicio compartido de los conectores públicos de CUIL/CUIT y radicación, con su documentación.
- `herramientas/verificar_accesos.mjs`: preflight de activación.
- `herramientas/configurar_api.mjs`: comprueba el Worker y guarda su URL pública.
- `.github/workflows/activar-consultas.yml`: activación manual con secretos y cupos.
- `.github/workflows/verificar-servicios.yml`: pruebas automáticas y capturas de navegador.

Los cambios visuales se publican al fusionar la rama en `main`, según la configuración de Pages del repositorio. GitHub Pages sirve archivos estáticos; las claves de proveedores y las consultas privadas se ejecutan en el Worker.

## Datos locales y actualización

Los workflows **Importar numeracion ENACOM**, **Actualizar base IMEI TAC (Osmocom)** y **Ampliar catalogo IMEI TAC** mantienen los datos locales según sus configuraciones. El importador de numeración es `herramientas/actualizar_enacom.py`; las herramientas de catálogo IMEI están en `otros-servicios/imei/tools/`.

El catálogo TAC identifica modelos, no confirma bloqueo, titularidad ni estado físico de un equipo. Su configuración prioriza JSON locales y un catálogo complementario. Conservar las atribuciones y licencias incluidas: la base Osmocom TAC es de Harald Welte y colaboradores, **CC BY-SA 3.0**.

## Verificación

Desde la raíz del repositorio:

```sh
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm ci --prefix backend-cloudflare
npm run check --prefix backend-cloudflare
```

Para la prueba de navegador local:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Las APIs de las pruebas están simuladas: estos comandos no buscan documentos ni patentes ni acreditan que las cuentas de producción estén habilitadas. `npm test` incluye ConsultaCUIT, su conector, radicación pública, endpoints independientes y las pruebas de activación anteriores. Las capturas se generan en `test-results/` y se guardan como artefacto `dattaquest-v11-capturas` del workflow de verificación.
