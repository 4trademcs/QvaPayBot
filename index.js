// Archivo principal que inicia el bot y maneja los comandos

const { bot, startExpressServer } = require("./bot");

function getPrimaryToken() {
  const direct = process.env.TELEGRAM_BOT_TOKEN;
  if (direct && String(direct).trim()) return direct;

  const arrayValue = process.env.TELEGRAM_BOT_TOKENS;
  if (!arrayValue) return null;

  try {
    const parsed = JSON.parse(arrayValue);
    if (Array.isArray(parsed) && parsed.length) {
      return String(parsed[0]).trim();
    }
  } catch (error) {
    // fallback to comma split
  }

  const simple = String(arrayValue)
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(",")[0]
    .trim();

  return simple || null;
}

function startBot() {
  if (typeof bot.startPolling === "function") {
    bot.startPolling();
    return;
  }

  if (typeof bot.start === "function") {
    bot.start();
    return;
  }

  throw new Error("La instancia del bot no tiene un método de inicio válido");
}

// Validar que las variables de entorno necesarias estén definidas
if (!getPrimaryToken()) {
  throw new Error("Falta TELEGRAM_BOT_TOKEN o TELEGRAM_BOT_TOKENS en el .env");
}

startExpressServer();
startBot();
