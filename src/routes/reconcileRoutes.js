const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const config = require("../config");
const { importTransactions } = require("../ingestion/importTransactions");
const { reconcileTransactions } = require("../matching/reconcile");
const { buildReportCsv, reportEntriesAsCsv } = require("../reports/csvReport");
const ReconciliationRun = require("../models/ReconciliationRun");
const ReportEntry = require("../models/ReportEntry");
const Transaction = require("../models/Transaction");

const router = express.Router();

function resolveDataFile(fileName, fallback) {
  const selected = fileName || fallback;
  const resolved = path.resolve(config.dataDir, selected);
  const relative = path.relative(config.dataDir, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("CSV file must be inside DATA_DIR");
  }

  return resolved;
}

function getTolerance(body = {}) {
  return {
    timestampToleranceSeconds: Number(
      body.timestampToleranceSeconds ?? config.defaultTolerance.timestampSeconds
    ),
    quantityTolerancePct: Number(body.quantityTolerancePct ?? config.defaultTolerance.quantityPct),
    conflictWindowSeconds: Number(
      body.conflictWindowSeconds ?? config.defaultTolerance.conflictWindowSeconds
    ),
    conflictQuantityTolerancePct: Number(
      body.conflictQuantityTolerancePct ?? config.defaultTolerance.conflictQuantityPct
    )
  };
}

function reportCsvUrl(runId) {
  return `/report/${runId}?format=csv`;
}

router.post("/reconcile", async (req, res, next) => {
  const runId = randomUUID();
  const tolerance = getTolerance(req.body);

  if (
    !Number.isFinite(tolerance.timestampToleranceSeconds) ||
    !Number.isFinite(tolerance.quantityTolerancePct) ||
    !Number.isFinite(tolerance.conflictWindowSeconds) ||
    !Number.isFinite(tolerance.conflictQuantityTolerancePct) ||
    tolerance.timestampToleranceSeconds < 0 ||
    tolerance.quantityTolerancePct < 0 ||
    tolerance.conflictWindowSeconds < tolerance.timestampToleranceSeconds ||
    tolerance.conflictQuantityTolerancePct < tolerance.quantityTolerancePct
  ) {
    return res.status(400).json({
      error:
        "tolerance values must be valid numbers; conflict tolerances cannot be smaller than match tolerances"
    });
  }

  let run;

  try {
    const userFile = resolveDataFile(req.body?.userFile, "user_transactions.csv");
    const exchangeFile = resolveDataFile(req.body?.exchangeFile, "exchange_transactions.csv");

    await Promise.all([fs.access(userFile), fs.access(exchangeFile)]);

    run = await ReconciliationRun.create({
      runId,
      config: tolerance,
      files: {
        user: path.basename(userFile),
        exchange: path.basename(exchangeFile)
      }
    });

    const [userImport, exchangeImport] = await Promise.all([
      importTransactions({ runId, source: "user", filePath: userFile }),
      importTransactions({ runId, source: "exchange", filePath: exchangeFile })
    ]);

    const counts = await reconcileTransactions(runId, tolerance);
    counts.invalidRows = userImport.invalidRows + exchangeImport.invalidRows;

    const reportCsvPath = await buildReportCsv(runId);

    run.status = "completed";
    run.counts = counts;
    run.reportCsvPath = reportCsvPath;
    run.finishedAt = new Date();
    await run.save();

    res.status(201).json({
      runId,
      status: run.status,
      counts,
      reportCsvUrl: reportCsvUrl(runId),
      imported: {
        user: userImport,
        exchange: exchangeImport
      }
    });
  } catch (error) {
    if (run) {
      run.status = "failed";
      run.error = error.message;
      run.finishedAt = new Date();
      await run.save();
    }

    next(error);
  }
});

router.get("/report/:runId", async (req, res, next) => {
  try {
    const run = await ReconciliationRun.findOne({ runId: req.params.runId }).lean();
    if (!run) return res.status(404).json({ error: "run not found" });

    const entries = await ReportEntry.find({ runId: req.params.runId })
      .sort({ createdAt: 1 })
      .lean();

    if (req.query.format === "csv") {
      const csv = await reportEntriesAsCsv(entries);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.runId}.csv"`);
      return res.send(csv);
    }

    res.json({ run, entries });
  } catch (error) {
    next(error);
  }
});

router.get("/report/:runId/summary", async (req, res, next) => {
  try {
    const run = await ReconciliationRun.findOne({ runId: req.params.runId }).lean();
    if (!run) return res.status(404).json({ error: "run not found" });

    res.json({
      runId: run.runId,
      status: run.status,
      counts: run.counts,
      config: run.config,
      files: run.files
    });
  } catch (error) {
    next(error);
  }
});

router.get("/report/:runId/unmatched", async (req, res, next) => {
  try {
    const run = await ReconciliationRun.findOne({ runId: req.params.runId }).lean();
    if (!run) return res.status(404).json({ error: "run not found" });

    const entries = await ReportEntry.find({
      runId: req.params.runId,
      category: { $in: ["UNMATCHED_USER", "UNMATCHED_EXCHANGE"] }
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ runId: run.runId, entries });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
