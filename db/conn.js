const mongoose = require("mongoose");
const dotenv = require('dotenv');
dotenv.config({path:'./config.env'});

const DB = process.env.DATABASE;

mongoose.set("strictQuery", false);

// Define connection options including maxPoolSize
const options = {
  maxPoolSize: 100 // Adjust the max pool size as needed
};

// Connect to MongoDB with the specified options
mongoose
  .connect(DB, options)
  .then(() => {
    console.log(`Connection successful....`);
  })
  .catch((err) => {
    console.log(`No connection: ${err.message}`);
  });
