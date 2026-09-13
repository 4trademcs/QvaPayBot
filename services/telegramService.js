const moment = require("moment");

function formatDate(fechaISO) {
  return moment(fechaISO).utcOffset(-4).format("DD/MM/YYYY HH:mm:ss");
}

function formatOfferMessage(offer, ordenadoPor) {
  const typeLabel = offer.type === "sell" ? "🔴 VENTA" : "🟢 COMPRA";
  const ownerName = offer.owner?.username || offer.owner?.name || "Anónimo";
  const rating = offer.owner?.rating || offer.owner?.average_rating || 0;
  const amount = Number(offer.amount || 0);
  const receive = Number(offer.receive || 0);
  const ratio = Number(offer.Ratio || (amount && receive ? receive / amount : 0));
  const url = offer.url || `https://qvapay.com/p2p/${offer.uuid || offer.id || ""}`;

  return `
${typeLabel} *Oferta P2P en QvaPay*

👤 *Usuario:* ${ownerName} (${rating}★)
💵 *Monto:* $${amount} USD
💳 *Recibe/Paga:* ${receive} ${offer.coin || "USD"}
📊 *Ratio:* ${ratio.toFixed(2)}
⏱ *Fecha:* ${formatDate(offer.ultimaFecha || offer.updated_at || new Date().toISOString())}

🔗 [Abrir oferta en QvaPay](${url})
${ordenadoPor ? `\n📌 *Orden:* ${ordenadoPor}` : ""}
`;
}

module.exports = {
  formatDate,
  formatOfferMessage,
};
