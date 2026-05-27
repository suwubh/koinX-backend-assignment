const mongoose = require("mongoose");

const reconciliationRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running"
    },
    config: {
      timestampToleranceSeconds: Number,
      quantityTolerancePct: Number,
      conflictWindowSeconds: Number,
      conflictQuantityTolerancePct: Number
    },
    files: {
      user: String,
      exchange: String
    },
    counts: {
      matched: { type: Number, default: 0 },
      conflicting: { type: Number, default: 0 },
      unmatchedUser: { type: Number, default: 0 },
      unmatchedExchange: { type: Number, default: 0 },
      invalidRows: { type: Number, default: 0 }
    },
    reportCsvPath: String,
    error: String,
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReconciliationRun", reconciliationRunSchema);
