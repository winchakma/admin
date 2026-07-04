const express = require('express');
const router = express.Router();
const InvitedEmail = require('../models/InvitedEmail');
const { protect, authorize } = require('../middleware/auth');

// All admin routes are protected and require superadmin role
router.use(protect);
router.use(authorize('superadmin'));

// @route   GET /api/admin/invites
// @desc    Get all invited emails
router.get('/invites', async (req, res) => {
  try {
    const invites = await InvitedEmail.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: invites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/admin/invite
// @desc    Add an email to the invite list
router.post('/invite', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide an email' });
    }

    const existingInvite = await InvitedEmail.findOne({ email: email.toLowerCase() });
    if (existingInvite) {
      return res.status(400).json({ success: false, message: 'Email is already invited' });
    }

    const invite = await InvitedEmail.create({
      email,
      invitedBy: req.user._id
    });

    res.status(201).json({ success: true, data: invite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   DELETE /api/admin/invite/:id
// @desc    Remove an invited email
router.delete('/invite/:id', async (req, res) => {
  try {
    const invite = await InvitedEmail.findById(req.params.id);
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invite not found' });
    }

    await invite.deleteOne();
    res.status(200).json({ success: true, data: {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

router.get('/azaan/status', (req, res) => res.json({ enabled: false }));
router.post('/azaan/toggle', (req, res) => res.json({ enabled: false }));
module.exports = router;
