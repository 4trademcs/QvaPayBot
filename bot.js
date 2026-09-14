const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const authService = require("./services/authService");
const offerService = require("./services/offerService");
const { isAuthorized } = require("./services/userService");
const { formatOfferMessage } = require("./services/telegramService");
require("dotenv").config();

function parseEnvArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  const normalized = String(value).trim();
  if (!normalized) return [];

  try {
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((item) => item.trim()).filter(Boolean);
    }
  } catch (error) {
    // ignore and fall through to comma-split
  }

  return normalized
    .split(",")
    .map((item) => item.trim().replace(/^\[|\]$/g, ""))
    .filter(Boolean);
}

const rawToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKENS;
const rawOutputMessageId = process.env.TELEGRAM_OUTPUT_MESSAGE_ID || process.env.TELEGRAM_OUTPUT_MESSAGE_IDS;
const botTokens = parseEnvArray(rawToken);
const outputMessageIds = parseEnvArray(rawOutputMessageId);
const token = botTokens[0];
const outputMessageIdFallback = outputMessageIds[0] || process.env.TELEGRAM_OUTPUT_MESSAGE_ID;
const username = process.env.QVAPAY_USERNAME || process.env.QVAPAY_USUARIO || process.env.TELEGRAM_USUARIO;
const password = process.env.QVAPAY_PASSWORD || process.env.QVAPAY_PASS || process.env.TELEGRAM_PASSWORD;
const autoScanSeconds = Number(process.env.AUTOMATIC_SCAN_SECONDS || process.env.TELEGRAM_INTERVALO || 60);
const scanIntervalMs = Math.max(60000, autoScanSeconds * 1000);

const bot = token
  ? new TelegramBot(token, { polling: false })
  : {
      start() {
        throw new Error("Falta TELEGRAM_BOT_TOKEN o TELEGRAM_BOT_TOKENS en el .env");
      },
      sendMessage() {
        throw new Error("Falta TELEGRAM_BOT_TOKEN o TELEGRAM_BOT_TOKENS en el .env");
      },
      onText() {},
      on() {},
    };

const app = express();
const port = process.env.PORT ?? 8080;

let expressServerStarted = false;

function startExpressServer() {
  if (expressServerStarted) return;
  expressServerStarted = true;
  app.listen(port, () => {
    console.log(`App listening on port ${port}`);
  });
}

let globalMonitorTimer = null;

const sessionData = new Map();
const userConfigs = new Map();
const intervals = new Map();
const previousOffers = new Map();
const defaultSupportedCoins = [
  "CUP",
  "MLC",
  "USD",
  "USDT",
  "BTC",
  "ETH",
  "TRX",
  "BCH",
  "LTC",
  "ZELLE",
  "PAYPAL",
  "EUR",
  "COP",
  "DOP",
  "PEN",
  "ARS",
  "CLP",
  "CRC",
  "MXN",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "BRL",
  "VES",
];

function getConfiguredChannels() {
  return outputMessageIds.length ? outputMessageIds : outputMessageIdFallback ? [outputMessageIdFallback] : [];
}

function maybeStartGlobalMonitor() {
  if (globalMonitorTimer) return;

  globalMonitorTimer = setInterval(async () => {
    for (const [chatId, session] of sessionData.entries()) {
      if (!isAuthorized(chatId)) continue;
      const config = getConfig(chatId);
      if (!config.active || !config.rules.length) continue;
      await processRuleSet(chatId, session, config.rules);
    }
  }, scanIntervalMs);
}

function sendMessage(chatId, text, extraOpts = {}) {
  return bot.sendMessage(chatId, text, extraOpts);
}

function sendMessageCanal(chatId, text) {
  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [[{ text: "Ver todas las ofertas P2P en QvaPay", url: "https://qvapay.com/p2p" }]],
    },
  };

  return bot.sendMessage(chatId, text, {
    ...inlineKeyboard,
    disable_web_page_preview: true,
    parse_mode: "Markdown",
  });
}

function getConfig(chatId) {
  if (!userConfigs.has(chatId)) {
    userConfigs.set(chatId, { active: false, rules: [], supportedCoins: [...defaultSupportedCoins] });
  }
  return userConfigs.get(chatId);
}

function getEffectiveRuleType(type) {
  const normalized = String(type || "").toLowerCase();
  return normalized === "buy" || normalized === "compra" ? "buy" : "sell";
}

