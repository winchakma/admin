const mongoose = require('mongoose');

const OverlaySchema = new mongoose.Schema({
  ticker1Text: {
    type: String,
    default: 'Headline News 1'
  },
  ticker1Active: {
    type: Boolean,
    default: false
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
  showTimeDate: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Overlay', OverlaySchema);
