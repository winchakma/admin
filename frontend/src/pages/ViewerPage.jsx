import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import io from 'socket.io-client';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, CircleDot, Monitor, CheckCircle, User, List } from 'lucide-react';

const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

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
  const adPlayerRef = useRef(null);
  const [activePlayer, setActivePlayer] = useState(1);
  const wrapperRef = useRef(null);
  const socketRef = useRef(null);
  const currentVideoIdRef = useRef(null);

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
      setRotationIndex(prev => (prev + 1) % 2);
    }, 3000);
    return () => clearInterval(rotater);
  }, []);

  // Live time and date updater
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
      
      let h = d.getHours();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12; 
      const hours = h.toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const seconds = d.getSeconds().toString().padStart(2, '0');
      setCurrentTimeStr(`${hours}:${minutes}:${seconds} ${ampm}`);

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
    }, 2500); 
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

    const controller = new AbortController();
    fetch(`${SOCKET_URL}/api/overlays`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (data) setOverlays(prev => ({ ...prev, ...data }));
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.warn('Overlay config offline');
      });

    return () => {
      s.off('connect');
      s.off('stream_status');
      s.off('overlays_updated');
      s.disconnect();
      controller.abort();
    };
  }, []);

  // Dual Video Playback & Sync Engine
  useEffect(() => {
    let timeoutId;
    if (!status.activeVideo || !status.isPlaying || !overlays.isBroadcastActive) {
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
        element.play().catch(e => console.log("Autoplay blocked:", e));
      };
      if (element.readyState >= 1) {
        element.currentTime = offset || 0;
        element.play().catch(e => console.log("Autoplay blocked:", e));
      }
    };

    if (status.activeVideo.isAd) {
      if (adPlayerRef.current) {
        const currentSrc = adPlayerRef.current.getAttribute('src');
        if (currentSrc !== videoUrl) {
          adPlayerRef.current.src = videoUrl;
          adPlayerRef.current.load();
        }
        if (adPlayerRef.current.readyState >= 1) {
          const targetOffset = status.activeVideo.offset || 0;
          if (Math.abs(adPlayerRef.current.currentTime - targetOffset) > 10) {
            adPlayerRef.current.currentTime = targetOffset;
          }
        }
        adPlayerRef.current.muted = isMuted;
        adPlayerRef.current.volume = volume;
        adPlayerRef.current.play().catch(e => console.log("Autoplay blocked:", e));
      }
      if (currentEl) {
        currentEl.pause();
      }
      if (nextEl) {
        nextEl.pause();
      }
      return;
    } else {
      if (adPlayerRef.current && !adPlayerRef.current.paused) {
        adPlayerRef.current.pause();
        adPlayerRef.current.removeAttribute('src');
        adPlayerRef.current.load();
      }
      if (currentEl) {
        currentEl.muted = isMuted;
        currentEl.volume = volume;
      }
      if (nextEl) {
        nextEl.muted = isMuted;
        nextEl.volume = volume;
      }
    }

    if (currentVideoIdRef.current !== status.activeVideo.id) {
      currentVideoIdRef.current = status.activeVideo.id;
      
      const nextCurrentSrc = nextEl.getAttribute('src');
      if (nextCurrentSrc === videoUrl) {
        if (nextEl.readyState >= 1) {
          const targetOffset = status.activeVideo.offset || 0;
          if (Math.abs(nextEl.currentTime - targetOffset) > 1) {
            nextEl.currentTime = targetOffset;
          }
        }
        nextEl.play().catch(e => console.log("Autoplay blocked:", e));
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
        
        timeoutId = setTimeout(() => {
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
        }, 5000);
      }
    } else if (!currentEl.hasAttribute('src')) {
      currentVideoIdRef.current = status.activeVideo.id;
      loadAndPlayVideo(currentEl, videoUrl, status.activeVideo.offset);
    } else {
      if (currentEl.readyState >= 1) {
        const currentDiff = Math.abs(currentEl.currentTime - status.activeVideo.offset);
        if (currentDiff > 5 && !currentEl.seeking) {
           currentEl.currentTime = status.activeVideo.offset;
        }

        if (currentEl.paused && !isPaused) {
          currentEl.play().catch(e => console.log("Autoplay blocked:", e));
        }
      }

      if (status.nextVideo) {
        const nextNormalized = status.nextVideo.filePath.replace(/\\/g, '/');
        const nextUrl = nextNormalized.startsWith('http') ? nextNormalized : `${SOCKET_URL}/${nextNormalized}`;
        if (nextEl.getAttribute('src') !== nextUrl) {
          nextEl.pause();
          nextEl.src = nextUrl;
          nextEl.load();
        }
      }
    }
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (video1Ref.current) {
        video1Ref.current.oncanplay = null;
        video1Ref.current.onloadeddata = null;
      }
      if (video2Ref.current) {
        video2Ref.current.oncanplay = null;
        video2Ref.current.onloadeddata = null;
      }
    };
  }, [status.activeVideo, overlays.isBroadcastActive, activePlayer, isPaused]); 

  const getPlayingElement = () => {
    if (status.activeVideo?.isAd) return adPlayerRef.current;
    return activePlayer === 1 ? video1Ref.current : video2Ref.current;
  };

  const handlePlayUnmute = () => {
    setIsMuted(false);
    setIsPaused(false);
    
    // Unlock all video elements for unmuted autoplay
    [video1Ref, video2Ref, adPlayerRef].forEach(ref => {
      if (ref.current) {
        ref.current.muted = false;
        ref.current.volume = volume;
        const p = ref.current.play();
        if (p !== undefined) {
          p.catch(() => {});
        }
      }
    });
  };

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex items-center justify-center font-sans">
      <div 
        ref={wrapperRef}
        onMouseMove={resetIdleTimer}
        onClick={resetIdleTimer}
        onTouchStart={resetIdleTimer}
        onMouseLeave={() => {
          setIsHovering(false);
          clearTimeout(hideControlsTimeoutRef.current);
        }}
        className={`relative w-full h-full bg-black group ${!isHovering ? 'cursor-none' : ''}`}
      >
            <div className={`absolute inset-0 w-full h-full ${status.activeVideo && overlays.isBroadcastActive ? 'block' : 'hidden'}`}>
              <video 
                ref={video1Ref} 
                className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${(activePlayer === 1 && !status.activeVideo?.isAd) ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`} 
                playsInline 
                muted={isMuted}
              />
              <video 
                ref={video2Ref} 
                className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${(activePlayer === 2 && !status.activeVideo?.isAd) ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`} 
                playsInline 
                muted={isMuted}
              />
              <video 
                ref={adPlayerRef} 
                className={`absolute inset-0 w-full h-full object-contain bg-black transition-opacity duration-300 ${status.activeVideo?.isAd ? 'opacity-100 z-20' : 'opacity-0 z-0 pointer-events-none'}`} 
                playsInline 
                muted={isMuted}
              />
            </div>

            {(!status.activeVideo || !overlays.isBroadcastActive) && (
              <div className="absolute inset-0 bg-slate-900 z-0 flex items-center justify-center border-[4px] border-slate-800 rounded-xl">
                <span className="text-gray-500 font-bold text-2xl lg:text-3xl uppercase tracking-widest opacity-50 flex items-center flex-col gap-4">
                  <Monitor className="w-16 h-16" />
                  Broadcast Offline
                </span>
              </div>
            )}

            {/* Play/Unmute Button overlay */}
            {isMuted && status.activeVideo && overlays.isBroadcastActive && (
              <button 
                onClick={handlePlayUnmute}
                className="absolute inset-0 w-full h-full bg-black/60 flex flex-col items-center justify-center gap-4 text-white font-bold text-xl transition-all hover:bg-black/75 z-10 cursor-pointer backdrop-blur-sm"
              >
                <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.6)] hover:scale-110 transition-transform">
                  <Play className="w-10 h-10 fill-white text-white ml-2" />
                </div>
              </button>
            )}

            {/* Overlays only show if broadcast is active */}
            {overlays.isBroadcastActive && (
              <>
                {/* Site Logo */}
                {overlays.logoActive && (
                  <div className="absolute top-[3%] left-[3%] text-white font-extrabold w-[7%] rounded-lg z-20 overflow-hidden">
                    {overlays.logoImagePath ? (
                      <img src={overlays.logoImagePath.startsWith('data:') ? overlays.logoImagePath : `${SOCKET_URL}/${overlays.logoImagePath.replace(/\\/g, '/')}`} alt="Logo" className="w-full h-auto block" />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center text-[1vw]">Logo</div>
                    )}
                  </div>
                )}

                {/* Tickers, OTS & Time/Date */}
                <div className="absolute bottom-[3%] left-[3%] right-[3%] flex flex-col gap-[1.5%] z-20 font-bold text-white select-none drop-shadow-lg pointer-events-none">
                  
                  {/* OTS graphic overlay */}
                  {overlays.otsActive && overlays.otsImagePath && (
                    <div className="self-end w-[15%] aspect-square flex items-center justify-center p-[1%] rounded-lg mb-[1%] pointer-events-auto">
                      <img src={overlays.otsImagePath.startsWith('data:') ? overlays.otsImagePath : `${SOCKET_URL}/${overlays.otsImagePath.replace(/\\/g, '/')}`} alt="OTS" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}

                  {/* Row 1 (Ticker 1) */}
                  {overlays.ticker1Active && (
                    <div className={`flex w-full shadow-lg mb-[1vh] ${!overlays.ticker1Active ? 'justify-end' : ''}`}>
                      {overlays.ticker1Active && (
                        <div className="bg-white border-r-[2px] border-gray-300 px-[0.5%] py-[0.5%] rounded-l-md w-[8%] shrink-0 flex items-center justify-center uppercase tracking-wider text-black overflow-hidden whitespace-nowrap font-black font-sans shadow-inner">
                          <span style={{ fontSize: `${Math.min(1.2, 1.2 * (10 / Math.max(4, (overlays.ticker1Title || 'Headline 1').length)))}vw` }}>
                            {overlays.ticker1Title || 'Headline 1'}
                          </span>
                        </div>
                      )}
                      {overlays.ticker1Active && (
                        <div className={`flex-1 bg-black border border-l-0 border-gray-800 px-[1%] py-[0.5%] flex items-center overflow-hidden ${overlays.showDate ? '' : 'rounded-r-md'}`}>
                          <marquee className="font-normal flex-1 text-white text-[1.2vw]" scrollamount="2.5">{overlays.ticker1Text}</marquee>
                        </div>
                      )}
                      {overlays.showDate && (
                        <div className={`bg-black/90 backdrop-blur border border-l-0 border-gray-800 px-[1%] py-[0.5%] w-[8%] shrink-0 text-center font-mono flex items-center justify-center text-gray-300 text-[1vw] transition-opacity duration-500 overflow-hidden whitespace-nowrap ${!overlays.ticker1Active ? 'rounded-md border-l' : 'rounded-r-md'}`}>
                          {rotationIndex === 0 && <span>{currentDateStr}</span>}
                          {rotationIndex === 1 && <span>{currentDayStr}</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Row 2 (Ticker 2 & Time/Date) */}
                  {(overlays.ticker2Active || overlays.showDate || overlays.showTime) && (
                    <div className={`flex w-full shadow-lg ${!overlays.ticker2Active ? 'justify-end' : ''}`}>
                      {overlays.ticker2Active && (
                        <div className="bg-white border-r-[2px] border-gray-300 px-[0.5%] py-[0.5%] rounded-l-md w-[8%] shrink-0 flex items-center justify-center uppercase tracking-wider text-black overflow-hidden whitespace-nowrap font-black font-sans shadow-inner">
                          <span style={{ fontSize: `${Math.min(1.2, 1.2 * (10 / Math.max(4, (overlays.ticker2Title || 'Headline 2').length)))}vw` }}>
                            {overlays.ticker2Title || 'Headline 2'}
                          </span>
                        </div>
                      )}
                      {overlays.ticker2Active && (
                        <div className={`flex-1 bg-black border border-l-0 border-gray-800 px-[1%] py-[0.5%] flex items-center overflow-hidden ${overlays.showTime ? '' : 'rounded-r-md'}`}>
                          <marquee className="font-normal flex-1 text-white text-[1.2vw]" scrollamount="3">{overlays.ticker2Text}</marquee>
                        </div>
                      )}
                      {overlays.showTime && (
                        <div className={`bg-black/90 backdrop-blur border border-l-0 border-gray-800 px-[1%] py-[0.5%] w-[8%] shrink-0 text-center font-mono flex items-center justify-center text-gray-300 text-[1vw] transition-opacity duration-500 overflow-hidden whitespace-nowrap ${!overlays.ticker2Active ? 'rounded-md border-l' : 'rounded-r-md'}`}>
                          <span className="animate-pulse">{currentTimeStr}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Custom TV Player Control Bar */}
                <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-12 pb-3 px-4 z-30 transition-opacity duration-300 ${isHovering || isPaused || isMuted ? 'opacity-100' : 'opacity-0'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <button onClick={() => {
                        const currentEl = getPlayingElement();
                        if (currentEl) {
                          if (isPaused) {
                            currentEl.play();
                            setIsPaused(false);
                          } else {
                            currentEl.pause();
                            setIsPaused(true);
                          }
                        }
                      }} className="text-white hover:text-blue-500 transition-colors">
                        {isPaused || isMuted ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
                      </button>
                      
                      <div className="flex items-center space-x-2 group/volume relative">
                        <button onClick={() => {
                          const currentEl = getPlayingElement();
                          if (currentEl) {
                            if (isMuted) {
                              currentEl.muted = false;
                              currentEl.volume = volume === 0 ? 0.5 : volume;
                              setIsMuted(false);
                              if (volume === 0) setVolume(0.5);
                            } else {
                              currentEl.muted = true;
                              setIsMuted(true);
                            }
                          }
                        }} className="text-white hover:text-blue-500 transition-colors">
                          {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>
                        <input 
                          type="range" 
                          min="0" max="1" step="0.05"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setVolume(val);
                            const currentEl = getPlayingElement();
                            if (currentEl) {
                              currentEl.volume = val;
                              currentEl.muted = val === 0;
                            }
                            setIsMuted(val === 0);
                          }}
                          className="w-0 opacity-0 group-hover/volume:w-20 group-hover/volume:opacity-100 transition-all duration-300 accent-blue-500 cursor-pointer"
                        />
                      </div>

                      <button 
                        onClick={() => {
                          const currentEl = getPlayingElement();
                          if (currentEl && status.activeVideo) {
                            currentEl.currentTime = status.activeVideo.offset;
                            currentEl.play().catch(e => console.log(e));
                            setIsPaused(false);
                          }
                        }}
                        className="flex items-center space-x-1.5 ml-2 cursor-pointer hover:opacity-75 transition-opacity"
                      >
                        <CircleDot className="w-3 h-3 text-red-500 animate-pulse" />
                        <span className="text-white font-bold text-xs tracking-widest uppercase">Live</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="relative">
                        <button 
                          onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                          className="text-white hover:text-blue-500 transition-colors flex items-center gap-1 text-xs font-bold tracking-wider"
                        >
                          <Settings className={`w-4 h-4 transition-transform duration-300 ${showSettingsMenu ? 'rotate-90 text-blue-500' : ''}`} /> 
                          {selectedQuality === 'Auto' ? 'HD' : selectedQuality}
                        </button>
                        
                        {showSettingsMenu && (
                          <div className="absolute bottom-full right-0 mb-4 w-32 bg-black/95 backdrop-blur-sm border border-gray-700 rounded-md shadow-2xl overflow-hidden py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="px-3 py-2 text-xs font-bold text-gray-400 border-b border-gray-800 uppercase tracking-wider">Quality</div>
                            {['Auto', '1080p', '720p', '480p', '360p'].map(q => (
                              <button
                                key={q}
                                onClick={() => {
                                  setSelectedQuality(q);
                                  setShowSettingsMenu(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 transition-colors flex items-center justify-between ${selectedQuality === q ? 'text-blue-500 font-bold bg-white/5' : 'text-white'}`}
                              >
                                {q}
                                {selectedQuality === q && <CircleDot className="w-2 h-2 text-blue-500" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => {
                        if (!document.fullscreenElement) {
                          wrapperRef.current?.requestFullscreen().then(() => {
                            if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
                              window.screen.orientation.lock('landscape').catch(e => console.log('Orientation lock failed', e));
                            }
                          }).catch(err => console.log(err));
                        } else {
                          document.exitFullscreen().then(() => {
                            if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
                              window.screen.orientation.unlock();
                            }
                          }).catch(err => console.log(err));
                        }
                      }} className="text-white hover:text-blue-500 transition-colors ml-2">
                        <Maximize className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
      </div>

  );
};

export default ViewerPage;
