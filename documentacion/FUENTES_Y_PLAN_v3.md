# DattaQuest v3 — fuentes propias y verificables

**Estado del paquete:** 21 de noviembre de 2026. Este proyecto es una web estática alojable en GitHub Pages. **Los datos referidos a personas o bloqueos NO deben inventarse ni inferirse.**

## Matriz de disponibilidad

| Consulta | Fuente identificada | Qué podemos integrar ahora | Qué falta | Estado |
|---|---|---|---|---|
| Prefijos telefónicos | ENACOM, archivo de numeración geográfica | Importar XLS para generar JSON local con hasta ~300 indicativos | Ejecutar importador con archivo ENACOM | Implementado importador; datos precargados: muestra parcial |
| Prestador original | ENACOM, asignaciones de bloques | Buscar la asignación original del rango telefónico localmente | Ejecutar mismo importador | Implementado motor local; sin dataset integrado hasta importación |
| Prestador **actual** | ENACOM, consulta con portabilidad | Redirigir al sitio oficial o conectar una API autorizada | Derecho de acceso/API de portabilidad | No integrado; no inferir por número |
| CUIL asignado | ANSES, constancia gratuita oficial | Validar datos de entrada y derivar a ANSES | Fuente habilitada para confirmar DNI → CUIL | No integrado; cálculo matemático NO es constancia |
| Radicación de dominio | DNRPA, consulta oficial con código verificador | Validar formato y derivar al formulario oficial | API oficial autorizada para automatizar | No integrado; no se elude el verificador |
| IMEI marca/modelo | Osmocom TAC, licencia CC BY-SA 3.0 | Generar 90-100 JSON locales de prefijo TAC (incluye solo marca/modelo) | Ejecutar copia y conversión | Implementado conversor; fallback comunitario hasta alojar copia |
| IMEI bloqueado | ENACOM/GSMA Device Registry | Enlace al chequeo oficial; adaptar API si autorizada | Acceso a servicio GSMA / ENACOM | No integrado; IMEI válido no implica equipo operativo |
| Dólar | DolarApi | Continúa el consumo API ya implementado en v2 | API/snapshot propio para independencia total | Externa, gratuita (v2) |

## 1. ENACOM: importar de verdad en la computadora

La publicación oficial de **Asignaciones a la fecha** mostraba fecha **13/11/2026** al verificarla. La publicación que otros proyectos han procesado, fechada 27/07/2026, consta de 48.903 asignaciones y 300 áreas. Las publicaciones cambian: **usar el fichero más reciente accesible** y verificar los metadatos. Ningún XLS se incluye en este paquete porque el entorno de preparación no permitió descargar su archivo binario; no sería correcto afirmar lo contrario.

1. Entrá a https://www.enacom.gob.ar/asignaciones-a-la-fecha_p445
2. Descargá el XLS de **numeración geográfica** (NO confundas con numeración no geográfica).
3. Instalá dependencias una sola vez: `python -m pip install -r herramientas/requirements.txt`
4. Ejecutá desde la raíz:
   `python herramientas/actualizar_enacom.py --archivo "C:/ruta/archivo_ENACOM.xls" --fuente "https://www.enacom.gob.ar/asignaciones-a-la-fecha_p445"`
5. Se regeneran **tres archivos**:
   - `otros-servicios/prestadores/data/asignaciones.json`
   - `otros-servicios/prefijos/data/prefijos.json`
   - `otros-servicios/prefijos/data/fuente.json`
6. Subí esos JSON al repositorio, sin subir los archivos de tu PC. GitHub Pages servirá los datos sin backend y sin enviar el número consultado fuera del navegador.

Para actualizar sin instalar Python local: en GitHub **Actions → Importar numeración ENACOM (manual) → Run workflow**, ingresá la URL **directa** del fichero XLS oficial, no la URL de la página informativa. Este flujo descarga/valida los datos y hace commit si la rama permite escritura. El pipeline no intenta burlar verificaciones ni copiar portales comerciales.

El importador verifica las 8 columnas del formato publicado, la longitud de números y un mínimo de 1000 asignaciones, guarda la URL de fuente, archivo, fecha y SHA-256, y publica las salidas solo después de validar el origen. Si ENACOM cambia el formato, puede requerir ajustes. **La ingesta real del XLS 2026 aún no está verificada**: la prueba automatizada usa CSV de formato equivalente.

