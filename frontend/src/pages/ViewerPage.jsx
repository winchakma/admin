import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import io from 'socket.io-client';
import Hls from 'hls.js';
import { Play } from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://admin-spml.onrender.com';

const ViewerPage = () => {
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const socketRef = useRef(null);

  const [overlays, setOverlays] = useState({
    ticker1Text: '',
    ticker1Title: '',
    ticker1Active: false,
    ticker2Text: '',
    ticker2Title: '',
    ticker2Active: false,
    otsImagePath: '',
    otsActive: false,
    showTime: false,
    showDate: false,
    isBroadcastActive: false
  });

  const [status, setStatus] = useState({
    activeVideo: null,
    isPlaying: false
  });

  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');

  // Live time and date updater
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const seconds = d.getSeconds().toString().padStart(2, '0');
      setCurrentTimeStr(`${hours}:${minutes}:${seconds}`);

      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      setCurrentDateStr(`${day}/${month}/${year}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Connect Socket.io
  useEffect(() => {
    const s = io(SOCKET_URL, { reconnectionAttempts: 5, timeout: 5000 });
    socketRef.current = s;

    s.on('connect', () => console.log('Connected to stream'));
    
    s.on('stream_status', (data) => {
      setStatus(data);
      if (data.overlays) {
        setOverlays(prev => ({ ...prev, ...data.overlays }));
      }
    });

    s.on('overlays_updated', (updatedOverlays) => {
      setOverlays(prev => ({ ...prev, ...updatedOverlays }));
    });

    // Initial fetch of overlays
    fetch(`${SOCKET_URL}/api/overlays`)
      .then(res => res.json())
      .then(data => {
        if (data) setOverlays(prev => ({ ...prev, ...data }));
      })
      .catch(err => console.warn('Overlay config offline'));

    return () => s.disconnect();
  }, []);

  // Video playback syncing effect
  useEffect(() => {
    if (!status.activeVideo || !status.isPlaying || !overlays.isBroadcastActive) {
      if (videoRef.current) {
        videoRef.current.src = '';
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    const normalizedPath = status.activeVideo.filePath.replace(/\\/g, '/');
    const videoUrl = normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')
      ? normalizedPath
      : `${SOCKET_URL}/${normalizedPath}`;

    const isHls = videoUrl.endsWith('.m3u8') || videoUrl.includes('.m3u8');

    if (isHls) {
      if (Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }
        const hls = new Hls();
        hlsRef.current = hls;
        hls.attachMedia(videoEl);
        hls.loadSource(videoUrl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoEl.play().catch(e => console.log("Autoplay blocked:", e));
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = videoUrl;
        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.play().catch(e => console.log("Autoplay blocked:", e));
        });
      }
    } else {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (videoEl.src !== videoUrl) {
        videoEl.src = videoUrl;
      }
      
      const currentDiff = Math.abs(videoEl.currentTime - status.activeVideo.offset);
      if (currentDiff > 3) {
        videoEl.currentTime = status.activeVideo.offset;
      }
      
      videoEl.play().catch(e => console.log("Autoplay blocked:", e));
    }
  }, [status.activeVideo?.id, status.activeVideo?.filePath, overlays.isBroadcastActive]);

  const handlePlayUnmute = () => {
    setIsMuted(false);
    if (videoRef.current) {
      videoRef.current.play().catch(err => console.log(err));
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white font-sans flex flex-col items-center pt-8 sm:pt-16 pb-20 px-4">
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-[#111111]/90 backdrop-blur border-b border-gray-800 z-50">
        <div className="flex items-center space-x-6">
          <div className="text-2xl font-bold text-pink-500 mr-8">MS BD SHOP ~ LTD</div>
        </div>
        <div>
          <Link to="/login" className="text-xs text-gray-500 hover:text-white transition-colors">Admin Login</Link>
        </div>
      </header>

      {/* Main Video Player aligned with Admin Preview */}
      <div className="w-full max-w-6xl mx-auto bg-black rounded-lg overflow-hidden shadow-2xl relative aspect-video mt-10">
        {status.activeVideo && overlays.isBroadcastActive ? (
          <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover z-0" 
            playsInline 
            muted={isMuted}
          />
        ) : (
          <div className="absolute inset-0 bg-[#66DE93] z-0 flex items-center justify-center">
            <span className="text-black font-bold text-xl uppercase tracking-widest opacity-30">
              Broadcast Offline
            </span>
          </div>
        )}

        {/* Play/Unmute Button overlay */}
        {isMuted && status.activeVideo && overlays.isBroadcastActive && (
          <button 
            onClick={handlePlayUnmute}
            className="absolute inset-0 w-full h-full bg-black/60 flex flex-col items-center justify-center gap-3 text-white font-bold text-sm transition-all hover:bg-black/75 z-10 cursor-pointer"
          >
            <div className="w-16 h-16 rounded-full bg-pink-600 flex items-center justify-center shadow-2xl">
              <Play className="w-8 h-8 fill-white text-white ml-1.5" />
            </div>
            <span>Click to Unmute / Play Linear Stream</span>
          </button>
        )}

        {/* Overlays only show if broadcast is active */}
        {overlays.isBroadcastActive && (
          <>
            {/* Site Logo */}
            <div className="absolute top-4 left-4 bg-[#111111] border border-gray-800 text-white font-extrabold text-xs sm:text-sm w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shadow-lg z-20">
              Logo
            </div>

            {/* OTS graphic overlay */}
            {overlays.otsActive && overlays.otsImagePath && (
              <div className="absolute right-4 bottom-[90px] w-16 h-16 sm:w-24 sm:h-24 bg-[#111111] border border-gray-800 flex items-center justify-center p-2 rounded-lg z-20 shadow-lg">
                <img src={`${SOCKET_URL}/${overlays.otsImagePath.replace(/\\/g, '/')}`} alt="OTS" className="max-w-full max-h-full object-contain" />
              </div>
            )}

            {/* Tickers & Time/Date Aligned Bottom Rows */}
            <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1 z-20 text-[9px] sm:text-xs font-bold text-white select-none">
              {/* Row 1 (Ticker 1 & Time) */}
              {overlays.ticker1Active && (
                <div className="flex gap-1 w-full shadow-md">
                  {/* Ticker 1 Title */}
                  <div className="bg-[#111111] border border-gray-800 px-3 py-1.5 rounded-l min-w-[80px] sm:min-w-[110px] text-center flex items-center justify-center uppercase tracking-wide">
                    {overlays.ticker1Title || 'Title Card'}
                  </div>
                  {/* Ticker 1 Text */}
                  <div className="flex-1 bg-[#2a2a2a] border-y border-gray-800 px-3 py-1.5 flex items-center overflow-hidden">
                    <marquee className="font-normal flex-1 text-white" scrollamount="2">{overlays.ticker1Text}</marquee>
                  </div>
                  {/* Time */}
                  {overlays.showTime && (
                    <div className="bg-[#111111] border border-gray-800 px-3 py-1.5 rounded-r min-w-[70px] sm:min-w-[90px] text-center font-mono flex items-center justify-center">
                      {currentTimeStr}
                    </div>
                  )}
                </div>
              )}

              {/* Row 2 (Ticker 2 & Date) */}
              {overlays.ticker2Active && (
                <div className="flex gap-1 w-full shadow-md">
                  {/* Ticker 2 Title */}
                  <div className="bg-[#111111] border border-gray-800 px-3 py-1.5 rounded-l min-w-[80px] sm:min-w-[110px] text-center flex items-center justify-center uppercase tracking-wide">
                    {overlays.ticker2Title || 'Title Card'}
                  </div>
                  {/* Ticker 2 Text */}
                  <div className="flex-1 bg-[#2a2a2a] border-y border-gray-800 px-3 py-1.5 flex items-center overflow-hidden">
                    <marquee className="font-normal flex-1 text-white" scrollamount="2.5">{overlays.ticker2Text}</marquee>
                  </div>
                  {/* Date */}
                  {overlays.showDate && (
                    <div className="bg-[#111111] border border-gray-800 px-3 py-1.5 rounded-r min-w-[70px] sm:min-w-[90px] text-center font-mono flex items-center justify-center">
                      {currentDateStr}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      
      <div className="mt-8 text-center text-gray-500 text-sm max-w-2xl font-medium tracking-wide">
        You are watching the live synchronized linear playout. Video playback, advertisements, and news overlays are controlled strictly by the broadcast administrator.
      </div>
    </div>
  );
};

export default ViewerPage;
