const fs = require("fs/promises");
const path = require("path");
const { stringify } = require("csv-stringify/sync");
const ReportEntry = require("../models/ReportEntry");
const config = require("../config");

function prefixRow(prefix, row = {}) {
  return {
    [`${prefix}_transaction_id`]: row.transaction_id || "",
    [`${prefix}_timestamp`]: row.timestamp || "",
    [`${prefix}_type`]: row.type || "",
    [`${prefix}_asset`]: row.asset || "",
    [`${prefix}_quantity`]: row.quantity || "",
    [`${prefix}_price_usd`]: row.price_usd || "",
    [`${prefix}_fee`]: row.fee || "",
    [`${prefix}_note`]: row.note || ""
  };
}

function toCsvRows(entries) {
  return entries.map((entry) => ({
    category: entry.category,
    reason: entry.reason,
    timestamp_delta_seconds: entry.deltas?.timestampSeconds ?? "",
    quantity_delta_pct: entry.deltas?.quantityPct ?? "",
    ...prefixRow("user", entry.userRow),
    ...prefixRow("exchange", entry.exchangeRow)
  }));
}

async function buildReportCsv(runId) {
  const entries = await ReportEntry.find({ runId }).sort({ createdAt: 1 }).lean();
  const csv = stringify(toCsvRows(entries), { header: true });

  await fs.mkdir(config.reportDir, { recursive: true });
  const filePath = path.join(config.reportDir, `${runId}.csv`);
  await fs.writeFile(filePath, csv, "utf8");

  return filePath;
}

async function reportEntriesAsCsv(entries) {
  return stringify(toCsvRows(entries), { header: true });
}

module.exports = {
  buildReportCsv,
  reportEntriesAsCsv
};
