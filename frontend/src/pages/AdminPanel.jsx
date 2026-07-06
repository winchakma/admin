import React, { useState, useEffect, useRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import io from 'socket.io-client';
import Hls from 'hls.js';
import { uploadFileInChunks } from '../utils/upload';
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

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

function AdminPanel() {
  const { token, user, logout } = useContext(AuthContext);
  
  const apiFetch = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) logout();
    return res;
  };

  const [activeTab, setActiveTab] = useState('admin');
  const [playlist, setPlaylist] = useState([]);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const previewVideo1Ref = useRef(null);
  const previewVideo2Ref = useRef(null);
  const previewAdRef = useRef(null);
  const [previewActivePlayer, setPreviewActivePlayer] = useState(1);
  

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
    showDate: true,
    isBroadcastActive: true
  });

  const [status, setStatus] = useState({ 
    activeVideo: null, 
    position: 0, 
    isPaused: false,
    adState: { isActive: false, isPlaying: false, activeAd: null, position: 0 } 
  });
  
  const overlaysRef = useRef(overlays);
  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('News');
  const [externalUrl, setExternalUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');
  const [currentDayStr, setCurrentDayStr] = useState('');
  const [rotationIndex, setRotationIndex] = useState(0);

  // Rotating index for Time/Date/Day
  useEffect(() => {
    const rotater = setInterval(() => {
      setRotationIndex(prev => (prev + 1) % 2);
    }, 3000);
    return () => clearInterval(rotater);
  }, []);

  const socketRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const [ads, setAds] = useState([]);
  const [adTitle, setAdTitle] = useState('');
  const [isAdUploading, setIsAdUploading] = useState(false);
  const [isPushingLive, setIsPushingLive] = useState(false);


  // Live time and date updater
  useEffect(() => {
    const timer = setInterval(() => {
      // Force Bangladesh Standard Time (UTC+6)
      const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
      
      let h = d.getHours();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12; // the hour '0' should be '12'
      const hours = h.toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const seconds = d.getSeconds().toString().padStart(2, '0');
      setCurrentTimeStr(`${hours}:${minutes}:${seconds} ${ampm}`);

      // Format date as DD/MM/YYYY
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      setCurrentDateStr(`${day}/${month}/${year}`);

      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      setCurrentDayStr(days[d.getDay()]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Dual Video Engine logic inside a reusable function
  const currentVideoIdRef = useRef(null);
  
  const setupDualPlayer = (video1Ref, video2Ref, adPlayerRef, activePlayer, setActivePlayer) => {
    if (!status.activeVideo) {
      if (video1Ref.current) {
        video1Ref.current.removeAttribute('src');
        video1Ref.current.load();
      }
      if (video2Ref.current) {
        video2Ref.current.removeAttribute('src');
        video2Ref.current.load();
      }
      if (adPlayerRef.current) {
        adPlayerRef.current.removeAttribute('src');
        adPlayerRef.current.load();
      }
      currentVideoIdRef.current = null;
      return;
    }

    const currentEl = activePlayer === 1 ? video1Ref.current : video2Ref.current;
    const nextEl = activePlayer === 1 ? video2Ref.current : video1Ref.current;
    if (!currentEl || !nextEl) return;

    const normalizedPath = status.activeVideo.filePath.replace(/\\/g, '/');
    const videoUrl = normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')
      ? normalizedPath
      : `${SOCKET_URL}/${normalizedPath}`;

    const loadAndPlayVideo = (element, url, offset) => {
      element.src = url;
      element.load();
      element.onloadedmetadata = () => {
        element.currentTime = offset || 0;
        element.play().catch(e => console.log(e));
      };
      if (element.readyState >= 1) {
        element.currentTime = offset || 0;
        element.play().catch(e => console.log(e));
      }
    };

    if (status.activeVideo.isAd) {
      if (adPlayerRef.current) {
        const adSrcUrl = decodeURI(adPlayerRef.current.src);
        if (!adPlayerRef.current.hasAttribute('src') || (!adSrcUrl.endsWith(videoUrl.split('?')[0]) && adSrcUrl !== videoUrl)) {
          adPlayerRef.current.src = videoUrl;
          adPlayerRef.current.load();
        }
        if (adPlayerRef.current.readyState >= 1) {
          const targetOffset = status.activeVideo.offset || 0;
          if (Math.abs(adPlayerRef.current.currentTime - targetOffset) > 10) {
            adPlayerRef.current.currentTime = targetOffset;
          }
        }
        adPlayerRef.current.play().catch(e => console.log("Autoplay blocked:", e));
      }
      if (currentEl) {
        currentEl.muted = true;
      }
      return;
    } else {
      if (adPlayerRef.current && !adPlayerRef.current.paused) {
        adPlayerRef.current.pause();
        adPlayerRef.current.removeAttribute('src');
        adPlayerRef.current.load();
      }
      if (currentEl) {
        currentEl.muted = isMuted; // Restore user's muted preference
      }
    }

    if (currentVideoIdRef.current !== status.activeVideo.id) {
      currentVideoIdRef.current = status.activeVideo.id;
      
      if (nextEl.hasAttribute('src') && (decodeURI(nextEl.src).endsWith(videoUrl.split('?')[0]) || decodeURI(nextEl.src) === videoUrl)) {
        if (nextEl.readyState >= 1) {
          const targetOffset = status.activeVideo.offset || 0;
          if (Math.abs(nextEl.currentTime - targetOffset) > 1) {
            nextEl.currentTime = targetOffset;
          }
        }
        nextEl.play().catch(e => console.log(e));
        setActivePlayer(activePlayer === 1 ? 2 : 1);
        
        if (status.nextVideo) {
          const nextNormalized = status.nextVideo.filePath.replace(/\\/g, '/');
          const nextUrl = nextNormalized.startsWith('http') ? nextNormalized : `${SOCKET_URL}/${nextNormalized}`;
          currentEl.pause();
          currentEl.src = nextUrl;
          currentEl.load();
        }
      } else {
        nextEl.src = videoUrl;
        nextEl.load();
        
        let hasSwapped = false;
        const onReady = () => {
          if (hasSwapped) return;
          hasSwapped = true;
          
          const targetOffset = status.activeVideo.offset || 0;
          if (Math.abs(nextEl.currentTime - targetOffset) > 1) {
            nextEl.currentTime = targetOffset;
          }
          nextEl.play().catch(e => console.log(e));
          setActivePlayer(activePlayer === 1 ? 2 : 1);
          nextEl.oncanplay = null;
          nextEl.onloadeddata = null;
          
          if (status.nextVideo) {
            const nextNormalized = status.nextVideo.filePath.replace(/\\/g, '/');
            const nextUrl = nextNormalized.startsWith('http') ? nextNormalized : `${SOCKET_URL}/${nextNormalized}`;
            setTimeout(() => {
              currentEl.pause();
              currentEl.src = nextUrl;
              currentEl.load();
            }, 350);
          }
        };
        nextEl.oncanplay = onReady;
        nextEl.onloadeddata = onReady;
        
        setTimeout(() => {
          if (hasSwapped) return;
          hasSwapped = true;
          
          nextEl.oncanplay = null;
          nextEl.onloadeddata = null;

          if (nextEl.readyState >= 1) {
            const targetOffset = status.activeVideo.offset || 0;
            if (Math.abs(nextEl.currentTime - targetOffset) > 1) {
              nextEl.currentTime = targetOffset;
            }
          }
          
          setActivePlayer(activePlayer === 1 ? 2 : 1);
          nextEl.play().catch(e=>console.log(e));
        }, 1500);
      }
    } else if (!currentEl.hasAttribute('src')) {
      currentVideoIdRef.current = status.activeVideo.id;
      loadAndPlayVideo(currentEl, videoUrl, status.activeVideo.offset);
    } else {
      if (currentEl.readyState >= 1) {
        const currentDiff = Math.abs(currentEl.currentTime - status.activeVideo.offset);
        if (currentDiff > 30 && !currentEl.seeking) {
          const now = Date.now();
          if (!currentEl.dataset.lastSeek || now - parseInt(currentEl.dataset.lastSeek) > 10000) {
            currentEl.currentTime = status.activeVideo.offset;
            currentEl.dataset.lastSeek = now.toString();
          }
        }
        if (currentEl.paused) {
          currentEl.play().catch(e => console.log(e));
        }
      }
      
      if (status.nextVideo) {
        const nextNormalized = status.nextVideo.filePath.replace(/\\/g, '/');
        const nextUrl = nextNormalized.startsWith('http') ? nextNormalized : `${SOCKET_URL}/${nextNormalized}`;
        if (!nextEl.hasAttribute('src') || (!decodeURI(nextEl.src).endsWith(nextUrl.split('?')[0]) && decodeURI(nextEl.src) !== nextUrl)) {
          nextEl.pause();
          nextEl.src = nextUrl;
          nextEl.load();
        }
      }
    }
  };

  useEffect(() => {
    // Only setup the players that are currently mounted (depends on activeTab)
    if (activeTab === 'admin') {
      setupDualPlayer(previewVideo1Ref, previewVideo2Ref, previewAdRef, previewActivePlayer, setPreviewActivePlayer);
    }
  }, [status.activeVideo, activeTab, previewActivePlayer]);

  useEffect(() => {
    return () => {
      [previewVideo1Ref, previewVideo2Ref, previewAdRef].forEach(ref => {
        if (ref.current) {
          ref.current.oncanplay = null;
          ref.current.onloadeddata = null;
          ref.current.removeAttribute('src');
          ref.current.load();
        }
      });
    };
  }, []);

  const handlePlayUnmute = () => {
    setIsMuted(false);
    const prev1 = previewActivePlayer === 1 ? previewVideo1Ref.current : previewVideo2Ref.current;
    if (prev1) prev1.play().catch(e => console.log(e));
  };

  // Connect Socket.io
  useEffect(() => {
    const s = io(SOCKET_URL, { reconnectionAttempts: 5, timeout: 5000 });
    socketRef.current = s;

    s.on('connect', () => console.log('Connected to playout socket'));
    
    s.on('stream_status', (data) => {
      setStatus(data);
      // Removed destructive overwrite of local editing overlays state
    });

    s.on('playlist_updated', (updatedPlaylist) => {
      setPlaylist(updatedPlaylist);
    });

    s.on('overlays_updated', (updatedOverlays) => {
      setOverlays(prev => ({ ...prev, ...updatedOverlays }));
    });

    s.on('ads_updated', (updatedAds) => {
      setAds(updatedAds);
    });

    fetchOverlays();
    fetchPlaylist();
    fetchLibrary();
    fetchAds();
    fetchChannels();
    
    return () => s.disconnect();
  }, []);

  const fetchPlaylist = async () => {
    try {
      const res = await apiFetch(`${SOCKET_URL}/api/playlist`);
      const data = await res.json();
      setPlaylist(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('API Offline, using local data');
    }
  };

  const fetchLibrary = async () => {
    try {
      const res = await apiFetch(`${SOCKET_URL}/api/library`);
      const data = await res.json();
      setLibraryAssets(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to fetch library');
    }
  };

  const fetchAds = async () => {
    try {
      const res = await apiFetch(`${SOCKET_URL}/api/ads`);
      const data = await res.json();
      setAds(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('API Offline, could not fetch ads');
    }
  };

  const fetchChannels = async () => {
    try {
      const res = await apiFetch(`${SOCKET_URL}/api/channels`);
      const data = await res.json();
      setChannels(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to fetch channels');
    }
  };

  const handleAdUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsAdUploading(true);
    
    try {
      const uploadResult = await uploadFileInChunks(file);
      if (!uploadResult || !uploadResult.completed) throw new Error('Chunk upload failed');

      const formData = new FormData();
      formData.append('title', adTitle || file.name);
      formData.append('filePath', uploadResult.filePath);
      formData.append('duration', uploadResult.duration);

      const res = await apiFetch(`${SOCKET_URL}/api/ads/upload`, {
        method: 'POST',
        body: formData
      });
      await res.json();
      setAdTitle('');
      fetchAds();
    } catch (err) {
      console.warn('Ad upload failed');
    } finally {
      setIsAdUploading(false);
    }
  };

  const handlePlayAd = async (id) => {
    try {
      await apiFetch(`${SOCKET_URL}/api/ads/${id}/play`, { method: 'POST' });
    } catch (err) {
      console.warn('Play ad failed');
    }
  };

  const handleStopAd = async () => {
    try {
      await apiFetch(`${SOCKET_URL}/api/ads/stop`, { method: 'POST' });
    } catch (err) {
      console.warn('Stop ad failed');
    }
  };

  const handleRemoveAd = async (id) => {
    try {
      await apiFetch(`${SOCKET_URL}/api/ads/${id}`, { method: 'DELETE' });
      setAds(prev => prev.filter(item => item._id !== id));
    } catch (err) {
      console.warn('Delete ad failed');
      fetchAds();
    }
  };

  const fetchOverlays = async () => {
    try {
      const res = await apiFetch(`${SOCKET_URL}/api/overlays`);
      const data = await res.json();
      if (data) {
        setOverlays(prev => ({ ...prev, ...data }));
      }
    } catch (e) {
      console.warn('API Offline, using local overlay config');
    }
  };

  const updateOverlayField = (updates, debounce = false) => {
    setOverlays(prev => ({ ...prev, ...updates }));

    const stateToSave = { ...overlaysRef.current, ...updates };

    if (debounce) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        // Read the absolute latest state when the timeout fires
        saveConfigToBackend(overlaysRef.current);
      }, 1000); // 1 second debounce
    } else {
      saveConfigToBackend(stateToSave);
    }
  };

  const saveConfigToBackend = (updates) => {
    apiFetch(`${SOCKET_URL}/api/overlays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }).catch(err => console.warn('Overlay background save offline'));
  };

  // Video file upload
  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const uploadResult = await uploadFileInChunks(file);
      if (!uploadResult || !uploadResult.completed) throw new Error('Chunk upload failed');

      const formData = new FormData();
      formData.append('title', uploadTitle || file.name);
      formData.append('category', uploadCategory);
      formData.append('filePath', uploadResult.filePath);
      formData.append('duration', uploadResult.duration);

      const res = await apiFetch(`${SOCKET_URL}/api/playlist/upload`, {
        method: 'POST',
        body: formData
      });
      const newItem = await res.json();
      setPlaylist(prev => [...prev, newItem]);
      setUploadTitle('');
    } catch (err) {
      console.warn('Upload failed');
    } finally {
      setIsSubmitting(false);
      // Reset input value to allow selecting same file again
      e.target.value = '';
    }
  };

  // External live link upload
  const handleAddExternalLink = async () => {
    if (!externalUrl || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await apiFetch(`${SOCKET_URL}/api/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: uploadTitle || 'External Live Stream',
          videoUrl: externalUrl,
          duration: 3600, // Default duration for live streams (1 hour)
          category: uploadCategory,
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveVideo = async (id) => {
    try {
      await apiFetch(`${SOCKET_URL}/api/playlist/${id}`, { method: 'DELETE' });
      setPlaylist(prev => prev.filter(item => item._id !== id));
    } catch (err) {
      console.warn('Delete failed');
    }
  };

  const handleOtsUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    // Note: Do not update React state instantly with base64, as it breaks the background sync if the image is too large.
    // Instead, rely purely on the socket event to pull down the final URL after upload.

    try {
      await apiFetch(`${SOCKET_URL}/api/overlays/upload-ots`, {
        method: 'POST',
        body: formData
      });
    } catch (err) {
      console.warn('OTS Image upload failed');
    } finally {
      // Reset input value to allow selecting same file again
      e.target.value = '';
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      await apiFetch(`${SOCKET_URL}/api/overlays/upload-logo`, {
        method: 'POST',
        body: formData
      });
    } catch (err) {
      console.warn('Logo upload failed');
    } finally {
      e.target.value = '';
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col sm:flex-row bg-[#111111] text-gray-300 font-sans antialiased overflow-x-hidden select-none pb-20 sm:pb-0">
      
      {/* DESKTOP SIDEBAR NAVIGATION */}
      <div className="hidden sm:flex w-16 bg-[#111111] border-r border-gray-800 flex-col items-center py-6 justify-between shrink-0">
        <div className="flex flex-col gap-6 items-center w-full mt-2">
          
          <button 
            onClick={() => setActiveTab('admin')} 
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${activeTab === 'admin' ? 'bg-[#1a1a1a] text-pink-500 shadow-inner border border-pink-500' : 'text-white hover:bg-[#BDBDBD]'}`}
          >
            <Home className="w-6 h-6" />
          </button>
          
          <Link 
            to="/library"
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all text-white hover:bg-[#BDBDBD]`}
          >
            <Folder className="w-6 h-6" />
          </Link>
        </div>
        
        <button 
          onClick={() => setActiveTab('settings')}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${activeTab === 'settings' ? 'bg-[#1a1a1a] text-pink-500 shadow-inner border border-pink-500' : 'text-white hover:bg-[#BDBDBD]'}`}
        >
          <Settings className="w-6 h-6" />
        </button>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="flex sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#111111] border-t border-gray-800 z-50 items-center justify-around px-4 shadow-lg">
        <button 
          onClick={() => setActiveTab('admin')} 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl ${activeTab === 'admin' ? 'bg-[#1a1a1a] text-pink-500 border border-pink-500' : 'text-white'}`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5">Admin</span>
        </button>
        <Link 
            to="/library"
            className="flex flex-col items-center justify-center w-12 h-12 rounded-xl text-white"
          >
            <Folder className="w-5 h-5" />
            <span className="text-[9px] font-bold mt-0.5">Library</span>
        </Link>
        <button 
          onClick={() => setActiveTab('settings')} 
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl ${activeTab === 'settings' ? 'bg-[#1a1a1a] text-pink-500 border border-pink-500' : 'text-white'}`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-0.5">Settings</span>
        </button>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto">
        
        {/* Top Bar for View Toggle */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 max-w-7xl w-full mx-auto">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wider">IPTV STREAM CONTROL CENTER</h2>
          </div>
        </div>

        {activeTab === 'admin' && (
          /* ADMIN DASHBOARD */
          <div className="grid grid-cols-1 md:grid-cols-12 lg:grid-cols-12 gap-6 sm:gap-8 max-w-7xl w-full mx-auto">
            
            {/* COLUMN 1: LIVE PREVIEW & CONTROLS */}
            <div className="md:col-span-6 lg:col-span-4 flex flex-col gap-6">
              
              {/* Live Preview Screen */}
              <div className="bg-[#1a1a1a] rounded-xl p-4 sm:p-5 shadow-sm border border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs sm:text-sm font-extrabold text-gray-300 uppercase tracking-wide">Live Preview</span>
                  <button 
                    onClick={() => updateOverlayField({ isBroadcastActive: !overlays.isBroadcastActive })}
                    className={`px-2.5 py-1 rounded text-white font-bold text-[9px] sm:text-[10px] tracking-widest flex items-center gap-1 transition-all ${overlays.isBroadcastActive ? 'bg-[#C92C2C] hover:bg-[#AC2323]' : 'bg-[#50BF7B] hover:bg-[#43A668]'}`}
                  >
                    {overlays.isBroadcastActive ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 fill-white text-[#C92C2C]" />
                        BROADCAST HALT
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-white text-[#50BF7B]" />
                        RESUME BROADCAST
                      </>
                    )}
                  </button>
                </div>

                {/* Simulated screen box */}
                <div className="aspect-video w-full bg-black rounded-lg border border-[#50BF7B] relative overflow-hidden flex flex-col justify-between p-3.5 shadow-inner">
                  {status.activeVideo ? (
                      <>
                        <video 
                ref={previewVideo1Ref} 
                className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${(previewActivePlayer === 1 && !status.activeVideo?.isAd) ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`} 
                playsInline 
                muted={isMuted}
              />
              <video 
                ref={previewVideo2Ref} 
                className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${(previewActivePlayer === 2 && !status.activeVideo?.isAd) ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`} 
                playsInline 
                muted={isMuted}
              />
              <video 
                ref={previewAdRef} 
                className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${status.activeVideo?.isAd ? 'opacity-100 z-20' : 'opacity-0 z-0 pointer-events-none'}`} 
                playsInline 
                muted={isMuted}
              />
                      </>
                  ) : (
                    <div className="absolute inset-0 bg-[#66DE93] z-0" />
                  )}

                  {/* Play/Unmute Button overlay */}
                  {isMuted && status.activeVideo && (
                    <button 
                      onClick={handlePlayUnmute}
                      className="absolute inset-0 w-full h-full bg-black/40 flex flex-col items-center justify-center gap-2 text-white font-bold text-xs transition-all hover:bg-black/50 z-10 cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-full bg-pink-600 flex items-center justify-center shadow-lg">
                        <Play className="w-6 h-6 fill-white text-white ml-1" />
                      </div>
                    </button>
                  )}

                  {overlays.logoActive && (
                    <div className="absolute top-2.5 left-2.5 text-white font-extrabold text-[8px] sm:text-[10px] w-7 sm:w-10 rounded-lg z-20 overflow-hidden">
                      {overlays.logoImagePath ? (
                        <img src={`${SOCKET_URL}/${overlays.logoImagePath.replace(/\\/g, '/')}`} alt="Logo" className="w-full h-auto block" />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center">Logo</div>
                      )}
                    </div>
                  )}



                  {/* Tickers, OTS & Time/Date Aligned Bottom Rows */}
                  <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-2 z-20 text-[8px] sm:text-[10px] font-bold text-white select-none drop-shadow pointer-events-none">
                    
                    {/* OTS Overlay */}
                    {overlays.otsActive && overlays.otsImagePath && (
                      <div className="self-end w-7 sm:w-10 bg-[#111111] border border-gray-800 rounded shadow-md mb-1 pointer-events-auto overflow-hidden">
                        <img src={`${SOCKET_URL}/${overlays.otsImagePath.replace(/\\/g, '/')}`} alt="OTS" className="w-full h-auto block" />
                      </div>
                    )}

                    {/* Row 1 (Ticker 1) */}
                    {overlays.ticker1Active && (
                      <div className={`flex w-full shadow-md mb-2 ${!overlays.ticker1Active ? 'justify-end' : ''}`}>
                        {/* Ticker 1 Title */}
                        {overlays.ticker1Active && (
                          <div className="bg-white border-r border-gray-300 px-1 sm:px-2 py-0.5 rounded-l w-[10%] sm:w-[8%] shrink-0 flex items-center justify-center uppercase tracking-wider text-black overflow-hidden whitespace-nowrap font-bold">
                            <span style={{ fontSize: `${Math.min(12, 9 * (10 / Math.max(4, (overlays.ticker1Title || 'Headline News 1').length)))}px` }}>
                              {overlays.ticker1Title}
                            </span>
                          </div>
                        )}
                        {/* Ticker 1 Text */}
                        {overlays.ticker1Active && (
                          <div className={`flex-1 bg-black border border-l-0 border-gray-800 px-2 py-0.5 flex items-center overflow-hidden ${overlays.showDate ? '' : 'rounded-r-md'}`}>
                            <marquee className="font-normal flex-1 text-white" scrollamount="2">{overlays.ticker1Text}</marquee>
                          </div>
                        )}
                        {overlays.showDate && (
                          <div className={`bg-black/90 backdrop-blur border border-l-0 border-gray-800 px-1 sm:px-2 py-0.5 w-[10%] sm:w-[8%] shrink-0 text-center font-mono flex items-center justify-center text-gray-300 text-[9px] sm:text-[10px] transition-opacity duration-500 overflow-hidden whitespace-nowrap ${!overlays.ticker1Active ? 'rounded border-l' : 'rounded-r'}`}>
                            {rotationIndex === 0 && <span>{currentDateStr || 'Date'}</span>}
                            {rotationIndex === 1 && <span>{currentDayStr || 'Day'}</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Row 2 (Ticker 2 & Unified Rotating Bug) */}
                    {(overlays.ticker2Active || overlays.showDate || overlays.showTime) && (
                      <div className={`flex w-full shadow-lg ${!overlays.ticker2Active ? 'justify-end' : ''}`}>
                        {/* Ticker 2 Title */}
                        {overlays.ticker2Active && (
                          <div className="bg-white border-r border-gray-300 px-1 sm:px-2 py-0.5 rounded-l w-[10%] sm:w-[8%] shrink-0 flex items-center justify-center uppercase tracking-wider text-black overflow-hidden whitespace-nowrap font-bold">
                            <span style={{ fontSize: `${Math.min(12, 9 * (10 / Math.max(4, (overlays.ticker2Title || 'Headline News 2').length)))}px` }}>
                              {overlays.ticker2Title}
                            </span>
                          </div>
                        )}
                        {/* Ticker 2 Text */}
                        {overlays.ticker2Active && (
                          <div className={`flex-1 bg-black border border-l-0 border-gray-800 px-2 py-0.5 flex items-center overflow-hidden ${overlays.showTime ? '' : 'rounded-r-md'}`}>
                            <marquee className="font-normal flex-1 text-white" scrollamount="2.5">{overlays.ticker2Text}</marquee>
                          </div>
                        )}
                        {/* Time Only Box */}
                        {overlays.showTime && (
                          <div className={`bg-black/90 backdrop-blur border border-l-0 border-gray-800 px-1 sm:px-2 py-0.5 w-[10%] sm:w-[8%] shrink-0 text-center font-mono flex items-center justify-center text-gray-300 text-[9px] sm:text-[10px] transition-opacity duration-500 overflow-hidden whitespace-nowrap ${!overlays.ticker2Active ? 'rounded border-l' : 'rounded-r'}`}>
                            <span className="animate-pulse">{currentTimeStr || 'Time'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct Stream URL Display */}
                <div className="mt-4 bg-[#1a1a1a] rounded-xl p-3 border border-pink-600/30 flex flex-col gap-1.5 shadow-lg">
                  <span className="text-[10px] sm:text-xs font-black text-pink-500 uppercase tracking-widest">Permanent Stream URL (For VLC / IPTV)</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      readOnly
                      value={`http://${window.location.hostname}/stream/live.m3u8`}
                      className="flex-1 bg-black text-gray-300 font-mono text-[9px] sm:text-[10px] px-2.5 py-1.5 rounded border border-gray-800 outline-none select-all cursor-text"
                      onClick={(e) => e.target.select()}
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(`http://${window.location.hostname}/stream/live.m3u8`);
                        alert("Stream URL Copied!");
                      }}
                      className="px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded text-[10px] font-bold transition-all shadow-md whitespace-nowrap"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>

                {/* External Live Stream button row */}
                <div className="mt-4 flex flex-col gap-2 bg-[#1a1a1a] rounded-xl p-3 border border-white/40">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Paste RTMP / HLS Stream URL (.m3u8)" 
                      value={externalUrl} 
                      onChange={(e) => setExternalUrl(e.target.value)}
                      className="flex-1 bg-[#2a2a2a] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 outline-none"
                    />
                    <button 
                      onClick={handleAddExternalLink}
                      disabled={isSubmitting}
                      className={`px-4 py-1.5 rounded-lg text-white font-bold text-xs tracking-wide transition-all shadow-sm ${isSubmitting ? 'bg-gray-600 cursor-not-allowed' : 'bg-pink-600 hover:bg-pink-700'}`}
                    >
                      {isSubmitting ? '...' : 'Connect'}
                    </button>
                  </div>
                  <button className="w-full py-2 rounded-lg bg-[#2a2a2a] hover:bg-[#333333] text-gray-300 border border-gray-700 flex items-center justify-center gap-1 text-xs font-bold transition-all shadow-sm">
                    <ArrowUp className="w-3.5 h-3.5 stroke-[3]" />
                    Push External Stream Live
                  </button>
                </div>
              </div>

              {/* Ad Playout Component */}
              <div className="bg-[#2a2a2a] rounded-xl p-4 sm:p-5 shadow-sm border border-gray-700/60 flex flex-col gap-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-xs sm:text-sm font-extrabold text-gray-300 uppercase tracking-wide">Ad Playout</span>
                  {status.activeVideo?.isAd && (
                    <button 
                      onClick={handleStopAd}
                      className="px-2.5 py-1 rounded bg-[#C92C2C] text-white font-extrabold text-[9px] sm:text-[10px] tracking-wide animate-pulse shadow-sm"
                    >
                      STOP AD
                    </button>
                  )}
                </div>

                {/* Upload Ad Area */}
                <div className="flex flex-col gap-2">
                  <input 
                    type="text" 
                    placeholder="Enter ad title (optional)" 
                    value={adTitle} 
                    onChange={(e) => setAdTitle(e.target.value)}
                    className="bg-[#2a2a2a] border-none rounded-lg px-3 py-1.5 text-xs text-gray-300 outline-none w-full"
                  />
                  <label className="py-2.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer w-full">
                    <Upload className="w-4 h-4 stroke-[3]" />
                    {isAdUploading ? 'Uploading Ad...' : 'Upload & Play Ad Now'}
                    <input type="file" accept="video/*,.mkv,.avi,.mov,.mp4,.webm,.wmv" onChange={handleAdUpload} className="hidden" disabled={isAdUploading} />
                  </label>
                </div>

                {/* Ad Playlist (history of uploaded ads) */}
                <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto mt-2 pr-1">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ad Playlist</span>
                  {ads.map((ad) => (
                    <div key={ad._id} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg p-2 border border-gray-700/40 text-xs">
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="font-bold text-gray-200 truncate">{ad.title}</span>
                        <span className="text-[9px] text-gray-500 font-mono">{formatTime(ad.duration)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          onClick={() => handlePlayAd(ad._id)}
                          className="px-2 py-1 rounded bg-[#50BF7B] hover:bg-[#43A668] text-white font-bold text-[9px] uppercase tracking-wide transition-all shadow-sm"
                        >
                          Play
                        </button>
                        <button 
                          onClick={() => handleRemoveAd(ad._id)}
                          className="text-gray-500 hover:text-[#C92C2C] transition-all"
                        >
                          <XCircle className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {ads.length === 0 && (
                    <div className="text-center py-4 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                      No Ads Uploaded Yet
                    </div>
                  )}
                </div>
              </div>

              {/* Azaan Scheduler */}
              <div className="bg-[#1a1a1a] rounded-xl p-4 sm:p-5 shadow-sm border border-gray-800 flex flex-col gap-4 mt-6">
                <span className="text-xs sm:text-sm font-extrabold text-gray-300 uppercase tracking-wide">Automated Azaan Schedule</span>
                <p className="text-[10px] text-gray-500 mb-2">Turn ON to automatically play the respective Azaan video at the scheduled time.</p>
                
                <div className="flex flex-col gap-3">
                  {/* Fajr */}
                  <div className="flex justify-between items-center bg-[#2a2a2a] p-2 sm:p-3 rounded-lg border border-gray-700/50">
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Fajr Azaan</span>
                    <button 
                      onClick={() => updateOverlayField({ azaanFajrActive: !overlays.azaanFajrActive })}
                      className={`w-10 h-5 sm:w-12 sm:h-6 rounded-full p-1 transition-all ${overlays.azaanFajrActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                    >
                      <div className={`w-3 h-3 sm:w-4 sm:h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.azaanFajrActive ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                  
                  {/* Zohr */}
                  <div className="flex justify-between items-center bg-[#2a2a2a] p-2 sm:p-3 rounded-lg border border-gray-700/50">
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Zohr Azaan</span>
                    <button 
                      onClick={() => updateOverlayField({ azaanZohrActive: !overlays.azaanZohrActive })}
                      className={`w-10 h-5 sm:w-12 sm:h-6 rounded-full p-1 transition-all ${overlays.azaanZohrActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                    >
                      <div className={`w-3 h-3 sm:w-4 sm:h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.azaanZohrActive ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                  
                  {/* Asr */}
                  <div className="flex justify-between items-center bg-[#2a2a2a] p-2 sm:p-3 rounded-lg border border-gray-700/50">
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Asr Azaan</span>
                    <button 
                      onClick={() => updateOverlayField({ azaanAsrActive: !overlays.azaanAsrActive })}
                      className={`w-10 h-5 sm:w-12 sm:h-6 rounded-full p-1 transition-all ${overlays.azaanAsrActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                    >
                      <div className={`w-3 h-3 sm:w-4 sm:h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.azaanAsrActive ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                  
                  {/* Maghrib */}
                  <div className="flex justify-between items-center bg-[#2a2a2a] p-2 sm:p-3 rounded-lg border border-gray-700/50">
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Maghrib Azaan</span>
                    <button 
                      onClick={() => updateOverlayField({ azaanMaghribActive: !overlays.azaanMaghribActive })}
                      className={`w-10 h-5 sm:w-12 sm:h-6 rounded-full p-1 transition-all ${overlays.azaanMaghribActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                    >
                      <div className={`w-3 h-3 sm:w-4 sm:h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.azaanMaghribActive ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                  
                  {/* Isha */}
                  <div className="flex justify-between items-center bg-[#2a2a2a] p-2 sm:p-3 rounded-lg border border-gray-700/50">
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Isha Azaan</span>
                    <button 
                      onClick={() => updateOverlayField({ azaanIshaActive: !overlays.azaanIshaActive })}
                      className={`w-10 h-5 sm:w-12 sm:h-6 rounded-full p-1 transition-all ${overlays.azaanIshaActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                    >
                      <div className={`w-3 h-3 sm:w-4 sm:h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.azaanIshaActive ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* COLUMN 2: NEWS TICKERS & OTS CONFIGURATION */}
            <div className="md:col-span-6 lg:col-span-4 flex flex-col gap-6">
              
              {/* News Tickers config */}
              <div className="bg-[#1a1a1a] rounded-xl p-4 sm:p-5 shadow-sm border border-gray-800 flex flex-col gap-5">
                <div className="flex justify-between items-center">
                  <span className="text-xs sm:text-sm font-extrabold text-gray-300 uppercase tracking-wide">News Ticker</span>
                  <button 
                    onClick={() => {
                      setIsPushingLive(true);
                      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                      saveConfigToBackend(overlaysRef.current);
                      setTimeout(() => setIsPushingLive(false), 1000);
                    }}
                    className={`px-3 py-1.5 rounded font-extrabold text-[9px] sm:text-[10px] tracking-wide shadow-sm transition-all flex items-center gap-1 ${isPushingLive ? 'bg-[#50BF7B] text-white' : 'bg-[#C92C2C] hover:bg-[#AC2323] text-white'}`}
                  >
                    {isPushingLive ? 'SAVED TO LIVE!' : 'PUSH TO LIVE'}
                  </button>
                </div>

                {/* News Ticker 1 */}
                <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
                  <span className="text-xs font-bold text-white tracking-wide text-center">News Ticker -1</span>
                  <input 
                    type="text" 
                    placeholder="Title Card" 
                    value={overlays.ticker1Title || ''} 
                    onChange={(e) => updateOverlayField({ ticker1Title: e.target.value }, true)}
                    className="bg-[#2a2a2a] border-none rounded-lg px-3.5 py-2 text-xs text-gray-300 outline-none font-semibold placeholder:text-gray-500 w-full"
                  />
                  <input 
                    type="text" 
                    placeholder="Headline Text" 
                    value={overlays.ticker1Text || ''} 
                    onChange={(e) => updateOverlayField({ ticker1Text: e.target.value }, true)}
                    className="bg-[#2a2a2a] border-none rounded-lg px-3.5 py-2 text-xs text-gray-300 outline-none font-semibold placeholder:text-gray-500 w-full"
                  />
                  <button 
                    onClick={() => updateOverlayField({ ticker1Active: !overlays.ticker1Active })}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${overlays.ticker1Active ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                  >
                    <div className={`w-4 h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.ticker1Active ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </button>
                </div>

                {/* News Ticker 2 */}
                <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
                  <span className="text-xs font-bold text-white tracking-wide text-center">News Ticker -2</span>
                  <input 
                    type="text" 
                    placeholder="Title Card" 
                    value={overlays.ticker2Title || ''} 
                    onChange={(e) => updateOverlayField({ ticker2Title: e.target.value }, true)}
                    className="bg-[#2a2a2a] border-none rounded-lg px-3.5 py-2 text-xs text-gray-300 outline-none font-semibold placeholder:text-gray-500 w-full"
                  />
                  <input 
                    type="text" 
                    placeholder="Headline Text" 
                    value={overlays.ticker2Text || ''} 
                    onChange={(e) => updateOverlayField({ ticker2Text: e.target.value }, true)}
                    className="bg-[#2a2a2a] border-none rounded-lg px-3.5 py-2 text-xs text-gray-300 outline-none font-semibold placeholder:text-gray-500 w-full"
                  />
                  <button 
                    onClick={() => updateOverlayField({ ticker2Active: !overlays.ticker2Active })}
                    className={`w-12 h-6 rounded-full p-1 transition-all ${overlays.ticker2Active ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                  >
                    <div className={`w-4 h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.ticker2Active ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </button>
                </div>

                {/* Time and Date Toggles */}
                <div className="flex flex-col gap-3">
                  <span className="text-[11px] font-bold text-[#666666] tracking-wide text-center">Time and Date</span>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 bg-[#2a2a2a] rounded-xl px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-300">Time</span>
                      <button 
                        onClick={() => updateOverlayField({ showTime: !overlays.showTime })}
                        className={`w-8 h-4 rounded-full p-0.5 transition-all ${overlays.showTime ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                      >
                        <div className={`w-3 h-3 bg-[#2a2a2a] rounded-full transition-all ${overlays.showTime ? 'translate-x-4' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                    <div className="flex-1 bg-[#2a2a2a] rounded-xl px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-300">Date</span>
                      <button 
                        onClick={() => updateOverlayField({ showDate: !overlays.showDate })}
                        className={`w-8 h-4 rounded-full p-0.5 transition-all ${overlays.showDate ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                      >
                        <div className={`w-3 h-3 bg-[#2a2a2a] rounded-full transition-all ${overlays.showDate ? 'translate-x-4' : 'translate-x-0'}`}></div>
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Stream Logo config */}
              <div className="bg-[#1a1a1a] rounded-xl p-4 sm:p-5 shadow-sm border border-gray-800 flex flex-col gap-4">
                <span className="text-xs sm:text-sm font-extrabold text-gray-300 uppercase tracking-wide">Stream Logo</span>
                <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 flex flex-col gap-2.5">
                    <label className="py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-gray-800 text-gray-300 font-bold text-xs tracking-wide cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-sm">
                      <Upload className="w-3.5 h-3.5 stroke-[3]" />
                      Upload Logo
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                    <button className="py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-gray-800 text-gray-300 font-bold text-xs tracking-wide flex items-center justify-center gap-1 shadow-sm">
                      <ArrowUp className="w-3.5 h-3.5 -rotate-45 stroke-[3]" />
                      Top Left
                    </button>
                  </div>
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#B3B3B3] rounded-lg border border-white/30 flex items-center justify-center p-2 shadow-inner overflow-hidden mx-auto sm:mx-0">
                    {overlays.logoImagePath ? (
                      <img src={overlays.logoImagePath.startsWith('data:') ? overlays.logoImagePath : `${SOCKET_URL}/${overlays.logoImagePath}`} alt="Logo" className="max-w-full max-h-full object-contain rounded" />
                    ) : (
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Preview</span>
                    )}
                  </div>
                </div>
                
                {/* Enable Logo toggle */}
                <button 
                  onClick={() => updateOverlayField({ logoActive: !overlays.logoActive })}
                  className={`w-12 h-6 rounded-full p-1 self-end transition-all ${overlays.logoActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                >
                  <div className={`w-4 h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.logoActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>

              {/* OTS Graphic config */}
              <div className="bg-[#1a1a1a] rounded-xl p-4 sm:p-5 shadow-sm border border-gray-800 flex flex-col gap-4">
                <span className="text-xs sm:text-sm font-extrabold text-gray-300 uppercase tracking-wide">OTS Graphic</span>
                <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 flex flex-col gap-2.5">
                    <label className="py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-gray-800 text-gray-300 font-bold text-xs tracking-wide cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-sm">
                      <Upload className="w-3.5 h-3.5 stroke-[3]" />
                      Upload
                      <input type="file" accept="image/*" onChange={handleOtsUpload} className="hidden" />
                    </label>
                    <button className="py-2.5 rounded-lg bg-[#1a1a1a] hover:bg-gray-800 text-gray-300 font-bold text-xs tracking-wide flex items-center justify-center gap-1 shadow-sm">
                      <ArrowUp className="w-3.5 h-3.5 rotate-135 stroke-[3]" />
                      Bottom Right
                    </button>
                  </div>
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#B3B3B3] rounded-lg border border-white/30 flex items-center justify-center p-2 shadow-inner overflow-hidden mx-auto sm:mx-0">
                    {overlays.otsImagePath ? (
                      <img src={overlays.otsImagePath.startsWith('data:') ? overlays.otsImagePath : `${SOCKET_URL}/${overlays.otsImagePath}`} alt="OTS" className="max-w-full max-h-full object-contain rounded" />
                    ) : (
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Preview</span>
                    )}
                  </div>
                </div>
                
                {/* Enable OTS toggle */}
                <button 
                  onClick={() => updateOverlayField({ otsActive: !overlays.otsActive })}
                  className={`w-12 h-6 rounded-full p-1 self-end transition-all ${overlays.otsActive ? 'bg-[#50BF7B]' : 'bg-[#767676]'}`}
                >
                  <div className={`w-4 h-4 bg-[#2a2a2a] rounded-full transition-all ${overlays.otsActive ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </button>
              </div>

            </div>

            {/* COLUMN 3: VIDEO PLAYLIST SERIAL */}
            <div className="md:col-span-12 lg:col-span-4 flex flex-col gap-6">
              
              {/* Video Playlist Serial container */}
              <div className="bg-[#1a1a1a] rounded-xl p-4 sm:p-5 shadow-sm border border-gray-800 flex flex-col gap-4 flex-1">
                <span className="text-xs sm:text-sm font-extrabold text-gray-300 uppercase tracking-wide">Video Playlist Serial</span>
                
                {/* Table headers */}
                <div className="grid grid-cols-12 text-center text-[9px] sm:text-[10px] font-bold text-[#666666] tracking-widest pb-1 border-b border-gray-700 select-none">
                  <div className="col-span-6 text-left pl-7">TITLE</div>
                  <div className="col-span-2">LEFT</div>
                  <div className="col-span-2">LEFT</div>
                  <div className="col-span-2">ACTIONS</div>
                </div>

                {/* List rows */}
                <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[300px] sm:max-h-[350px] pr-1">
                  {playlist.map((video, idx) => (
                    <div key={video._id} className="grid grid-cols-12 items-center bg-[#2a2a2a] rounded-lg p-2 sm:p-2.5 border border-gray-700/50 shadow-sm text-center">
                      <div className="col-span-6 flex items-center gap-1.5 sm:gap-2 text-left min-w-0">
                        <button className="text-gray-500 hover:text-gray-300">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded bg-[#B3B3B3] shrink-0"></div>
                        <span className="text-xs font-bold text-gray-300 truncate pr-1">{video.title}</span>
                      </div>
                      
                      {/* Left timer columns */}
                      <div className="col-span-2 text-[9px] sm:text-[10px] font-bold text-[#50BF7B] tracking-wider">
                        {formatTime(video.duration)}
                      </div>
                      <div className="col-span-2 text-[9px] sm:text-[10px] font-bold text-[#C92C2C] tracking-wider">
                        ---
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
                    <div className="text-center py-8 text-xs text-gray-400 font-bold">
                      Playlist is empty. Add videos or live stream URLs.
                    </div>
                  )}
                </div>

                {/* Add Video button mockup */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Title (optional)" 
                      value={uploadTitle} 
                      onChange={(e) => setUploadTitle(e.target.value)}
                      className="bg-[#2a2a2a] border-none rounded-lg px-3 py-1.5 text-xs text-gray-300 outline-none flex-1"
                    />
                    <select 
                      value={uploadCategory} 
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="bg-[#2a2a2a] border-none rounded-lg px-2 py-1.5 text-xs text-gray-300 outline-none"
                    >
                      <option value="News">News</option>
                      <option value="Music">Music</option>
                      <option value="Movie">Movie</option>
                    </select>
                  </div>
                  <button 
                    onClick={() => setShowLibraryModal(true)}
                    className="py-3 rounded-lg bg-[#2a2a2a] hover:bg-[#333333] text-white font-bold text-xs tracking-widest flex items-center justify-center gap-2 border border-gray-700 transition-all shadow-sm cursor-pointer w-full"
                  >
                    <Folder className="w-4 h-4 stroke-[3]" />
                    Select from Library
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* --- SETTINGS / SYSTEM OVERVIEW --- */}
        {activeTab === 'settings' && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full max-w-5xl mx-auto overflow-y-auto">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white mb-2 self-start tracking-wider">System Overview</h1>
            <p className="text-gray-400 text-xs sm:text-sm self-start mb-8 tracking-wide">Manage your account and system permissions.</p>

            <div className="w-full flex flex-col lg:flex-row gap-6 lg:gap-10">
              
              {/* Left Column: Password Management */}
              <div className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-lg p-5 sm:p-6 flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center border border-pink-500/20">
                    <Settings className="w-5 h-5 text-pink-500" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-sm sm:text-base">Change Password</h2>
                    <p className="text-gray-500 text-[10px] sm:text-xs">Update your current admin password</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-400 tracking-wider">Current Password</label>
                    <input type="password" id="current-pwd" placeholder="Enter current password" className="bg-[#2a2a2a] border border-gray-700/50 rounded-lg px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-pink-500/50 transition-all" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-400 tracking-wider">New Password</label>
                    <input type="password" id="new-pwd" placeholder="Enter new password" className="bg-[#2a2a2a] border border-gray-700/50 rounded-lg px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-pink-500/50 transition-all" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-400 tracking-wider">Confirm New Password</label>
                    <input type="password" id="confirm-pwd" placeholder="Re-enter new password" className="bg-[#2a2a2a] border border-gray-700/50 rounded-lg px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-pink-500/50 transition-all" />
                  </div>
                  <button 
                    onClick={async () => {
                      const cur = document.getElementById('current-pwd').value;
                      const newP = document.getElementById('new-pwd').value;
                      const conf = document.getElementById('confirm-pwd').value;
                      if (!cur || !newP) return alert('Fill all fields');
                      if (newP !== conf) return alert('New passwords do not match');
                      
                      try {
                        const res = await apiFetch(`${SOCKET_URL}/api/auth/change-password`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ currentPassword: cur, newPassword: newP })
                        });
                        const data = await res.json();
                        if (data.success) {
                          alert('Password updated successfully!');
                          document.getElementById('current-pwd').value = '';
                          document.getElementById('new-pwd').value = '';
                          document.getElementById('confirm-pwd').value = '';
                        } else {
                          alert(data.message || 'Error updating password');
                        }
                      } catch (err) {
                        alert('Error updating password');
                      }
                    }}
                    className="mt-2 w-full py-3 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-bold text-sm tracking-wide transition-all shadow-md"
                  >
                    Update Password
                  </button>
                </div>
              </div>

              {/* Right Column: Super Admin Only (Promote Admins) */}
              {user && user.role === 'superadmin' ? (
                <div className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-lg p-5 sm:p-6 flex flex-col gap-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-pink-500 to-purple-600 text-[10px] font-bold text-white rounded-bl-lg shadow-sm">
                    SUPER ADMIN EXCLUSIVE
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                      <AlertTriangle className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                      <h2 className="text-white font-bold text-sm sm:text-base">Admin Access Control</h2>
                      <p className="text-gray-500 text-[10px] sm:text-xs">Invite news portals to become normal admins</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-400 tracking-wider">Email Address to Invite</label>
                      <div className="flex gap-2">
                        <input type="email" id="invite-email" placeholder="client@news.com" className="flex-1 bg-[#2a2a2a] border border-gray-700/50 rounded-lg px-4 py-2.5 text-sm text-gray-200 outline-none focus:border-purple-500/50 transition-all" />
                        <button 
                          onClick={async () => {
                            const email = document.getElementById('invite-email').value;
                            if (!email) return alert('Enter an email');
                            try {
                              const res = await apiFetch(`${SOCKET_URL}/api/auth/invite`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email })
                              });
                              const data = await res.json();
                              if (data.success) {
                                alert(`Invited ${email}! They can now register.`);
                                document.getElementById('invite-email').value = '';
                                // Re-render or force refetch of list not strictly needed if we just alert, but a refetch would be nice. 
                                // Since it's a simple setup, alerting is sufficient for now.
                              } else {
                                alert(data.message || 'Error inviting user');
                              }
                            } catch (err) {
                              alert('Error inviting user');
                            }
                          }}
                          className="px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-all"
                        >
                          Invite
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">Invited users must go to the Register page to create their account.</p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <button 
                        onClick={async () => {
                          try {
                            const res = await apiFetch(`${SOCKET_URL}/api/auth/invites`);
                            const data = await res.json();
                            if (data.success) {
                              const invitesList = data.data.invites.map(i => i.email).join('\n');
                              const usersList = data.data.users.map(u => `${u.email} (${u.role})`).join('\n');
                              alert(`PENDING INVITES:\n${invitesList || 'None'}\n\nREGISTERED ADMINS:\n${usersList}`);
                            }
                          } catch (err) {
                            alert('Failed to load list');
                          }
                        }}
                        className="w-full py-2.5 rounded-lg border border-purple-500/30 text-purple-400 font-bold text-xs hover:bg-purple-500/10 transition-all"
                      >
                        View All Admins & Pending Invites
                      </button>
                    </div>

                  </div>
                </div>
              ) : (
                <div className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded-xl shadow-lg p-5 sm:p-6 flex flex-col gap-4 items-center justify-center text-center opacity-50">
                   <AlertTriangle className="w-8 h-8 text-gray-600" />
                   <div>
                     <h3 className="text-gray-400 font-bold text-sm">Restricted Area</h3>
                     <p className="text-gray-600 text-xs mt-1">Only the Super Admin can manage permissions.</p>
                   </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* Library Selection Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-800">
              <h2 className="text-xl font-black text-white flex items-center gap-3 tracking-wider">
                <Folder className="w-6 h-6 text-pink-500" />
                SELECT FROM VIDEO LIBRARY
              </h2>
              <button 
                onClick={() => setShowLibraryModal(false)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-[#111111]">
              {libraryAssets.length === 0 ? (
                <div className="text-center py-12">
                  <Folder className="w-16 h-16 text-gray-800 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-400">Library is empty</h3>
                  <p className="text-sm text-gray-600 mt-1">Go to the Video Library page to upload videos first.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {libraryAssets.map(asset => (
                    <div 
                      key={asset._id} 
                      onClick={async () => {
                        try {
                          await apiFetch(`${SOCKET_URL}/api/playlist/add-from-library`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ libraryId: asset._id })
                          });
                          setShowLibraryModal(false);
                          fetchPlaylist();
                        } catch (err) {
                          alert('Failed to add video to playlist');
                        }
                      }}
                      className="bg-[#2a2a2a] border border-gray-700 hover:border-pink-500 rounded-xl overflow-hidden cursor-pointer group transition-all"
                    >
                      <div className="aspect-video bg-black relative flex items-center justify-center">
                        <Play className="w-8 h-8 text-gray-700 group-hover:text-pink-500 transition-colors" />
                        <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {Math.floor(asset.duration / 3600)}:{String(Math.floor((asset.duration % 3600) / 60)).padStart(2, '0')}:{String(Math.floor(asset.duration % 60)).padStart(2, '0')}
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="text-xs font-bold text-gray-200 line-clamp-2" title={asset.title}>
                          {asset.title}
                        </h3>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
