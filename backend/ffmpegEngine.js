const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

let activeFfmpegCommand = null;

// Ensure stream data files exist so drawtext doesn't crash on startup
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

const startFfmpegStream = (inputVideoPath, offset = 0) => {
  stopFfmpegStream();
  ensureStreamDataFiles();

  const outputPath = path.join(__dirname, 'stream', 'live.m3u8');
  
  // Clean up old segments
  if (fs.existsSync(path.join(__dirname, 'stream'))) {
    const files = fs.readdirSync(path.join(__dirname, 'stream'));
    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
        fs.unlinkSync(path.join(__dirname, 'stream', file));
      }
    }
  } else {
    fs.mkdirSync(path.join(__dirname, 'stream'), { recursive: true });
  }

  // Use relative paths for drawtext to avoid Windows absolute path escaping issues
  const relFontPath = 'font.ttf';
  const relTicker1 = 'stream_data/ticker1.txt';

  const inputOpts = [
    '-re' // Read input at native frame rate
  ];
  
  if (offset > 0) {
    inputOpts.unshift(`-ss ${offset}`);
  }

  activeFfmpegCommand = ffmpeg(inputVideoPath)
    .inputOptions(inputOpts)

    .complexFilter([
      // Scale down to 720p to save CPU on large movies
      `[0:v:0]scale=-2:720[vout]`
    ])
    .outputOptions([
      '-map [vout]',
      '-map 0:a:0?', // Map the first audio stream if it exists
      '-c:v libx264',
      '-preset ultrafast', // Use ultrafast to prevent CPU lag on large files
      '-crf 28',
      '-g 60', // Force keyframes every 60 frames for consistent HLS segmenting
      '-sc_threshold 0', // Disable scene detection to keep strict keyframes
      '-threads 2', // Limit threads so Express can still serve files to web viewers
      '-c:a aac',
      '-ar 44100',
      '-f hls',
      '-hls_time 4',
      '-hls_list_size 5',
      '-hls_flags delete_segments'
    ])
    .output(outputPath)
    .on('start', (commandLine) => {
      console.log('Spawned FFmpeg with command: ' + commandLine);
      try {
        fs.writeFileSync(path.join(__dirname, 'uploads', 'ffmpeg-debug.txt'), 'Spawned FFmpeg with command: ' + commandLine + '\\n\\n');
      } catch(e) {}
    })
    .on('error', (err, stdout, stderr) => {
      if (err.message.includes('SIGKILL')) {
        console.log('FFmpeg stream stopped (killed).');
      } else {
        console.error('FFmpeg Error:', err.message);
        console.error('FFmpeg Stderr:', stderr);
        try {
          fs.appendFileSync(path.join(__dirname, 'uploads', 'ffmpeg-debug.txt'), 'Error: ' + err.message + '\\nStderr:\\n' + stderr + '\\n\\n');
        } catch(e) {}
      }
    })
    .on('end', () => {
      console.log('FFmpeg stream ended.');
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
