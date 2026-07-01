const mongoose = require('mongoose');

const streamStateSchema = new mongoose.Schema({
  currentVideoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Playlist',
    required: false
  },
  currentVideoStartTime: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('StreamState', streamStateSchema);
