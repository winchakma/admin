const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  logoPath: {
    type: String, // Path to uploaded logo
    required: false
  },
  streamUrl: {
    type: String, // The .m3u8 URL
    required: true
  },
  category: {
    type: String,
    default: 'Live TV'
  },
  orderIndex: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Channel', channelSchema);
