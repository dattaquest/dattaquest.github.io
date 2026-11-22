# DattaQuest — Correcciones y vías de integración verificables (noviembre 2026)

## Correcciones del sitio
- IMEI: la errata `XAIOMI` se presenta como **Xiaomi**, incluidas las repeticiones en los modelos, sin modificar los datos TAC originales ni afirmar bloqueo o funcionamiento.
- Prestadores: se conserva el nombre legal histórico de ENACOM. A las razones sociales `TELEFONICA MOVILES ARGENTINA S.A.`, `COMPANIA DE RADIOCOMUNICACIONES MOVILES S.A.` y `AMX ARGENTINA S.A.` se añade la **marca comercial asociada** (Movistar, Personal y Claro respectivamente). La razón social NO es la marca. Esta asociación no confirma operadora actual ni refleja necesariamente cambios societarios posteriores.

## CUIL: opciones y límites
1. **ANSES – constancia oficial:** https://www.argentina.gob.ar/servicio/solicitar-constancia-de-cuil . Está destinada a obtener el CUIL asignado, no ofrece una API pública de consultas masivas documentada.
2. **ANSES – intercambio electrónico con organizaciones externas:** https://www.anses.gob.ar/cartilla/intercambio-electronico-de-informacion-con-organizaciones-externas . Requiere alta y permisos; confirmar que exista un servicio aplicable a la finalidad y al sujeto consultado antes de desarrollar un cliente.
3. **Clave de la Seguridad Social Corporativa:** https://www.argentina.gob.ar/servicio/obtener-clave-de-la-seguridad-social-corporativa . Orientada a empresas, entidades y organismos; no implica habilitación automática para buscar CUIL de cualquier ciudadano.
4. **ARCA – web services de padrón:** https://www.arca.gob.ar/ws/documentacion/catalogo.asp . `ws_sr_constancia_inscripcion` reemplaza `ws_sr_padron_a5` (deprecado). Son servicios autenticados para datos tributarios por CUIT y sujetos a permisos; **no son equivalentes a DNI → CUIL**.
5. **AUTENTICAR:** https://www.argentina.gob.ar/jefatura/innovacion/autenticar . Plataforma de identidad federada para sistemas que puedan integrarla, no un directorio público de CUIL.

**Importante:** por Resolución 286/2021, los prefijos de nuevos CUIL se asignan sin relación obligatoria con sexo/género. Un algoritmo que combine DNI + sexo + dígito verificador produce un *candidato*, no el registro confirmado de ANSES. No publicar candidatos como si fuesen CUIL registrados: https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-286-2021-350568/texto .

## Radicación de patentes: opciones y límites
1. **DNRPA – consulta oficial por dominio:** https://www.dnrpa.gov.ar/portal_dnrpa/radicacion2 . Requiere ingresar código verificador. No se ha confirmado una API abierta para la relación patente → registro actual.
2. **Datos Argentina – registros seccionales:** https://datos.gob.ar/dataset/justicia_bbdac295-c88e-4e2d-8f74-a845a2e93a61 . Tiene listados de registros con ubicación y competencia. Es reutilizable para un futuro *buscador de registros por localidad*, pero **no permite saber por sí solo dónde está radicada una patente**.
3. **Solicitud formal:** para automatizar la radicación de un dominio, presentar la finalidad de DattaQuest y consultar con DNRPA si existe acceso institucional, convenio o endpoint documentado y autorizado. Ninguna clave se debe incluir en GitHub Pages.

## Backend y seguridad
El adaptador de Cloudflare Workers existente puede consumir endpoints **después** de contar con autorización, contrato de respuesta documentado, CORS y credenciales almacenadas como secretos. Se corrige su origen predeterminado a `https://dattaquest.github.io`, pero **esto no activa por sí solo consultas de ANSES o DNRPA**.

Datos personales: Ley 25.326 https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto . Incorporar finalidad clara, consentimiento/base de legitimación, verificación de identidad cuando sea necesario, límites de consulta y minimización de registros.

## Estado
Se entrega el código de presentación y el ajuste del backend; las API de ANSES y DNRPA permanecen **sin configurar** porque no hay credenciales habilitadas ni endpoints autorizados aportados por los organismos. No se generan respuestas ficticias.
