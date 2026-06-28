import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';

const ViewerPage = () => {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://admin-spml.onrender.com';

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      const res = await fetch(`${API_URL}/api/channels`);
      const data = await res.json();
      setChannels(data);
      if (data.length > 0) {
        setActiveChannel(data[0]);
      }
    } catch (err) {
      console.error("Error fetching channels:", err);
    }
  };

  useEffect(() => {
    if (activeChannel && videoRef.current) {
      const video = videoRef.current;
      const streamUrl = activeChannel.streamUrl;

      if (Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }
        const hls = new Hls();
        hlsRef.current = hls;
        
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(e => console.error("Auto-play prevented", e));
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(e => console.error("Auto-play prevented", e));
        });
      }
    }
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [activeChannel]);

  return (
    <div className="min-h-screen bg-[#111111] text-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 bg-[#111111] z-50">
        <div className="flex items-center space-x-6">
          <div className="text-2xl font-bold text-pink-500 mr-8">MS BD SHOP ~ LTD</div>
          <nav className="hidden md:flex space-x-6 text-sm font-medium text-gray-300">
            <a href="#" className="hover:text-white pb-1 border-b-2 border-white">Live TV</a>
            <a href="#" className="hover:text-white">Sports</a>
            <a href="#" className="hover:text-white">Drama</a>
            <a href="#" className="hover:text-white">Movies</a>
          </nav>
        </div>
      </header>

      {/* Main Video Player */}
      <div className="w-full max-w-6xl mx-auto mt-6 bg-black rounded-lg overflow-hidden shadow-2xl relative aspect-video">
        <video 
          ref={videoRef}
          controls 
          className="w-full h-full object-contain bg-black"
          autoPlay
          muted
        />
        {activeChannel && (
          <div className="absolute top-4 left-4 bg-black/60 px-4 py-2 rounded-md flex items-center space-x-3">
             {activeChannel.logoPath && (
               <img src={`${API_URL}/${activeChannel.logoPath}`} alt="Logo" className="h-8 w-8 rounded-full object-cover" />
             )}
             <span className="font-bold">{activeChannel.name}</span>
             <span className="flex items-center text-red-500 text-sm font-bold ml-2">
               <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1"></span> LIVE
             </span>
          </div>
        )}
      </div>

      {/* Channel Grid */}
      <div className="max-w-6xl mx-auto mt-12 px-4 pb-20">
        <h2 className="text-xl font-bold mb-6">Live Channels</h2>
        
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-6">
          {channels.map((channel) => (
            <div 
              key={channel._id} 
              onClick={() => setActiveChannel(channel)}
              className={`flex flex-col items-center cursor-pointer group ${activeChannel?._id === channel._id ? 'opacity-100' : 'opacity-70 hover:opacity-100 transition-opacity'}`}
            >
              <div className={`w-20 h-20 rounded-full bg-white flex items-center justify-center p-2 shadow-lg mb-3 ${activeChannel?._id === channel._id ? 'ring-4 ring-pink-500' : 'group-hover:ring-2 ring-gray-400'}`}>
                {channel.logoPath ? (
                  <img src={`${API_URL}/${channel.logoPath}`} alt={channel.name} className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="text-gray-800 font-bold text-center leading-tight truncate px-1">{channel.name}</div>
                )}
              </div>
              <span className="text-xs font-semibold text-center truncate w-full">{channel.name}</span>
            </div>
          ))}
          {channels.length === 0 && (
            <div className="col-span-full text-center text-gray-500 py-10">No channels available.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewerPage;
