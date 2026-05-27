const fs = require("fs/promises");
const path = require("path");
const config = require("./config");

async function logDataIssue(runId, message, meta = {}) {
  const dir = config.logDir;
  await fs.mkdir(dir, { recursive: true });

  const line = JSON.stringify({
    at: new Date().toISOString(),
    runId,
    message,
    ...meta
  });

  await fs.appendFile(path.join(dir, "data-quality.log"), `${line}\n`);
}

module.exports = {
  logDataIssue
};
