const fs = require("fs");
const path = require("path");

const usersFilePath = path.resolve(__dirname, "..", "config", "users.json");

function parseEnvIds(rawValue) {
  if (!rawValue) return [];

  if (Array.isArray(rawValue)) {
    return rawValue.map(String).map((item) => Number(item.trim())).filter((value) => Number.isFinite(value));
  }

  const normalized = String(rawValue).trim();
  if (!normalized) return [];

  try {
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((item) => Number(item.trim())).filter((value) => Number.isFinite(value));
    }
  } catch (error) {
    // fallback to CSV
  }

  return normalized
    .split(",")
    .map((item) => item.trim().replace(/[\[\]\s]/g, ""))
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

function getAllowedUsers() {
  try {
    const envIds = parseEnvIds(process.env.ALLOWED_TELEGRAM_IDS || process.env.TELEGRAM_ALLOWED_IDS || process.env.ALLOWED_CHAT_IDS);

    if (!fs.existsSync(usersFilePath)) {
      fs.mkdirSync(path.dirname(usersFilePath), { recursive: true });
      const data = { allowed_users: envIds };
      fs.writeFileSync(usersFilePath, JSON.stringify(data, null, 2));
      return envIds;
    }

    const content = fs.readFileSync(usersFilePath, "utf8");
    const parsed = JSON.parse(content || "{}");
    const usersFromFile = (parsed.allowed_users || []).map(Number).filter((value) => Number.isFinite(value));
    const merged = [...new Set([...envIds, ...usersFromFile])];

    if (merged.length !== usersFromFile.length || envIds.length) {
      fs.writeFileSync(usersFilePath, JSON.stringify({ allowed_users: merged }, null, 2));
    }

    return merged;
  } catch (error) {
    console.error("Error leyendo users.json:", error.message);
    return [];
  }
}

function isAuthorized(chatId) {
  const allowed = getAllowedUsers();
  return allowed.includes(Number(chatId));
}

module.exports = {
  usersFilePath,
  getAllowedUsers,
  isAuthorized,
};
