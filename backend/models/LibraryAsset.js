const mongoose = require('mongoose');

const LibraryAssetSchema = new mongoose.Schema({
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
  },
  category: {
    type: String,
    enum: ['News', 'Music', 'Movie'],
    default: 'News'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LibraryAsset', LibraryAssetSchema);
