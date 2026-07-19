/**
 * Usama IPTV — Client Application Logic
 * Premium, minimal, and fully functional IPTV streaming dashboard.
 */

// --- Global Application State ---
const state = {
  allChannels: [],
  filteredChannels: [],
  categories: new Set(),
  activeCategory: 'All',
  searchQuery: '',
  activeChannel: null,
  failedChannels: new Set(), // Track channels that failed to load
  
  // Settings (synchronized with LocalStorage)
  lowBandwidthMode: localStorage.getItem('usama_low_bandwidth') === 'true',
  useProxy: localStorage.getItem('usama_use_proxy') === 'true',
  
  // Playlist Sources Metadata - VERIFIED WORKING SOURCES
  sources: [
    { name: 'lupael.github.io (running.m3u)', url: 'https://lupael.github.io/IPTV/running.m3u', status: 'pending' },
    { name: 'abusaeeidx/Mrgify-BDIX-IPTV', url: 'https://github.com/abusaeeidx/Mrgify-BDIX-IPTV/raw/main/playlist.m3u', status: 'pending' },
    { name: 'iptv-org/Sports (sports.m3u)', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u', status: 'pending' },
    { name: 'cloudy44-a/IPTV Channels', url: 'https://gist.githubusercontent.com/cloudy44-a/5739c14bceb83d1c2cdded28ecfdffd1/raw/channels.m3u', status: 'pending' }
    { name: 'Free-TV/IPTV (playlist.m3u8)', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8', status: 'pending' }
  ]
};

// --- Proxy Definitions ---
// CORS proxies helper
// We use corsproxy.io because it handles HLS streams and m3u8 files reliably without auth keys
const getProxiedUrl = (url) => {
  if (!state.useProxy) return url;
  return `https://corsproxy.io/?${encodeURIComponent(url)}`;
};

// --- HLS.js Player Variables ---
let hls = null;
const videoEl = document.getElementById('iptv-video');

// --- DOM Elements Cache ---
const elements = {
  // Counters / Indicators
  channelCounter: document.getElementById('channel-counter'),
  quickBandwidthBtn: document.getElementById('quick-bandwidth-toggle'),
  bandwidthStatusDot: document.getElementById('bandwidth-status'),
  badgeLowSpeedActive: document.getElementById('badge-low-speed-active'),
  
  // Search & Categories
  searchInput: document.getElementById('channel-search'),
  clearSearchBtn: document.getElementById('clear-search-btn'),
  categoryPills: document.getElementById('category-pills'),
  channelsContainer: document.getElementById('channels-container'),

  // Player Overlays
  playerStartOverlay: document.getElementById('player-start-overlay'),
  playerLoadingOverlay: document.getElementById('player-loading-overlay'),
  playerErrorOverlay: document.getElementById('player-error-overlay'),
  errorMessageText: document.getElementById('error-message-text'),
  errorRetryBtn: document.getElementById('error-retry-btn'),
  errorProxyEnableBtn: document.getElementById('error-proxy-enable-btn'),
  
  // Custom Controls
  playPauseBtn: document.getElementById('play-pause-btn'),
  playIcon: document.getElementById('play-icon'),
  reloadStreamBtn: document.getElementById('reload-stream-btn'),
  muteBtn: document.getElementById('mute-btn'),
  volumeIcon: document.getElementById('volume-icon'),
  volumeSlider: document.getElementById('volume-slider'),
  pipBtn: document.getElementById('pip-btn'),
  fullscreenBtn: document.getElementById('fullscreen-btn'),
  fullscreenIcon: document.getElementById('fullscreen-icon'),
  
  // Quality Controls
  qualityBtn: document.getElementById('quality-btn'),
  qualityLabel: document.getElementById('quality-label'),
  qualityDropdown: document.getElementById('quality-dropdown'),
  qualitySelectorContainer: document.getElementById('quality-selector-container'),
  
  // Channel Details Card
  activeChannelLogo: document.getElementById('active-channel-logo'),
  activeChannelName: document.getElementById('active-channel-name'),
  activeChannelCategory: document.getElementById('active-channel-category'),
  activeChannelSource: document.getElementById('active-channel-source'),
  currentStreamStatus: document.getElementById('current-stream-status'),
  
  // Settings Modal Elements
  settingsToggleBtn: document.getElementById('settings-toggle-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  settingsSaveBtn: document.getElementById('settings-save-btn'),
  modalBandwidthToggle: document.getElementById('modal-bandwidth-toggle'),
  modalBandwidthKnob: document.getElementById('modal-bandwidth-knob'),
  modalProxyToggle: document.getElementById('modal-proxy-toggle'),
  modalProxyKnob: document.getElementById('modal-proxy-knob')
};

// --- Initializer Function ---
document.addEventListener('DOMContentLoaded', () => {
  initUIStates();
  initEventListeners();
  loadPlaylists();
});

// --- UI Initial States Synchronization ---
function initUIStates() {
  // Sync toggle controls in UI from active settings state
  updateToggleVisuals(elements.modalBandwidthToggle, elements.modalBandwidthKnob, state.lowBandwidthMode);
  updateToggleVisuals(elements.modalProxyToggle, elements.modalProxyKnob, state.useProxy);
  
  // Sync quick navbar bandwidth state
  if (state.lowBandwidthMode) {
    elements.bandwidthStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b]';
    elements.badgeLowSpeedActive.classList.replace('hidden', 'flex');
  } else {
    elements.bandwidthStatusDot.className = 'w-2 h-2 rounded-full bg-zinc-600';
    elements.badgeLowSpeedActive.classList.replace('flex', 'hidden');
  }
  
  // Sync volume progress slider styling
  const vol = elements.volumeSlider.value;
  elements.volumeSlider.style.setProperty('--volume-percent', `${vol}%`);
}

function updateToggleVisuals(trackEl, knobEl, isActive) {
  if (isActive) {
    trackEl.classList.replace('bg-zinc-700', 'bg-cyan-500');
    knobEl.classList.replace('left-0.5', 'left-[22px]');
  } else {
    trackEl.classList.replace('bg-cyan-500', 'bg-zinc-700');
    knobEl.classList.replace('left-[22px]', 'left-0.5');
  }
}

// --- Playlist Fetching with Runtime Channel Validation ---
async function loadPlaylists() {
  const fetchPromises = state.sources.map(async (source, idx) => {
    try {
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      source.status = 'loaded';
      document.getElementById(`source-status-${idx}`).innerText = 'SUCCESS';
      document.getElementById(`source-status-${idx}`).className = 'text-emerald-400 font-bold uppercase';
      return parseM3U(text);
    } catch (err) {
      console.error(`Error loading source ${source.name}:`, err);
      source.status = 'failed';
      document.getElementById(`source-status-${idx}`).innerText = 'FAILED';
      document.getElementById(`source-status-${idx}`).className = 'text-red-500 font-bold uppercase';
      return [];
    }
  });

  // Fetch in parallel
  const results = await Promise.all(fetchPromises);
  
  // Merge and deduplicate channels
  const mergedChannels = results.flat();
  state.allChannels = deduplicateChannels(mergedChannels);
  state.filteredChannels = [...state.allChannels];
  
  // Compile Unique Categories
  state.categories.clear();
  state.allChannels.forEach(c => {
    if (c.category) state.categories.add(c.category);
  });
  
  // Update counter badge
  elements.channelCounter.innerText = `Channels: ${state.allChannels.length}`;
  
  // Render layout components
  renderCategoryPills();
  renderChannelGrid();
}

/**
 * Robust regex-based M3U/M3U8 tag parsing
 */
function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];
  let currentInfo = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // Regex parsing for attributes on EXINF
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      const nameAttrMatch = line.match(/tvg-name="([^"]+)"/i);
      
      // Parse Display Name (anything after the last comma)
      const commaIndex = line.lastIndexOf(',');
      let name = "";
      if (commaIndex !== -1) {
        name = line.substring(commaIndex + 1).trim();
      } else {
        name = nameAttrMatch ? nameAttrMatch[1] : "Unknown Channel";
      }

      currentInfo = {
        name: name || (nameAttrMatch ? nameAttrMatch[1] : "Unknown Channel"),
        logo: logoMatch ? logoMatch[1] : "",
        category: groupMatch ? sanitizeCategory(groupMatch[1]) : "Other Streams",
        url: ""
      };
    } else if (line.startsWith('#')) {
      // Ignore other M3U metadata headers
      continue;
    } else if (currentInfo) {
      // Current line represents the actual stream URL
      currentInfo.url = line;
      
      const name = currentInfo.name.trim();
      const url = currentInfo.url.trim().toLowerCase();
      
      // Filter out unplayable formats (raw .ts files, DASH .mpd files, Kodi config statements)
      const isPlayableHLS = url.includes('.m3u8') || url.includes('.m3u') || url.includes('master') || url.includes('manifest') || url.includes('playlist');
      const isUnplayable = url.includes('.ts') || url.includes('.mpd') || url.includes('/dash/') || name.startsWith('#') || name.includes('KODIPROP');
      
      if (isUnplayable || !isPlayableHLS) {
        currentInfo = null;
        continue;
      }
      
      channels.push(currentInfo);
      currentInfo = null;
    }
  }

  return channels;
}

