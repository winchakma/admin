import re

with open('backend/routes/api.js', 'r', encoding='utf-8') as f:
    content = f.read()

chunk_upload_code = """
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

    const finalUploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(finalUploadDir)) {
      fs.mkdirSync(finalUploadDir, { recursive: true });
    }

    const finalFilePath = path.join(finalUploadDir, `${uploadId}-${originalname}`);
    
    const chunkData = fs.readFileSync(chunkFile.path);
    fs.appendFileSync(finalFilePath, chunkData);
    
    fs.unlinkSync(chunkFile.path);

    if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
      const duration = await getVideoDuration(finalFilePath);
      const relativePath = path.join('uploads', `${uploadId}-${originalname}`).replace(/\\\\/g, '/');
      return res.json({ completed: true, filePath: relativePath, duration: duration });
    } else {
      return res.json({ completed: false, message: `Chunk ${chunkIndex} uploaded` });
    }
  } catch (error) {
    console.error('Chunk upload error:', error);
    res.status(500).json({ error: 'Chunk upload failed' });
  }
});
"""

# Insert chunk upload code right before `/* --- Channel Routes (Live TV) --- */`
content = content.replace('/* --- Channel Routes (Live TV) --- */', chunk_upload_code + '\\n/* --- Channel Routes (Live TV) --- */')

# Replace /library/upload
content = re.sub(
    r"router\.post\('/library/upload', protect, upload\.single\('video'\), async \(req, res\) => \{.*?\n      await newAsset\.save\(\);\n      res\.status\(201\)\.json\(newAsset\);\n    \} catch \(err\) \{\n      res\.status\(500\)\.json\(\{ error: err\.message \}\);\n    \}\n  \}\);",
    """router.post('/library/upload', protect, async (req, res) => {
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
  });""",
    content,
    flags=re.DOTALL
)

# Replace /playlist/upload
content = re.sub(
    r"router\.post\('/playlist/upload', protect, upload\.single\('video'\), async \(req, res\) => \{.*?\n    res\.status\(201\)\.json\(newPlaylistItem\);\n  \} catch \(err\) \{\n    res\.status\(500\)\.json\(\{ error: err\.message \}\);\n  \}\n\}\);",
    """router.post('/playlist/upload', protect, async (req, res) => {
  try {
    const { title, category, filePath, duration } = req.body;
    if (!filePath) return res.status(400).json({ error: 'No file path provided' });

    const lastItem = await Playlist.findOne().sort('-orderIndex');
    const orderIndex = lastItem ? lastItem.orderIndex + 1 : 0;

    const newPlaylistItem = new Playlist({
      title: title || 'Untitled',
      filePath,
      duration: duration || 30,
      category: category || 'News',
      orderIndex
    });

    await newPlaylistItem.save();
    
    const updatedPlaylist = await Playlist.find().sort('orderIndex');
    if (req.app.get('io')) {
      req.app.get('io').emit('playlist_updated', updatedPlaylist);
    }
    
    res.status(201).json(newPlaylistItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});""",
    content,
    flags=re.DOTALL
)

# Replace /ads/upload
content = re.sub(
    r"router\.post\('/ads/upload', protect, upload\.single\('video'\), async \(req, res\) => \{.*?\n    res\.status\(201\)\.json\(newAd\);\n  \} catch \(err\) \{\n    res\.status\(500\)\.json\(\{ error: err\.message \}\);\n  \}\n\}\);",
    """router.post('/ads/upload', protect, async (req, res) => {
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
});""",
    content,
    flags=re.DOTALL
)

with open('backend/routes/api.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("api.js updated successfully")
