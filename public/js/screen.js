// ==========================================
// SCREEN CLIENT - Multi-Screen Sync
// ==========================================

// Configuration
const CONFIG = {
  reconnectInterval: 3000,
  vibrateDuration: 100,
  hideStatusBarDelay: 5000
};

// State
let socket = null;
let deviceId = null;
let deviceName = null;
let wakeLock = null;
let isConnected = false;
let statusBarTimeout = null;

// DOM Elements
const statusDot = document.getElementById('statusDot');
const connectionStatus = document.getElementById('connectionStatus');
const deviceNameEl = document.getElementById('deviceName');
const statusBar = document.getElementById('statusBar');
const centerInfo = document.getElementById('centerInfo');
const fullscreenBtn = document.getElementById('fullscreenBtn');

// ==========================================
// SOCKET CONNECTION
// ==========================================

function connectSocket() {
  socket = io(window.location.origin, {
    reconnection: true,
    reconnectionDelay: CONFIG.reconnectInterval,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => {
    console.log('[SCREEN] Connected to server');
    isConnected = true;
    updateConnectionStatus(true);
    
    // Generate or retrieve device name
    deviceName = localStorage.getItem('screenName') || `Screen-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    localStorage.setItem('screenName', deviceName);
    
    // Register as screen
    socket.emit('register', {
      type: 'screen',
      name: deviceName
    });
    
    // Vibrate on connect
    if (navigator.vibrate) {
      navigator.vibrate(CONFIG.vibrateDuration);
    }
  });

  socket.on('registered', (data) => {
    deviceId = data.id;
    deviceNameEl.textContent = data.name;
    console.log(`[SCREEN] Registered as: ${data.name} (${data.id})`);
  });

  socket.on('disconnect', () => {
    console.log('[SCREEN] Disconnected from server');
    isConnected = false;
    updateConnectionStatus(false);
  });

  socket.on('connect_error', (error) => {
    console.error('[SCREEN] Connection error:', error);
    isConnected = false;
    updateConnectionStatus(false);
  });

  // ==========================================
  // COLOR EVENTS
  // ==========================================

  socket.on('flash', (data) => {
    const { color, duration } = data;
    console.log(`[SCREEN] Flash: ${color} for ${duration}ms`);
    
    // Set color immediately
    setBackgroundColor(color);
    centerInfo.classList.add('active');
  });

  socket.on('setColor', (color) => {
    setBackgroundColor(color);
    centerInfo.classList.add('active');
  });
}

// ==========================================
// COLOR HANDLING
// ==========================================

function setBackgroundColor(color) {
  if (typeof color === 'string') {
    // Handle named colors or hex
    document.body.style.backgroundColor = color;
  } else if (typeof color === 'object') {
    if (color.hex) {
      document.body.style.backgroundColor = color.hex;
    } else if (color.r !== undefined) {
      document.body.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
    }
  }
  
  // Update theme-color meta tag
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = document.body.style.backgroundColor;
  }
}

// ==========================================
// UI UPDATES
// ==========================================

function updateConnectionStatus(connected) {
  if (connected) {
    statusDot.classList.add('connected');
    connectionStatus.textContent = 'Conectado';
  } else {
    statusDot.classList.remove('connected');
    connectionStatus.textContent = 'Reconectando...';
  }
}

function toggleStatusBar() {
  statusBar.classList.toggle('hidden');
  
  // Clear existing timeout
  if (statusBarTimeout) {
    clearTimeout(statusBarTimeout);
  }
  
  // Auto-hide after delay if visible
  if (!statusBar.classList.contains('hidden')) {
    statusBarTimeout = setTimeout(() => {
      statusBar.classList.add('hidden');
    }, CONFIG.hideStatusBarDelay);
  }
}

// ==========================================
// WAKE LOCK
// ==========================================

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[SCREEN] Wake Lock active');
      
      wakeLock.addEventListener('release', () => {
        console.log('[SCREEN] Wake Lock released');
      });
    } catch (err) {
      console.warn('[SCREEN] Wake Lock failed:', err);
    }
  } else {
    console.warn('[SCREEN] Wake Lock API not supported');
  }
}

// Re-acquire wake lock when page becomes visible
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && wakeLock === null) {
    await requestWakeLock();
  }
});

// ==========================================
// FULLSCREEN
// ==========================================

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn('[SCREEN] Fullscreen failed:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

// Update button based on fullscreen state
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    fullscreenBtn.classList.add('hidden');
    statusBar.classList.add('hidden');
  } else {
    fullscreenBtn.classList.remove('hidden');
  }
});

// ==========================================
// EVENT LISTENERS
// ==========================================

// Toggle status bar on tap
document.body.addEventListener('click', (e) => {
  if (e.target !== fullscreenBtn) {
    toggleStatusBar();
  }
});

// Fullscreen button
fullscreenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFullscreen();
});

// Prevent context menu on long press
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Prevent zoom on double tap
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, false);

// ==========================================
// INITIALIZATION
// ==========================================

async function init() {
  console.log('[SCREEN] Initializing...');
  
  // Request wake lock
  await requestWakeLock();
  
  // Connect to server
  connectSocket();
  
  // Auto-hide status bar after delay
  statusBarTimeout = setTimeout(() => {
    statusBar.classList.add('hidden');
  }, CONFIG.hideStatusBarDelay);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