/**
 * Standardize and sanitize M3U categories
 */
function sanitizeCategory(catName) {
  if (!catName) return "Other Streams";
  
  let formatted = catName
    .replace(/[_\-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
    
  // Standardize common groupings
  if (/sports|football|cricket|fifa/i.test(formatted)) return "Sports";
  if (/news|cnn|bbc|al jazeera/i.test(formatted)) return "News";
  if (/movies|cinema|hbo|film/i.test(formatted)) return "Movies";
  if (/music|mtv/i.test(formatted)) return "Music";
  if (/kids|cartoon|disney/i.test(formatted)) return "Kids";
  if (/entertainment|show|general/i.test(formatted)) return "Entertainment";
  if (/bdix|local|bangla/i.test(formatted)) return "Local Channels";
  
  return formatted;
}

/**
 * Deduplicate channels based on exact stream URL or trimmed name (case-insensitive)
 */
function deduplicateChannels(channels) {
  const seenUrls = new Set();
  const seenNames = new Set();
  const unique = [];

  for (const channel of channels) {
    if (!channel.url) continue;
    
    const standardUrl = channel.url.toLowerCase().trim();
    const standardName = channel.name.toLowerCase().trim();
    
    // Deduplicate if we've already registered this stream link or exact channel title
    if (!seenUrls.has(standardUrl) && !seenNames.has(standardName)) {
      seenUrls.add(standardUrl);
      seenNames.add(standardName);
      unique.push(channel);
    }
  }
  
  // Sort alphabetically by name
  return unique.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Render Categories & Pills ---
function renderCategoryPills() {
  const sortedCategories = Array.from(state.categories).sort();
  const categoriesList = ["All"];
  if (sortedCategories.includes("Sports")) {
    categoriesList.push("Sports");
  }
  sortedCategories.forEach(cat => {
    if (cat !== "Sports") {
      categoriesList.push(cat);
    }
  });
  
  elements.categoryPills.innerHTML = '';
  
  categoriesList.forEach(cat => {
    const pill = document.createElement('button');
    const count = cat === 'All' ? state.allChannels.length : state.allChannels.filter(c => c.category === cat).length;
    
    if (count === 0 && cat !== 'All') return; // Skip empty categories
    
    pill.className = `px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer snap-start transition duration-200 ${
      state.activeCategory === cat 
        ? 'bg-cyan-400 text-zinc-950 shadow-md shadow-cyan-400/10 active-pill' 
        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800/80'
    }`;
    pill.innerText = `${cat} (${count})`;
    
    pill.addEventListener('click', () => {
      // Update UI active styling
      document.querySelector('.active-pill')?.classList.remove('bg-cyan-400', 'text-zinc-950', 'shadow-md', 'shadow-cyan-400/10', 'active-pill');
      document.querySelector('.active-pill')?.classList.add('bg-zinc-900', 'hover:bg-zinc-800', 'text-zinc-300', 'hover:text-white', 'border', 'border-zinc-800/80');
      
      pill.className = 'px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer snap-start transition duration-200 bg-cyan-400 text-zinc-950 shadow-md shadow-cyan-400/10 active-pill';
      
      state.activeCategory = cat;
      filterAndRenderChannels();
    });
    
    elements.categoryPills.appendChild(pill);
  });
}

// --- Render Channel Grid Cards ---
function renderChannelGrid() {
  elements.channelsContainer.innerHTML = '';
  
  if (state.filteredChannels.length === 0) {
    elements.channelsContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center p-8 text-center border border-zinc-800/50 rounded-2xl bg-zinc-900/10 mt-4">
        <i data-lucide="search-code" class="w-8 h-8 text-zinc-600 mb-2"></i>
        <p class="text-sm font-semibold text-zinc-400">No channels found</p>
        <p class="text-xs text-zinc-500 mt-1">Try resetting your search query or choosing another category.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  state.filteredChannels.forEach((channel, index) => {
    const card = document.createElement('div');
    const isActive = state.activeChannel && state.activeChannel.url === channel.url;
    const isFailed = state.failedChannels.has(channel.url);
    
    card.className = `glass-card flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 ${
      isFailed 
        ? 'border-red-500/30 bg-red-950/20 opacity-60 cursor-not-allowed' 
        : isActive 
          ? 'channel-active border-zinc-800/60 bg-zinc-900/10' 
          : 'border-zinc-800/60 bg-zinc-900/10 cursor-pointer'
    }`;
    
    // Fail-safe Logo Placeholder SVG if link is broken/missing
    const placeholderSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234b5563'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M15 19l-7-7 7-7'%3E%3C/path%3E%3C/svg%3E`;
    const logoSrc = channel.logo || placeholderSvg;
    
    card.innerHTML = `
      <div class="h-10 w-10 rounded-lg bg-zinc-900 border border-zinc-800/80 flex items-center justify-center p-1.5 overflow-hidden shrink-0">
        <img class="h-full w-full object-contain channel-logo-img" 
             src="${logoSrc}" 
             onerror="this.src='${placeholderSvg}'" 
             alt="${channel.name}">
      </div>
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-bold text-zinc-200 truncate group-hover:text-white transition ${isFailed ? 'line-through text-red-400' : ''}">${channel.name}</h4>
        <span class="text-[10px] text-zinc-400 border border-zinc-800/80 bg-zinc-900/40 rounded px-1.5 py-0.5 mt-0.5 inline-block font-semibold">${channel.category}</span>
      </div>
      <div class="channel-indicator hidden">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400"></span>
        </span>
      </div>
      ${isFailed ? `<div class="text-red-500 text-xs font-semibold">Failed</div>` : ''}
    `;
    
    if (isActive) {
      card.querySelector('.channel-indicator').classList.remove('hidden');
    }
    
    if (!isFailed) {
      card.addEventListener('click', () => {
        // Remove previous active state
        document.querySelector('.channel-active')?.querySelector('.channel-indicator').classList.add('hidden');
        document.querySelector('.channel-active')?.classList.remove('channel-active');
        
        // Mark current active
        card.classList.add('channel-active');
        card.querySelector('.channel-indicator').classList.remove('hidden');
        
        playChannel(channel);
      });
    }
    
    elements.channelsContainer.appendChild(card);
  });
}

// --- Search and Category Filtering Logic ---
function filterAndRenderChannels() {
  const query = state.searchQuery.toLowerCase().trim();
  
  state.filteredChannels = state.allChannels.filter(channel => {
    const matchesSearch = channel.name.toLowerCase().includes(query) || 
                          channel.category.toLowerCase().includes(query);
    const matchesCategory = state.activeCategory === 'All' || 
                            channel.category === state.activeCategory;
                            
    return matchesSearch && matchesCategory;
  });
  
  renderChannelGrid();
}

// --- HLS Stream Loading & Playing with Error Detection ---
function playChannel(channel) {
  state.activeChannel = channel;
  
  // Update Player Metadata elements
  elements.activeChannelName.innerText = channel.name;
  elements.activeChannelCategory.innerText = channel.category;
  elements.activeChannelSource.innerText = `Stream: ${channel.url}`;
  elements.activeChannelLogo.src = channel.logo || `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233f3f46'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M15 19l-7-7 7-7'%3E%3C/path%3E%3C/svg%3E`;
  elements.currentStreamStatus.innerText = "Connecting...";
  elements.currentStreamStatus.className = "text-xs text-cyan-400 font-semibold";
  
  // Show spinner overlay, hide others
  elements.playerStartOverlay.classList.add('opacity-0', 'pointer-events-none');
  elements.playerErrorOverlay.classList.add('opacity-0', 'pointer-events-none');
  elements.playerLoadingOverlay.classList.remove('opacity-0');
  
  const streamUrl = getProxiedUrl(channel.url);
  console.log(`Attempting to stream: ${streamUrl}`);
  
  // Terminate previous player instance
  if (hls) {
    hls.destroy();
    hls = null;
  }
  
  // Quality dropdown setup reset
  elements.qualityDropdown.classList.add('hidden');
  elements.qualityLabel.innerText = "Quality: Auto";
  
  // Check if HLS.js is supported in current browser environment
  if (Hls.isSupported()) {
    // Determine dynamic player config for Low-Bandwidth Mode
    const config = getHlsConfig();
    
    hls = new Hls(config);
    hls.loadSource(streamUrl);
    hls.attachMedia(videoEl);
    
    // --- HLS EVENT LISTENERS ---
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('HLS Media attached successfully');
    });
    
    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log('Manifest loaded, found levels:', data.levels.length);
      elements.playerLoadingOverlay.classList.add('opacity-0');
      
      // Auto Play
      videoEl.play()
        .then(() => updatePlayPauseButton(true))
        .catch(err => {
          console.warn('Playback blocked by browser auto-play restrictions', err);
          updatePlayPauseButton(false);
        });
        
      elements.currentStreamStatus.innerText = "Streaming Live";
      elements.currentStreamStatus.className = "text-xs text-emerald-400 font-semibold";
      
      // Set up Quality selectors
      setupQualityMenu(hls.levels);
      
      // Apply Low-Bandwidth initial quality cap
      if (state.lowBandwidthMode) {
        hls.currentLevel = 0; // Select lowest bitrate level index
        updateQualityLabel(0, hls.levels);
      } else {
        hls.currentLevel = -1; // Auto level selector
        updateQualityLabel(-1, hls.levels);
      }
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      const activeLvl = hls.levels[data.level];
      if (activeLvl) {
        const height = activeLvl.height;
        const autoText = hls.autoLevelEnabled ? 'Auto (' : '';
        const endParenthesis = hls.autoLevelEnabled ? 'p)' : 'p';
        elements.currentStreamStatus.innerText = `Active Quality: ${autoText}${height}${endParenthesis}`;
      }
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('Fatal HLS.js Error:', data);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Fatal network error. Try to recover.
            console.log('Fatal network error. Retrying connection...');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('Fatal media error. Recovering media...');
            hls.recoverMediaError();
            break;
          default:
            // Cannot recover - mark channel as failed
            console.error('Stream failed - marking channel as failed');
            state.failedChannels.add(channel.url);
            hls.destroy();
            hls = null;
            
            // Re-render to show failed status
            renderChannelGrid();
            showStreamError(data);
            break;
        }
      } else {
        console.warn('Non-fatal HLS Error:', data);
      }
    });
    
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    // Fallback: Safari Native streaming support
    console.log('Utilizing Safari native HLS parser');
    videoEl.src = streamUrl;
    
    videoEl.addEventListener('loadedmetadata', () => {
      elements.playerLoadingOverlay.classList.add('opacity-0');
      videoEl.play();
      updatePlayPauseButton(true);
      
      elements.currentStreamStatus.innerText = "Streaming Live (Native)";
      elements.currentStreamStatus.className = "text-xs text-emerald-400 font-semibold";
      elements.qualityLabel.innerText = "Quality: Native";
      elements.qualitySelectorContainer.classList.add('opacity-50', 'pointer-events-none');
    });
    
    videoEl.addEventListener('error', (e) => {
      // Mark channel as failed on error
      state.failedChannels.add(channel.url);
      renderChannelGrid();
      showStreamError(e);
    });
  } else {
    // Browser does not support HLS at all
    elements.playerLoadingOverlay.classList.add('opacity-0');
    state.failedChannels.add(channel.url);
    renderChannelGrid();
    showStreamError({ info: 'Your browser does not support HLS stream playback.' });
  }
}

/**
 * Configure optimized HLS.js buffer settings for low bandwidth
 */
function getHlsConfig() {
  const baseConfig = {
    enableWorker: true,
    lowLatencyMode: false, // Turn off low latency to favor buffer safety
  };
  
  if (state.lowBandwidthMode) {
    return {
      ...baseConfig,
      maxBufferLength: 45, // Buffer ahead up to 45s
      maxMaxBufferLength: 60,
      maxBufferSize: 20 * 1024 * 1024, // cap max buffer at 20MB
      abrEwmaDefaultEstimate: 300000, // assume 300kbps initial speed
      testBandwidth: false, // skip auto-probing
      backBufferLength: 15
    };
  }
  
  return {
    ...baseConfig,
    maxBufferLength: 20,
    maxMaxBufferLength: 35,
    maxBufferSize: 60 * 1024 * 1024, // 60MB max buffer size
  };
}

/**
 * Stream Failure Handler
 */
function showStreamError(errDetails) {
  elements.playerLoadingOverlay.classList.add('opacity-0');
  elements.playerErrorOverlay.classList.remove('opacity-0', 'pointer-events-none');
  
  elements.currentStreamStatus.innerText = "Playback Failed";
  elements.currentStreamStatus.className = "text-xs text-red-500 font-semibold";
  
  // Custom smart error text detection
  let errorMsg = "The stream is temporarily unavailable or returned a network error.";
  if (state.useProxy) {
    errorMsg = "Stream playback failed even via proxy. The channel source might be offline.";
    elements.errorProxyEnableBtn.classList.add('hidden');
  } else {
    errorMsg = "Direct stream loading failed due to CORS policy block or stream offline. Try playing via proxy bypass.";
    elements.errorProxyEnableBtn.classList.remove('hidden');
  }
  
  elements.errorMessageText.innerText = errorMsg;
}

// --- Dynamic Quality Level Selector ---
function setupQualityMenu(levels) {
  elements.qualityDropdown.innerHTML = '';
  
  // Auto mode option
  const autoOption = document.createElement('button');
  autoOption.className = `w-full text-left px-4 py-2 hover:bg-zinc-800 text-xs font-semibold transition ${
    !hls.autoLevelEnabled ? 'text-zinc-400' : 'text-cyan-400 border-l-2 border-cyan-400 bg-cyan-950/20'
  }`;
  autoOption.innerText = 'Adaptive (Auto)';
  autoOption.addEventListener('click', () => {
    hls.currentLevel = -1; // Auto
    updateQualityLabel(-1, levels);
    elements.qualityDropdown.classList.add('hidden');
  });
  elements.qualityDropdown.appendChild(autoOption);
  
  // Level options sorted highest to lowest
  const sortedLevels = [...levels].map((l, originalIdx) => ({ l, originalIdx })).reverse();
  
  sortedLevels.forEach(({ l, originalIdx }) => {
    const option = document.createElement('button');
    const isCurrent = hls.currentLevel === originalIdx && !hls.autoLevelEnabled;
    const mbps = (l.bitrate / (1024 * 1024)).toFixed(1);
    
    option.className = `w-full text-left px-4 py-2 hover:bg-zinc-800 text-xs transition flex justify-between items-center ${
      isCurrent ? 'text-cyan-400 border-l-2 border-cyan-400 bg-cyan-950/20 font-bold' : 'text-zinc-300 font-semibold'
    }`;
    
    option.innerHTML = `
      <span>${l.height}p</span>
      <span class="text-[10px] text-zinc-500 font-mono">${mbps} Mbps</span>
    `;
    
    option.addEventListener('click', () => {
      hls.currentLevel = originalIdx;
      updateQualityLabel(originalIdx, levels);
      elements.qualityDropdown.classList.add('hidden');
    });
    
    elements.qualityDropdown.appendChild(option);
  });
}

function updateQualityLabel(levelIdx, levels) {
  if (levelIdx === -1) {
    elements.qualityLabel.innerText = "Quality: Auto";
  } else {
    const level = levels[levelIdx];
    elements.qualityLabel.innerText = `Quality: ${level ? level.height : 'Auto'}p`;
  }
  
  // Re-render checkmarks in menu
  if (hls && hls.levels) {
    setupQualityMenu(hls.levels);
  }
}

// --- Player Native Event Handlers ---
function updatePlayPauseButton(isPlaying) {
  if (isPlaying) {
    elements.playIcon.setAttribute('data-lucide', 'pause');
  } else {
    elements.playIcon.setAttribute('data-lucide', 'play');
  }
  lucide.createIcons();
}

// --- Core Event Listeners Setup ---
function initEventListeners() {
  
  // Native Video element controls
  videoEl.addEventListener('play', () => updatePlayPauseButton(true));
  videoEl.addEventListener('pause', () => updatePlayPauseButton(false));
  videoEl.addEventListener('waiting', () => {
    elements.playerLoadingOverlay.classList.remove('opacity-0');
  });
  videoEl.addEventListener('playing', () => {
    elements.playerLoadingOverlay.classList.add('opacity-0');
  });
  
  // Play/Pause button click
  elements.playPauseBtn.addEventListener('click', () => {
    if (!state.activeChannel) return;
    if (videoEl.paused) {
      videoEl.play();
    } else {
      videoEl.pause();
    }
  });
  
  // Reload Stream
  elements.reloadStreamBtn.addEventListener('click', () => {
    if (state.activeChannel) {
      playChannel(state.activeChannel);
    }
  });
  
  // Click on video canvas triggers play/pause toggling
  videoEl.addEventListener('click', () => {
    if (!state.activeChannel) return;
    if (videoEl.paused) {
      videoEl.play();
    } else {
      videoEl.pause();
    }
  });

  // Mute / Unmute
  elements.muteBtn.addEventListener('click', () => {
    videoEl.muted = !videoEl.muted;
    updateMuteUI();
  });
  
  // Volume Slider changes
  elements.volumeSlider.addEventListener('input', (e) => {
    const vol = e.target.value;
    videoEl.volume = vol / 100;
    if (vol == 0) {
      videoEl.muted = true;
    } else {
      videoEl.muted = false;
    }
    updateMuteUI();
  });
  
  // Quality dropdown visibility
  elements.qualityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.qualityDropdown.classList.toggle('hidden');
  });
  
  document.addEventListener('click', () => {
    elements.qualityDropdown.classList.add('hidden');
  });

  // Picture in Picture
  elements.pipBtn.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoEl.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP not supported or failed:', e);
    }
  });

  // Fullscreen implementation on the container frame to persist custom UI overlay
  const playerContainer = videoEl.parentElement;
  elements.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      playerContainer.requestFullscreen()
        .then(() => {
          elements.fullscreenIcon.setAttribute('data-lucide', 'minimize');
          lucide.createIcons();
        })
        .catch(err => console.error('Error entering fullscreen:', err));
    } else {
      document.exitFullscreen()
        .then(() => {
          elements.fullscreenIcon.setAttribute('data-lucide', 'maximize');
          lucide.createIcons();
        });
    }
  });
  
  // Listen for fullscreen change event (e.g. Esc key pressed)
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      elements.fullscreenIcon.setAttribute('data-lucide', 'maximize');
    } else {
      elements.fullscreenIcon.setAttribute('data-lucide', 'minimize');
    }
    lucide.createIcons();
  });

  // Search input with Debounce for performance
  let searchTimeout = null;
  elements.searchInput.addEventListener('input', (e) => {
    const value = e.target.value;
    state.searchQuery = value;
    
    if (value.length > 0) {
      elements.clearSearchBtn.classList.remove('hidden');
    } else {
      elements.clearSearchBtn.classList.add('hidden');
    }
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterAndRenderChannels();
    }, 200);
  });
  
  elements.clearSearchBtn.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.clearSearchBtn.classList.add('hidden');
    filterAndRenderChannels();
  });

  // Error screen control click actions
  elements.errorRetryBtn.addEventListener('click', () => {
    if (state.activeChannel) playChannel(state.activeChannel);
  });
  
  elements.errorProxyEnableBtn.addEventListener('click', () => {
    state.useProxy = true;
    localStorage.setItem('usama_use_proxy', 'true');
    initUIStates();
    if (state.activeChannel) playChannel(state.activeChannel);
  });

  // Start Overlay Play button click triggers play state
  elements.playerStartOverlay.addEventListener('click', () => {
    // Triggers click on the first channel if none is selected
    if (!state.activeChannel && state.allChannels.length > 0) {
      const firstCard = elements.channelsContainer.querySelector('.glass-card');
      if (firstCard) firstCard.click();
    }
  });

  // --- Settings Panel Controls ---
  
  // Settings Visibility
  elements.settingsToggleBtn.addEventListener('click', () => toggleSettingsModal(true));
  elements.settingsCloseBtn.addEventListener('click', () => toggleSettingsModal(false));
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) toggleSettingsModal(false);
  });
  
  // Quick Bandwidth Toggle in Top Bar
  elements.quickBandwidthBtn.addEventListener('click', () => {
    state.lowBandwidthMode = !state.lowBandwidthMode;
    localStorage.setItem('usama_low_bandwidth', state.lowBandwidthMode);
    
    initUIStates();
    
    // If stream is active, reload to enforce quality restriction
    if (state.activeChannel) {
      playChannel(state.activeChannel);
    }
  });
  
  // Modal Bandwidth Toggling
  elements.modalBandwidthToggle.addEventListener('click', () => {
    const active = !state.lowBandwidthMode;
    state.lowBandwidthMode = active;
    updateToggleVisuals(elements.modalBandwidthToggle, elements.modalBandwidthKnob, active);
  });
  
  // Modal Proxy Toggling
  elements.modalProxyToggle.addEventListener('click', () => {
    const active = !state.useProxy;
    state.useProxy = active;
    updateToggleVisuals(elements.modalProxyToggle, elements.modalProxyKnob, active);
  });
  
  // Modal Save Action
  elements.settingsSaveBtn.addEventListener('click', () => {
    // Commit configurations to memory storage
    localStorage.setItem('usama_low_bandwidth', state.lowBandwidthMode);
    localStorage.setItem('usama_use_proxy', state.useProxy);
    
    // Refresh GUI visuals
    initUIStates();
    toggleSettingsModal(false);
    
    // Reload stream immediately with new configurations
    if (state.activeChannel) {
      playChannel(state.activeChannel);
    }
  });
}

/**
 * Handle Mute state change visuals
 */
function updateMuteUI() {
  const isMuted = videoEl.muted;
  const val = videoEl.volume * 100;
  
  elements.volumeSlider.value = isMuted ? 0 : val;
  elements.volumeSlider.style.setProperty('--volume-percent', `${isMuted ? 0 : val}%`);
  
  if (isMuted || val == 0) {
    elements.volumeIcon.setAttribute('data-lucide', 'volume-x');
  } else if (val < 40) {
    elements.volumeIcon.setAttribute('data-lucide', 'volume-1');
  } else {
    elements.volumeIcon.setAttribute('data-lucide', 'volume-2');
  }
  lucide.createIcons();
}

/**
 * Modal visibility switch animations
 */
function toggleSettingsModal(open) {
  if (open) {
    // Synchronize switches with actual settings first in case user cancelled last edit
    updateToggleVisuals(elements.modalBandwidthToggle, elements.modalBandwidthKnob, state.lowBandwidthMode);
    updateToggleVisuals(elements.modalProxyToggle, elements.modalProxyKnob, state.useProxy);
    
    elements.settingsModal.classList.remove('hidden');
    setTimeout(() => {
      elements.settingsModal.classList.remove('opacity-0');
      elements.settingsModal.querySelector('.scale-95').classList.remove('scale-95');
    }, 10);
  } else {
    elements.settingsModal.classList.add('opacity-0');
    elements.settingsModal.querySelector('.glass-panel').classList.add('scale-95');
    setTimeout(() => {
      elements.settingsModal.classList.add('hidden');
    }, 300);
  }
}