function normalizeOffer(rawOffer, rule) {
  const amount = Number(rawOffer.amount || 0);
  const receive = Number(rawOffer.receive || 0);
  const ratio = Number(rawOffer.Ratio || (amount > 0 ? receive / amount : 0));

  return {
    ...rawOffer,
    type: rawOffer.type || rule.type,
    coin: rawOffer.coin || rule.coin,
    amount,
    receive,
    Ratio: ratio,
    name: rawOffer.owner?.name || rawOffer.owner?.username || "Anónimo",
    ultimaFecha: rawOffer.updated_at || rawOffer.updatedAt || new Date().toISOString(),
    url: rawOffer.url || `https://qvapay.com/p2p/${rawOffer.uuid || rawOffer.id || ""}`,
  };
}

function compareOfferCollections(current, previous) {
  if (!previous || previous.length !== current.length) return true;
  return JSON.stringify(current) !== JSON.stringify(previous);
}

async function sendArrayToTelegram(chatId, array, ordenadoPor) {
  const safeArray = (array || []).slice(0, 10);
  if (!safeArray.length) return;

  const summary = `📊 *${ordenadoPor}*\n\n${safeArray.length} ofertas coinciden con la regla actual.`;
  await sendMessageCanal(chatId, summary);

  for (const offer of safeArray) {
    const formatted = formatOfferMessage(
      normalizeOffer(offer, { type: offer.type || "sell", coin: offer.coin || "USD" }),
      ordenadoPor
    );
    await sendMessage(chatId, formatted, { parse_mode: "Markdown" });
  }
}

async function processRuleSet(chatId, session, rules, isManual = false) {
  if (!session || !rules || rules.length === 0) return;

  for (const rule of rules) {
    try {
      const coin = String(rule.coin || "CUP").toUpperCase();
      const type = getEffectiveRuleType(rule.type);
      const data = await offerService.getOffers(session, type, `BANK_${coin}`, rule.min, rule.max);
      const rawOffers = (data.data || data.offers || data || []).filter((offer) => offer && offer.status === "open");

      const filteredOffers = rawOffers
        .map((offer) => normalizeOffer(offer, { type, coin }))
        .filter((offer) => {
          const ratioOk = type === "buy"
            ? Number(offer.Ratio || 0) >= Number(rule.ratio)
            : Number(offer.Ratio || 0) <= Number(rule.ratio);

          return ratioOk;
        })
        .sort((a, b) => {
          if (String(rule.orden || "ratio").toLowerCase() === "fecha") {
            return new Date(b.ultimaFecha) - new Date(a.ultimaFecha);
          }
          return Number(b.Ratio || 0) - Number(a.Ratio || 0);
        });

      const cacheKey = `${chatId}:${type}:${coin}`;
      const previous = previousOffers.get(cacheKey) || [];

      if (filteredOffers.length > 0 && (isManual || compareOfferCollections(filteredOffers, previous))) {
        if (!isManual) {
          previousOffers.set(cacheKey, filteredOffers);
        }

        const targetChannels = isManual ? [chatId] : getConfiguredChannels();

        for (const targetChannel of targetChannels) {
          await sendArrayToTelegram(
            targetChannel,
            filteredOffers,
            rule.orden === "fecha" ? "Ofertas ordenadas por fecha" : "Ofertas ordenadas por mejor ratio"
          );
        }
      } else if (isManual && filteredOffers.length === 0) {
        await sendMessageCanal(chatId, `📭 No hay ofertas para tu regla: ${type.toUpperCase()} ${coin}`);
      }
    } catch (error) {
      console.error(`Error procesando regla para ${chatId}:`, error.message);
    }
  }
}

