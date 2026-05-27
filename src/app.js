const express = require("express");
const { connectMongo } = require("./db/mongo");
const config = require("./config");
const reconcileRoutes = require("./routes/reconcileRoutes");

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use(async (req, res, next) => {
  try {
    await connectMongo();
    next();
  } catch (error) {
    next(error);
  }
});

app.use(reconcileRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "route not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "internal server error" });
});

async function start() {
  await connectMongo();
  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = app;
