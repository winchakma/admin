const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

let activeFfmpegCommand = null;
let watcherInterval = null;

let globalSequence = 0;
let masterSegments = [];
let discontinuityNext = false;
let lastProcessedTempSequence = -1;
let isFirstBoot = true;

const streamDir = path.join(__dirname, 'stream');
const tempDir = path.join(__dirname, 'stream_temp');

// Clean directories on startup
if (fs.existsSync(streamDir)) {
  fs.readdirSync(streamDir).forEach(f => {
    if (f.endsWith('.ts') || f.endsWith('.m3u8')) fs.unlinkSync(path.join(streamDir, f));
  });
} else {
  fs.mkdirSync(streamDir, { recursive: true });
}

if (fs.existsSync(tempDir)) {
  fs.readdirSync(tempDir).forEach(f => {
    if (f.endsWith('.ts') || f.endsWith('.m3u8')) fs.unlinkSync(path.join(tempDir, f));
  });
} else {
  fs.mkdirSync(tempDir, { recursive: true });
}

process.on('exit', () => {
  if (activeFfmpegCommand) activeFfmpegCommand.kill('SIGKILL');
  if (watcherInterval) clearInterval(watcherInterval);
});

const ensureStreamDataFiles = () => {
  const dataDir = path.join(__dirname, 'stream_data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const files = ['ticker1.txt', 'ticker2.txt', 'time.txt'];
  files.forEach(file => {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '', 'utf8');
    }
  });
};

const writeMasterM3u8 = () => {
  const masterLines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:5',
    `#EXT-X-MEDIA-SEQUENCE:${Math.max(0, globalSequence - masterSegments.length)}`
  ];
  
  masterSegments.forEach(seg => {
    if (seg.discontinuity) masterLines.push('#EXT-X-DISCONTINUITY');
    masterLines.push(`#EXTINF:${seg.duration},`);
    masterLines.push(seg.filename);
  });
  
  const m3u8Path = path.join(streamDir, 'live.m3u8');
  fs.writeFileSync(m3u8Path, masterLines.join('\n') + '\n');
};

const pollTempM3u8 = () => {
  const tempM3u8Path = path.join(tempDir, 'live.m3u8');
  if (!fs.existsSync(tempM3u8Path)) return;

  try {
    const content = fs.readFileSync(tempM3u8Path, 'utf8');
    const lines = content.split('\n');
    
    // Find the latest chunk to process correctly
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXTINF:')) {
        const duration = parseFloat(lines[i].split(':')[1].split(',')[0]);
        const filename = lines[i+1].trim();
        
        // We need to only process chunks that have a higher number than what we've processed in this temp directory
        const match = filename.match(/live(\d+)\.ts/);
        if (match) {
          const tempSeqNum = parseInt(match[1]);
          
          if (tempSeqNum > lastProcessedTempSequence) {
            const tempTsPath = path.join(tempDir, filename);
            if (!fs.existsSync(tempTsPath)) continue;

            lastProcessedTempSequence = tempSeqNum;
            
            const newFilename = `master_${globalSequence}.ts`;
            const finalTsPath = path.join(streamDir, newFilename);
            
            fs.copyFileSync(tempTsPath, finalTsPath);
            
            masterSegments.push({
              duration,
              filename: newFilename,
              discontinuity: discontinuityNext
            });
            
            globalSequence++;
            discontinuityNext = false;
            
            if (masterSegments.length > 20) {
              const removed = masterSegments.shift();
              const oldFile = path.join(streamDir, removed.filename);
              if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
            }
            
            writeMasterM3u8();
          }
        }
      }
    }
  } catch(e) {
    // Ignore read errors during FFmpeg writes
  }
};

const startFfmpegStream = (inputVideoPath, offset = 0, onCrash = null) => {
  stopFfmpegStream();
  ensureStreamDataFiles();
  
  if (!isFirstBoot) {
    discontinuityNext = true;
  }
  isFirstBoot = false;

  // Clear temp directory so old TS files don't confuse the parser
  if (fs.existsSync(tempDir)) {
    fs.readdirSync(tempDir).forEach(f => {
      if (f.endsWith('.ts') || f.endsWith('.m3u8')) fs.unlinkSync(path.join(tempDir, f));
    });
  }
  
  // reset lastProcessedTempSequence because temp directory is cleared
  lastProcessedTempSequence = -1;

  const outputPath = path.join(tempDir, 'live.m3u8');
  
  const inputOpts = [
    '-re' 
  ];
  
  if (offset > 0) {
    inputOpts.unshift(`-ss ${offset}`);
  }

  activeFfmpegCommand = ffmpeg(inputVideoPath)
    .inputOptions(inputOpts)
    .complexFilter([
      `[0:v:0]scale=-2:720[vout]`
    ])
    .outputOptions([
      '-map [vout]',
      '-map 0:a:0?',
      '-c:v libx264',
      '-preset ultrafast',
      '-crf 28',
      '-g 60', 
      '-sc_threshold 0',
      '-threads 2',
      '-c:a aac',
      '-ar 44100',
      '-f hls',
      '-hls_time 4',
      '-hls_list_size 5',
      '-hls_flags delete_segments'
    ])
    .output(outputPath)
    .on('start', (commandLine) => {
      console.log('Spawned FFmpeg stitcher child: ' + inputVideoPath);
      if (!watcherInterval) {
        watcherInterval = setInterval(pollTempM3u8, 1000);
      }
    })
    .on('error', (err) => {
      if (!err.message.includes('SIGKILL')) {
        console.error('FFmpeg Error:', err.message);
        if (onCrash) onCrash();
      }
    })
    .on('end', () => {
      console.log('FFmpeg stream ended naturally.');
    });

  activeFfmpegCommand.run();
};

const stopFfmpegStream = () => {
  if (activeFfmpegCommand) {
    activeFfmpegCommand.kill('SIGKILL');
    activeFfmpegCommand = null;
  }
};

module.exports = {
  startFfmpegStream,
  stopFfmpegStream
};
