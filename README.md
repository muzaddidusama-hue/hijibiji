# hijibiji

## Premium IPTV Web Application

A minimal, high-performance, and fully responsive IPTV web streaming dashboard.

### Features
- **Parallel Parser**: Concurrently fetches and parses multiple M3U/M3U8 playlists on load.
- **Smart Filter Guard**: Filters out Kodi DRM configurations (`#KODIPROP`) and unplayable MPEG-DASH streams (`.mpd`).
- **Cinematic custom player controls**: Sleek HTML5 video player integration powered by Hls.js, featuring Play/Pause overlays, custom volume sliders, reload triggers, native Fullscreen, and PiP (Picture-in-Picture).
- **Adaptive Quality Selector**: Dynamically parses manifest streams to let users select resolution levels or use adaptive auto-bitrate.
- **Low-Bandwidth Mode**: Optimizes buffer sizes and caps resolution quality at startup to prevent buffering on slow connections.
- **CORS Bypass Proxy**: Easily switches on-the-fly to route streams through `corsproxy.io` bypass proxy when direct fetches fail.
- **Deduplication & Search**: Aggregates feeds into a single sorted list (deduplicating exact streams and names) and filters in real-time by search terms and category pills.

### Technologies
- HTML5 & Vanilla JavaScript
- Tailwind CSS v4 (Browser CDN)
- Hls.js v1.5.8
- Lucide Icons & Outfit typography
