const mongoose = require("mongoose");
const config = require("../config");

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri);
}

async function closeMongo() {
  await mongoose.connection.close();
}

module.exports = {
  connectMongo,
  closeMongo
};
