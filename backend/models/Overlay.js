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
  logoImagePath: {
    type: String,
    default: ''
  },
  logoActive: {
    type: Boolean,
    default: true
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
  },
  azaanFajrActive: {
    type: Boolean,
    default: false
  },
  azaanZohrActive: {
    type: Boolean,
    default: false
  },
  azaanAsrActive: {
    type: Boolean,
    default: false
  },
  azaanMaghribActive: {
    type: Boolean,
    default: false
  },
  azaanIshaActive: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Overlay', OverlaySchema);