function handleStartCommand(msg) {
  const chatId = msg.chat.id;
  if (!isAuthorized(chatId)) {
    return sendMessage(chatId, "⛔ Acceso denegado. Solo usuarios autorizados pueden usar este bot.");
  }

  sendMessage(
    chatId,
    "¡Hola! Soy el bot global de alertas QvaPay.\n\nPara autenticarte en QvaPay ejecuta:\n /login\n\nMonitoreo automático:\n /Modo Automático ON\n /Modo Automático OFF\n\nConfigura alertas con comandos tipo:\n /Ofertas_sell_CUP 1 500 0.95 desc\n /Ofertas_buy_USDT 1 300 0.92 asc\n /Ofertas_sell_ZELLE 1 250 1.05 desc\n\nEstado:\n /estado\n /alive\n /logout",
    {
      reply_markup: {
        keyboard: [
          [{ text: "Modo Automático ON" }, { text: "Modo Automático OFF" }],
          [{ text: "Enviar Manualmente parámetros" }, { text: "Reset parámetros" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function handleLoginCommand(msg) {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    return sendMessage(chatId, "⛔ Acceso denegado. Solo usuarios autorizados pueden usar este bot.");
  }

  if (sessionData.has(chatId)) {
    return sendMessage(chatId, "Ya tienes una sesión iniciada.");
  }

  try {
    const data = await authService.login(username, password);
    const accessToken = data.accessToken || data.token || data.access_token;
    const balance = data.me?.balance || data.user?.balance || data.balance || "desconocido";

    sessionData.set(chatId, { ...data, accessToken });

    const config = getConfig(chatId);
    config.supportedCoins = await offerService.getSupportedCoins(sessionData.get(chatId));
    maybeStartGlobalMonitor();

    sendMessage(
      chatId,
      `Iniciado sesión correctamente.\nSaldo en QvaPay: ${balance}\n\nEl monitoreo automático quedó activo para tus alertas configuradas.`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error(error);
    sendMessage(chatId, "Hubo un error al establecer usuario y contraseña.");
  }
}

async function handleLogoutCommand(msg) {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    return sendMessage(chatId, "⛔ Acceso denegado. Solo usuarios autorizados pueden usar este bot.");
  }

  try {
    if (sessionData.has(chatId)) {
      const session = sessionData.get(chatId);
      if (session.accessToken) {
        await authService.logout(session.accessToken);
      }
      sessionData.delete(chatId);
      clearInterval(intervals.get(chatId));
      intervals.delete(chatId);
      previousOffers.delete(chatId);
      sendMessage(chatId, "Sesión cerrada correctamente.");
      return;
    }

    sendMessage(chatId, "No tienes ninguna sesión iniciada.");
  } catch (error) {
    console.error(error);
    sendMessage(chatId, "Hubo un error al cerrar sesión.");
  }
}

function handleAliveCommand(msg) {
  const chatId = msg.chat.id;
  if (!isAuthorized(chatId)) {
    return sendMessage(chatId, "⛔ Acceso denegado. Solo usuarios autorizados pueden usar este bot.");
  }

  sendMessage(
    chatId,
    sessionData.has(chatId)
      ? "El servidor está activo y el monitoreo global está listo para trabajar en segundo plano."
      : "Sesión QvaPay no activa."
  );
}

function handleStatusCommand(msg) {
  const chatId = msg.chat.id;
  if (!isAuthorized(chatId)) {
    return sendMessage(chatId, "⛔ Acceso denegado. Solo usuarios autorizados pueden usar este bot.");
  }

  const config = getConfig(chatId);
  if (!config.rules.length) {
    return sendMessage(chatId, "⚠️ No tienes reglas de alerta configuradas.");
  }

  let text = `📊 Estado del rastreador: ${config.active ? "🟢 ACTIVO" : "🔴 INACTIVO"}\n\n*Reglas configuradas:*\n`;
  config.rules.forEach((rule, index) => {
    text += `${index + 1}. ${rule.type.toUpperCase()} ${rule.coin} | Min $${rule.min} | Max $${rule.max} | Ratio ${rule.ratio} | Orden ${rule.orden}\n`;
  });

  sendMessage(chatId, text, { parse_mode: "Markdown" });
}

async function handleMarketOffersCommand(msg) {
  const chatId = msg.chat.id;
  if (!isAuthorized(chatId)) {
    return sendMessage(chatId, "⛔ Acceso denegado. Solo usuarios autorizados pueden usar este bot.");
  }

  const session = sessionData.get(chatId);
  if (!session) {
    return sendMessage(chatId, "Necesitas iniciar sesión antes de consultar ofertas.");
  }

  try {
    const coins = (await offerService.getSupportedCoins(session)).slice(0, 6);
    const response = await offerService.getOffers(session, "sell", "BANK_CUP", 1, 1000);
    const offers = (response.data || response.offers || []).slice(0, 5);

    if (!offers.length) {
      return sendMessage(chatId, "📭 No hay ofertas activas en el mercado P2P en este momento.");
    }

    await sendMessage(
      chatId,
      `📊 *Mercado P2P QvaPay* (${offers.length} ofertas mostradas)\nMonedas disponibles: ${coins.join(", ")}`,
      { parse_mode: "Markdown" }
    );

    for (const offer of offers) {
      await sendMessage(
        chatId,
        formatOfferMessage(
          normalizeOffer(offer, { type: offer.type || "sell", coin: offer.coin || "CUP" }),
          "Consulta manual"
        ),
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    console.error(error);
    sendMessage(chatId, "❌ Error al consultar la API de QvaPay.");
  }
}

function registerRule(chatId, rule) {
  const config = getConfig(chatId);
  config.rules = config.rules.filter((existing) => !(existing.type === rule.type && existing.coin === rule.coin));
  config.rules.push(rule);
}

async function handleRuleCommand(msg, match) {
  const chatId = msg.chat.id;
  if (!isAuthorized(chatId)) {
    return sendMessage(chatId, "⛔ Acceso denegado. Solo usuarios autorizados pueden usar este bot.");
  }

  const type = getEffectiveRuleType(match[1]);
  const coin = String(match[2]).toUpperCase();
  const min = Number(match[3]);
  const max = Number(match[4]);
  const ratio = Number(match[5]);
  const orden = String(match[6]).toLowerCase();

  const config = getConfig(chatId);
  const allowedCoins = config.supportedCoins.length ? config.supportedCoins : defaultSupportedCoins;

  if (!allowedCoins.includes(coin)) {
    return sendMessage(
      chatId,
      `⚠️ La moneda *${coin}* no es válida en QvaPay.\nMonedas disponibles: ${allowedCoins.join(", ")}`,
      { parse_mode: "Markdown" }
    );
  }

  const rule = { type, coin, min, max, ratio, orden };
  registerRule(chatId, rule);

  const reply = `✅ *Regla de alarma guardada*\n\n• Tipo: ${type.toUpperCase()}\n• Moneda: ${coin}\n• Rango: $${min} - $${max} USD\n• Ratio límite: ${ratio}\n• Orden: ${orden.toUpperCase()}\n\nEjecuta /Modo Automático ON para activar la vigilancia continua.`;

  sendMessage(chatId, reply, { parse_mode: "Markdown" });
}

function toggleAutomaticMode(chatId, enabled) {
  const config = getConfig(chatId);
  config.active = enabled;

  if (enabled) {
    maybeStartGlobalMonitor();
    return sendMessage(chatId, `🟢 Modo automático activado. Revisaré ofertas cada ${Math.round(autoScanSeconds / 60)} minuto(s).`);
  }

  return sendMessage(chatId, "🔴 Modo automático desactivado.");
}

function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  if (text === "Reset parámetros" || text === "/reset_params") {
    const config = getConfig(chatId);
    config.rules = [];
    config.active = false;
    sendMessage(chatId, "Parámetros reseteados. Ahora puedes introducirlos nuevamente.");
    return;
  }

  if (text === "Enviar Manualmente parámetros" || text === "/send_params") {
    const session = sessionData.get(chatId);
    const config = getConfig(chatId);
    if (!config.active && session && config.rules.length) {
      processRuleSet(chatId, session, config.rules, true);
      sendMessage(chatId, "Parámetros enviados manualmente.");
      return;
    }

    sendMessage(chatId, "Modo Automático está activo o no hay reglas configuradas.");
    return;
  }

  if (text === "Modo Automático ON" || text === "/automatic") {
    if (!sessionData.has(chatId)) {
      sendMessage(chatId, "Necesitas iniciar sesión antes de activar el proceso automático.");
      return;
    }
    toggleAutomaticMode(chatId, true);
    return;
  }

  if (text === "Modo Automático OFF" || text === "/automatic_off") {
    toggleAutomaticMode(chatId, false);
    return;
  }
}

function handleHolaCommand(msg) {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    return sendMessage(chatId, "⛔ Acceso denegado. Solo usuarios autorizados pueden usar este bot.");
  }

  sendMessage(
    chatId,
    "Muy buenas 👋 El servicio de bot está configurado y corriendo, cortesía de Michel.dev — un crack en el negocio."
  );
}

bot.onText(/\/start/, handleStartCommand);
bot.onText(/\/alive/, handleAliveCommand);
bot.onText(/\/login/, handleLoginCommand);
bot.onText(/\/logout/, handleLogoutCommand);
bot.onText(/\/estado/, handleStatusCommand);
bot.onText(/\/ofertas/i, handleMarketOffersCommand);
bot.onText(/\/Ofertas_(sell|buy)_([A-Za-z0-9]+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(asc|desc)/i, handleRuleCommand);
bot.onText(/\/Modo Automático (ON|OFF)/i, (msg, match) => {
  const enabled = String(match[1]).toUpperCase() === "ON";
  toggleAutomaticMode(msg.chat.id, enabled);
});
bot.on("message", handleMessage);
bot.onText(/\/hola\b/i, handleHolaCommand);

module.exports = { bot, app, startExpressServer };
