require("dotenv").config();

const path = require("path");

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const rootDir = path.resolve(__dirname, "..", "..");

module.exports = {
  port: readNumber("PORT", 3000),
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/koinx_reconciliation",
  dataDir: path.resolve(rootDir, process.env.DATA_DIR || "data"),
  reportDir: path.resolve(rootDir, process.env.REPORT_DIR || "reports"),
  defaultTolerance: {
    timestampSeconds: readNumber("TIMESTAMP_TOLERANCE_SECONDS", 300),
    quantityPct: readNumber("QUANTITY_TOLERANCE_PCT", 0.01)
  }
};
