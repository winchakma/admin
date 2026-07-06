const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const Playlist = require('../models/Playlist');
const AdItem = require('../models/AdItem');
const AdState = require('../models/AdState');
const StreamState = require('../models/StreamState');
const Channel = require('../models/Channel');
const Overlay = require('../models/Overlay');
const LibraryAsset = require('../models/LibraryAsset');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

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
    execFile('ffprobe', [
      '-v', 'error', 
      '-show_entries', 'format=duration', 
      '-of', 'default=noprint_wrappers=1:nokey=1', 
      filePath
    ], (err, stdout) => {
      if (err) {
        console.warn('ffprobe not found or failed, falling back to 30s default');
        return resolve(30); // Default fallback duration
      }
      const duration = parseFloat(stdout.trim());
      resolve(isNaN(duration) ? 30 : duration);
    });
  });
};


const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}.part`);
  }
});
const uploadChunks = multer({ storage: chunkStorage });

router.post('/upload/chunk', protect, uploadChunks.single('chunk'), async (req, res) => {
  try {
    const { originalname, chunkIndex, totalChunks, uploadId } = req.body;
    const chunkFile = req.file;

    if (!chunkFile) return res.status(400).json({ error: 'No chunk file provided' });
    
    // Prevent giant uploads (DDoS prevention)
    if (totalChunks > 1000) { // Limit to ~5GB total
        fs.unlinkSync(chunkFile.path);
        return res.status(400).json({ error: 'File too large' });
    }

    const finalUploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(finalUploadDir)) {
      fs.mkdirSync(finalUploadDir, { recursive: true });
    }

    const finalFilePath = path.join(finalUploadDir, `${uploadId}-${originalname}`);
    const chunkFilePath = path.join(finalUploadDir, `${uploadId}-${originalname}.part${chunkIndex}`);
    
    fs.renameSync(chunkFile.path, chunkFilePath);

    let allChunksUploaded = true;
    for (let i = 0; i < totalChunks; i++) {
       if (!fs.existsSync(path.join(finalUploadDir, `${uploadId}-${originalname}.part${i}`))) {
           allChunksUploaded = false;
           break;
       }
    }

    if (allChunksUploaded) {
      for (let i = 0; i < totalChunks; i++) {
        const partPath = path.join(finalUploadDir, `${uploadId}-${originalname}.part${i}`);
        const chunkData = fs.readFileSync(partPath);
        fs.appendFileSync(finalFilePath, chunkData);
        fs.unlinkSync(partPath);
      }
      
      const duration = await getVideoDuration(finalFilePath);
      const relativePath = path.join('uploads', `${uploadId}-${originalname}`).replace(/\\/g, '/');
      return res.json({ completed: true, filePath: relativePath, duration: duration });
    } else {
      return res.json({ completed: false, message: `Chunk ${chunkIndex} uploaded` });
    }
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: 'Chunk upload failed' });
  }
});
/* --- Channel Routes (Live TV) --- */

// Get all channels (PUBLIC ROUTE - used by Viewer Page)
router.get('/channels', async (req, res) => {
  try {
    const channels = await Channel.find().sort('orderIndex');
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new channel
router.post('/channels', protect, upload.single('logo'), async (req, res) => {
  try {
    const { name, streamUrl, category } = req.body;
    if (!name || !streamUrl) {
      return res.status(400).json({ error: 'Name and streamUrl are required' });
    }

    let logoPath = '';
    if (req.file) {
      logoPath = path.join('uploads', req.file.filename).replace(/\\/g, '/');
    }

    const lastItem = await Channel.findOne().sort('-orderIndex');
    const orderIndex = lastItem ? lastItem.orderIndex + 1 : 0;

    const newChannel = new Channel({
      name,
      streamUrl,
      logoPath,
      category: category || 'Live TV',
      orderIndex
    });

    await newChannel.save();
    
    // Notify clients (if you want the viewer to auto-update)
    const updatedChannels = await Channel.find().sort('orderIndex');
    if (req.app.get('io')) {
      req.app.get('io').emit('channels_updated', updatedChannels);
    }

    res.status(201).json(newChannel);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder channels
router.put('/channels/reorder', protect, async (req, res) => {
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

    await Channel.bulkWrite(bulkOps);
    const updatedChannels = await Channel.find().sort('orderIndex');
    
    if (req.app.get('io')) {
      req.app.get('io').emit('channels_updated', updatedChannels);
    }

    res.json(updatedChannels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a channel
router.delete('/channels/:id', protect, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    if (channel.logoPath) {
      const fullPath = path.join(__dirname, '..', channel.logoPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await Channel.findByIdAndDelete(req.params.id);
    
    const updatedChannels = await Channel.find().sort('orderIndex');
    if (req.app.get('io')) {
      req.app.get('io').emit('channels_updated', updatedChannels);
    }

    res.json({ message: 'Channel deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* --- Library Routes --- */

// Get all library assets
router.get('/library', protect, async (req, res) => {
  try {
    const assets = await LibraryAsset.find().sort({ createdAt: -1 });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload and add video to library (not playlist)
router.post('/library/upload', protect, upload.none(), async (req, res) => {
  try {
    const { title, category, filePath, duration } = req.body;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    const newAsset = new LibraryAsset({
      title: title || 'Untitled',
      filePath,
      duration: duration || 30,
      category: category || 'News'
    });

    await newAsset.save();
    res.status(201).json(newAsset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a library asset
router.delete('/library/:id', protect, authorize('superadmin'), async (req, res) => {
  try {
    const item = await LibraryAsset.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Library asset not found' });
    }

    // Delete physical file
    const fullPath = path.join(__dirname, '..', item.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await LibraryAsset.findByIdAndDelete(req.params.id);
    res.json({ message: 'Asset deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Update a library asset
router.put('/library/:id', protect, authorize('superadmin'), async (req, res) => {
  try {
    const { title, category } = req.body;
    const asset = await LibraryAsset.findByIdAndUpdate(req.params.id, { title, category }, { new: true });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* --- Playlist Routes --- */

// Get all playlist items sorted by orderIndex
router.get('/playlist', protect, async (req, res) => {
  try {
    const playlist = await Playlist.find().sort('orderIndex');
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add external stream URL to playlist
router.post('/playlist', protect, async (req, res) => {
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
      category: req.body.category || 'News',
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
router.post('/playlist/upload', protect, authorize('superadmin'), upload.none(), async (req, res) => {
  try {
    const { title, category, filePath, duration } = req.body;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    // Get highest orderIndex to place this at the end
    const lastItem = await Playlist.findOne().sort('-orderIndex');
    const orderIndex = lastItem ? lastItem.orderIndex + 1 : 0;

    const newItem = new Playlist({
      title: title || 'Untitled',
      filePath,
      duration: duration || 30,
      category: category || 'News',
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

// Add video to playlist FROM Library
router.post('/playlist/add-from-library', protect, authorize('superadmin'), async (req, res) => {
  try {
    const { libraryId } = req.body;
    if (!libraryId) {
      return res.status(400).json({ error: 'libraryId is required' });
    }

    const libraryAsset = await LibraryAsset.findById(libraryId);
    if (!libraryAsset) {
      return res.status(404).json({ error: 'Library asset not found' });
    }

    const lastItem = await Playlist.findOne().sort('-orderIndex');
    const orderIndex = lastItem ? lastItem.orderIndex + 1 : 0;

    const newItem = new Playlist({
      title: libraryAsset.title,
      filePath: libraryAsset.filePath,
      duration: libraryAsset.duration,
      category: libraryAsset.category,
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

// Reorder playlist items
router.put('/playlist/reorder', protect, authorize('superadmin'), async (req, res) => {
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
router.delete('/playlist/:id', protect, authorize('superadmin'), async (req, res) => {
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
router.get('/overlays', protect, async (req, res) => {
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
router.post('/overlays', protect, async (req, res) => {
  try {
    let config = await Overlay.findOne();
    if (!config) {
      config = new Overlay(req.body);
    } else {
      config.set(req.body);
    }
    await config.save();

    // Write text values to files for FFmpeg CG Engine
    const streamDataDir = path.join(__dirname, '..', 'stream_data');
    if (!fs.existsSync(streamDataDir)) {
      fs.mkdirSync(streamDataDir, { recursive: true });
    }
    fs.writeFileSync(path.join(streamDataDir, 'ticker1.txt'), config.ticker1Active ? config.ticker1Text || '' : '', 'utf8');
    fs.writeFileSync(path.join(streamDataDir, 'ticker2.txt'), config.ticker2Active ? config.ticker2Text || '' : '', 'utf8');


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
router.post('/overlays/upload-ots', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const filePath = path.join('uploads', req.file.filename).replace(/\\/g, '/');
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

// Upload Stream Logo Image
router.post('/overlays/upload-logo', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const filePath = path.join('uploads', req.file.filename).replace(/\\/g, '/');
    let config = await Overlay.findOne();
    if (!config) {
      config = new Overlay({ logoImagePath: filePath, logoActive: true });
    } else {
      config.logoImagePath = filePath;
      config.logoActive = true;
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

/* --- Ad Playlist & Playout Routes --- */

// Get all ad items
router.get('/ads', protect, async (req, res) => {
  try {
    const ads = await AdItem.find().sort({ createdAt: -1 });
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload and auto-play ad
router.post('/ads/upload', protect, upload.none(), async (req, res) => {
  try {
    const { title, filePath, duration } = req.body;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    const newAd = new AdItem({
      title: title || 'Untitled Ad',
      filePath,
      duration: duration || 30
    });

    await newAd.save();
    
    const updatedAds = await AdItem.find().sort({ createdAt: -1 });
    if (req.app.get('io')) {
      req.app.get('io').emit('ads_updated', updatedAds);
    }

    res.status(201).json(newAd);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Play an existing ad immediately
router.post('/ads/:id/play', protect, async (req, res) => {
  try {
    const ad = await AdItem.findById(req.params.id);
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    let adState = await AdState.findOne();
    if (!adState) {
      adState = new AdState({ totalAdTimeOffset: 0 });
    }

     // If there's already an active ad, transition it
    if (adState.activeAd && adState.activeAd.startedAt) {
      let elapsed = (Date.now() - new Date(adState.activeAd.startedAt).getTime()) / 1000;
      if (isNaN(elapsed) || elapsed < 0) elapsed = 0;
      const currentOffset = typeof adState.totalAdTimeOffset === 'number' && !isNaN(adState.totalAdTimeOffset) ? adState.totalAdTimeOffset : 0;
      const adDuration = typeof adState.activeAd.duration === 'number' && !isNaN(adState.activeAd.duration) ? adState.activeAd.duration : 0;
      
      let actualElapsed = elapsed < adDuration ? elapsed : adDuration;
      adState.totalAdTimeOffset = currentOffset + actualElapsed;

      // Shift StreamState
      const streamState = await StreamState.findOne();
      if (streamState && streamState.currentVideoStartTime) {
        streamState.currentVideoStartTime = new Date(new Date(streamState.currentVideoStartTime).getTime() + (actualElapsed * 1000));
        await streamState.save();
      }
    }

    adState.activeAd = {
      title: ad.title,
      filePath: ad.filePath,
      duration: ad.duration,
      startedAt: new Date()
    };

    await adState.save();
    res.json({ message: 'Ad playback started', activeAd: adState.activeAd });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop current ad
router.post('/ads/stop', protect, async (req, res) => {
  try {
    let adState = await AdState.findOne();
    if (adState && adState.activeAd && adState.activeAd.startedAt) {
      let elapsed = (Date.now() - new Date(adState.activeAd.startedAt).getTime()) / 1000;
      if (isNaN(elapsed) || elapsed < 0) elapsed = 0;
      const currentOffset = typeof adState.totalAdTimeOffset === 'number' && !isNaN(adState.totalAdTimeOffset) ? adState.totalAdTimeOffset : 0;
      const adDuration = typeof adState.activeAd.duration === 'number' && !isNaN(adState.activeAd.duration) ? adState.activeAd.duration : 0;
      
      let actualElapsed = elapsed < adDuration ? elapsed : adDuration;
      adState.totalAdTimeOffset = currentOffset + actualElapsed;
      adState.activeAd = null;
      await adState.save();

      // Shift StreamState forward by ad duration
      // Live TV Style: We NO LONGER shift the clock. The movie plays naturally behind the Ad!
    }
    res.json({ message: 'Ad stopped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an ad item
router.delete('/ads/:id', protect, async (req, res) => {
  try {
    const ad = await AdItem.findById(req.params.id);
    if (!ad) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    const fullPath = path.join(__dirname, '..', ad.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await AdItem.findByIdAndDelete(req.params.id);

    // Notify clients
    const updatedAds = await AdItem.find().sort({ createdAt: -1 });
    if (req.app.get('io')) {
      req.app.get('io').emit('ads_updated', updatedAds);
    }

    res.json({ message: 'Ad deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Dummy settings endpoint
router.get('/settings', (req, res) => res.json({}));
