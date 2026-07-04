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
  },
  azaanToggles: {
    Fajr: { type: Boolean, default: false },
    Zohr: { type: Boolean, default: false },
    Asr: { type: Boolean, default: false },
    Maghrib: { type: Boolean, default: false },
    Isha: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdState', AdStateSchema);
