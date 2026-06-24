const mongoose = require('mongoose');

const AdItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  filePath: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdItem', AdItemSchema);
