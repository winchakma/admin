import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Home, Folder, Settings, Search, Film, Music, Rss, ArrowLeft, Play, Clock, MoreVertical, XCircle, ChevronDown } from 'lucide-react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const apiFetch = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
};

const formatTime = (seconds) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function VideoLibrary() {
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const s = io(SOCKET_URL, { reconnectionAttempts: 5, timeout: 5000 });
    socketRef.current = s;

    s.on('playlist_updated', () => {
      // Library is separate now, no need to update on playlist changes
    });

    s.on('stream_status', (data) => {
      // Status not strictly needed for library anymore unless we want to show it
    });

    fetchLibrary();

    return () => s.disconnect();
  }, []);

  const fetchLibrary = async () => {
    try {
      const res = await apiFetch(`${SOCKET_URL}/api/library`);
      const data = await res.json();
      setLibraryAssets(data);
    } catch (e) {
      console.warn('API Offline, using local data');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', file.name);

    try {
      await apiFetch(`${SOCKET_URL}/api/library/upload`, {
        method: 'POST',
        body: formData
      });
      await fetchLibrary(); // Refresh library after upload
    } catch (err) {
      console.error('Upload failed', err);
      alert('Failed to upload video');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveVideo = async (id) => {
    if (!window.confirm('Are you sure you want to permanently delete this video from the library?')) return;
    try {
      await apiFetch(`${SOCKET_URL}/api/library/${id}`, { method: 'DELETE' });
      fetchLibrary();
    } catch (err) {
      console.warn('Delete failed');
    }
  };

  const handleCategoryChange = async (id, newCategory) => {
    try {
      await apiFetch(`${SOCKET_URL}/api/library/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory })
      });
      fetchLibrary();
    } catch (err) {
      console.warn('Category update failed');
    }
  };

  const filteredVideos = libraryAssets.filter(video => {
    if (activeTab !== 'All' && video.category !== activeTab) return false;
    if (searchQuery && !video.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col sm:flex-row bg-[#111111] text-gray-300 font-sans antialiased pb-20 sm:pb-0">
      
      {/* DESKTOP SIDEBAR */}
      <div className="hidden sm:flex w-16 bg-[#111111] border-r border-gray-800 flex-col items-center py-6 justify-between shrink-0">
        <div className="flex flex-col gap-6 items-center w-full mt-2">
          <Link 
            to="/admin" 
            className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:bg-[#BDBDBD] transition-all"
          >
            <Home className="w-6 h-6" />
          </Link>
          
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#1a1a1a] text-pink-500 shadow-inner border border-pink-500 transition-all">
            <Folder className="w-6 h-6" />
          </div>
        </div>
        
        <Link to="/settings" className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:bg-[#BDBDBD] transition-all">
          <Settings className="w-6 h-6" />
        </Link>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <div className="flex sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#111111] border-t border-gray-800 z-50 items-center justify-around px-4 shadow-lg">
        <Link to="/admin" className="flex flex-col items-center justify-center w-12 h-12 text-white">
          <Home className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5">Admin</span>
        </Link>
        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-[#1a1a1a] text-pink-500 border border-pink-500">
          <Folder className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5">Library</span>
        </div>
        <Link to="/settings" className="flex flex-col items-center justify-center w-12 h-12 text-white">
          <Settings className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5">Settings</span>
        </Link>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 max-w-7xl w-full mx-auto">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wider flex items-center gap-3">
              <Link to="/admin" className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors inline-block sm:hidden">
                <ArrowLeft className="w-5 h-5 text-white" />
              </Link>
              VIDEO LIBRARY
            </h2>
            <p className="text-sm text-gray-500 mt-1 font-bold">Manage and organize your broadcast assets</p>
          </div>
          <div className="flex gap-4">
            <label className={`px-5 py-2.5 rounded-lg text-white font-bold text-sm tracking-wide shadow-md transition-all flex items-center gap-2 cursor-pointer ${isUploading ? 'bg-gray-600' : 'bg-green-600 hover:bg-green-700'}`}>
              <Upload className="w-4 h-4" />
              {isUploading ? 'Uploading...' : 'Upload Video'}
              <input 
                type="file" 
                accept="video/*" 
                onChange={handleFileUpload} 
                disabled={isUploading}
                ref={fileInputRef}
                className="hidden" 
              />
            </label>
            <Link 
              to="/admin" 
              className="px-5 py-2.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-bold text-sm tracking-wide shadow-md transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              Go to Control Center
            </Link>
          </div>
        </div>

        <div className="max-w-7xl w-full mx-auto flex flex-col gap-6">
          
          {/* Controls Bar */}
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* Filter Tabs */}
            <div className="flex bg-[#111111] p-1 rounded-lg border border-gray-800 w-full sm:w-auto overflow-x-auto hide-scrollbar">
              {['All', 'News', 'Music', 'Movie'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 sm:flex-none px-6 py-2 rounded-md text-xs font-bold tracking-wide transition-all flex items-center justify-center gap-2 ${
                    activeTab === tab 
                      ? 'bg-[#2a2a2a] text-white shadow' 
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {tab === 'News' && <Rss className="w-3.5 h-3.5" />}
                  {tab === 'Music' && <Music className="w-3.5 h-3.5" />}
                  {tab === 'Movie' && <Film className="w-3.5 h-3.5" />}
                  {tab}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="Search videos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#111111] border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-300 outline-none focus:border-gray-600 transition-colors"
              />
            </div>
          </div>

          {/* Video Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredVideos.map(video => (
              <div key={video._id} className="bg-[#1a1a1a] border border-gray-800 rounded-xl overflow-hidden group hover:border-gray-600 transition-colors flex flex-col">
                {/* Thumbnail Area */}
                <div className="aspect-video bg-[#111111] relative flex items-center justify-center">
                  <Film className="w-12 h-12 text-gray-800" />
                  
                  {/* Duration Badge */}
                  <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(video.duration)}
                  </div>
                </div>

                {/* Info Area */}
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="text-sm font-bold text-gray-200 line-clamp-2" title={video.title}>
                      {video.title}
                    </h3>
                    <button 
                      onClick={() => handleRemoveVideo(video._id)}
                      className="text-gray-600 hover:text-[#C92C2C] transition-colors p-1 shrink-0"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="mt-auto flex items-center justify-between">
                    <div className="relative">
                      <select
                        value={video.category || 'News'}
                        onChange={(e) => handleCategoryChange(video._id, e.target.value)}
                        className="appearance-none bg-[#2a2a2a] border border-gray-700 text-xs font-bold text-gray-300 rounded px-3 py-1 pr-8 outline-none focus:border-gray-500 cursor-pointer"
                      >
                        <option value="News">News</option>
                        <option value="Music">Music</option>
                        <option value="Movie">Movie</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                    <span className="text-[10px] text-gray-600 font-mono">
                      {new Date(video.createdAt || Date.now()).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {filteredVideos.length === 0 && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                <Folder className="w-16 h-16 text-gray-800 mb-4" />
                <h3 className="text-lg font-bold text-gray-400">No videos found</h3>
                <p className="text-sm text-gray-600 mt-1 max-w-md">
                  {searchQuery ? `No videos matching "${searchQuery}" in this category.` : 'Your video library is empty. Go to the Control Center to upload videos.'}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
