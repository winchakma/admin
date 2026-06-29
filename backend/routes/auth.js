const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const InvitedEmail = require('../models/InvitedEmail');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

// Helper function to sign JWT
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret_key_change_in_production', {
    expiresIn: '30d'
  });
};

// @route   POST /api/auth/register
// @desc    Register a user if they are invited
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Check if email exists in InvitedEmail
    const isInvited = await InvitedEmail.findOne({ email: email.toLowerCase() });
    
    // TEMPORARY: Allow first user to register without invite (Super Admin setup)
    const userCount = await User.countDocuments();
    if (!isInvited && userCount > 0) {
      return res.status(403).json({ success: false, message: 'This email is not authorized to register.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user (first user is superadmin)
    const user = await User.create({
      email,
      password: hashedPassword,
      role: userCount === 0 ? 'superadmin' : 'admin'
    });

    // Remove from invited list once registered
    if (isInvited) {
      await InvitedEmail.findByIdAndDelete(isInvited._id);
    }

    const token = signToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials or missing password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = signToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
router.get('/me', protect, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
router.post('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide both current and new password' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/auth/invite
// @desc    Invite a new admin email (Super Admin Only)
router.post('/invite', protect, authorize('superadmin'), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide an email to invite' });
    }

    const lowerEmail = email.toLowerCase().trim();

    // Check if user already exists
    const userExists = await User.findOne({ email: lowerEmail });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    // Check if already invited
    const inviteExists = await InvitedEmail.findOne({ email: lowerEmail });
    if (inviteExists) {
      return res.status(400).json({ success: false, message: 'Email is already invited' });
    }

    const newInvite = await InvitedEmail.create({
      email: lowerEmail,
      invitedBy: req.user.id
    });

    res.status(201).json({ success: true, data: newInvite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/auth/invites
// @desc    List all invited emails and current users (Super Admin Only)
router.get('/invites', protect, authorize('superadmin'), async (req, res) => {
  try {
    const invites = await InvitedEmail.find().populate('invitedBy', 'email').sort('-createdAt');
    const users = await User.find().select('-password').sort('-createdAt');

    res.status(200).json({
      success: true,
      data: {
        invites,
        users
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
