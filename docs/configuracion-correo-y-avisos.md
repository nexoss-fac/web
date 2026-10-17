# Correo de invitación y avisos al teléfono

Todo se configura en el archivo `.env` (después de cambiarlo, reinicia con Ctrl+C y `npm run dev`).

## Correo de invitación al equipo

Elige UNA de estas dos opciones.

### Opción A: Gmail por SMTP
1. En la cuenta de Google activa la verificación en dos pasos y crea una "contraseña de aplicación".
2. En la carpeta del proyecto ejecuta `npm install nodemailer`.
3. Agrega al `.env`:

    MAIL_PROVIDER=smtp
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=465
    SMTP_USER=tucorreo@gmail.com
    SMTP_PASS=la-contraseña-de-aplicación
    MAIL_FROM=NEXOSS <tucorreo@gmail.com>

### Opción B: Resend (no instala nada)
Requiere una cuenta en resend.com y un dominio verificado.

    MAIL_PROVIDER=resend
    RESEND_API_KEY=re_xxxxxxxx
    MAIL_FROM=NEXOSS <hola@tudominio.com>

### Despliegue en Render
En Render crea **New → Web Service**, conecta el repositorio y configura:

    Build Command: npm ci && npm run build
    Start Command: npm start

En **Environment**, agrega `MAIL_PROVIDER=resend`, `RESEND_API_KEY` y `MAIL_FROM`. Guarda la clave solamente en Render, nunca en el repositorio ni en el código del navegador. Render asigna una URL pública al servicio; NEXOSS la usa automáticamente para formar los enlaces de invitación. Si conectas un dominio propio, define también `APP_PUBLIC_URL` con esa URL HTTPS.

### Enlace de invitación
Al crear una invitación, NEXOSS envía un correo con un enlace directo a esa invitación, la empresa y el rol asignado. La persona debe iniciar sesión o crear su cuenta con el mismo correo invitado, verificarlo y pulsar **Aceptar y entrar**. El enlace no concede acceso hasta que la invitación se acepta.

En desarrollo local, si no defines `APP_PUBLIC_URL`, el enlace apunta a `http://127.0.0.1:3000`, que solo funciona en tu computadora. Para una URL propia, define:

    APP_PUBLIC_URL=https://nexoss.tudominio.com

Configura el proveedor de correo en el entorno del servidor y reinicia o vuelve a desplegar NEXOSS. Si el correo no sale, la invitación igual queda creada y el panel muestra el motivo para corregir la configuración.

## Avisos al teléfono (venta o gasto nuevo)

El servidor envía el aviso hacia afuera, así que funciona aunque NEXOSS corra solo en tu PC. Puedes usar uno o los dos canales.

### Telegram (privado, recomendado)
1. En Telegram abre @BotFather, escribe /newbot y copia el token.
2. Escríbele cualquier mensaje a tu bot nuevo.
3. Abre en el navegador `https://api.telegram.org/botTU_TOKEN/getUpdates` y busca `"chat":{"id":NUMERO`. Ese número es tu chat.
4. Agrega al `.env`:

    NOTIFY_TELEGRAM_BOT_TOKEN=123456:ABC...
    NOTIFY_TELEGRAM_CHAT_ID=123456789

### ntfy (app gratuita)
Instala la app "ntfy" y suscríbete a un tema con un nombre largo e imposible de adivinar (cualquiera que conozca el nombre puede leer los avisos):

    NOTIFY_NTFY_TOPIC=nexoss-makd-7f3k9x2q8w

### Qué avisar
Por defecto avisa ventas y gastos. Para solo ventas: `NOTIFY_EVENTS=sale`.

Los avisos no incluyen RIF, teléfono ni correo del cliente. Un gasto solo avisa si se guarda por el servidor (con Neon conectado), y cada venta o gasto avisa una sola vez aunque se reenvíe.
