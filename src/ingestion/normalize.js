const ASSET_ALIASES = {
  BITCOIN: "BTC",
  XBT: "BTC",
  ETHER: "ETH",
  ETHEREUM: "ETH",
  POLYGON: "MATIC",
  TETHER: "USDT"
};

const TYPE_ALIASES = {
  DEPOSIT: "TRANSFER_IN",
  WITHDRAWAL: "TRANSFER_OUT"
};

function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeAsset(value) {
  const upper = cleanText(value).toUpperCase();
  return ASSET_ALIASES[upper] || upper;
}

function normalizeType(value) {
  const upper = cleanText(value).toUpperCase();
  return TYPE_ALIASES[upper] || upper;
}

function parseOptionalNumber(value) {
  const raw = cleanText(value);
  if (raw === "") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function areTypesCompatible(userType, exchangeType) {
  if (userType === exchangeType) return true;

  // The assignment calls out this perspective flip. Keeping it explicit avoids
  // treating every transfer direction as interchangeable by accident.
  return userType === "TRANSFER_OUT" && exchangeType === "TRANSFER_IN";
}

module.exports = {
  cleanText,
  normalizeAsset,
  normalizeType,
  parseOptionalNumber,
  areTypesCompatible
};
