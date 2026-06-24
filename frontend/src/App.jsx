import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { 
  Play, 
  Trash2, 
  Upload, 
  Settings, 
  Home, 
  Folder, 
  Clock, 
  FileVideo, 
  AlertTriangle, 
  ToggleLeft, 
  ToggleRight, 
  Plus, 
  Menu, 
  ExternalLink,
  Calendar,
  Grid
} from 'lucide-react';

const SOCKET_URL = 'http://localhost:5000';

function App() {
  const [activeTab, setActiveTab] = useState('admin'); // admin or public
  const [playlist, setPlaylist] = useState([]);
  const [overlays, setOverlays] = useState({
    ticker1Text: 'Headline News 1',
    ticker1Active: false,
    ticker2Text: 'Headline News 2',
    ticker2Active: false,
    otsImagePath: '',
    otsActive: false,
    showTimeDate: false
  });
  const [status, setStatus] = useState({
    activeVideo: null,
    elapsedTime: 0,
    remainingTime: 0,
    isPlaying: false
  });

  const [socket, setSocket] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [ticker1Input, setTicker1Input] = useState('');
  const [ticker2Input, setTicker2Input] = useState('');

  // Connect Socket.io
  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);

    s.on('connect', () => console.log('Connected to playout socket'));
    
    s.on('stream_status', (data) => {
      setStatus(data);
      if (data.overlays) {
        setOverlays(data.overlays);
      }
    });

    s.on('playlist_updated', (updatedPlaylist) => {
      setPlaylist(updatedPlaylist);
    });

    s.on('overlays_updated', (updatedOverlays) => {
      setOverlays(updatedOverlays);
    });

    // Fetch initial data
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
      console.error(e);
    }
  };

  const fetchOverlays = async () => {
    try {
      const res = await fetch(`${SOCKET_URL}/api/overlays`);
      const data = await res.json();
      setOverlays(data);
      setTicker1Input(data.ticker1Text);
      setTicker2Input(data.ticker2Text);
    } catch (e) {
      console.error(e);
    }
  };

  // Upload Video File
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
      setPlaylist([...playlist, newItem]);
      setUploadTitle('');
    } catch (err) {
      console.error(err);
    }
  };

  // Remove Video
  const handleRemoveVideo = async (id) => {
    try {
      await fetch(`${SOCKET_URL}/api/playlist/${id}`, { method: 'DELETE' });
      setPlaylist(playlist.filter(item => item._id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // Save news ticker settings
  const saveTickerSettings = async (updates) => {
    try {
      const res = await fetch(`${SOCKET_URL}/api/overlays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      setOverlays(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Upload OTS graphic image
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
      setOverlays(data);
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex bg-dark-900 text-slate-100 overflow-x-hidden">
      {/* Sidebar Navigation */}
      <div className="w-16 bg-dark-800 border-r border-slate-800 flex flex-col items-center py-6 justify-between shrink-0">
        <div className="flex flex-col gap-8 items-center">
          <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Grid className="w-6 h-6" />
          </div>
          <button 
            onClick={() => setActiveTab('admin')} 
            className={`p-2.5 rounded-xl transition-all ${activeTab === 'admin' ? 'bg-slate-700/50 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Home className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setActiveTab('public')} 
            className={`p-2.5 rounded-xl transition-all ${activeTab === 'public' ? 'bg-slate-700/50 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Folder className="w-6 h-6" />
          </button>
        </div>
        <button className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <Settings className="w-6 h-6" />
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-dark-800/80 backdrop-blur px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse"></div>
            <h1 className="font-bold text-lg tracking-wider text-slate-200">IPTV BROADCAST SYSTEM</h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setActiveTab(activeTab === 'admin' ? 'public' : 'admin')}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold tracking-wide flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
            >
              {activeTab === 'admin' ? 'Switch to Viewer Page' : 'Switch to Admin Panel'}
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </header>

        {activeTab === 'admin' ? (
          /* ADMIN DASHBOARD PANEL */
          <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-3 gap-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
            
            {/* Column 1: Live Preview & Uploads */}
            <div className="flex flex-col gap-6">
              {/* Live Preview Container */}
              <div className="glass rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                    <FileVideo className="w-5 h-5 text-indigo-400" />
                    Live Preview
                  </h3>
                  {status.isPlaying ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                      ON AIR
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                      STANDBY
                    </span>
                  )}
                </div>
                
                {/* Mock Stream Player Window */}
                <div className="aspect-video w-full bg-emerald-500 rounded-xl relative overflow-hidden shadow-inner border border-emerald-600/40 flex flex-col justify-between p-4">
                  {/* Watermark Logo */}
                  <div className="px-3 py-1.5 rounded-lg bg-slate-900/60 backdrop-blur text-xs font-bold text-white self-start">
                    Site Logo
                  </div>

                  {/* OTS Graphic overlay in live preview screen */}
                  {overlays.otsActive && overlays.otsImagePath && (
                    <div className="absolute right-4 bottom-14 w-28 aspect-square bg-slate-900/80 rounded-lg border border-slate-700/50 overflow-hidden flex items-center justify-center p-1 shadow-lg">
                      <img 
                        src={`${SOCKET_URL}/${overlays.otsImagePath}`} 
                        alt="OTS" 
                        className="max-w-full max-h-full rounded object-contain"
                      />
                    </div>
                  )}

                  {/* Bottom overlays (News Ticker list & time date) */}
                  <div className="w-full mt-auto flex flex-col gap-1.5">
                    {overlays.ticker1Active && (
                      <div className="w-full bg-slate-900/85 backdrop-blur px-3 py-1.5 rounded border-l-4 border-indigo-500 text-xs flex justify-between items-center text-slate-100">
                        <span className="font-bold text-indigo-400 tracking-wider">TICKER 1</span>
                        <marquee scrollamount="3" className="flex-1 mx-4 font-medium">{overlays.ticker1Text}</marquee>
                      </div>
                    )}
                    {overlays.ticker2Active && (
                      <div className="w-full bg-slate-900/85 backdrop-blur px-3 py-1.5 rounded border-l-4 border-emerald-500 text-xs flex justify-between items-center text-slate-100">
                        <span className="font-bold text-emerald-400 tracking-wider">TICKER 2</span>
                        <marquee scrollamount="3.5" className="flex-1 mx-4 font-medium">{overlays.ticker2Text}</marquee>
                      </div>
                    )}

                    {overlays.showTimeDate && (
                      <div className="flex gap-2 self-end mt-1 text-[10px] font-bold font-mono tracking-widest text-emerald-400">
                        <span className="bg-slate-950/80 px-2 py-0.5 rounded flex items-center gap-1"><Clock className="w-3 h-3"/> {new Date().toLocaleTimeString()}</span>
                        <span className="bg-slate-950/80 px-2 py-0.5 rounded flex items-center gap-1"><Calendar className="w-3 h-3"/> {new Date().toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button className="flex-1 py-3 rounded-xl bg-red-600/25 hover:bg-red-600/35 border border-red-500/30 text-red-400 font-semibold tracking-wider flex items-center justify-center gap-2 transition-all">
                    <AlertTriangle className="w-4 h-4"/>
                    BROADCAST HALT
                  </button>
                  <button className="px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center transition-all">
                    <ExternalLink className="w-5 h-5 text-slate-300" />
                  </button>
                </div>
              </div>

              {/* Insert Now component */}
              <div className="glass rounded-2xl p-5 flex flex-col gap-4">
                <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                  <Play className="w-5 h-5 text-emerald-400" />
                  Real-time Insert Stream
                </h3>
                <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 bg-slate-800/20">
                  <Upload className="w-8 h-8 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-300">Drag & drop or Click to upload live feed</span>
                  <span className="text-xs text-slate-500">Supports MP4, MKV, MOV</span>
                </div>
              </div>
            </div>

            {/* Column 2: News Tickers & OTS Configurations */}
            <div className="flex flex-col gap-6">
              {/* Ticker Management */}
              <div className="glass rounded-2xl p-5 flex flex-col gap-5">
                <h3 className="font-semibold text-slate-300 flex items-center justify-between">
                  News Ticker Settings
                  <button 
                    onClick={() => saveTickerSettings({ ticker1Active: !overlays.ticker1Active, ticker2Active: !overlays.ticker2Active })}
                    className="p-1 rounded bg-slate-800 text-slate-300"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </h3>

                {/* News Ticker 1 */}
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-400">News Ticker - 1</span>
                    <button 
                      onClick={() => saveTickerSettings({ ticker1Active: !overlays.ticker1Active })}
                      className="text-indigo-400 hover:text-indigo-300 transition-all"
                    >
                      {overlays.ticker1Active ? <ToggleRight className="w-9 h-9" /> : <ToggleLeft className="w-9 h-9 text-slate-600" />}
                    </button>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Ticker 1 Text" 
                    value={ticker1Input} 
                    onChange={(e) => setTicker1Input(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500/50 transition-all"
                  />
                  <button 
                    onClick={() => saveTickerSettings({ ticker1Text: ticker1Input })}
                    className="mt-1.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-xs font-semibold transition-all"
                  >
                    Update Ticker 1
                  </button>
                </div>

                {/* News Ticker 2 */}
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-400">News Ticker - 2</span>
                    <button 
                      onClick={() => saveTickerSettings({ ticker2Active: !overlays.ticker2Active })}
                      className="text-emerald-400 hover:text-emerald-300 transition-all"
                    >
                      {overlays.ticker2Active ? <ToggleRight className="w-9 h-9" /> : <ToggleLeft className="w-9 h-9 text-slate-600" />}
                    </button>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Ticker 2 Text" 
                    value={ticker2Input} 
                    onChange={(e) => setTicker2Input(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50 transition-all"
                  />
                  <button 
                    onClick={() => saveTickerSettings({ ticker2Text: ticker2Input })}
                    className="mt-1.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all"
                  >
                    Update Ticker 2
                  </button>
                </div>

                {/* Time & Date Toggles */}
                <div className="flex items-center justify-between p-3.5 bg-slate-800/20 rounded-xl border border-slate-800/50">
                  <span className="text-sm font-semibold text-slate-300">Display Time & Date Overlay</span>
                  <button onClick={() => saveTickerSettings({ showTimeDate: !overlays.showTimeDate })}>
                    {overlays.showTimeDate ? <ToggleRight className="w-9 h-9 text-indigo-400" /> : <ToggleLeft className="w-9 h-9 text-slate-600" />}
                  </button>
                </div>
              </div>

              {/* OTS Graphic settings */}
              <div className="glass rounded-2xl p-5 flex flex-col gap-4">
                <h3 className="font-semibold text-slate-300">OTS Graphic Overlay</h3>
                <div className="grid grid-cols-2 gap-4">
                  <label className="border border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-4 bg-slate-800/30 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2">
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-300">Upload Image</span>
                    <input type="file" accept="image/*" onChange={handleOtsUpload} className="hidden" />
                  </label>
                  <div className="bg-slate-900/50 rounded-xl p-4 flex flex-col items-center justify-center border border-slate-800">
                    <span className="text-xs font-bold text-slate-500 mb-2">Active Graphic</span>
                    {overlays.otsImagePath ? (
                      <img 
                        src={`${SOCKET_URL}/${overlays.otsImagePath}`} 
                        alt="OTS Preview" 
                        className="w-16 h-16 object-contain rounded border border-slate-800"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded border border-dashed border-slate-800 flex items-center justify-center text-[10px] text-slate-600">No Image</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-800/20 rounded-xl border border-slate-800/50">
                  <span className="text-sm font-semibold text-slate-300">Enable OTS Overlay</span>
                  <button onClick={() => saveTickerSettings({ otsActive: !overlays.otsActive })}>
                    {overlays.otsActive ? <ToggleRight className="w-9 h-9 text-indigo-400" /> : <ToggleLeft className="w-9 h-9 text-slate-600" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Column 3: Video Playlist Queue */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-400" />
                  Video Playlist Queue
                </h3>
                <span className="text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
                  {playlist.length} Videos
                </span>
              </div>

              {/* Upload field to add video */}
              <div className="flex flex-col gap-2 p-3 bg-slate-800/30 rounded-xl border border-slate-800/50">
                <input 
                  type="text" 
                  placeholder="Enter video title (optional)" 
                  value={uploadTitle} 
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="bg-slate-900 border border-slate-800/60 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none"
                />
                <label className="py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs tracking-wider cursor-pointer text-center flex items-center justify-center gap-1.5 transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  ADD VIDEO FILE
                  <input type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />
                </label>
              </div>

              {/* Playlist Table */}
              <div className="flex-1 overflow-y-auto max-h-[420px] flex flex-col gap-2">
                {playlist.map((video, index) => {
                  const isActive = status.activeVideo?.id === video._id;
                  return (
                    <div 
                      key={video._id} 
                      className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${isActive ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-slate-800/30 border-slate-800/50 hover:bg-slate-800/50'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold text-slate-500 w-4">{index + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-200 truncate">{video.title}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {formatTime(video.duration)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isActive && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 animate-pulse">
                            PLAYING
                          </span>
                        )}
                        <button 
                          onClick={() => handleRemoveVideo(video._id)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {playlist.length === 0 && (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No videos in the playlist. Upload videos to begin playout.
                  </div>
                )}
              </div>
            </div>

          </main>
        ) : (
          /* PUBLIC PLAYBACK STREAM PAGE */
          <main className="flex-1 flex flex-col items-center justify-center p-8 bg-dark-900">
            <div className="w-full max-w-4xl glass rounded-2xl overflow-hidden shadow-2xl relative border border-slate-800">
              
              {/* HTML5 Overlay simulation inside the clean player wrapper */}
              <div className="aspect-video w-full bg-slate-950 relative overflow-hidden flex flex-col justify-between p-6">
                
                {/* 24/7 Overlay indicator */}
                <div className="px-3.5 py-1.5 rounded-full bg-slate-900/80 text-[10px] font-extrabold tracking-widest text-slate-100 border border-slate-700/40 absolute left-6 top-6 shadow-md flex items-center gap-2 select-none">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  IPTV LIVE 24/7
                </div>

                {/* Watermark Logo placement */}
                <div className="absolute right-6 top-6 text-sm font-black tracking-wider text-slate-400/35 uppercase select-none">
                  Blue Playout Logo
                </div>

                {/* Simulating running live content block */}
                {status.activeVideo ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <FileVideo className="w-16 h-16 text-slate-700/60 animate-bounce mb-3" />
                    <p className="text-sm font-semibold text-slate-500 font-mono">Playing: {status.activeVideo.title}</p>
                    <p className="text-xs text-slate-600 font-mono mt-1">Elapsed: {formatTime(status.elapsedTime)} / {formatTime(status.activeVideo.duration)}</p>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 font-mono">
                    Playout Standby
                  </div>
                )}

                {/* Overlays rendering */}
                {overlays.otsActive && overlays.otsImagePath && (
                  <div className="absolute right-6 bottom-16 w-36 aspect-square bg-slate-900/90 rounded-xl border border-slate-700/60 overflow-hidden flex items-center justify-center p-2 shadow-2xl">
                    <img 
                      src={`${SOCKET_URL}/${overlays.otsImagePath}`} 
                      alt="OTS graphic" 
                      className="max-w-full max-h-full rounded object-contain"
                    />
                  </div>
                )}

                <div className="w-full mt-auto flex flex-col gap-2">
                  {overlays.ticker1Active && (
                    <div className="w-full bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-lg border-l-4 border-indigo-500 text-xs flex justify-between items-center text-slate-100 shadow-lg">
                      <marquee scrollamount="2.5" className="flex-1 font-semibold">{overlays.ticker1Text}</marquee>
                    </div>
                  )}
                  {overlays.ticker2Active && (
                    <div className="w-full bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-lg border-l-4 border-emerald-500 text-xs flex justify-between items-center text-slate-100 shadow-lg">
                      <marquee scrollamount="3" className="flex-1 font-semibold">{overlays.ticker2Text}</marquee>
                    </div>
                  )}

                  {overlays.showTimeDate && (
                    <div className="flex gap-2.5 self-end mt-1 text-[10px] font-bold font-mono tracking-widest text-emerald-400 select-none">
                      <span className="bg-slate-900/90 px-3 py-1 rounded-md shadow-md">{new Date().toLocaleTimeString()}</span>
                      <span className="bg-slate-900/90 px-3 py-1 rounded-md shadow-md">{new Date().toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

              </div>

              {/* Viewer Mode Bar */}
              <div className="bg-dark-800 px-6 py-4 flex items-center justify-between border-t border-slate-800">
                <div>
                  <h3 className="font-semibold text-slate-300">Live linear broadcast feed</h3>
                  <p className="text-xs text-slate-500">24/7 continuous stitch player (client controls are disabled)</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                  <span className="text-xs font-semibold text-indigo-400 font-mono uppercase tracking-wider">Sync Active</span>
                </div>
              </div>

            </div>
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
