# DattaQuest v4 — ENACOM y Osmocom

Esta actualización **no simula resultados**. Cada búsqueda indica qué puede verificar y de qué fuente procede.

## IMEI (identificación del modelo)

Se corrige en `otros-servicios/imei/js/tac-lookup.js` la ruta relativa del catálogo. Antes intentaba cargar `../data` desde la página IMEI y fallaba; ahora usa `./data`.

La nueva acción **Actualizar base IMEI TAC (Osmocom)** descarga la copia comunitaria SQLite del catálogo Osmocom, valida su formato y transforma los TAC en fragmentos JSON locales dentro de `otros-servicios/imei/data/tac/`. Esto permite identificar marca y modelo sin enviar el IMEI completo a un servidor de terceros. Hasta ejecutar la acción, el formulario usa la copia comunitaria remota, si está disponible. La actualización puede iniciarse manualmente y se programa mensualmente.

**Fuente y licencia:** Osmocom TAC (© Harald Welte y colaboradores), **CC BY-SA 3.0**. Fuente de la copia: https://github.com/G33l0/imei-generator . La identificación TAC no garantiza que el dispositivo sea genuino ni confirma si figura bloqueado. Para el bloqueo se requiere una fuente autorizada ENACOM/GSMA.

## ENACOM (numeración y prefijos)

La acción **Importar numeracion ENACOM** permite ejecutar el importador existente con un XLS oficial y publicar sus resultados:
- `otros-servicios/prestadores/data/asignaciones.json`
- `otros-servicios/prefijos/data/prefijos.json`
- `otros-servicios/prefijos/data/fuente.json`

**Primera ejecución:** en https://www.enacom.gob.ar/asignaciones-a-la-fecha_p445 obtené el enlace DIRECTO al archivo de numeración geográfica (.xls). Luego entrá en GitHub → Actions → Importar numeracion ENACOM → Run workflow y pegá esa URL en `xls_url`. No sirve la URL de la página informativa.

Para actualizar semanalmente sin volver a ingresar la URL: Settings → Secrets and variables → Actions → Variables → agregá `ENACOM_XLS_URL` con el enlace directo oficial. Si ENACOM modifica el enlace será necesario actualizar la variable.

**Seguridad:** el descargador solo admite HTTPS dentro de `enacom.gob.ar`, verifica el tipo de archivo y no reemplaza la base ante archivos vacíos, tipos erróneos o menos de 1000 asignaciones. El importador existente almacena SHA-256, procedencia y fecha. La importación presupone el formato de ocho columnas publicado por ENACOM; si este cambia, la acción falla en lugar de fabricar datos.

**Distinción importante:** esos datos contienen la asignación histórica/original de los bloques, no la compañía actual de un número portado. Una compañía actual confirmada necesita consulta oficial habilitada. Tampoco revelan titularidad o activación.

## Servicios sin API pública autorizada

- CUIL asignado: ANSES, https://www.argentina.gob.ar/descarga-constancia-cuil
- Radicación: DNRPA, https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2
- Prestador actual: ENACOM, https://www.enacom.gob.ar/buscador-de-prestadores_p1510
- Lista negra de IMEI: ENACOM/GSMA, https://www.enacom.gob.ar/imei

La versión actual de DattaQuest conserva los formularios y conectores, pero **no** presenta esos datos como verificados sin acceso formal. GitHub Pages es un hosting estático, no debe recibir claves o secretos.

## Despliegue y revisión

Estas modificaciones fueron propuestas en una rama separada de `main` mediante pull request. Fusionarlo activará los nuevos workflows. Para que puedan escribir datos en `main`, en GitHub → Settings → Actions → General → Workflow permissions se debe permitir *Read and write permissions* cuando la política del repositorio lo requiera.

No se ha ejecutado aún ninguna descarga de XLS ni de base TAC mediante GitHub Actions; verificar sus ejecuciones y los JSON publicados antes de considerar funcional la consulta local.
