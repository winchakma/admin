const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');
const { PassThrough } = require('stream');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

let masterFfmpegCommand = null;
let currentChildCommand = null;
const streamPipe = new PassThrough();

process.on('exit', () => {
  if (masterFfmpegCommand) masterFfmpegCommand.kill('SIGKILL');
  if (currentChildCommand) currentChildCommand.kill('SIGKILL');
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

const startMasterFfmpeg = () => {
  if (masterFfmpegCommand) return;
  
  ensureStreamDataFiles();
  const outputPath = path.join(__dirname, 'stream', 'live.m3u8');
  if (!fs.existsSync(path.join(__dirname, 'stream'))) {
    fs.mkdirSync(path.join(__dirname, 'stream'), { recursive: true });
  }

  masterFfmpegCommand = ffmpeg()
    .input(streamPipe)
    .inputFormat('mpegts')
    .outputOptions([
      '-vf setpts=N/30/TB',
      '-af asetpts=N/44100/TB',
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
      '-hls_list_size 20',
      '-hls_flags delete_segments'
    ])
    .output(outputPath)
    .on('start', (commandLine) => {
      console.log('[Master Stream] Spawned continuous FFmpeg Master Pipeline');
    })
    .on('error', (err, stdout, stderr) => {
      console.error('[Master Stream] Error:', err.message);
      masterFfmpegCommand = null;
      // Auto restart master stream
      setTimeout(startMasterFfmpeg, 2000);
    })
    .on('end', () => {
      console.log('[Master Stream] Ended. Restarting in 2s...');
      masterFfmpegCommand = null;
      setTimeout(startMasterFfmpeg, 2000);
    });

  masterFfmpegCommand.run();
};

const startFfmpegStream = (inputVideoPath, offset = 0, onCrash = null) => {
  stopFfmpegStream();
  
  if (!masterFfmpegCommand) {
    startMasterFfmpeg();
  }

  const inputOpts = [
    '-re'
  ];
  
  if (offset > 0) {
    inputOpts.unshift(`-ss ${offset}`);
  }

  currentChildCommand = ffmpeg(inputVideoPath)
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
      '-r 30',
      '-c:a aac',
      '-ar 44100',
      '-f mpegts'
    ])
    .on('start', (commandLine) => {
      console.log('[Child Stream] Pumping video into Master: ' + inputVideoPath);
    })
    .on('error', (err) => {
      if (!err.message.includes('SIGKILL')) {
        console.error('[Child Stream] Error:', err.message);
        if (onCrash) onCrash();
      }
    })
    .on('end', () => {
      console.log('[Child Stream] Finished pumping video.');
    });

  currentChildCommand.pipe(streamPipe, { end: false });
};

const stopFfmpegStream = () => {
  if (currentChildCommand) {
    currentChildCommand.kill('SIGKILL');
    currentChildCommand = null;
  }
};

module.exports = {
  startMasterFfmpeg,
  startFfmpegStream,
  stopFfmpegStream
};
