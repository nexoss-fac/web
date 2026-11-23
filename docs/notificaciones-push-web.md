# Notificaciones push web de NEXOSS

## Qué hace
- Añade controles para activar/desactivar push en el panel de administración y en el espacio del cobrador.
- Registra la suscripción por dispositivo en la base de datos de la empresa activa.
- Las alertas generales de la empresa se limitan a dispositivos de propietario/administrador.
- Los dispositivos del cobrador se registran con su rol y solo reciben alertas de las cuentas asignadas.
- Usa el Service Worker `public/sw.js`. No requiere instalar ntfy.

## Requisitos de despliegue
1. Ejecutar `npm install` para instalar `web-push` y actualizar `package-lock.json`.
2. Generar claves VAPID con `npx web-push generate-vapid-keys`.
3. Configurar en el servidor (nunca en variables `VITE_*`):
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_VAPID_SUBJECT=mailto:correo-del-administrador@tu-dominio.com`
4. Desplegar el sitio bajo HTTPS. `localhost` funciona para desarrollo; HTTP en una IP/dominio no seguro no.
5. Reiniciar/re-desplegar después de configurar las variables.
6. Verificar que la base de datos de cada empresa permita crear la tabla `nexoss_web_push_subscriptions`.

## Cómo activarlo
1. Iniciar sesión como propietario o administrador de una empresa.
2. Pulsar **Activar notificaciones** y aceptar el permiso del navegador.
3. Repetir en cada dispositivo que deba recibir los avisos.
4. Registrar una venta y un gasto de prueba para validar la entrega.

## Seguridad y limitaciones
- El endpoint de alta/baja está detrás de autenticación Firebase y de membresía activa; `owner`, `admin` y `collector` pueden registrar su propio dispositivo.
- La tabla se crea en el contexto de base de datos de la empresa activa, evitando mezclar suscripciones entre empresas con bases de datos separadas.
- No incluir datos bancarios, identificadores fiscales ni datos personales de clientes en las notificaciones.
- La entrega depende del navegador, los permisos del sistema operativo, conectividad y configuración de ahorro de batería.
- Antes de producción, probar especialmente la revocación de membresías: las suscripciones de dispositivos de un administrador cuyo acceso se revoque deben eliminarse junto con la membresía. La entrega en segundo plano puede variar por navegador.


## Cobranza y visitas de Macizo
- El administrador asigna clientes por RIF a usuarios con rol `collector`.
- El cobrador solo puede leer sus asignaciones y registrar abonos en sus facturas; no obtiene acceso general a ventas, inventario, cartera ni asignaciones.
- Al confirmar un despacho a crédito, se crea un seguimiento de 15 días y una visita de anaqueles a los 3 días.
- El servidor programa avisos push para el día 10, el vencimiento, la mora desde el día 16 y la visita pendiente.
- El administrador recibe todas las alertas de la empresa y conserva la facultad de cerrar las visitas de anaqueles.
- Los avisos se procesan cada 15 minutos en el proceso de la empresa. Al iniciar sesión un administrador o cobrador, la aplicación vuelve a armar el ciclo de recordatorios del tenant.
- Las tablas de asignación, seguimiento y abonos se crean en la base Neon operativa del tenant. Los abonos se conservan en un historial separado y no reescriben los pagos originales de la factura.
