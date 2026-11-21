# DattaQuest · Primera implementación de Otros servicios

## Publicación en GitHub Pages

1. Descomprimí el ZIP en tu PC.
2. Copiá los archivos y carpetas de **dattashamir-main/** al nivel principal (raíz) de tu repositorio `TomiAF98/dattashamir` (o subí los archivos modificados conservando la estructura).
3. Hacé commit a la rama publicada por GitHub Pages.
4. Abrí `https://tomiaf98.github.io/dattashamir/index.html` y hacé clic en **OTROS SERVICIOS**.
5. También podés ir a `https://tomiaf98.github.io/dattashamir/otros-servicios/index.html`.

La carpeta `.nojekyll` previene que GitHub Pages excluya nombres especiales. No necesitás servidor ni base de datos para probar esta implementación.

## Servicios y estado

| Página | Estado inicial |
|---|---|
| `otros-servicios/prestadores/index.html` | Interfaz + validación del número; **no consulta** el operador actual (requiere portabilidad autorizada). |
| `otros-servicios/prefijos/index.html` | Consulta **local y funcional** de una **muestra parcial** de códigos en `data/prefijos.json`. |
| `otros-servicios/dolar/index.html` | Consulta **funcional** de cotizaciones vía `https://dolarapi.com/v1/dolares`. API externa gratuita, **no base propia todavía**. Caché local durante 3 horas. Fuente atribuida. |
| `otros-servicios/cuil/index.html` | Interfaz + validación DNI; **no calcula ni asegura** el CUIL real. Requiere ANSES u otra vía autorizada. |
| `otros-servicios/radicacion/index.html` | Interfaz + validación patente; **no consulta** DNRPA ni radicación real. |
| `otros-servicios/imei/index.html` | **Valida estructura y Luhn localmente**. **No consulta** listas de bloqueo/robo (requiere fuente autorizada). |

## Organización

- Los archivos HTML originales de la raíz fueron modificados únicamente para agregar el enlace desplegable y dos referencias a recursos (`otros-servicios/comun/nav.css`, `otros-servicios/comun/nav.js`).
- `otros-servicios/comun/` tiene estilos y scripts compartidos para que el diseño sea uniforme. Incluye un desplegable con alternativa nativa si los scripts de Bootstrap originales no se ejecutan.
- Cada servicio tiene `index.html`, `css/estilo.css`, `js/consulta.js` y, cuando corresponde, una carpeta `data/`.
- El sonido del menú se reproduce con `click.mp3` original. Los enlaces están hechos para el sitio GitHub Pages dentro de `/dattashamir/`.

## Evolución a bases propias

GitHub Pages publica archivos estáticos: **no corre bases SQL, procesos automáticos ni APIs privadas**. Para trabajar con datos internos, habrá que añadir una API/backend separado (por ejemplo Cloudflare Workers o Supabase) y un proceso de actualización de datos autorizado. Para cotizaciones, la API externa actual es un adaptador temporal. Los prefijos pueden ampliarse usando los indicativos públicos del ENACOM con seguimiento de su fuente y fecha. No recolectar ni exponer datos personales sin la base legal correspondiente.

Fuentes de referencia:
- ENACOM prestadores: https://www.enacom.gob.ar/buscador-de-prestadores_p1510
- ENACOM indicativos: https://www.enacom.gob.ar/indicativos-interurbanos_p143
- ANSES CUIL: https://www.argentina.gob.ar/servicio/solicitar-constancia-de-cuil
- DNRPA radicación: https://www.argentina.gob.ar/propiedadautomotor/consultar-radicacion-vehiculo
- ENACOM IMEI: https://www.enacom.gob.ar/denuncia-al-910_p4034
- Cotizaciones / uso: https://dolarapi.com/docs/uso

**Nota de privacidad:** los formularios de prestadores, CUIL, radicación e IMEI no transmiten los datos ingresados. El de dólar sí solicita cotizaciones a un servicio externo sin pasar identificaciones del usuario.


# ACTUALIZACIÓN v2 — menú y consultas

### Navegación
- Corregida la clase de **INICIO** en las siete páginas nuevas y el marcado LI de todos los menús modificados.
- Añadido alineado consistente, sin salto de línea en desktop, a `otros-servicios/comun/nav.css`.

### Cuatro conectores de API (opcionales; NO son datos reales por defecto)

Configuración en `otros-servicios/comun/api-config.js`:

```js
window.DATTA_API_BASE = 'https://TU_BACKEND/api';
```

El frontend utiliza `POST` JSON (con CORS admitiendo tu sitio). Las credenciales **nunca** deben aparecer en HTML/JS público: guárdalas exclusivamente en un backend seguro. Solo manda datos cuando la API está explícitamente configurada. Respuestas esperadas:

- `POST /api/prestadores` body `{"numero":"1112345678"}` → `{"verificado":true,"prestador_actual":"...","prestador_original":"...","portado":false,"fuente":"..."}`.
- `POST /api/cuil` body `{"dni":"12345678"}` → `{"verificado":true,"cuil":"20-12345678-6","fuente":"..."}`. **Solo** con CUIL comprobado realmente por una fuente habilitada; no generar por inferencia.
- `POST /api/radicacion` body `{"patente":"AB123CD"}` → `{"verificado":true,"localidad":"...","provincia":"...","registro":"...","fuente":"..."}`.
- `POST /api/imei/estado` body `{"imei":"...15 dígitos..."}` → `{"verificado":true,"estado":"bloqueado|no_reportado|desconocido","fuente":"..."}`.

Los cuatro conectores exigen `verificado:true` en la respuesta; sin API o si la fuente no confirma los datos, presentan **No verificado**, nunca un resultado supuesto. Un backend por sí solo no da acceso a ENACOM/ANSES/DNRPA/GSMA; para lograrlo hay que conseguir credenciales/licencias y documentación de sus servicios autorizados.

### Modelo del dispositivo vía TAC (sí intenta funcionar sin credenciales)

`otros-servicios/imei/js/tac-lookup.js` busca por el TAC de 8 dígitos del IMEI validado con Luhn, en una base pública comunitaria de Osmocom disponible en `https://raw.githubusercontent.com/G33l0/imei-generator/main/data/tac.sqlite` (snapshot de ~22.500 TAC). Carga el motor SQL.js desde CDN Cloudflare. **El IMEI no se transmite al repositorio ni a SQL.js**; únicamente descarga archivos estáticos. Si el catálogo remoto falla, recurre a cuatro TAC verificados incluidos en el JS; si no hay coincidencia, **no inventa un modelo**.

La base comunitaria **no es la lista de robados** ni el catálogo completo GSMA. **Bloqueado/operativo** sigue requiriendo acceso autorizado en tiempo real a una base de listas negras y, además, no se puede garantizar el funcionamiento físico del teléfono usando solo el IMEI.

Atribución: Base Osmocom TAC, © Harald Welte y colaboradores, **CC-BY-SA 3.0**; motor SQL.js licencia MIT, alojado en CDN de terceros. Si querés autonomía total, descargá la base y el motor con licencias correspondientes y guardalos en tu propio hosting (actualizá URLs en tac-lookup.js).

### Enlaces oficiales (alternativa inmediata gratuita)
- Prestadores: https://www.enacom.gob.ar/buscador-de-prestadores_p1510
- CUIL: https://www.argentina.gob.ar/servicio/solicitar-constancia-de-cuil
- Radicación con código verificador: https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2
- IMEI: https://www.enacom.gob.ar/imei

**Privacidad:** Los formularios DNI/IMEI/teléfono/patente NO transmiten datos personales a terceros sin que `DATTA_API_BASE` esté configurada. En el caso de CUIL, informá a los usuarios antes de activar la API, obtené consentimiento según corresponda y definí política de privacidad y conservación de datos. No registres números íntegros en logs de un backend.


### Cómo alojar tu propia base de modelos IMEI (sin dependencia permanente de GitHub ajeno)

1. En tu computadora, ejecutá `python otros-servicios/imei/tools/descargar_base_tac.py`.
2. El script descarga el archivo abierto y verifica el esquema de la base SQLite, guardándolo en `otros-servicios/imei/data/tac.sqlite` y poniendo `local_db:true` en `config.json`.
3. Subí ambos archivos a tu repositorio. Desde entonces la web busca el TAC en **tu propia copia**. Si esa copia falla, intenta la fuente pública y después la pequeña muestra local.

La copia es una base TAC de identificación de modelos, **NO una base de IMEI bloqueados**. Respetá la licencia CC-BY-SA 3.0 y conservá su atribución.
