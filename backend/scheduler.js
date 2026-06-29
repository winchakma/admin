const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Playlist = require('./models/Playlist');
const Overlay = require('./models/Overlay');
const AdState = require('./models/AdState');
const AdItem = require('./models/AdItem');
const https = require('https');
const { startFfmpegStream, stopFfmpegStream } = require('./ffmpegEngine');

let todayPrayerTimes = null;
let azanPlayedToday = {
  Fajr: false,
  Zohr: false,
  Asr: false,
  Maghrib: false,
  Isha: false,
  dateFetched: null
};

// Fixed prayer schedule provided by the client
const staticPrayerTimes = {
  0: { Fajr: '03:49', Zohr: '12:03', Asr: '15:22', Maghrib: '18:49', Isha: '20:17' }, // Sunday
  1: { Fajr: '03:46', Zohr: '12:02', Asr: '15:20', Maghrib: '18:50', Isha: '20:19' }, // Monday
  2: { Fajr: '03:47', Zohr: '12:02', Asr: '15:21', Maghrib: '18:50', Isha: '20:19' }, // Tuesday
  3: { Fajr: '03:47', Zohr: '12:02', Asr: '15:21', Maghrib: '18:50', Isha: '20:17' }, // Wednesday
  4: { Fajr: '03:48', Zohr: '12:02', Asr: '15:21', Maghrib: '18:50', Isha: '20:17' }, // Thursday
  5: { Fajr: '03:48', Zohr: '12:03', Asr: '15:22', Maghrib: '18:50', Isha: '20:17' }, // Friday
  6: { Fajr: '03:48', Zohr: '12:03', Asr: '15:22', Maghrib: '18:50', Isha: '20:17' }  // Saturday
};

const updatePrayerTimes = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  if (azanPlayedToday.dateFetched === dateStr) return;

  const currentDayOfWeek = d.getDay(); // 0-6
  todayPrayerTimes = staticPrayerTimes[currentDayOfWeek];
  
  azanPlayedToday = {
    Fajr: false,
    Zohr: false,
    Asr: false,
    Maghrib: false,
    Isha: false,
    dateFetched: dateStr
  };
  console.log(`[Azan System] Loaded Static Prayer Times for Dhaka (${dateStr}):`, todayPrayerTimes);
};

// Fetch immediately on startup
updatePrayerTimes();

let activeFfmpegProcess = null;
let currentStatus = {
  activeVideo: null,
  elapsedTime: 0,
  remainingTime: 0,
  isPlaying: false,
  streamUrl: '/stream/live.m3u8'
};

