const axios = require("axios");

function extractAccessToken(payload) {
  if (!payload) return null;

  const candidate = payload.data || payload;
  return (
    candidate.accessToken ||
    candidate.token ||
    candidate.access_token ||
    candidate.auth?.token ||
    candidate.data?.accessToken ||
    candidate.data?.token ||
    candidate.data?.access_token ||
    null
  );
}

function extractUserData(payload) {
  if (!payload) return {};
  const candidate = payload.data || payload;
  return candidate.user || candidate.me || candidate.data || candidate || {};
}

async function login(email, password) {
  const url = "https://qvapay.com/api/auth/login";
  const headers = { Accept: "application/json" };
  const body = { email, password };

  try {
    const response = await axios.post(url, body, { headers });
    const payload = response.data || {};
    const accessToken = extractAccessToken(payload);
    const user = extractUserData(payload);

    return {
      ...payload,
      accessToken,
      user,
      me: user,
    };
  } catch (error) {
    console.error("Error al realizar el login:", error.response?.data || error.message);
    throw error;
  }
}

async function logout(accessToken) {
  const url = "https://qvapay.com/api/auth/logout";
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    console.error("Error al realizar el logout:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = { login, logout };
