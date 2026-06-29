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

const startFfmpegStream = (inputVideoPath) => {
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

  // FFmpeg drawtext requires escaped colons for Windows paths (e.g., C\:/path)
  const escapedFontPath = path.join(__dirname, 'font.ttf').replace(/\\/g, '/').replace(':', '\\\\:');
  const escapedTicker1 = path.join(__dirname, 'stream_data', 'ticker1.txt').replace(/\\/g, '/').replace(':', '\\\\:');

  activeFfmpegCommand = ffmpeg(inputVideoPath)
    .inputOptions([
      '-stream_loop -1', // Loop the input video endlessly for a 24/7 feel
      '-re' // Read input at native frame rate
    ])
    .complexFilter([
      // Basic example: Burn ticker1 text onto the video
      `drawtext=fontfile='${escapedFontPath}':textfile='${escapedTicker1}':reload=1:fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:boxborderw=5:x=(w-text_w)/2:y=h-50`
    ])
    .outputOptions([
      '-c:v libx264',
      '-preset veryfast',
      '-crf 28',
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
