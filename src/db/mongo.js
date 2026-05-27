const mongoose = require("mongoose");
const config = require("../config");

let connectionPromise;

async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  mongoose.set("strictQuery", true);
  connectionPromise = mongoose.connect(config.mongoUri);
  return connectionPromise;
}

async function closeMongo() {
  await mongoose.connection.close();
  connectionPromise = null;
}

module.exports = {
  connectMongo,
  closeMongo
};
