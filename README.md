# Alerta Telegram QvaPay

Bot de Telegram para monitorear ofertas P2P de QvaPay en segundo plano, con alertas automáticas, lista blanca de usuarios y supervisión continua.

## Descripción

Este proyecto se diseñó como un bot global de alertas para QvaPay. La idea principal es que el bot no espere a que el usuario haga una consulta manual, sino que:

- inicie sesión con la cuenta de QvaPay,
- revise el mercado automáticamente,
- filtre ofertas por reglas de cada usuario autorizado,
- envíe alertas al canal configurado,
- y solo permita el uso a usuarios que tú autorices.

## Principio de seguridad

Este bot está pensado para ser privado.

- No es público.
- Solo pueden usarlo los usuarios que estén en `ALLOWED_TELEGRAM_IDS`.
- El bot creado con BotFather es el único que escucha comandos.
- Un bot token y un channel ID son cosas distintas.

## Variables de entorno

La configuración principal se reduce a arrays. Así evitás duplicar conceptos y usás una sola variable por cada tipo.

```env
# Arreglo principal de bots del proyecto. El primer elemento es el principal.
TELEGRAM_BOT_TOKENS=["tu_token_principal_del_bot"]

# Arreglo principal de destinos (canales, grupos o personas).
TELEGRAM_OUTPUT_MESSAGE_IDS=["-1001234567890", "123456789"]

# Credenciales de QvaPay
QVAPAY_USERNAME=tu_email_o_usuario_qvapay
QVAPAY_PASSWORD=tu_password_qvapay

# Segundos entre revisiones automáticas
AUTOMATIC_SCAN_SECONDS=60

# Solo los usuarios autorizados pueden interactuar con el bot
ALLOWED_TELEGRAM_IDS=[123456789,987654321]

# Puerto de la app
PORT=8080
```

### Qué representa cada valor

- `TELEGRAM_BOT_TOKENS`: arreglo con los tokens de Telegram. Si hay solo uno, usa una sola posición.
- `TELEGRAM_OUTPUT_MESSAGE_IDS`: arreglo con los IDs de destino. Pueden ser IDs de canales (ej. `-100...`), IDs de grupos, o IDs de usuarios (personas). Si pones varios en el arreglo, a **todos** ellos les llegarán las alertas automáticamente.
- `QVAPAY_USERNAME`: correo o usuario de inicio de sesión en QvaPay.
- `QVAPAY_PASSWORD`: contraseña de QvaPay.
- `AUTOMATIC_SCAN_SECONDS`: intervalo de monitoreo automático en segundos.
- `ALLOWED_TELEGRAM_IDS`: lista blanca de usuarios de Telegram autorizados.
- `PORT`: puerto del servidor Express.

## Diferencia entre token de bot e ID de destino

Es importante no mezclar estos dos conceptos:

- `TELEGRAM_BOT_TOKENS`: identifica al bot y sirve para que el bot reciba mensajes.
- `TELEGRAM_OUTPUT_MESSAGE_IDS`: identifica el o los destinos (canales, grupos, usuarios) donde se publican las alertas automáticas.

Son valores distintos y no se sustituyen entre sí.

## Cómo obtener el token del bot

1. Abre Telegram.
2. Busca `@BotFather`.
3. Escribe `/newbot`.
4. Asigna un nombre y username.
5. Copia el token que te devuelve.

Ejemplo:

```text
123456:ABCDEF... 
```

Ese valor va dentro de `TELEGRAM_BOT_TOKENS`.

## Cómo obtener el ID de destino (canal, grupo o usuario)

Usá un bot de diagnóstico como `@RawDataBot` o un bot que muestre los datos del chat.

Cuando agregues el bot al canal/grupo o le mandes un mensaje desde ahí, te devolverá un valor tipo:

```text
-1001234567890
```

Ese valor va dentro de `TELEGRAM_OUTPUT_MESSAGE_IDS`. Si quieres enviarlo a múltiples destinos (por ejemplo a ti mismo, a un amigo y a un canal), simplemente agrégalos al arreglo separados por comas: `["123", "456", "-100789"]`.

## Cómo obtener el ID del usuario autorizado

Con un bot tipo `@RawDataBot` o un bot equivalente podrás ver tu `chat_id`:

```text
123456789
```

Ese ID se agrega en `ALLOWED_TELEGRAM_IDS`.

## Configuración de usuarios autorizados

Los usuarios autorizados son los únicos que pueden usar el bot.

Ejemplo:

```env
ALLOWED_TELEGRAM_IDS=[123456789,987654321]
```

También podés tenerlo en `config/users.json`:

```json
{
  "allowed_users": [
    123456789,
    987654321
  ]
}
```

El programa combina ambos valores y toma la lista final sin permitir acceso a terceros.

## Revisión automática y frecuencia

La revisión automática del mercado no debe ser demasiado agresiva. En la interfaz pública de QvaPay los precios se actualizan en cadencia cercana al minuto, así que el valor recomendado es:

```env
AUTOMATIC_SCAN_SECONDS=60
```

Esto resulta en un ciclo de 1 minuto, que es más seguro y compatible con la frecuencia natural del mercado que un polling excesivamente agresivo.

## Instalación

```bash
npm install
```

Crea tu `.env` con valores reales y luego:

```bash
npm start
```

O directamente:

```bash
node index.js
```

## Comandos del bot

### Autenticación

- `/start`: bienvenida y acceso autorizado.
- `/login`: inicia sesión en QvaPay.
- `/logout`: cierra la sesión.
- `/alive`: comprueba que todo está activo.
- `/estado`: muestra reglas y estado.

### Consultas manuales

- `/ofertas`
- `/Ofertas_sell_CUP 1 500 0.95 desc`
- `/Ofertas_buy_USDT 1 300 0.92 asc`
- `/Ofertas_sell_ZELLE 1 250 1.05 desc`

### Modo automático

- `/Modo Automático ON`
- `/Modo Automático OFF`

Cuando el modo está activo, el bot revisa el mercado automáticamente y envía alertas a los canales configurados.

## Modo global y restricción

La lógica actual está pensada para:

- aceptar solo usuarios autorizados,
- mantener la sesión de QvaPay por usuario,
- verificar reglas activas en background,
- y disparar alertas cuando hay cambios relevantes.

Esto hace que sea un bot global de vigilancia, pero no accesible para cualquiera.

## Estructura de archivos

```text
.
├── bot.js
├── index.js
├── .env
├── .env.example
├── config/
│   └── users.json
├── services/
│   ├── authService.js
│   ├── offerService.js
│   ├── telegramService.js
│   └── userService.js
├── package.json
├── README.md
└── .gitignore
```

## Recomendación final

Usá esto como patrón principal:

```env
TELEGRAM_BOT_TOKENS=["..."]
TELEGRAM_OUTPUT_MESSAGE_IDS=["..."]
QVAPAY_USERNAME=...
QVAPAY_PASSWORD=...
AUTOMATIC_SCAN_SECONDS=60
ALLOWED_TELEGRAM_IDS=[...]
PORT=8080
```

Si solo tenés un bot y un canal, simplemente dejás un arreglo con un solo elemento. Eso elimina duplicación y mantiene todo claro.
