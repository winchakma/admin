import re

with open('c:/Users/user/Desktop/admin/frontend/src/pages/ViewerPage.jsx', 'r', encoding='utf8') as f:
    content = f.read()

# 1. Replace SOCKET_URL definition
content = content.replace(
    "const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://admin-spml.onrender.com';",
    "const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';"
)

# 2. Replace Refs
content = content.replace(
    "const video1Ref = useRef(null);\n  const video2Ref = useRef(null);\n  const [activePlayer, setActivePlayer] = useState(1);",
    "const videoRef = useRef(null);\n  const hlsRef = useRef(null);"
)

# 3. Replace the entire Dual Video Engine
# We'll find "// Dual Video Playback" and find the matching "  }, [status.activeVideo, overlays.isBroadcastActive]);" line.
# Actually, the line is:
#  }, [status.activeVideo, overlays.isBroadcastActive]); // IMPORTANT: Depends on the whole activeVideo object to trigger every second!

hls_logic = '''
  useEffect(() => {
    if (!status.activeVideo || !overlays.isBroadcastActive) {
      if (videoRef.current) {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    if (Hls.isSupported() && videoRef.current) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });
      hlsRef.current = hls;
      
      const streamUrl = `${SOCKET_URL}/stream/live.m3u8`;
      
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(streamUrl);
      });
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isPaused && !isMuted) {
          videoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
        }
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (videoRef.current && videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = `${SOCKET_URL}/stream/live.m3u8`;
      videoRef.current.addEventListener('loadedmetadata', () => {
        if (!isPaused && !isMuted) {
          videoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
        }
      });
    }
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [status.activeVideo, overlays.isBroadcastActive]);'''

# We will use re.sub for this part but be more relaxed with the ending.
content = re.sub(
    r'  // Dual Video Playback & Sync Engine\n  useEffect\(\(\) => \{.*?\n  \}, \[status\.activeVideo, overlays\.isBroadcastActive\]\);[^\n]*',
    hls_logic.strip(),
    content,
    flags=re.DOTALL
)

# 4. Replace handlePlayUnmute
old_handle_play = '''  const handlePlayUnmute = () => {
    setIsMuted(false);
    setIsPaused(false);
    const currentEl = activePlayer === 1 ? video1Ref.current : video2Ref.current;
    if (currentEl) {
      currentEl.play().catch(err => console.log(err));
      currentEl.muted = false;
      currentEl.volume = volume;
    }
  };'''

new_handle_play = '''  const handlePlayUnmute = () => {
    setIsMuted(false);
    setIsPaused(false);
    if (videoRef.current) {
      videoRef.current.play().catch(err => console.log(err));
      videoRef.current.muted = false;
      videoRef.current.volume = volume;
    }
  };'''
content = content.replace(old_handle_play, new_handle_play)

# 5. Replace activePlayer references in controls
content = content.replace('const currentEl = activePlayer === 1 ? video1Ref.current : video2Ref.current;', 'const currentEl = videoRef.current;')

# 6. Replace video tags
old_videos = '''<video 
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
          />'''

new_videos = '''<video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover z-0 opacity-100 block" 
            playsInline 
            muted={isMuted}
          />'''

content = content.replace(old_videos, new_videos)

with open('c:/Users/user/Desktop/admin/frontend/src/pages/ViewerPage.jsx', 'w', encoding='utf8') as f:
    f.write(content)
