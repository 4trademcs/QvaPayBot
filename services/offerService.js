const axios = require("axios");

const BASE_URL = "https://qvapay.com";

function getAccessToken(session) {
  if (!session) return null;
  return (
    session.accessToken ||
    session.token ||
    session.access_token ||
    session.data?.accessToken ||
    session.data?.token ||
    session.data?.access_token ||
    null
  );
}

async function getOffers(session, type, coin, min, max) {
  const accessToken = getAccessToken(session);
  if (!accessToken) {
    throw new Error("No existe token de sesión válido para consultar ofertas.");
  }

  const url = `${BASE_URL}/api/p2p/index`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    const response = await axios.get(url, {
      headers,
      params: {
        type,
        coin,
        min,
        max,
      },
    });

    return response.data || {};
  } catch (error) {
    console.error("Error al obtener las ofertas:", error.response?.data || error.message);
    throw error;
  }
}

async function getSupportedCoins(session) {
  const accessToken = getAccessToken(session);
  if (!accessToken) {
    return ["CUP", "MLC", "USDT", "BTC", "ETH", "TRX", "BCH", "LTC", "ZELLE", "PAYPAL"];
  }

  const url = `${BASE_URL}/api/v1/coins`;

  try {
    const response = await axios.get(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = response.data || {};
    const list = payload.data || payload || [];
    return list
      .map((coin) => coin.coins || coin.tick || coin.name || coin.symbol)
      .filter(Boolean)
      .map((coin) => String(coin).toUpperCase());
  } catch (error) {
    console.warn("No se pudieron obtener monedas de QvaPay; usando lista por defecto.", error.message);
    return ["CUP", "MLC", "USDT", "BTC", "ETH", "TRX", "BCH", "LTC", "ZELLE", "PAYPAL"];
  }
}

module.exports = {
  getOffers,
  getSupportedCoins,
};
