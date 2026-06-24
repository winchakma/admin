import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Hls from 'hls.js';
import { 
  Upload, 
  Settings, 
  Home, 
  Folder, 
  Play,
  Clock,
  Calendar,
  AlertTriangle,
  ArrowUp,
  XCircle,
  MoreVertical
} from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://admin-spml.onrender.com';

function App() {
  const [activeTab, setActiveTab] = useState('admin');
  const [playlist, setPlaylist] = useState([]);
  const [isMuted, setIsMuted] = useState(true);

  const previewVideoRef = useRef(null);
  const publicVideoRef = useRef(null);
  const previewHlsRef = useRef(null);
  const publicHlsRef = useRef(null);
  
  const [overlays, setOverlays] = useState({
    ticker1Text: 'Headline Text',
    ticker1Title: 'Title Card',
    ticker1Active: false,
    ticker2Text: 'Headline Text',
    ticker2Title: 'Title Card',
    ticker2Active: false,
    otsImagePath: '',
    otsActive: false,
    showTime: true,
    showDate: true
  });

  const [status, setStatus] = useState({
    activeVideo: null,
    elapsedTime: 0,
    remainingTime: 0,
    isPlaying: false
  });

  const [uploadTitle, setUploadTitle] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');
  const socketRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Live time and date updater
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      
      // Format time as hh:mm:ss
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const seconds = d.getSeconds().toString().padStart(2, '0');
      setCurrentTimeStr(`${hours}:${minutes}:${seconds}`);

      // Format date as DD/MM/YYYY
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      setCurrentDateStr(`${day}/${month}/${year}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Video playback syncing effect
  useEffect(() => {
    if (!status.activeVideo) {
      if (previewVideoRef.current) previewVideoRef.current.src = '';
      if (publicVideoRef.current) publicVideoRef.current.src = '';
      return;
    }

    const videoUrl = status.activeVideo.filePath.startsWith('http://') || status.activeVideo.filePath.startsWith('https://')
      ? status.activeVideo.filePath
      : `${SOCKET_URL}/${status.activeVideo.filePath}`;

    const setupPlayer = (videoEl, hlsRef) => {
      if (!videoEl) return;

      const isHls = videoUrl.endsWith('.m3u8') || videoUrl.includes('.m3u8');

      if (isHls) {
        if (Hls.isSupported()) {
          if (hlsRef.current) {
            hlsRef.current.destroy();
          }
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(videoUrl);
          hls.attachMedia(videoEl);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (status.activeVideo.offset) {
              videoEl.currentTime = status.activeVideo.offset;
            }
            videoEl.play().catch(e => console.log("Autoplay blocked:", e));
          });
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = videoUrl;
          videoEl.addEventListener('loadedmetadata', () => {
            if (status.activeVideo.offset) {
              videoEl.currentTime = status.activeVideo.offset;
            }
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
    };

    setupPlayer(previewVideoRef.current, previewHlsRef);
    setupPlayer(publicVideoRef.current, publicHlsRef);

  }, [status.activeVideo?.id, status.activeVideo?.filePath]);

  const handlePlayUnmute = () => {
    setIsMuted(false);
    if (previewVideoRef.current) {
      previewVideoRef.current.play().catch(err => console.log(err));
    }
    if (publicVideoRef.current) {
      publicVideoRef.current.play().catch(err => console.log(err));
    }
  };

  // Connect Socket.io
  useEffect(() => {
    const s = io(SOCKET_URL, { reconnectionAttempts: 5, timeout: 5000 });
    socketRef.current = s;

    s.on('connect', () => console.log('Connected to playout socket'));
    
    s.on('stream_status', (data) => {
      setStatus(data);
      if (data.overlays) {
        setOverlays(prev => ({ ...prev, ...data.overlays }));
      }
    });

    s.on('playlist_updated', (updatedPlaylist) => {
      setPlaylist(updatedPlaylist);
    });

    s.on('overlays_updated', (updatedOverlays) => {
      setOverlays(prev => ({ ...prev, ...updatedOverlays }));
    });

    fetchPlaylist();
    fetchOverlays();

    return () => s.disconnect();
  }, []);

  const fetchPlaylist = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}/api/playlist`);
      const data = await res.json();
      setPlaylist(data);
    } catch (e) {
      console.warn('API Offline, using local data');
    }
  };

  const fetchOverlays = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}/api/overlays`);
      const data = await res.json();
      if (data) {
        setOverlays(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.warn('API Offline, using local overlay config');
    }
  };

  // Immediate state update & DEBOUNCED background save
  const updateOverlayField = (updates, debounce = false) => {
    // 1. Update React state immediately (always synchronous and instant)
    setOverlays(prev => ({
      ...prev,
      ...updates
    }));

    // 2. Handle background API save
    if (debounce) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveConfigToBackend(updates);
      }, 1000); // 1 second debounce
    } else {
      saveConfigToBackend(updates);
    }
  };

  const saveConfigToBackend = (updates) => {
    fetch(`${SOCKET_URL}/api/overlays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }).catch(err => console.warn('Overlay background save offline'));
  };

  // Video file upload
  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', uploadTitle || file.name);

    try {
      const res = await fetch(`${SOCKET_URL}/api/playlist/upload`, {
        method: 'POST',
        body: formData
      });
      const newItem = await res.json();
      setPlaylist(prev => [...prev, newItem]);
      setUploadTitle('');
    } catch (err) {
      console.warn('Upload failed');
    }
  };

  // External live link upload
  const handleAddExternalLink = async () => {
    if (!externalUrl) return;

    try {
      const res = await fetch(`${SOCKET_URL}/api/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: uploadTitle || 'External Live Stream',
          videoUrl: externalUrl,
          duration: 3600, // Default duration for live streams (1 hour)
          orderIndex: playlist.length,
          status: 'active'
        })
      });
      const newItem = await res.json();
      setPlaylist(prev => [...prev, newItem]);
      setExternalUrl('');
      setUploadTitle('');
    } catch (err) {
      console.warn('Failed to add external stream link');
    }
  };

  const handleRemoveVideo = async (id) => {
    // Optimistic UI delete
    setPlaylist(playlist.filter(item => item._id !== id));
    try {
      await fetch(`${SOCKET_URL}/api/playlist/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Delete failed');
    }
  };

  const handleOtsUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    const reader = new FileReader();
    reader.onload = () => {
      updateOverlayField({ otsImagePath: reader.result, otsActive: true });
    };
    reader.readAsDataURL(file);

    try {
      await fetch(`${SOCKET_URL}/api/overlays/upload-ots`, {
        method: 'POST',
        body: formData
      });
    } catch (err) {
      console.warn('OTS Image upload failed');
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col sm:flex-row bg-[#E3E3E3] text-[#333333] font-sans antialiased overflow-x-hidden select-none pb-20 sm:pb-0">
      
      {/* DESKTOP SIDEBAR NAVIGATION */}
      <div className="hidden sm:flex w-16 bg-[#AFAFAF] border-r border-[#969696] flex-col items-center py-6 justify-between shrink-0">
        <div className="flex flex-col gap-6 items-center w-full">
          <div className="text-[10px] font-black text-slate-800 tracking-wider mb-2 text-center uppercase">Site<br/>Logo</div>
          
          <button 
            onClick={() => setActiveTab('admin')} 
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${activeTab === 'admin' ? 'bg-[#ECECEC] text-[#4A4A4A] shadow-inner border border-slate-300' : 'text-[#ECECEC] hover:bg-[#BDBDBD]'}`}
          >
            <Home className="w-6 h-6" />
          </button>
          
          <button 
            onClick={() => setActiveTab('public')} 
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${activeTab === 'public' ? 'bg-[#ECECEC] text-[#4A4A4A] shadow-inner border border-slate-300' : 'text-[#ECECEC] hover:bg-[#BDBDBD]'}`}
          >
            <Folder className="w-6 h-6" />
          </button>
        </div>
        
        <button className="w-12 h-12 rounded-full flex items-center justify-center text-[#ECECEC] hover:bg-[#BDBDBD] transition-all">
          <Settings className="w-6 h-6" />
        </button>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="flex sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#AFAFAF] border-t border-[#969696] z-50 items-center justify-around px-4 shadow-lg">
        <button 
          onClick={() => setActiveTab('admin')} 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl ${activeTab === 'admin' ? 'bg-[#ECECEC] text-[#4A4A4A] border border-slate-300' : 'text-[#ECECEC]'}`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5">Admin</span>
        </button>
        <button 
          onClick={() => setActiveTab('public')} 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl ${activeTab === 'public' ? 'bg-[#ECECEC] text-[#4A4A4A] border border-slate-300' : 'text-[#ECECEC]'}`}
        >
          <Folder className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5">Viewer</span>
        </button>
        <button className="flex flex-col items-center justify-center w-12 h-12 text-[#ECECEC]">
          <Settings className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5">Config</span>
        </button>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto">
        
        {/* Top Bar for View Toggle */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 max-w-7xl w-full mx-auto">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-wider">IPTV STREAM CONTROL CENTER</h2>
          </div>
          <button 
            onClick={() => setActiveTab(activeTab === 'admin' ? 'public' : 'admin')} 
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-[#5367B5] hover:bg-[#46579E] text-white font-bold text-sm tracking-wide shadow-md transition-all text-center"
          >
            {activeTab === 'admin' ? 'Go to Public Viewer Page' : 'Return to Admin Panel'}
          </button>
        </div>

        {activeTab === 'admin' ? (
          /* ADMIN DASHBOARD */
          <div className="grid grid-cols-1 md:grid-cols-12 lg:grid-cols-12 gap-6 sm:gap-8 max-w-7xl w-full mx-auto">
            
            {/* COLUMN 1: LIVE PREVIEW & CONTROLS */}
            <div className="md:col-span-6 lg:col-span-4 flex flex-col gap-6">
              
              {/* Live Preview Screen */}
              <div className="bg-[#ECECEC] rounded-xl p-4 sm:p-5 shadow-sm border border-white/60">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs sm:text-sm font-extrabold text-[#333333] uppercase tracking-wide">Live Preview</span>
                  <button className="px-2.5 py-1 rounded bg-[#C92C2C] text-white font-bold text-[9px] sm:text-[10px] tracking-widest flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 fill-white text-[#C92C2C]" />
                    BROADCAST HALT
                  </button>
                </div>

                {/* Simulated screen box */}
                <div className="aspect-video w-full bg-black rounded-lg border border-[#50BF7B] relative overflow-hidden flex flex-col justify-between p-3.5 shadow-inner">
                  {status.activeVideo ? (
                    <video 
                      ref={previewVideoRef} 
                      className="absolute inset-0 w-full h-full object-cover z-0" 
                      playsInline 
                      muted={isMuted}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[#66DE93] z-0" />
                  )}

                  {/* Play/Unmute Button overlay */}
                  {isMuted && status.activeVideo && (
                    <button 
                      onClick={handlePlayUnmute}
                      className="absolute inset-0 w-full h-full bg-black/40 flex flex-col items-center justify-center gap-2 text-white font-bold text-xs transition-all hover:bg-black/50 z-10 cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#5367B5] flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 fill-white text-white ml-1" />
                      </div>
                      <span>Click to Play / Unmute Preview</span>
                    </button>
                  )}

                  <div className="px-2 py-1 bg-slate-900/60 rounded text-[9px] font-bold text-white self-start z-20">
                    Logo
                  </div>

                  {/* OTS Overlay - TRANSPARENT BACKGROUND (No border/bg) */}
                  {overlays.otsActive && overlays.otsImagePath && (
                    <div className="absolute right-3 bottom-12 w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center p-0 overflow-hidden bg-transparent z-20">
                      <img src={overlays.otsImagePath.startsWith('data:') ? overlays.otsImagePath : `${SOCKET_URL}/${overlays.otsImagePath}`} alt="OTS" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}

                  {/* Overlay text banners */}
                  <div className="w-full mt-auto flex flex-col gap-1 text-[7px] font-bold text-slate-900 select-none z-20">
                    {overlays.ticker1Active && (
                      <div className="w-full border-t border-slate-700/30 flex justify-between py-1 bg-slate-900/10 px-2 font-mono items-center overflow-hidden">
                        <div className="flex gap-2 flex-1 min-w-0 mr-4">
                          <span>{overlays.ticker1Title}:</span>
                          <marquee className="font-normal flex-1" scrollamount="2">{overlays.ticker1Text}</marquee>
                        </div>
                      </div>
                    )}
                    {overlays.ticker2Active && (
                      <div className="w-full border-t border-slate-700/30 flex justify-between py-1 bg-slate-900/10 px-2 font-mono items-center overflow-hidden">
                        <div className="flex gap-2 flex-1 min-w-0 mr-4">
                          <span>{overlays.ticker2Title}:</span>
                          <marquee className="font-normal flex-1" scrollamount="2.5">{overlays.ticker2Text}</marquee>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Floating Time and Date display box (Independent of tickers) */}
                  <div className="absolute right-3.5 top-10 flex flex-col gap-1 text-[8px] font-bold font-mono text-slate-800 bg-slate-950/10 px-2 py-1 rounded select-none text-right z-20">
                    {overlays.showTime && <div>{currentTimeStr || 'Time'}</div>}
                    {overlays.showDate && <div>{currentDateStr || 'Date'}</div>}
                  </div>
                </div>

                {/* External Live Stream button row */}
                <div className="mt-4 flex flex-col gap-2 bg-[#ECECEC] rounded-xl p-3 border border-white/40">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Paste RTMP / HLS Stream URL (.m3u8)" 
                      value={externalUrl} 
                      onChange={(e) => setExternalUrl(e.target.value)}
                      className="flex-1 bg-white border border-[#CCCCCC] rounded-lg px-3 py-1.5 text-xs text-[#333333] outline-none"
                    />
                    <button 
                      onClick={handleAddExternalLink}
                      className="px-4 py-1.5 rounded-lg bg-[#5367B5] hover:bg-[#46579E] text-white font-bold text-xs tracking-wide transition-all shadow-sm"
                    >
                      Connect
                    </button>
                  </div>
                  <button className="w-full py-2 rounded-lg bg-[#DCDCDC] hover:bg-[#D0D0D0] text-[#333333] border border-[#C5C5C5] flex items-center justify-center gap-1 text-xs font-bold transition-all shadow-sm">
                    <ArrowUp className="w-3.5 h-3.5 stroke-[3]" />
                    Push External Stream Live
                  </button>
                </div>
              </div>

              {/* Insert Now Component */}
              <label className="bg-white rounded-xl p-6 shadow-sm border border-slate-200/60 flex flex-col items-center justify-center text-center gap-4 py-8 sm:aspect-[4/3] cursor-pointer hover:bg-slate-50/50 transition-all">
                <Upload className="w-10 h-10 sm:w-12 sm:h-12 text-[#333333] stroke-[1.5]" />
                <span className="text-base sm:text-lg font-bold text-[#333333]">Insert Now</span>
                <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
              </label>

            </div>

            {/* COLUMN 2: NEWS TICKERS & OTS CONFIGURATION */}
            <div className="md:col-span-6 lg:col-span-4 flex flex-col gap-6">
              
              {/* News Tickers config */}
              <div className="bg-[#ECECEC] rounded-xl p-4 sm:p-5 shadow-sm border border-white/60 flex flex-col gap-5">
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm font-extrabold text-[#333333] uppercase tracking-wide">News Ticker</span>
                  <button className="w-6 h-6 rounded-full bg-[#E95C5C]/20 hover:bg-[#E95C5C]/35 text-[#C92C2C] flex items-center justify-center transition-all">
                    <Play className="w-3.5 h-3.5 fill-[#C92C2C] stroke-none" />
                  </button>
                </div>

                {/* News Ticker 1 */}
                <div className="bg-[#969696] rounded-xl p-4 flex flex-col gap-3">
                  <span className="text-xs font-bold text-[#ECECEC] tracking-wide text-center">News Ticker -1</span>
                  <input 
                    type="text" 
                    placeholder="Title Card" 
                    value={overlays.ticker1Title || ''} 
                    onChange={(e) => updateOverlayField({ ticker1Title: e.target.value }, true)}
                    className="bg-[#D9D9D9] border-none rounded-lg px-3.5 py-2 text-xs text-[#333333] outline-none font-semibold placeholder:text-[#888888] w-full"
                  />
                  <input 
                    type="text" 
                    placeholder="Headline Text" 
                    value={overlays.ticker1Text || ''} 
                    onChange={(e) => updateOverlayField({ ticker1Text: e.target.value }, true)}
                    className="bg-[#D9D9D9] border-none rounded-lg px-3.5 py-2 text-xs text-[#333333] outline-none font-semibold placeholder:text-[#888888] w-full"
                  />
                  <button 
                    onClick={() => updateOverlayField({ ticker1Active: !overlays.ticker1Active })}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${overlays.ticker1Active ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-all ${overlays.ticker1Active ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </button>
                </div>

                {/* News Ticker 2 */}
                <div className="bg-[#969696] rounded-xl p-4 flex flex-col gap-3">
                  <span className="text-xs font-bold text-[#ECECEC] tracking-wide text-center">News Ticker -2</span>
                  <input 
                    type="text" 
                    placeholder="Title Card" 
                    value={overlays.ticker2Title || ''} 
                    onChange={(e) => updateOverlayField({ ticker2Title: e.target.value }, true)}
                    className="bg-[#D9D9D9] border-none rounded-lg px-3.5 py-2 text-xs text-[#333333] outline-none font-semibold placeholder:text-[#888888] w-full"
                  />
                  <input 
                    type="text" 
                    placeholder="Headline Text" 
                    value={overlays.ticker2Text || ''} 
                    onChange={(e) => updateOverlayField({ ticker2Text: e.target.value }, true)}
                    className="bg-[#D9D9D9] border-none rounded-lg px-3.5 py-2 text-xs text-[#333333] outline-none font-semibold placeholder:text-[#888888] w-full"
                  />
                  <button 
                    onClick={() => updateOverlayField({ ticker2Active: !overlays.ticker2Active })}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${overlays.ticker2Active ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-all ${overlays.ticker2Active ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </button>
                </div>

                {/* Time and Date Toggles */}
                <div className="flex flex-col gap-3">
                  <span className="text-[11px] font-bold text-[#666666] tracking-wide text-center">Time and Date</span>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 bg-[#D9D9D9] rounded-xl px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#333333]">Time</span>
                      <button 
                        onClick={() => updateOverlayField({ showTime: !overlays.showTime })}
                        className={`w-8 h-4 rounded-full p-0.5 transition-all ${overlays.showTime ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full transition-all ${overlays.showTime ? 'translate-x-4' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    <div className="flex-1 bg-[#D9D9D9] rounded-xl px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#333333]">Date</span>
                      <button 
                        onClick={() => updateOverlayField({ showDate: !overlays.showDate })}
                        className={`w-8 h-4 rounded-full p-0.5 transition-all ${overlays.showDate ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full transition-all ${overlays.showDate ? 'translate-x-4' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* OTS Graphic config */}
              <div className="bg-[#ECECEC] rounded-xl p-4 sm:p-5 shadow-sm border border-white/60 flex flex-col gap-4">
                <span className="text-xs sm:text-sm font-extrabold text-[#333333] uppercase tracking-wide">OTS Graphic</span>
                <div className="bg-[#969696] rounded-xl p-4 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 flex flex-col gap-2.5">
                    <label className="py-2.5 rounded-lg bg-[#ECECEC] hover:bg-[#DFDFDF] text-[#333333] font-bold text-xs tracking-wide cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-sm">
                      <Upload className="w-3.5 h-3.5 stroke-[3]" />
                      Upload
                      <input type="file" accept="image/*" onChange={handleOtsUpload} className="hidden" />
                    </label>
                    <button className="py-2.5 rounded-lg bg-[#ECECEC] hover:bg-[#DFDFDF] text-[#333333] font-bold text-xs tracking-wide flex items-center justify-center gap-1 shadow-sm">
                      <ArrowUp className="w-3.5 h-3.5 rotate-135 stroke-[3]" />
                      Bottom Right
                    </button>
                  </div>
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#B3B3B3] rounded-lg border border-white/30 flex items-center justify-center p-2 shadow-inner overflow-hidden mx-auto sm:mx-0">
                    {overlays.otsImagePath ? (
                      <img src={overlays.otsImagePath.startsWith('data:') ? overlays.otsImagePath : `${SOCKET_URL}/${overlays.otsImagePath}`} alt="OTS" className="max-w-full max-h-full object-contain rounded" />
                    ) : (
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Preview</span>
                    )}
                  </div>
                </div>
                
                {/* Enable OTS toggle */}
                <button 
                  onClick={() => updateOverlayField({ otsActive: !overlays.otsActive })}
                  className={`w-12 h-6 rounded-full p-1 self-end transition-all ${overlays.otsActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-all ${overlays.otsActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>

            </div>

            {/* COLUMN 3: VIDEO PLAYLIST SERIAL */}
            <div className="md:col-span-12 lg:col-span-4 flex flex-col gap-6">
              
              {/* Video Playlist Serial container */}
              <div className="bg-[#ECECEC] rounded-xl p-4 sm:p-5 shadow-sm border border-white/60 flex flex-col gap-4 flex-1">
                <span className="text-xs sm:text-sm font-extrabold text-[#333333] uppercase tracking-wide">Video Playlist Serial</span>
                
                {/* Table headers */}
                <div className="grid grid-cols-12 text-center text-[9px] sm:text-[10px] font-bold text-[#666666] tracking-widest pb-1 border-b border-[#CCCCCC] select-none">
                  <div className="col-span-6 text-left pl-7">TITLE</div>
                  <div className="col-span-2">LEFT</div>
                  <div className="col-span-2">LEFT</div>
                  <div className="col-span-2">ACTIONS</div>
                </div>

                {/* List rows */}
                <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[300px] sm:max-h-[350px] pr-1">
                  {playlist.map((video, idx) => (
                    <div key={video._id} className="grid grid-cols-12 items-center bg-white rounded-lg p-2 sm:p-2.5 border border-slate-200/50 shadow-sm text-center">
                      <div className="col-span-6 flex items-center gap-1.5 sm:gap-2 text-left min-w-0">
                        <button className="text-slate-400 hover:text-slate-600">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-[#B3B3B3] shrink-0"></div>
                        <span className="text-xs font-bold text-[#333333] truncate pr-1">{video.title}</span>
                      </div>
                      
                      {/* Left timer columns */}
                      <div className="col-span-2 text-[9px] sm:text-[10px] font-bold text-[#50BF7B] tracking-wider">
                        {formatTime(video.duration)}
                      </div>
                      <div className="col-span-2 text-[9px] sm:text-[10px] font-bold text-[#C92C2C] tracking-wider">
                        {idx === 0 ? '11:23:46' : '12:23:46'}
                      </div>
                      
                      <div className="col-span-2 flex items-center justify-center">
                        <button 
                          onClick={() => handleRemoveVideo(video._id)}
                          className="text-[#C92C2C] hover:text-[#AC2323] transition-all"
                        >
                          <XCircle className="w-5 h-5 sm:w-6 sm:h-6 fill-[#C92C2C] text-white" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {playlist.length === 0 && (
                    <div className="text-center py-8 text-xs text-slate-500 font-bold">
                      Playlist is empty. Add videos or live stream URLs.
                    </div>
                  )}
                </div>

                {/* Add Video button mockup */}
                <div className="flex flex-col gap-2">
                  <input 
                    type="text" 
                    placeholder="Enter video title (optional)" 
                    value={uploadTitle} 
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="bg-[#D9D9D9] border-none rounded-lg px-3 py-1.5 text-xs text-[#333333] outline-none w-full"
                  />
                  <label className="py-3 rounded-lg bg-[#DFDFDF] hover:bg-[#D5D5D5] text-[#333333] font-bold text-xs tracking-widest flex items-center justify-center gap-2 border border-[#C5C5C5] transition-all shadow-sm cursor-pointer w-full">
                    <Upload className="w-4 h-4 stroke-[3]" />
                    Add Video
                    <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
                  </label>
                </div>
              </div>

            </div>

          </div>
        ) : (
          /* VIEWER MODE */
          <div className="flex flex-col items-center justify-center p-2 sm:p-8 bg-slate-900 min-h-[60vh] sm:min-h-[80vh] rounded-2xl border border-slate-800 max-w-7xl w-full mx-auto">
            <div className="w-full max-w-4xl bg-black rounded-xl overflow-hidden shadow-2xl relative">
              <div className="aspect-video w-full bg-black relative overflow-hidden flex flex-col justify-between p-4 sm:p-6">
                {status.activeVideo ? (
                  <video 
                    ref={publicVideoRef} 
                    className="absolute inset-0 w-full h-full object-cover z-0" 
                    playsInline 
                    muted={isMuted}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#66DE93] z-0" />
                )}

                {/* Play/Unmute Button overlay */}
                {isMuted && status.activeVideo && (
                  <button 
                    onClick={handlePlayUnmute}
                    className="absolute inset-0 w-full h-full bg-black/60 flex flex-col items-center justify-center gap-3 text-white font-bold text-sm transition-all hover:bg-black/75 z-10 cursor-pointer"
                  >
                    <div className="w-16 h-16 rounded-full bg-[#5367B5] flex items-center justify-center shadow-2xl">
                      <Play className="w-8 h-8 fill-white text-white ml-1.5" />
                    </div>
                    <span>Click to Unmute / Play Linear Stream</span>
                  </button>
                )}

                {/* Site Logo */}
                <div className="px-2 py-1 sm:px-3 sm:py-1.5 bg-slate-900/60 rounded text-[10px] sm:text-xs font-bold text-white self-start z-20">
                  Logo
                </div>

                {/* OTS graphic overlay in public player - TRANSPARENT BACKGROUND (No border/bg) */}
                {overlays.otsActive && overlays.otsImagePath && (
                  <div className="absolute right-4 bottom-14 sm:right-6 sm:bottom-16 w-24 sm:w-36 aspect-square flex items-center justify-center overflow-hidden bg-transparent z-20">
                    <img src={overlays.otsImagePath.startsWith('data:') ? overlays.otsImagePath : `${SOCKET_URL}/${overlays.otsImagePath}`} alt="OTS" className="max-w-full max-h-full object-contain" />
                  </div>
                )}

                {/* Overlay text banners with scrolling marquee */}
                <div className="w-full mt-auto flex flex-col gap-1.5 sm:gap-2 font-bold text-slate-900 text-[10px] sm:text-xs select-none z-20">
                  {overlays.ticker1Active && (
                    <div className="w-full bg-slate-950/80 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border-l-4 border-[#50BF7B] flex justify-between items-center shadow-lg font-mono overflow-hidden">
                      <div className="flex gap-2 flex-1 min-w-0 mr-4">
                        <span>{overlays.ticker1Title}:</span>
                        <marquee className="font-normal flex-1" scrollamount="2">{overlays.ticker1Text}</marquee>
                      </div>
                    </div>
                  )}
                  {overlays.ticker2Active && (
                    <div className="w-full bg-slate-950/80 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border-l-4 border-[#C92C2C] flex justify-between items-center shadow-lg font-mono overflow-hidden">
                      <div className="flex gap-2 flex-1 min-w-0 mr-4">
                        <span>{overlays.ticker2Title}:</span>
                        <marquee className="font-normal flex-1" scrollamount="2.5">{overlays.ticker2Text}</marquee>
                      </div>
                    </div>
                  )}
                </div>

                {/* Floating Time and Date display box (Independent of tickers) */}
                <div className="absolute right-4 top-14 sm:right-6 sm:top-16 flex flex-col gap-1 text-[10px] sm:text-xs font-bold font-mono text-white bg-slate-950/80 px-3 py-1.5 rounded-md shadow-md select-none text-right z-20">
                  {overlays.showTime && <div>{currentTimeStr}</div>}
                  {overlays.showDate && <div>{currentDateStr}</div>}
                </div>

              </div>

              <div className="bg-slate-800 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between border-t border-slate-700">
                <span className="text-xs sm:text-sm font-bold text-slate-300">Live Linear Broadcast (24/7 View Mode)</span>
                <button 
                  onClick={() => setActiveTab('admin')} 
                  className="px-3 py-1.5 bg-[#5367B5] hover:bg-[#46579E] rounded text-[10px] sm:text-xs font-bold text-white transition-all"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom section: Video Gallery folder tabs */}
        {activeTab === 'admin' && (
          <div className="w-full max-w-7xl mx-auto mt-8">
            <div className="inline-flex">
              <div className="px-6 py-2.5 rounded-t-xl bg-white border-t border-x border-slate-200/60 font-bold text-xs tracking-wider text-slate-800">
                Video Gallery
              </div>
            </div>
            <div className="bg-white rounded-b-xl rounded-tr-xl p-6 border border-slate-200/60 shadow-sm min-h-[120px] flex flex-col gap-4">
              <span className="text-xs font-bold text-[#666666] tracking-wider border-b pb-1">News</span>
              <div className="flex gap-4">
                {/* Gallery item mocks */}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
