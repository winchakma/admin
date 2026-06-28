require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const MONGO_URI = 'mongodb+srv://admin:spml@cluster0.htlsc44.mongodb.net/iptv_broadcast?retryWrites=true&w=majority'; // Guessing the URI format from the error log, or I should just require config/db

const checkUser = async () => {
  try {
    const db = require('./config/db');
    await db(); // Connect to db
    const users = await User.find({});
    console.log("All users:", users);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
checkUser();