// Start the scheduler
const startScheduler = (io) => {
  // Ensure stream directory exists
  const streamDir = path.join(__dirname, 'stream');
  if (!fs.existsSync(streamDir)) {
    fs.mkdirSync(streamDir, { recursive: true });
  }

  // Periodic loop to calculate playout timing and sync clients
  setInterval(async () => {
    try {
      let adState = await AdState.findOne();
      if (!adState) {
        adState = new AdState({ totalAdTimeOffset: 0 });
        await adState.save();
      } else if (typeof adState.totalAdTimeOffset !== 'number' || isNaN(adState.totalAdTimeOffset)) {
        adState.totalAdTimeOffset = 0;
        await adState.save();
      }

      // 1. Fetch new prayer times if day changed in Dhaka
      updatePrayerTimes();

      // 2. Check if it's Azan time right now
      if (todayPrayerTimes && (!adState.activeAd || !adState.activeAd.startedAt)) {
        const dhakaDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
        const hh = dhakaDate.getHours().toString().padStart(2, '0');
        const mm = dhakaDate.getMinutes().toString().padStart(2, '0');
        const currentDhakaTimeStr = `${hh}:${mm}`;

        for (const [prayer, time] of Object.entries(todayPrayerTimes)) {
          if (currentDhakaTimeStr === time && !azanPlayedToday[prayer]) {
            azanPlayedToday[prayer] = true;
            console.log(`[Azan System] It is exactly time for ${prayer} Azan (${time}). Triggering video...`);

            try {
              // Priority 1: Exact match (e.g. "Maghrib")
              let azanAd = await AdItem.findOne({ title: { $regex: new RegExp(`^${prayer}$`, 'i') } });
              
              // Priority 2: Loose match (e.g. "Maghrib Azan")
              if (!azanAd) {
                azanAd = await AdItem.findOne({ title: { $regex: new RegExp(prayer, 'i') } });
              }

              if (azanAd) {
                adState.activeAd = {
                  title: `[AZAN] ${azanAd.title}`,
                  filePath: azanAd.filePath,
                  duration: azanAd.duration,
                  startedAt: new Date()
                };
                await adState.save();
                console.log(`[Azan System] Successfully injected ${prayer} video into broadcast queue.`);
              } else {
                console.log(`[Azan System] Could not find an uploaded Ad containing "${prayer}" in its title.`);
              }
            } catch (err) {
              console.error(`[Azan System] Database error while finding ${prayer} Azan video:`, err);
            }
          }
        }
      }

      const overlayConfig = await Overlay.findOne() || {};
      
      // Check if broadcast is halted
      if (overlayConfig.isBroadcastActive === false) {
        currentStatus.isPlaying = false;
        currentStatus.activeVideo = null;
        currentStatus.overlays = overlayConfig;
        io.emit('stream_status', currentStatus);
        return;
      }

      // Check if an ad is currently playing
      if (adState.activeAd && adState.activeAd.startedAt) {
        let elapsed = (Date.now() - new Date(adState.activeAd.startedAt).getTime()) / 1000;
        if (isNaN(elapsed) || elapsed < 0) {
          elapsed = 0;
        }
        if (elapsed < adState.activeAd.duration) {
          currentStatus.isPlaying = true;
          currentStatus.activeVideo = {
            id: 'ad-' + new Date(adState.activeAd.startedAt).getTime(),
            title: '[AD] ' + adState.activeAd.title,
            filePath: adState.activeAd.filePath,
            duration: adState.activeAd.duration,
            offset: elapsed,
            isAd: true
          };
          currentStatus.elapsedTime = Math.floor(elapsed);
          currentStatus.remainingTime = Math.max(0, Math.floor(adState.activeAd.duration - elapsed));

          currentStatus.overlays = overlayConfig;

          io.emit('stream_status', currentStatus);
          return;
        } else {
          // Ad has finished playing, transition back to regular playlist
          const adDuration = typeof adState.activeAd.duration === 'number' && !isNaN(adState.activeAd.duration) ? adState.activeAd.duration : 0;
          adState.totalAdTimeOffset = (adState.totalAdTimeOffset || 0) + adDuration;
          adState.activeAd = null;
          await adState.save();
        }
      }

      const playlist = await Playlist.find({ status: 'active' }).sort('orderIndex');
      if (playlist.length === 0) {
        currentStatus.isPlaying = false;
        currentStatus.activeVideo = null;
        io.emit('stream_status', currentStatus);
        return;
      }

      // Calculate total duration
      const totalDuration = playlist.reduce((sum, item) => sum + item.duration, 0);
      const now = Date.now();
      const adjustedNow = (now / 1000) - (adState.totalAdTimeOffset || 0);
      const currentCycleTime = adjustedNow % totalDuration;

      let accumulatedTime = 0;
      let selectedItem = playlist[0];
      let offset = 0;

      for (const item of playlist) {
        if (currentCycleTime >= accumulatedTime && currentCycleTime < accumulatedTime + item.duration) {
          selectedItem = item;
          offset = currentCycleTime - accumulatedTime;
          break;
        }
        accumulatedTime += item.duration;
      }

      currentStatus.isPlaying = true;
      currentStatus.activeVideo = {
        id: selectedItem._id,
        title: selectedItem.title,
        filePath: selectedItem.filePath,
        duration: selectedItem.duration,
        offset: offset
      };
      currentStatus.elapsedTime = Math.floor(offset);
      currentStatus.remainingTime = Math.max(0, Math.floor(selectedItem.duration - offset));

      // Fetch active overlays to broadcast
      currentStatus.overlays = overlayConfig;

      io.emit('stream_status', currentStatus);

      // Attempt to manage local FFmpeg playout if running under supportive system
      manageLocalPlayout(selectedItem, offset);

    } catch (err) {
      console.error('Scheduler error:', err.message);
    }
  }, 1000);
};

// Manage backend HLS stitching using FFmpeg
let currentFfmpegVideoId = null;

const manageLocalPlayout = (selectedItem, offset) => {
  if (!selectedItem) {
    if (currentFfmpegVideoId !== null) {
      stopFfmpegStream();
      currentFfmpegVideoId = null;
    }
    return;
  }

  // If the video hasn't changed, let the current FFmpeg process run
  if (currentFfmpegVideoId === selectedItem.id || currentFfmpegVideoId === selectedItem._id?.toString()) {
    return;
  }

  // Video changed, start new FFmpeg stream
  currentFfmpegVideoId = selectedItem.id || selectedItem._id?.toString();
  
  const isExternalUrl = selectedItem.filePath.startsWith('http://') || selectedItem.filePath.startsWith('https://');
  let inputVideoPath = selectedItem.filePath;
  
  if (!isExternalUrl) {
    inputVideoPath = path.join(__dirname, selectedItem.filePath);
    if (!fs.existsSync(inputVideoPath)) {
      console.log(`[FFmpeg CG] Cannot start stream. Local video file missing: ${inputVideoPath}`);
      return;
    }
  }

  console.log(`[FFmpeg CG] Starting broadcast stream for: ${selectedItem.title}`);
  startFfmpegStream(inputVideoPath);
};

module.exports = { startScheduler };
