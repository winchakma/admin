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

AdItemSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdItem', AdItemSchema);
