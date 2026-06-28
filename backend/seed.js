require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iptv_broadcast'; // Make sure this matches config/db.js

const seedSuperAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected for seeding...');

    const superAdminEmail = 'admin@example.com'; // Change this to whatever the user wants
    const superAdminPassword = 'password123'; // Change this to a secure password

    const existingUser = await User.findOne({ email: superAdminEmail });
    if (existingUser) {
      console.log('Super Admin already exists.');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(superAdminPassword, salt);

    await User.create({
      email: superAdminEmail,
      password: hashedPassword,
      role: 'superadmin'
    });

    console.log(`Super Admin created! Email: ${superAdminEmail}, Password: ${superAdminPassword}`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
};

seedSuperAdmin();