**Atención:** un número en un bloque asignado a Personal/Movistar/Claro/etc. NO confirma que esa empresa sea la actual, ni que la línea esté en funcionamiento. Para eso hace falta acceso autorizado a portabilidad. El dato local corresponde a la asignación original del bloque.

## 2. IMEI: preparar una base TAC propia sin CDN en el navegador

1. Desde la raíz del proyecto ejecutá `python otros-servicios/imei/tools/descargar_base_tac.py`.
2. Luego ejecutá `python otros-servicios/imei/tools/convertir_base_tac.py`.
3. Subí **`otros-servicios/imei/data/tac/`** (los JSON generados) y `otros-servicios/imei/data/config.json`. No hace falta subir SQLite después de convertir a JSON: el sitio usa los archivos por TAC. Si querés subir SQLite como respaldo, podés hacerlo.
4. Marcá la procedencia del catálogo y conservá la atribución **Osmocom, CC BY-SA 3.0**. Respetá la obligación de compartir los datos derivados bajo la misma licencia.

También se incorporó `.github/workflows/actualizar-tac.yml`, que intenta reconstruir la copia local una vez al mes y puede ejecutarse manualmente desde Actions. Las ejecuciones pueden fallar si el repositorio comunitario cambia de ubicación o acceso; comprobá las notificaciones de GitHub Actions.

Con `local_json:true`, el navegador consulta únicamente `/otros-servicios/imei/data/tac/NN.json`, usando **dos dígitos del TAC** para cargar un grupo pequeño de dispositivos. El IMEI completo jamás es enviado a ese catálogo. Si la copia local está ausente, el software conserva temporalmente el fallback v2 (SQLite comunitario / SQL.js), pero **no devuelve estado de bloqueo** a partir del TAC.

## 3. APIs que todavía necesitan autorización

No se localizaron APIs abiertas, gratuitas y documentadas para estas funciones completas:

- **ENACOM / portabilidad actual:** https://www.enacom.gob.ar/buscador-de-prestadores_p1510 ; contacto institucional publicado: `numeracion@enacom.gob.ar`.
- **ANSES / asignación de CUIL:** https://www.argentina.gob.ar/descarga-constancia-cuil . La constancia gratuita requiere completar datos personales. No es suficiente derivar un CUIL exclusivamente del DNI.
- **DNRPA / radicación real:** https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2 . El portal solicita código verificador, que no se sortea ni automatiza por vías no autorizadas.
- **GSMA / blacklist IMEI:** https://www.gsmaservices.com/device-services/device-check/ ; consulta pública ofrecida por ENACOM: https://www.enacom.gob.ar/imei . Para API empresarial verificar elegibilidad, documentación y condiciones con GSMA.

**Nunca guardes credenciales en GitHub Pages.** El adaptador `backend-cloudflare/` puede recibir claves como secretos y permitir conectar servicios autorizados. El backend solo transporta resultados `verificado:true` recibidos de la fuente real; no genera datos. Para datos de personas, informar finalidad, habilitar consentimiento/base jurídica aplicable y evitar registros de DNI/IMEI o números completos en logs. Incorporar controles antiabuso antes de ofrecer consultas masivas.

## Fuentes de referencia y procedencia

- ENACOM: https://www.enacom.gob.ar/asignaciones-a-la-fecha_p445 ; https://www.enacom.gob.ar/indicativos-interurbanos_p143 ; https://www.enacom.gob.ar/buscador-de-prestadores_p1510
- Registro de estructura del XLS 2026 (investigación pública independiente): https://numeracion.code.ar/metodologia y https://github.com/grjasis/numeracion/blob/main/docs/02-modelo-de-datos.md
- ANSES: https://www.argentina.gob.ar/descarga-constancia-cuil
- DNRPA: https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2
- GSMA: https://www.gsmaservices.com/device-services/device-check/
- Osmocom: https://tacdb.osmocom.org/ ; licencia CC BY-SA 3.0

## Qué significa cada estado

- **Implementado:** existe código funcionando con datos aportados y verificados; puede requerir que descargues un catálogo oficial.
- **Preparado:** existe formulario/adaptador, **pero no una consulta automática funcionando** sin acceso válido.
- **No verificado:** no se ha consultado una base autorizada. Nunca debe aparecer `operativo`, `no robado`, `prestador actual` o `CUIL confirmado` por una inferencia.
