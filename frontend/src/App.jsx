import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
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

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://iptv-broadcast-backend.onrender.com';

function App() {
  const [activeTab, setActiveTab] = useState('admin');
  const [playlist, setPlaylist] = useState([
    { _id: '1', title: 'Video Title', duration: 44626, status: 'active', orderIndex: 0 },
    { _id: '2', title: 'Video Title', duration: 44626, status: 'active', orderIndex: 1 },
    { _id: '3', title: 'Video Title', duration: 44626, status: 'active', orderIndex: 2 },
    { _id: '4', title: 'Video Title', duration: 44626, status: 'active', orderIndex: 3 },
    { _id: '5', title: 'Video Title', duration: 44626, status: 'active', orderIndex: 4 },
    { _id: '6', title: 'Video Title', duration: 44626, status: 'active', orderIndex: 5 },
    { _id: '7', title: 'Video Title', duration: 44626, status: 'active', orderIndex: 6 },
    { _id: '8', title: 'Video Title', duration: 44626, status: 'active', orderIndex: 7 }
  ]);
  
  const [overlays, setOverlays] = useState({
    ticker1Text: 'Headline News 1',
    ticker1Title: 'Title Card',
    ticker1Active: false,
    ticker2Text: 'Headline News 2',
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
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');
  const socketRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Live time and date updater
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentTimeStr(d.toLocaleTimeString());
      setCurrentDateStr(d.toLocaleDateString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      if (data && data.length > 0) {
        setPlaylist(data);
      }
    } catch (e) {
      console.warn('API Offline, using mock playlist data');
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
      console.warn('API Offline, using mock overlay config');
    }
  };

  const updateOverlayField = (updates, debounce = false) => {
    setOverlays(prev => ({
      ...prev,
      ...updates
    }));

    if (debounce) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveConfigToBackend(updates);
      }, 1000);
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

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', uploadTitle || file.name);

    const tempItem = {
      _id: Date.now().toString(),
      title: uploadTitle || file.name,
      duration: 30,
      status: 'active',
      orderIndex: playlist.length
    };
    setPlaylist([...playlist, tempItem]);
    setUploadTitle('');

    try {
      const res = await fetch(`${SOCKET_URL}/api/playlist/upload`, {
        method: 'POST',
        body: formData
      });
      const newItem = await res.json();
      setPlaylist(prev => prev.map(item => item._id === tempItem._id ? newItem : item));
    } catch (err) {
      console.warn('Upload failed, retaining local item');
    }
  };

  const handleRemoveVideo = async (id) => {
    setPlaylist(playlist.filter(item => item._id !== id));
    try {
      await fetch(`${SOCKET_URL}/api/playlist/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Delete failed, local UI cleaned');
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
      console.warn('OTS Image upload failed, keeping local preview');
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
                <div className="aspect-video w-full bg-[#66DE93] rounded-lg border border-[#50BF7B] relative overflow-hidden flex flex-col justify-between p-3.5 shadow-inner">
                  <div className="px-2 py-1 bg-slate-900/60 rounded text-[9px] font-bold text-white self-start">
                    Logo
                  </div>

                  {/* OTS Overlay - TRANSPARENT BACKGROUND (No border/bg) */}
                  {overlays.otsActive && (
                    <div className="absolute right-3 bottom-12 w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center p-0 overflow-hidden bg-transparent">
                      {overlays.otsImagePath ? (
                        <img src={overlays.otsImagePath.startsWith('data:') ? overlays.otsImagePath : `${SOCKET_URL}/${overlays.otsImagePath}`} alt="OTS" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <div className="w-full h-full bg-[#B3B3B3]/40 rounded border border-white/20 flex items-center justify-center text-[7px] font-bold text-slate-800 uppercase">OTS</div>
                      )}
                    </div>
                  )}

                  {/* Overlay text banners */}
                  <div className="w-full mt-auto flex flex-col gap-1 text-[7px] font-bold text-slate-900 select-none">
                    {overlays.ticker1Active && (
                      <div className="w-full border-t border-slate-700/30 flex justify-between py-1 bg-slate-900/10 px-2 font-mono items-center overflow-hidden">
                        <div className="flex gap-2 flex-1 min-w-0 mr-4">
                          <span>{overlays.ticker1Title}:</span>
                          <marquee className="font-normal flex-1" scrollamount="2">{overlays.ticker1Text}</marquee>
                        </div>
                        {overlays.showTime && <span className="shrink-0">{currentTimeStr || 'Time'}</span>}
                      </div>
                    )}
                    {overlays.ticker2Active && (
                      <div className="w-full border-t border-slate-700/30 flex justify-between py-1 bg-slate-900/10 px-2 font-mono items-center overflow-hidden">
                        <div className="flex gap-2 flex-1 min-w-0 mr-4">
                          <span>{overlays.ticker2Title}:</span>
                          <marquee className="font-normal flex-1" scrollamount="2.5">{overlays.ticker2Text}</marquee>
                        </div>
                        {overlays.showDate && <span className="shrink-0">{currentDateStr || 'Date'}</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* External Live Stream button row */}
                <div className="mt-4 flex gap-2">
                  <button className="flex-1 py-2.5 rounded-lg bg-[#5367B5] hover:bg-[#46579E] text-white font-bold text-xs tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-sm">
                    External Live Stream
                  </button>
                  <button className="px-3 rounded-lg bg-[#DCDCDC] hover:bg-[#D0D0D0] text-[#333333] border border-[#C5C5C5] flex items-center justify-center transition-all shadow-sm">
                    <ArrowUp className="w-4 h-4 stroke-[3]" />
                  </button>
                </div>
              </div>

              {/* Insert Now Component */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200/60 flex flex-col items-center justify-center text-center gap-4 py-8 sm:aspect-[4/3] cursor-pointer hover:bg-slate-50/50 transition-all">
                <Upload className="w-10 h-10 sm:w-12 sm:h-12 text-[#333333] stroke-[1.5]" />
                <span className="text-base sm:text-lg font-bold text-[#333333]">Insert Now</span>
              </div>

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
              <div className="aspect-video w-full bg-[#66DE93] relative overflow-hidden flex flex-col justify-between p-4 sm:p-6">
                
                {/* Site Logo */}
                <div className="px-2 py-1 sm:px-3 sm:py-1.5 bg-slate-900/60 rounded text-[10px] sm:text-xs font-bold text-white self-start">
                  Logo
                </div>

                {/* OTS graphic overlay in public player - TRANSPARENT BACKGROUND (No border/bg) */}
                {overlays.otsActive && overlays.otsImagePath && (
                  <div className="absolute right-4 bottom-14 sm:right-6 sm:bottom-16 w-24 sm:w-36 aspect-square flex items-center justify-center overflow-hidden bg-transparent">
                    <img src={overlays.otsImagePath.startsWith('data:') ? overlays.otsImagePath : `${SOCKET_URL}/${overlays.otsImagePath}`} alt="OTS" className="max-w-full max-h-full object-contain" />
                  </div>
                )}

                {/* Overlay text banners with scrolling marquee */}
                <div className="w-full mt-auto flex flex-col gap-1.5 sm:gap-2 font-bold text-slate-900 text-[10px] sm:text-xs select-none">
                  {overlays.ticker1Active && (
                    <div className="w-full bg-slate-950/80 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border-l-4 border-[#50BF7B] flex justify-between items-center shadow-lg font-mono overflow-hidden">
                      <div className="flex gap-2 flex-1 min-w-0 mr-4">
                        <span>{overlays.ticker1Title}:</span>
                        <marquee className="font-normal flex-1" scrollamount="2">{overlays.ticker1Text}</marquee>
                      </div>
                      {overlays.showTime && <span className="text-emerald-400 font-bold shrink-0">{currentTimeStr}</span>}
                    </div>
                  )}
                  {overlays.ticker2Active && (
                    <div className="w-full bg-slate-950/80 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border-l-4 border-[#C92C2C] flex justify-between items-center shadow-lg font-mono overflow-hidden">
                      <div className="flex gap-2 flex-1 min-w-0 mr-4">
                        <span>{overlays.ticker2Title}:</span>
                        <marquee className="font-normal flex-1" scrollamount="2.5">{overlays.ticker2Text}</marquee>
                      </div>
                      {overlays.showDate && <span className="text-emerald-400 font-bold shrink-0">{currentDateStr}</span>}
                    </div>
                  )}
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
