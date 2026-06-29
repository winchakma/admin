const mongoose = require('mongoose');

const OverlaySchema = new mongoose.Schema({
  ticker1Title: {
    type: String,
    default: 'Title Card'
  },
  ticker1Text: {
    type: String,
    default: 'Headline News 1'
  },
  ticker1Active: {
    type: Boolean,
    default: false
  },
  ticker2Title: {
    type: String,
    default: 'Title Card'
  },
  ticker2Text: {
    type: String,
    default: 'Headline News 2'
  },
  ticker2Active: {
    type: Boolean,
    default: false
  },
  otsImagePath: {
    type: String,
    default: ''
  },
  otsActive: {
    type: Boolean,
    default: false
  },
  showTime: {
    type: Boolean,
    default: true
  },
  showDate: {
    type: Boolean,
    default: true
  },
  isBroadcastActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Overlay', OverlaySchema);
