# Fuentes para CUIL y radicación — revisión del 23/11/2026

## Estado de la integración

ConsultaCUIT continúa siendo la fuente activa de DNI → CUIT. Su funcionamiento fue confirmado por el propietario de DattaQuest. La fuente es un padrón tributario, y cambiar la etiqueta de su respuesta a CUIL no amplía su cobertura ni acredita una asignación de ANSES.

La versión 11 incorpora un adaptador para el formulario público de radicación de Argentina.gob.ar. La comprobación inicial sólo confirmó acceso al formulario. Después, el caso aportado por el usuario falló tanto en DattaQuest como en el formulario oficial. No se ha verificado una consulta completa exitosa. La corrección posterior elimina el indicador positivo de servicio: `/api/radicacion/status` informa `radicacion: null`, `formularioAccesible: true`, `estado: "solo_formulario"` y `consultaPatenteVerificada: false` cuando únicamente logra cargar el formulario. El archivo `otros-servicios/radicacion/js/config.js` controla la conexión; vaciar su endpoint permite deshabilitarla. No se activan proveedores comerciales como alternativa automática.

### Incidencia reproducida y alternativa

El formulario oficial mostró literalmente «El vehículo de patente @patente no aparece radicado», sin sustituir el marcador. El [código histórico oficial](https://github.com/argob/drupal-argentina-distro/blob/master/modules/argentinagobar/argentinagobar_formularios/src/Consulta/ConsultaRadicacionPorDominio.php) genera ese mensaje ante un HTTP 500 del servicio interno. La observación demuestra una respuesta inconclusa para el caso probado; no demuestra inexistencia de la patente ni permite afirmar que fallen todas las consultas. Los registros de DattaQuest muestran respuestas en unos 2–3 segundos, sin agotar el límite de espera.

La corrección clasifica este caso como `fuente_respuesta_inconclusa` (503) y presenta «Radicación no confirmada». No constituye una reparación del servicio externo ni una nueva fuente de datos.

La alternativa pública identificada es [DNRPA — Radicación por Patente](https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2.php), que requiere Dominio y Código verificador. No se comprobó una consulta completa en ese formulario ni su independencia del fallo de Argentina.gob.ar. Integrarlo requiere revisar la condición del producto que excluye el verificador; no se lo omite ni se agrega una redirección al sitio.

## CUIL: opciones investigadas

| Fuente | Cobertura documentada | Acceso y costo | Decisión |
| --- | --- | --- | --- |
| [ConsultaCUIT](https://consultacuit.fluxorhub.com/api) | CUIT de personas con datos en el padrón tributario disponible. | API pública gratuita, sin token. | Se conserva activa. No confirma todos los CUIL. |
| [ARCA, Padrón A13](https://www.arca.gob.ar/ws/ws-padron-a13/manual-ws-sr-padron-a13-v1.4.pdf) | `getIdPersonaListByDocumento` obtiene claves; `getPersona` informa `tipoClave`, documento y tipo de persona. El manual contempla CUIT/CUIL. | Certificado, autorización WSAA, token/sign y CUIT representada. | Vía oficial a evaluar con credenciales. El manual no garantiza cobertura universal de CUIL sin actividad tributaria. |
| [Afip SDK](https://afipsdk.com/pricing/) | Puente REST a los servicios de ARCA, incluido A13. | Plan Free con 1 CUIT representada y 1.000 requests. Cuenta/token y habilitación productiva. | Adaptador existente conservado e inspeccionado. Una búsqueda puede consumir varias requests; no equivale a 1.000 búsquedas. |
| [ARCA {API}](https://api.com.ar/docs/padron/documento) | DNI → lista de CUIT/CUIL mediante A13. | Cuenta, API key, certificado y delegación; plan gratuito con cupo anunciado en su web. | Alternativa con registro. No confundir con una API oficial de ARCA. |
| [ANSES / Argentina.gob.ar](https://www.argentina.gob.ar/descarga-constancia-cuil) | Constancia de CUIL. | Formulario gratuito: documento, nombre, apellido y sexo. | No cumple la interfaz de DNI solamente. No se encontró contrato público de API para terceros. |
| [SINTyS](https://www.argentina.gob.ar/jefatura/sintys/preguntas-frecuentes) | Intercambio de información entre organismos públicos. | Gratuito para organismos autorizados; excluye particulares. | No es una fuente disponible para esta web privada. |
| [RENAPER / SID](https://www.argentina.gob.ar/sid/modalidades-y-productos) | Servicios de validación de identidad. | Adhesión, evaluación, autorización y condiciones de uso. | No es un padrón abierto de DNI → CUIL. |
| [API.ar](https://api.ar/apis/datos-anses-dni/) | Anuncia datos ANSES por DNI. | Habilitación de cuenta, finalidad y precio por consulta; condiciones de redistribución. | No satisface gratuidad y ausencia de registro. |

Para conectar A13 se necesita una identidad técnica autorizada del operador. Los visitantes pueden conservar DNI + botón sin registrarse, pero esto no elimina el alta técnica del operador. No deben enviarse certificados, claves privadas ni contraseñas por el repositorio o por el frontend.

### Sitios públicos que no resuelven la integración

- [InformesEnLinea](https://informesenlinea.com.ar/cuil) y [ReportesYa](https://reportesya.com.ar/cuil): los formularios actuales requieren DNI, sexo y verificación Turnstile. No publican una API abierta ni permiten determinar, por el JavaScript público, cuál es su fuente de CUIL. No se afirma que sean únicamente calculadoras: el procesamiento ocurre en su servidor.
- [Datuar](https://datuar.com/): exige verificación de seguridad y anuncia fuentes públicas y privadas, sin contrato abierto verificable para esta integración.
- [CUITOnline](https://www.cuitonline.com/faq): su propia FAQ limita la búsqueda por DNI/CUIL a quienes poseen CUIT registrado y publicado en AFIP.
- Las bibliotecas de dígito verificador generan candidatos; no confirman la clave asignada a una persona.
- No se incorporan archivos de personas encontrados en repositorios cuando no puede verificarse su publicación oficial y procedencia.

### Por qué no se utiliza la Central de Deudores como padrón CUIL

La [API del BCRA](https://www.bcra.gob.ar/apis-banco-central/) es pública y gratuita, pero recibe un CUIT/CUIL/CDI y devuelve información financiera asociada. No devuelve el DNI ni distingue el tipo de clave. Su campo `identificacion` reproduce el identificador consultado. No es una confirmación de asignación de CUIL por ANSES, y la ausencia de datos no demuestra que una persona no tenga CUIL. No se incorpora como resolvedor de identidad.

## Radicación: formulario público oficial

Fuente: [¿En cuál registro automotor está radicado un vehículo?](https://www.argentina.gob.ar/propiedadautomotor/consultar-radicacion-vehiculo).

La inspección del formulario desplegado confirmó:

- Formulario `consulta-radicacion-dominio`, campo `patente`, botón `op=Consultalo`.
- Carga de `form_build_id` y `form_id` de cada formulario. Los valores no se fijan en el código ni se comparten entre visitantes.
- Envío Drupal AJAX a `/system/ajax`, con el disparador y los controles normales de la interfaz.
- La comprobación en navegador con el campo vacío mostró el error de validación oficial; no consultó ninguna patente.

No se emplea la API interna autenticada del Gobierno ni se obtiene su bearer token. El adaptador utiliza el formulario público, por lo que depende de su disponibilidad y estructura. Un CAPTCHA, una restricción, una redirección o un cambio del formulario detienen la consulta. No hay resolución automática de desafíos ni proxies alternativos.

El código histórico oficial está en [argob/drupal-argentina-distro](https://github.com/argob/drupal-argentina-distro/tree/master/modules/argentinagobar/argentinagobar_formularios). Ayuda a interpretar la respuesta, pero no sustituye la inspección de la versión desplegada.

### Datos devueltos y controles

Se devuelven exclusivamente patente consultada, nombre del registro seccional y datos de la oficina: dirección, localidad, provincia, código postal, teléfono y horario cuando existan. El adaptador exige coincidencia de patente y un panel de registro reconocible. No devuelve titulares, documentos ni domicilios particulares.

El HTML de la fuente se interpreta como datos inertes, nunca se ejecuta ni se inserta en la página de DattaQuest. El frontend imprime texto mediante su renderizador de campos.

La versión histórica oficial convertía algunos errores de servidor en el texto «no aparece radicado». Por eso ese mensaje no se utiliza como prueba concluyente de ausencia: DattaQuest informa una consulta no completada.

Los [términos de Argentina.gob.ar](https://www.argentina.gob.ar/terminos-y-condiciones) describen acceso libre/gratuito, contenido CC BY 4.0 salvo excepciones y respeto de los controles de acceso. Esto no constituye un contrato de API ni garantía de disponibilidad. La atribución de la fuente acompaña el resultado.

### Alternativas vehiculares evaluadas

- [Portal clásico DNRPA](https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2.php): consulta gratuita con código verificador; no se omite ese control.
- [Chasis](https://www.chasis.com.ar/docs): API documentada de radicación con clave y consumo de créditos. Su sandbox responde con datos ficticios. El adaptador existente queda sin activar como alternativa de pago.
- [Patente.ar](https://patente.ar/api-vehicular) y [API.ar](https://api.ar/precios/): API keys y créditos/cotización; no se verificó un plan gratuito permanente que cumpla el requisito.
- [Clasificar V2](https://clasific.ar/docs/v2/vehicles): exige API key. Su documentación actual describe lectura de datos históricos y reserva `onMiss=search` y `refresh=true` para planes pagos; no documenta un campo de radicación en el contrato revisado. No se integra suponiendo una cobertura gratuita de registro vigente.
- [Argenapi](https://www.argenapi.com/docs/patentes/consulta): permite solicitar sólo `radicacion: true`, con cobertura nacional y un crédito por operación. Requiere API key y créditos; no cumple las condiciones de costo cero y ausencia de cuenta.
- El directorio de registros seccionales identifica oficinas, pero no vincula por sí mismo cada patente con su registro actual.

## Verificación y activación

Las pruebas de contratos utilizan respuestas sintéticas; no envían documentos ni patentes a fuentes externas. La comprobación pública `/api/radicacion/status` sólo carga el formulario y declara `consultaPatenteVerificada: false`. No debe confundirse con una consulta productiva de un vehículo.

La conexión al formulario se mantiene para tramitar solicitudes, pero la disponibilidad de la consulta no se deduce del acceso al formulario. Un cambio de estructura o una restricción detienen la consulta. No se amplían permisos ni se omiten controles para sortear esa restricción.
