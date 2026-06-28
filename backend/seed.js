require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iptv_broadcast'; // Make sure this matches config/db.js

const seedSuperAdmin = async () => {
  try {
    const superAdminEmail = 'winchakma123@gmail.com';
    const superAdminPassword = 'password123';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(superAdminPassword, salt);

    const existingUser = await User.findOne({ email: superAdminEmail });
    
    if (existingUser) {
      if (!existingUser.password) {
        existingUser.password = hashedPassword;
        existingUser.role = 'superadmin';
        await existingUser.save();
        console.log('Super Admin updated with missing password.');
      } else {
        console.log('Super Admin already exists properly.');
      }
    } else {
      await User.create({
        email: superAdminEmail,
        password: hashedPassword,
        role: 'superadmin'
      });
      console.log(`Super Admin created! Email: ${superAdminEmail}`);
    }
  } catch (err) {
    console.error('Seeding error:', err);
  }
};

module.exports = seedSuperAdmin;
