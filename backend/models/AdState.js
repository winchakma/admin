const mongoose = require('mongoose');

const AdStateSchema = new mongoose.Schema({
  activeAd: {
    title: String,
    filePath: String,
    duration: Number,
    startedAt: Date
  },
  totalAdTimeOffset: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdState', AdStateSchema);
