import React, { useState, useEffect } from 'react';
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
  MoreVertical,
  Plus
} from 'lucide-react';

const SOCKET_URL = 'http://localhost:5000';

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
    ticker1Text: 'Headline Text',
    ticker1Title: 'Title Card',
    ticker1Active: true,
    ticker2Text: 'Headline Text',
    ticker2Title: 'Title Card',
    ticker2Active: false,
    otsImagePath: '',
    otsActive: true,
    showTime: true,
    showDate: true
  });

  const [socket, setSocket] = useState(null);
  const [ticker1TitleInput, setTicker1TitleInput] = useState('Title Card');
  const [ticker1TextInput, setTicker1TextInput] = useState('Headline Text');
  const [ticker2TitleInput, setTicker2TitleInput] = useState('Title Card');
  const [ticker2TextInput, setTicker2TextInput] = useState('Headline Text');

  // Connect Socket.io
  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);

    s.on('connect', () => console.log('Connected to playout socket'));
    
    s.on('stream_status', (data) => {
      if (data.overlays) {
        setOverlays(prev => ({
          ...prev,
          ...data.overlays
        }));
      }
    });

    s.on('playlist_updated', (updatedPlaylist) => {
      setPlaylist(updatedPlaylist);
    });

    s.on('overlays_updated', (updatedOverlays) => {
      setOverlays(prev => ({
        ...prev,
        ...updatedOverlays
      }));
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
      console.error(e);
    }
  };

  const fetchOverlays = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}/api/overlays`);
      const data = await res.json();
      if (data) {
        setOverlays(prev => ({ ...prev, ...data }));
        setTicker1TitleInput(data.ticker1Title || 'Title Card');
        setTicker1TextInput(data.ticker1Text || 'Headline Text');
        setTicker2TitleInput(data.ticker2Title || 'Title Card');
        setTicker2TextInput(data.ticker2Text || 'Headline Text');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveTickerSettings = async (updates) => {
    try {
      const res = await fetch(`${SOCKET_URL}/api/overlays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      setOverlays(prev => ({ ...prev, ...data }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleOtsUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(`${SOCKET_URL}/api/overlays/upload-ots`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setOverlays(prev => ({ ...prev, ...data }));
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex bg-[#E3E3E3] text-[#333333] font-sans antialiased overflow-x-hidden select-none">
      
      {/* LEFT SIDEBAR NAVIGATION */}
      <div className="w-16 bg-[#AFAFAF] border-r border-[#969696] flex flex-col items-center py-6 justify-between shrink-0">
        <div className="flex flex-col gap-6 items-center w-full">
          {/* Logo container */}
          <div className="text-sm font-bold text-slate-800 tracking-wider mb-2">Site Logo</div>
          
          <button 
            onClick={() => setActiveTab('admin')} 
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${activeTab === 'admin' ? 'bg-[#ECECEC] text-[#4A4A4A] shadow-inner' : 'text-[#ECECEC] hover:bg-[#BDBDBD]'}`}
          >
            <Home className="w-6 h-6" />
          </button>
          
          <button 
            onClick={() => setActiveTab('public')} 
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${activeTab === 'public' ? 'bg-[#ECECEC] text-[#4A4A4A] shadow-inner' : 'text-[#ECECEC] hover:bg-[#BDBDBD]'}`}
          >
            <Folder className="w-6 h-6" />
          </button>
        </div>
        
        <button className="w-12 h-12 rounded-full flex items-center justify-center text-[#ECECEC] hover:bg-[#BDBDBD] transition-all">
          <Settings className="w-6 h-6" />
        </button>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col p-8 overflow-y-auto">
        {activeTab === 'admin' ? (
          /* ADMIN DASHBOARD */
          <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto">
            {/* Top Bar for View Toggle */}
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black text-slate-800 tracking-wider">IPTV STREAM CONTROL CENTER</h2>
              <button 
                onClick={() => setActiveTab('public')} 
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm tracking-wide shadow-md transition-all"
              >
                Go to Public Viewer Page
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* COLUMN 1: LIVE PREVIEW & CONTROLS (cols 4) */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* Live Preview Screen */}
                <div className="bg-[#ECECEC] rounded-xl p-5 shadow-sm border border-white/60">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-extrabold text-[#333333] uppercase tracking-wide">Live Preview</span>
                    <button className="px-3 py-1 rounded bg-[#C92C2C] text-white font-bold text-[10px] tracking-widest flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 fill-white text-[#C92C2C]" />
                      BROADCAST HALT
                    </button>
                  </div>

                  {/* Simulated screen box */}
                  <div className="aspect-video w-full bg-[#66DE93] rounded-lg border border-[#50BF7B] relative overflow-hidden flex flex-col justify-between p-3.5 select-none shadow-inner">
                    {/* Top logo */}
                    <div className="px-2 py-1 bg-slate-900/60 rounded text-[9px] font-bold text-white self-start">
                      Logo
                    </div>

                    {/* OTS inside green preview screen */}
                    {overlays.otsActive && (
                      <div className="absolute right-3 bottom-12 w-16 aspect-square bg-[#B3B3B3] rounded border border-white/40 flex items-center justify-center p-1 text-[8px] font-bold font-mono text-slate-800 text-center uppercase shadow">
                        OTS Graphic
                      </div>
                    )}

                    {/* Overlay texts banner preview inside green player */}
                    <div className="w-full mt-auto flex flex-col gap-1 text-[7px] font-bold text-slate-900 select-none">
                      <div className="w-full border-t border-slate-700/30 flex justify-between py-1 bg-slate-900/10 px-2 font-mono">
                        <div className="flex gap-2">
                          <span>{overlays.ticker1Title}:</span>
                          <span className="font-normal">{overlays.ticker1Text}</span>
                        </div>
                        {overlays.showTime && <span>Time</span>}
                      </div>
                      <div className="w-full border-t border-slate-700/30 flex justify-between py-1 bg-slate-900/10 px-2 font-mono">
                        <div className="flex gap-2">
                          <span>{overlays.ticker2Title}:</span>
                          <span className="font-normal">{overlays.ticker2Text}</span>
                        </div>
                        {overlays.showDate && <span>Date</span>}
                      </div>
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
                <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200/60 flex flex-col items-center justify-center text-center gap-4 aspect-[4/3] cursor-pointer hover:bg-slate-50/50 transition-all">
                  <Upload className="w-12 h-12 text-[#333333] stroke-[1.5]" />
                  <span className="text-lg font-bold text-[#333333]">Insert Now</span>
                </div>

              </div>

              {/* COLUMN 2: NEWS TICKERS & OTS CONFIGURATION (cols 4) */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* News Tickers config */}
                <div className="bg-[#ECECEC] rounded-xl p-5 shadow-sm border border-white/60 flex flex-col gap-5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-extrabold text-[#333333] uppercase tracking-wide">News Ticker</span>
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
                      value={ticker1TitleInput} 
                      onChange={(e) => setTicker1TitleInput(e.target.value)}
                      onBlur={() => saveTickerSettings({ ticker1Title: ticker1TitleInput })}
                      className="bg-[#D9D9D9] border-none rounded-lg px-3.5 py-2 text-xs text-[#333333] outline-none font-semibold placeholder:text-[#888888]"
                    />
                    <input 
                      type="text" 
                      placeholder="Headline Text" 
                      value={ticker1TextInput} 
                      onChange={(e) => setTicker1TextInput(e.target.value)}
                      onBlur={() => saveTickerSettings({ ticker1Text: ticker1TextInput })}
                      className="bg-[#D9D9D9] border-none rounded-lg px-3.5 py-2 text-xs text-[#333333] outline-none font-semibold placeholder:text-[#888888]"
                    />
                    <button 
                      onClick={() => saveTickerSettings({ ticker1Active: !overlays.ticker1Active })}
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
                      value={ticker2TitleInput} 
                      onChange={(e) => setTicker2TitleInput(e.target.value)}
                      onBlur={() => saveTickerSettings({ ticker2Title: ticker2TitleInput })}
                      className="bg-[#D9D9D9] border-none rounded-lg px-3.5 py-2 text-xs text-[#333333] outline-none font-semibold placeholder:text-[#888888]"
                    />
                    <input 
                      type="text" 
                      placeholder="Headline Text" 
                      value={ticker2TextInput} 
                      onChange={(e) => setTicker2TextInput(e.target.value)}
                      onBlur={() => saveTickerSettings({ ticker2Text: ticker2TextInput })}
                      className="bg-[#D9D9D9] border-none rounded-lg px-3.5 py-2 text-xs text-[#333333] outline-none font-semibold placeholder:text-[#888888]"
                    />
                    <button 
                      onClick={() => saveTickerSettings({ ticker2Active: !overlays.ticker2Active })}
                      className={`w-12 h-6 rounded-full p-1 transition-all ${overlays.ticker2Active ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-all ${overlays.ticker2Active ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                  </div>

                  {/* Time and Date Toggles */}
                  <div className="flex flex-col gap-3">
                    <span className="text-[11px] font-bold text-[#666666] tracking-wide text-center">Time and Date</span>
                    <div className="flex gap-4">
                      <div className="flex-1 bg-[#D9D9D9] rounded-xl px-4 py-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#333333]">Time</span>
                        <button 
                          onClick={() => saveTickerSettings({ showTime: !overlays.showTime })}
                          className={`w-8 h-4 rounded-full p-0.5 transition-all ${overlays.showTime ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                        >
                          <div className={`w-3 h-3 bg-white rounded-full transition-all ${overlays.showTime ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>
                      <div className="flex-1 bg-[#D9D9D9] rounded-xl px-4 py-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#333333]">Date</span>
                        <button 
                          onClick={() => saveTickerSettings({ showDate: !overlays.showDate })}
                          className={`w-8 h-4 rounded-full p-0.5 transition-all ${overlays.showDate ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                        >
                          <div className={`w-3 h-3 bg-white rounded-full transition-all ${overlays.showDate ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </button>
                      </div>
                    </div>
                  </div>

                </div>

                {/* OTS Graphic config */}
                <div className="bg-[#ECECEC] rounded-xl p-5 shadow-sm border border-white/60 flex flex-col gap-4">
                  <span className="text-sm font-extrabold text-[#333333] uppercase tracking-wide">OTS Graphic</span>
                  <div className="bg-[#969696] rounded-xl p-4 flex gap-4">
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
                    <div className="w-24 h-24 bg-[#B3B3B3] rounded-lg border border-white/30 flex items-center justify-center p-2 shadow-inner">
                      {overlays.otsImagePath ? (
                        <img src={`${SOCKET_URL}/${overlays.otsImagePath}`} alt="OTS" className="max-w-full max-h-full object-contain rounded" />
                      ) : (
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Preview</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Enable OTS toggle */}
                  <button 
                    onClick={() => saveTickerSettings({ otsActive: !overlays.otsActive })}
                    className={`w-12 h-6 rounded-full p-1 self-end transition-all ${overlays.otsActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full transition-all ${overlays.otsActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </button>
                </div>

              </div>

              {/* COLUMN 3: VIDEO PLAYLIST SERIAL (cols 4) */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* Video Playlist Serial container */}
                <div className="bg-[#ECECEC] rounded-xl p-5 shadow-sm border border-white/60 flex flex-col gap-4 flex-1">
                  <span className="text-sm font-extrabold text-[#333333] uppercase tracking-wide">Video Playlist Serial</span>
                  
                  {/* Table headers */}
                  <div className="grid grid-cols-12 text-center text-[10px] font-bold text-[#666666] tracking-widest pb-1 border-b border-[#CCCCCC] select-none">
                    <div className="col-span-6 text-left pl-7">TITLE</div>
                    <div className="col-span-2">LEFT</div>
                    <div className="col-span-2">LEFT</div>
                    <div className="col-span-2">ACTIONS</div>
                  </div>

                  {/* List rows */}
                  <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[350px] pr-1">
                    {playlist.map((video, idx) => (
                      <div key={video._id} className="grid grid-cols-12 items-center bg-white rounded-lg p-2.5 border border-slate-200/50 shadow-sm text-center">
                        <div className="col-span-6 flex items-center gap-2 text-left min-w-0">
                          <button className="text-slate-400 hover:text-slate-600">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          <div className="w-8 h-8 rounded bg-[#B3B3B3] shrink-0"></div>
                          <span className="text-xs font-bold text-[#333333] truncate pr-1">{video.title}</span>
                        </div>
                        
                        {/* Left timer columns matching screenshot */}
                        <div className="col-span-2 text-[10px] font-bold text-[#50BF7B] tracking-wider">
                          {formatTime(video.duration)}
                        </div>
                        <div className="col-span-2 text-[10px] font-bold text-[#C92C2C] tracking-wider">
                          {idx === 0 ? '11:23:46' : ''}
                        </div>
                        
                        <div className="col-span-2 flex items-center justify-center">
                          <button className="text-[#C92C2C] hover:text-[#AC2323] transition-all">
                            <XCircle className="w-6 h-6 fill-[#C92C2C] text-white" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Video button matching mockup style */}
                  <button className="mt-auto py-3 rounded-lg bg-[#DFDFDF] hover:bg-[#D5D5D5] text-[#333333] font-bold text-xs tracking-widest flex items-center justify-center gap-2 border border-[#C5C5C5] transition-all shadow-sm">
                    <Upload className="w-4 h-4 stroke-[3]" />
                    Add Video
                  </button>
                </div>

              </div>

            </div>

            {/* Bottom section: Video Gallery folder tabs */}
            <div className="w-full">
              <div className="inline-flex">
                <div className="px-6 py-2.5 rounded-t-xl bg-white border-t border-x border-slate-200/60 font-bold text-xs tracking-wider text-slate-800">
                  Video Gallery
                </div>
              </div>
              <div className="bg-white rounded-b-xl rounded-tr-xl p-6 border border-slate-200/60 shadow-sm min-h-[120px] flex flex-col gap-4">
                <span className="text-xs font-bold text-[#666666] tracking-wider border-b pb-1">News</span>
                {/* Sub folders placeholder */}
                <div className="flex gap-4">
                  {/* Gallery item mocks */}
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* VIEWER MODE */
          <div className="flex flex-col items-center justify-center p-8 bg-slate-900 min-h-[80vh] rounded-2xl border border-slate-800">
            <div className="w-full max-w-4xl bg-black rounded-xl overflow-hidden shadow-2xl relative">
              <div className="aspect-video w-full bg-[#66DE93] relative overflow-hidden flex flex-col justify-between p-6">
                
                {/* Site Logo */}
                <div className="px-3 py-1.5 bg-slate-900/60 rounded text-xs font-bold text-white self-start">
                  Logo
                </div>

                {/* OTS graphic overlay in public player */}
                {overlays.otsActive && (
                  <div className="absolute right-6 bottom-16 w-36 aspect-square bg-[#B3B3B3] rounded-lg border border-white/40 flex items-center justify-center p-2 text-sm font-bold font-mono text-slate-800 text-center uppercase shadow-2xl">
                    OTS Graphic
                  </div>
                )}

                {/* Overlay text banners */}
                <div className="w-full mt-auto flex flex-col gap-2 font-bold text-slate-900 text-xs select-none">
                  {overlays.ticker1Active && (
                    <div className="w-full bg-slate-950/80 text-white px-4 py-2 rounded-lg border-l-4 border-[#50BF7B] flex justify-between items-center shadow-lg font-mono">
                      <span>{overlays.ticker1Title}:</span>
                      <span className="font-normal flex-1 mx-4 truncate">{overlays.ticker1Text}</span>
                      {overlays.showTime && <span className="text-emerald-400 font-bold shrink-0">{new Date().toLocaleTimeString()}</span>}
                    </div>
                  )}
                  {overlays.ticker2Active && (
                    <div className="w-full bg-slate-950/80 text-white px-4 py-2 rounded-lg border-l-4 border-[#C92C2C] flex justify-between items-center shadow-lg font-mono">
                      <span>{overlays.ticker2Title}:</span>
                      <span className="font-normal flex-1 mx-4 truncate">{overlays.ticker2Text}</span>
                      {overlays.showDate && <span className="text-emerald-400 font-bold shrink-0">{new Date().toLocaleDateString()}</span>}
                    </div>
                  )}
                </div>

              </div>

              <div className="bg-slate-800 px-6 py-4 flex items-center justify-between border-t border-slate-700">
                <span className="text-sm font-bold text-slate-300">Live Linear Broadcast (24/7 View Mode)</span>
                <button 
                  onClick={() => setActiveTab('admin')} 
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-bold text-white transition-all"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
