const { connectMongo, closeMongo } = require("../src/db/mongo");
const app = require("../src/app");

async function main() {
  await connectMongo();

  const server = app.listen(0);
  const port = server.address().port;

  const response = await fetch(`http://localhost:${port}/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  const body = await response.json();
  console.log(JSON.stringify(body, null, 2));

  server.close();
  await closeMongo();
}

main().catch(async (error) => {
  console.error(error);
  await closeMongo();
  process.exit(1);
});
