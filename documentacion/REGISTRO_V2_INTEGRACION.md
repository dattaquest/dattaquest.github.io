# Registro de consultas v2 — integración pendiente del servidor

Esta rama no debe integrarse hasta modificar el servidor existente:
https://dattaquest-consultacuit.sizedhatch64.chatgpt.site

La configuración por defecto mantiene exactamente el formato v1. No activar `window.DATTA_LOGS_V2 = true` hasta comprobar el receptor, su política de datos y su panel privado.

## Cambios del cliente preparados

- Prefijos: resultado público de códigos, localidad, provincia y total mostrado; no conserva números completos ni texto libre arbitrario.
- Dólar: cotizaciones públicas de compra/venta, resultado desde red o caché, HTTP real del proveedor cuando existe.
- Duración local en milisegundos, un evento por consulta terminada. Los demás servicios conservan el comportamiento existente.

## Contrato del servidor pendiente de implementar

Aceptar eventos v1 y v2 en POST /api/eventos. V2 conserva service, action y client, y admite version=2, outcome, durationMs, detail de campos permitidos por servicio y providerHttp opcional. Validar tipos, límites de tamaño, enumeraciones y catálogo; no confiar en los datos enviados por el navegador. No interpretar providerHttp como código HTTP del servidor propio.

Migración aditiva y reversible de registros: conservar la IP previa, separar ipv4 e ipv6 según familia usando un analizador IP; mantener ambos campos anulables, duración y detalle opcionales. No reconstruir direcciones faltantes ni rellenar datos históricos con supuestos. Mantener expiración de 30 días y las reglas de acceso vigentes.

Para capturar ambas familias cuando estén disponibles: configurar dos destinos propios HTTPS, uno exclusivamente A y otro exclusivamente AAAA, con una asociación efímera por consulta, limitada en tiempo, y registrar las direcciones observadas por el servidor o proxy de confianza. No usar servicios externos de IP ni confiar en cabeceras manipulables por visitantes. Si una familia no está disponible, mostrar un guion. No intentar forzar ni identificar redes privadas.

## Panel privado

Mantener /admin/consultas y añadir columnas IPv4, IPv6 y Ver detalle. La ficha debe usar el identificador del registro y repetir la autorización de propietario en cada petición. Escapar texto, impedir caché compartida, devolver 404 si el registro expiró, mantener sin detalle los registros históricos. Mostrar servicio, fecha/hora argentina, metadatos, resultado, duración y distinguir HTTP del servidor del HTTP del proveedor.

No ampliar el registro de identificadores personales, contenido de informes ni entradas de pago sin definir finalidad, autorización, aviso de privacidad, minimización, cifrado y acceso restringido. No almacenar contraseñas, tokens, cookies, CAPTCHA ni datos de tarjeta. No copiar informes personales a un registro de estadísticas general. Las operaciones de pago siguen siendo pedidos, no pagos confirmados.

## Verificación antes del despliegue

Probar v1 y v2, IPv4 sola, IPv6 sola y conectividad dual, datos ausentes, consultas sin coincidencias, fallo de proveedor, caché, paginación, expiración, acceso sin sesión y con usuario distinto del propietario. Confirmar que no se envía información privada en los eventos y actualizar las versiones de caché de los scripts antes de activar v2. Ejecutar npm test y las pruebas del navegador. Verificar el servidor y la página publicada con datos de prueba.
