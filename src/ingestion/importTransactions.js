const path = require("path");
const Transaction = require("../models/Transaction");
const { readCsv } = require("./csvReader");
const {
  cleanText,
  normalizeAsset,
  normalizeType,
  parseOptionalNumber
} = require("./normalize");
const { logDataIssue } = require("../auditLog");

const REQUIRED_TYPES = new Set(["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT"]);

function parseTimestamp(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateRow(row, source, seenIds) {
  const issues = [];
  const transactionId = cleanText(row.transaction_id);
  const type = normalizeType(row.type);
  const asset = normalizeAsset(row.asset);
  const timestamp = parseTimestamp(row.timestamp);
  const quantity = parseOptionalNumber(row.quantity);
  const priceUsd = parseOptionalNumber(row.price_usd);
  const fee = parseOptionalNumber(row.fee);

  if (!transactionId) {
    issues.push("missing transaction_id");
  } else if (seenIds.has(transactionId)) {
    issues.push(`duplicate transaction_id in ${source} file`);
  }

  if (!timestamp) issues.push("invalid or missing timestamp");
  if (!type) issues.push("missing type");
  if (type && !REQUIRED_TYPES.has(type)) issues.push(`unsupported type: ${type}`);
  if (!asset) issues.push("missing asset");
  if (quantity === null) issues.push("invalid or missing quantity");
  if (quantity !== null && quantity <= 0) issues.push("quantity must be greater than zero");
  if (row.price_usd !== undefined && cleanText(row.price_usd) !== "" && priceUsd === null) {
    issues.push("invalid price_usd");
  }
  if (row.fee !== undefined && cleanText(row.fee) !== "" && fee === null) {
    issues.push("invalid fee");
  }

  if (transactionId) seenIds.add(transactionId);

  return {
    transactionId,
    valid: issues.length === 0,
    issues,
    normalized: {
      timestamp,
      type,
      asset,
      quantity,
      priceUsd,
      fee
    }
  };
}

async function importTransactions({ runId, source, filePath }) {
  const rows = await readCsv(filePath);
  const seenIds = new Set();
  const docs = [];

  rows.forEach((row, index) => {
    const checked = validateRow(row, source, seenIds);

    docs.push({
      runId,
      source,
      rowNumber: index + 2,
      transactionId: checked.transactionId,
      original: row,
      normalized: checked.normalized,
      valid: checked.valid,
      issues: checked.issues
    });
  });

  const inserted = docs.length ? await Transaction.insertMany(docs) : [];

  const badRows = docs.filter((doc) => !doc.valid);
  await Promise.all(
    badRows.map((doc) =>
      logDataIssue(runId, "invalid transaction row", {
        source,
        file: path.basename(filePath),
        rowNumber: doc.rowNumber,
        transactionId: doc.transactionId,
        issues: doc.issues
      })
    )
  );

  return {
    rowsRead: rows.length,
    rowsInserted: inserted.length,
    invalidRows: badRows.length
  };
}

module.exports = {
  importTransactions
};
