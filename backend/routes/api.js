const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const Playlist = require('../models/Playlist');
const Overlay = require('../models/Overlay');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Helper to get video duration using ffprobe
const getVideoDuration = (filePath) => {
  return new Promise((resolve) => {
    const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
    exec(command, (err, stdout) => {
      if (err) {
        console.warn('ffprobe not found or failed, falling back to 30s default');
        return resolve(30); // Default fallback duration
      }
      const duration = parseFloat(stdout.trim());
      resolve(isNaN(duration) ? 30 : duration);
    });
  });
};

/* --- Playlist Routes --- */

// Get all playlist items sorted by orderIndex
router.get('/playlist', async (req, res) => {
  try {
    const playlist = await Playlist.find().sort('orderIndex');
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add external stream URL to playlist
router.post('/playlist', async (req, res) => {
  try {
    const { title, videoUrl, duration } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required' });
    }

    // Get highest orderIndex to place this at the end
    const lastItem = await Playlist.findOne().sort('-orderIndex');
    const orderIndex = lastItem ? lastItem.orderIndex + 1 : 0;

    const newItem = new Playlist({
      title: title || 'External Live Stream',
      filePath: videoUrl, // Save URL in the path field
      duration: duration || 3600, // Default to 1 hour
      orderIndex,
      status: 'active'
    });

    await newItem.save();
    
    // Notify clients
    const updatedPlaylist = await Playlist.find().sort('orderIndex');
    if (req.app.get('io')) {
      req.app.get('io').emit('playlist_updated', updatedPlaylist);
    }

    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload and add video to playlist
router.post('/playlist/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    const filePath = path.join('uploads', req.file.filename);
    const fullPath = path.join(__dirname, '..', filePath);
    const duration = await getVideoDuration(fullPath);

    // Get highest orderIndex to place this at the end
    const lastItem = await Playlist.findOne().sort('-orderIndex');
    const orderIndex = lastItem ? lastItem.orderIndex + 1 : 0;

    const newItem = new Playlist({
      title: req.body.title || req.file.originalname,
      filePath,
      duration,
      orderIndex,
      status: 'active'
    });

    await newItem.save();
    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder playlist items
router.put('/playlist/reorder', async (req, res) => {
  try {
    const { ids } = req.body; // Array of item IDs in the new order
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids must be an array' });
    }

    const bulkOps = ids.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { orderIndex: index } }
      }
    }));

    await Playlist.bulkWrite(bulkOps);
    const updatedPlaylist = await Playlist.find().sort('orderIndex');
    
    // Notify clients about playlist changes via WebSocket if io is attached
    if (req.app.get('io')) {
      req.app.get('io').emit('playlist_updated', updatedPlaylist);
    }

    res.json(updatedPlaylist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete playlist item
router.delete('/playlist/:id', async (req, res) => {
  try {
    const item = await Playlist.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Delete physical file
    const fullPath = path.join(__dirname, '..', item.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await Playlist.findByIdAndDelete(req.params.id);
    
    // Notify clients
    const updatedPlaylist = await Playlist.find().sort('orderIndex');
    if (req.app.get('io')) {
      req.app.get('io').emit('playlist_updated', updatedPlaylist);
    }

    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* --- Overlay Routes --- */

// Get current overlay configurations
router.get('/overlays', async (req, res) => {
  try {
    let config = await Overlay.findOne();
    if (!config) {
      config = new Overlay();
      await config.save();
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update overlay configuration
router.post('/overlays', async (req, res) => {
  try {
    let config = await Overlay.findOne();
    if (!config) {
      config = new Overlay(req.body);
    } else {
      Object.assign(config, req.body);
    }
    await config.save();

    // Notify clients about overlay configuration change
    if (req.app.get('io')) {
      req.app.get('io').emit('overlays_updated', config);
    }

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload OTS Graphic Image
router.post('/overlays/upload-ots', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const filePath = path.join('uploads', req.file.filename);
    let config = await Overlay.findOne();
    if (!config) {
      config = new Overlay({ otsImagePath: filePath, otsActive: true });
    } else {
      config.otsImagePath = filePath;
      config.otsActive = true;
    }
    await config.save();

    if (req.app.get('io')) {
      req.app.get('io').emit('overlays_updated', config);
    }

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
