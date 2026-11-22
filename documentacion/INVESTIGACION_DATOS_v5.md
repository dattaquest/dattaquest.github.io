# DattaQuest — Implementación basada en funciones públicas (v5)

## Auditoría de servicios comerciales
Datacels, Informes en Línea y ReportesYa muestran formularios públicos de prefijos, operador y CUIL.
Sus páginas públicas no ofrecen libre descarga de bases privadas ni acceso documentado para replicar sus sistemas internos.
Datacels e Informes en Línea reconocen fuentes privadas en sus informes; ReportesYa menciona informes pagos con entrega posterior.

Fuentes: https://datacels.com.ar/prefijos ; https://datacels.com.ar/como-saber-de-quien-es-un-numero-celular
https://informesenlinea.com.ar/cuil ; https://informesenlinea.com.ar/preguntas ; https://reportesya.com.ar/preguntas

## Prefijos
La base importada de ENACOM tiene 300 indicativos. Ahora se buscan números y también localidades por nombre.
La cabecera de numeración no implica ubicación actual ni demuestra qué operadora tiene hoy el número.

## IMEI, segunda fuente
Osmocom sigue siendo la primera fuente. La segunda es la compilación abierta de MoazEb: https://github.com/MoazEb/tac-database
Para activar la ampliación, fusionar el PR y ejecutar Actions → Ampliar catalogo IMEI TAC → Run workflow.
El script valida los CSV, conserva solamente TAC, marca y modelo, y publica fragmentos bajo otros-servicios/imei/data/tac-ampliado/.
La compilación reclama licencia MIT y cita materiales derivados de Osmocom con CC BY-SA 3.0. Conservar los avisos y respetar los derechos subyacentes.
El catálogo no puede comprobar denuncia, bloqueo, titularidad, garantía ni estado operativo del dispositivo.

## Restricciones verificadas
El operador actual requiere portabilidad actualizada y no se deduce de las asignaciones ENACOM.
El CUIL asignado no se confirma calculando prefijos por género: la Resolución 286/2021 desvinculó los nuevos prefijos del género.
La radicación actual requiere acceso DNRPA autorizado; el sitio oficial incluye código verificador.
Las consultas a fuentes restringidas deben respetar autenticación, permisos, privacidad y condiciones del servicio.