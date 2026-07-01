import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import io from 'socket.io-client';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, CircleDot } from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://admin-spml.onrender.com';

const ViewerPage = () => {
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isHovering, setIsHovering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const hideControlsTimeoutRef = useRef(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const video1Ref = useRef(null);
  const video2Ref = useRef(null);
  const [activePlayer, setActivePlayer] = useState(1);
  const wrapperRef = useRef(null);
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
  const [currentDayStr, setCurrentDayStr] = useState('');
  const [rotationIndex, setRotationIndex] = useState(0);

  // Rotating index for Time/Date/Day
  useEffect(() => {
    const rotater = setInterval(() => {
      setRotationIndex(prev => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(rotater);
  }, []);

  // Live time and date updater
  useEffect(() => {
    const timer = setInterval(() => {
      // Force Bangladesh Standard Time (UTC+6)
      const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
      
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const seconds = d.getSeconds().toString().padStart(2, '0');
      setCurrentTimeStr(`${hours}:${minutes}:${seconds}`);

      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      setCurrentDateStr(`${day}/${month}/${year}`);

      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      setCurrentDayStr(days[d.getDay()]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Idle timer for hiding controls
  const resetIdleTimer = () => {
    setIsHovering(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setIsHovering(false);
    }, 2500); // Hide after 2.5 seconds of inactivity
  };

  useEffect(() => {
    resetIdleTimer();
    return () => clearTimeout(hideControlsTimeoutRef.current);
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

  // Dual Video Playback & Sync Engine
  useEffect(() => {
    if (!status.activeVideo || !status.isPlaying || !overlays.isBroadcastActive) {
      if (video1Ref.current) video1Ref.current.src = '';
      if (video2Ref.current) video2Ref.current.src = '';
      return;
    }

    const currentEl = activePlayer === 1 ? video1Ref.current : video2Ref.current;
    const nextEl = activePlayer === 1 ? video2Ref.current : video1Ref.current;
    if (!currentEl || !nextEl) return;

    const normalizedPath = status.activeVideo.filePath.replace(/\\/g, '/');
    const videoUrl = normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')
      ? normalizedPath
      : `${SOCKET_URL}/${normalizedPath}`;

    // 1. Transition Check (Video Switched)
    // We check if the URL we are SUPPOSED to play doesn't match the CURRENT player
    if (currentEl.src && !currentEl.src.endsWith(videoUrl.split('?')[0]) && currentEl.src !== videoUrl) {
      // Is the next video preloaded in the background player?
      if (nextEl.src && (nextEl.src.endsWith(videoUrl.split('?')[0]) || nextEl.src === videoUrl)) {
        // PERFECT! It's preloaded. Swap instantly!
        nextEl.currentTime = status.activeVideo.offset || 0;
        nextEl.play().catch(e => console.log("Autoplay blocked:", e));
        setActivePlayer(activePlayer === 1 ? 2 : 1);
        
        // Now preload the NEW nextVideo in the background
        if (status.nextVideo) {
          const nextNormalized = status.nextVideo.filePath.replace(/\\/g, '/');
          const nextUrl = nextNormalized.startsWith('http') ? nextNormalized : `${SOCKET_URL}/${nextNormalized}`;
          currentEl.src = nextUrl;
          currentEl.load();
        }
      } else {
        // Fallback: Hard switch if preload failed or just started
        currentEl.src = videoUrl;
        currentEl.currentTime = status.activeVideo.offset || 0;
        currentEl.play().catch(e => console.log("Autoplay blocked:", e));
        
        // Set up preload
        if (status.nextVideo) {
          const nextNormalized = status.nextVideo.filePath.replace(/\\/g, '/');
          const nextUrl = nextNormalized.startsWith('http') ? nextNormalized : `${SOCKET_URL}/${nextNormalized}`;
          nextEl.src = nextUrl;
          nextEl.load();
        }
      }
    } else if (!currentEl.src) {
      // First ever load
      currentEl.src = videoUrl;
      currentEl.currentTime = status.activeVideo.offset || 0;
      currentEl.play().catch(e => console.log("Autoplay blocked:", e));
    } else {
      // 2. Sync Enforcement (Runs every second because status.activeVideo is a new object reference)
      const currentDiff = Math.abs(currentEl.currentTime - status.activeVideo.offset);
      // Stricter sync tolerance (2 seconds max drift before correction)
      if (currentDiff > 2) {
        currentEl.currentTime = status.activeVideo.offset;
      }
      if (currentEl.paused && !isPaused) {
        currentEl.play().catch(e => console.log("Autoplay blocked:", e));
      }

      // Keep preload updated just in case admin changes the queue
      if (status.nextVideo) {
        const nextNormalized = status.nextVideo.filePath.replace(/\\/g, '/');
        const nextUrl = nextNormalized.startsWith('http') ? nextNormalized : `${SOCKET_URL}/${nextNormalized}`;
        if (!nextEl.src || (!nextEl.src.endsWith(nextUrl.split('?')[0]) && nextEl.src !== nextUrl)) {
          nextEl.src = nextUrl;
          nextEl.load();
        }
      }
    }
  }, [status.activeVideo, overlays.isBroadcastActive]); // IMPORTANT: Depends on the whole activeVideo object to trigger every second!

  const handlePlayUnmute = () => {
    setIsMuted(false);
    setIsPaused(false);
    const currentEl = activePlayer === 1 ? video1Ref.current : video2Ref.current;
    if (currentEl) {
      currentEl.play().catch(err => console.log(err));
      currentEl.muted = false;
      currentEl.volume = volume;
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
      <div 
        ref={wrapperRef}
        onMouseMove={resetIdleTimer}
        onClick={resetIdleTimer}
        onTouchStart={resetIdleTimer}
        onMouseLeave={() => {
          setIsHovering(false);
          clearTimeout(hideControlsTimeoutRef.current);
        }}
        className={`w-full max-w-6xl mx-auto bg-black rounded-lg overflow-hidden shadow-2xl relative aspect-video mt-10 group ${!isHovering ? 'cursor-none' : ''}`}
      >
        {status.activeVideo && overlays.isBroadcastActive ? (
          <>
            <video 
              ref={video1Ref} 
              className={`absolute inset-0 w-full h-full object-cover z-0 ${activePlayer === 1 ? 'opacity-100 block' : 'opacity-0 hidden'}`} 
              playsInline 
              muted={isMuted}
            />
            <video 
              ref={video2Ref} 
              className={`absolute inset-0 w-full h-full object-cover z-0 ${activePlayer === 2 ? 'opacity-100 block' : 'opacity-0 hidden'}`} 
              playsInline 
              muted={isMuted}
            />
          </>
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
            {overlays.logoActive && (
              <div className="absolute top-4 left-4 bg-[#111111] border border-gray-800 text-white font-extrabold text-xs sm:text-sm w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shadow-lg z-20 overflow-hidden">
                {overlays.logoImagePath ? (
                  <img src={overlays.logoImagePath.startsWith('data:') ? overlays.logoImagePath : `${SOCKET_URL}/${overlays.logoImagePath.replace(/\\/g, '/')}`} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  "Logo"
                )}
              </div>
            )}



            {/* Tickers, OTS & Time/Date Aligned Bottom Rows */}
            <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1 z-20 text-[2.5vw] md:text-[1.8vw] lg:text-[1.2vw] xl:text-[1vw] font-bold text-white select-none drop-shadow-lg pointer-events-none">
              
              {/* OTS graphic overlay (Dynamically stacked above tickers) */}
              {overlays.otsActive && overlays.otsImagePath && (
                <div className="self-end w-16 h-16 sm:w-24 sm:h-24 bg-[#111111] border border-gray-800 flex items-center justify-center p-2 rounded-lg shadow-lg mb-2 pointer-events-auto">
                  <img src={overlays.otsImagePath.startsWith('data:') ? overlays.otsImagePath : `${SOCKET_URL}/${overlays.otsImagePath.replace(/\\/g, '/')}`} alt="OTS" className="max-w-full max-h-full object-contain" />
                </div>
              )}

              {/* Row 1 (Ticker 1) */}
              {overlays.ticker1Active && (
                <div className={`flex w-full shadow-2xl ${!overlays.ticker1Active ? 'justify-end' : ''}`}>
                  {/* Ticker 1 Title */}
                  {overlays.ticker1Active && (
                    <div className="bg-[#111111] border-r-2 border-pink-600 px-2 md:px-3 py-2 md:py-3 rounded-l-lg w-[25%] sm:w-[20%] md:w-[15%] lg:w-[12%] shrink-0 flex items-center justify-center uppercase tracking-wider text-pink-500 overflow-hidden">
                      <span className="whitespace-nowrap origin-center transition-transform" style={{ transform: `scale(${Math.min(1, 10 / Math.max(1, (overlays.ticker1Title || 'Headline News 1').length))})` }}>
                        {overlays.ticker1Title || 'Headline News 1'}
                      </span>
                    </div>
                  )}
                  {/* Ticker 1 Text */}
                  {overlays.ticker1Active && (
                    <div className="flex-1 bg-gradient-to-r from-[#1a1a1a] to-[#2a2a2a] border-y border-gray-800 px-4 py-2 md:py-3 flex items-center overflow-hidden">
                      <marquee className="font-normal flex-1 text-gray-100" scrollamount="4">{overlays.ticker1Text}</marquee>
                    </div>
                  )}
                  {/* (Time bug moved to unified rotating bug below) */}
                </div>
              )}

              {/* Row 2 (Ticker 2 & Unified Rotating Bug) */}
              {(overlays.ticker2Active || overlays.showDate || overlays.showTime) && (
                <div className={`flex w-full shadow-2xl ${!overlays.ticker2Active ? 'justify-end' : ''}`}>
                  {/* Ticker 2 Title */}
                  {overlays.ticker2Active && (
                    <div className="bg-[#111111] border-r-2 border-blue-600 px-2 md:px-3 py-2 md:py-3 rounded-l-lg w-[25%] sm:w-[20%] md:w-[15%] lg:w-[12%] shrink-0 flex items-center justify-center uppercase tracking-wider text-blue-500 overflow-hidden">
                      <span className="whitespace-nowrap origin-center transition-transform" style={{ transform: `scale(${Math.min(1, 10 / Math.max(1, (overlays.ticker2Title || 'Headline News 2').length))})` }}>
                        {overlays.ticker2Title || 'Headline News 2'}
                      </span>
                    </div>
                  )}
                  {/* Ticker 2 Text */}
                  {overlays.ticker2Active && (
                    <div className="flex-1 bg-gradient-to-r from-[#1a1a1a] to-[#2a2a2a] border-y border-gray-800 px-4 py-2 md:py-3 flex items-center overflow-hidden">
                      <marquee className="font-normal flex-1 text-gray-100" scrollamount="5">{overlays.ticker2Text}</marquee>
                    </div>
                  )}
                  {/* Unified Rotating Time/Date Bug */}
                  {(overlays.showDate || overlays.showTime) && (
                    <div className={`bg-black/90 backdrop-blur border border-gray-800 px-2 md:px-4 py-2 md:py-3 w-[25%] sm:w-[20%] md:w-[15%] lg:w-[12%] shrink-0 text-center font-mono flex items-center justify-center text-gray-300 transition-opacity duration-500 overflow-hidden whitespace-nowrap ${!overlays.ticker2Active ? 'rounded-lg' : 'rounded-r-lg'}`}>
                      {rotationIndex === 0 && <span className="animate-pulse">{currentTimeStr}</span>}
                      {rotationIndex === 1 && <span>{currentDayStr}</span>}
                      {rotationIndex === 2 && <span>{currentDateStr}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Custom TV Player Control Bar */}
            <div 
              className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-16 pb-3 px-4 z-30 transition-opacity duration-300 ${isHovering || isPaused || isMuted ? 'opacity-100' : 'opacity-0'}`}
            >
              <div className="flex items-center justify-between">
                {/* Left Controls */}
                <div className="flex items-center space-x-4">
                  <button onClick={() => {
                    if (videoRef.current) {
                      if (isPaused) {
                        videoRef.current.play();
                        setIsPaused(false);
                      } else {
                        videoRef.current.pause();
                        setIsPaused(true);
                      }
                    }
                  }} className="text-white hover:text-pink-500 transition-colors">
                    {isPaused || isMuted ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
                  </button>
                  
                  <div className="flex items-center space-x-2 group/volume relative">
                    <button onClick={() => {
                      if (videoRef.current) {
                        if (isMuted) {
                          videoRef.current.muted = false;
                          videoRef.current.volume = volume === 0 ? 0.5 : volume;
                          setIsMuted(false);
                          if (volume === 0) setVolume(0.5);
                        } else {
                          videoRef.current.muted = true;
                          setIsMuted(true);
                        }
                      }
                    }} className="text-white hover:text-pink-500 transition-colors">
                      {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>
                    <input 
                      type="range" 
                      min="0" max="1" step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setVolume(val);
                        if (videoRef.current) {
                          videoRef.current.volume = val;
                          videoRef.current.muted = val === 0;
                        }
                        setIsMuted(val === 0);
                      }}
                      className="w-0 opacity-0 group-hover/volume:w-20 group-hover/volume:opacity-100 transition-all duration-300 accent-pink-500 cursor-pointer"
                    />
                  </div>

                  <button 
                    onClick={() => {
                      if (videoRef.current && status.activeVideo) {
                        videoRef.current.currentTime = status.activeVideo.offset;
                        videoRef.current.play().catch(e => console.log(e));
                        setIsPaused(false);
                      }
                    }}
                    className="flex items-center space-x-1.5 ml-2 cursor-pointer hover:opacity-75 transition-opacity"
                  >
                    <CircleDot className="w-3 h-3 text-red-500 animate-pulse" />
                    <span className="text-white font-bold text-xs tracking-widest uppercase">Live</span>
                  </button>
                </div>

                {/* Right Controls */}
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <button 
                      onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                      className="text-white hover:text-pink-500 transition-colors flex items-center gap-1 text-xs font-bold tracking-wider"
                    >
                      <Settings className={`w-4 h-4 transition-transform duration-300 ${showSettingsMenu ? 'rotate-90 text-pink-500' : ''}`} /> 
                      {selectedQuality === 'Auto' ? 'HD' : selectedQuality}
                    </button>
                    
                    {/* Quality Settings Dropdown */}
                    {showSettingsMenu && (
                      <div className="absolute bottom-full right-0 mb-4 w-32 bg-black/95 backdrop-blur-sm border border-gray-700 rounded-md shadow-2xl overflow-hidden py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="px-3 py-2 text-xs font-bold text-gray-400 border-b border-gray-800 uppercase tracking-wider">Quality</div>
                        {['Auto', '1080p', '720p', '480p', '360p'].map(q => (
                          <button
                            key={q}
                            onClick={() => {
                              setSelectedQuality(q);
                              setShowSettingsMenu(false);
                              // Note: Real HLS level switching would happen here via hlsRef.current.currentLevel
                            }}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 transition-colors flex items-center justify-between ${selectedQuality === q ? 'text-pink-500 font-bold bg-white/5' : 'text-white'}`}
                          >
                            {q}
                            {selectedQuality === q && <CircleDot className="w-2 h-2 text-pink-500" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => {
                    if (!document.fullscreenElement) {
                      wrapperRef.current?.requestFullscreen().catch(err => console.log(err));
                    } else {
                      document.exitFullscreen();
                    }
                  }} className="text-white hover:text-pink-500 transition-colors ml-2">
                    <Maximize className="w-5 h-5" />
                  </button>
                </div>
              </div>
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
