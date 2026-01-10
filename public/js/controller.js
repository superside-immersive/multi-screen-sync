// ==========================================
// CONTROLLER CLIENT - Multi-Screen Sync
// ADVANCED DETECTION WITH AREA MAPPING
// ==========================================

// Configuration
const CONFIG = {
  scanFlashDuration: 400,       // ms to wait after flash (increased for better capture)
  scanCooldown: 250,            // ms between scans
  brightnessThreshold: 40,      // 0-255 sensitivity for detection (lowered for better edge detection)
  minBlobSize: 30,              // minimum pixels to consider valid detection
  animationFPS: 30,             // target frames per second
  canvasSize: 200,              // virtual animation canvas size (increased for better resolution)
  edgeDetectionPasses: 2,       // number of edge refinement passes
  morphologyKernel: 3,          // kernel size for morphological operations
  gaussianBlurRadius: 2,        // blur radius for noise reduction
  minNormalizedArea: 0.02,      // clamp area so very large detections are reduced
  maxNormalizedArea: 0.65       // clamp area so oversize detections are limited
};

// State
let socket = null;
let isConnected = false;
let screens = [];
let webcamStream = null;
let isScanning = false;
let isAnimating = false;
let currentAnimation = 'gradient';
let animationSpeed = 1;
let animationBrightness = 1;
let animationFrame = null;
let lastColors = new Map(); // For delta encoding

// Audio reactive (bass boom) mode
let audioBeatEnabled = false;
let audioCtx = null;
let audioAnalyser = null;
let audioData = null;
let audioSource = null;
let audioStream = null;
let audioRaf = null;
let audioBaseline = 0;
let lastBeatAt = 0;
let oneShotRunning = false;

// DOM Elements
const videoContainer = document.getElementById('videoContainer');
const webcamVideo = document.getElementById('webcamVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const startWebcamBtn = document.getElementById('startWebcamBtn');
const screenList = document.getElementById('screenList');
const animationGrid = document.getElementById('animationGrid');
const scanBtn = document.getElementById('scanBtn');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const blackoutBtn = document.getElementById('blackoutBtn');
const connectionDot = document.getElementById('connectionDot');
const connectionText = document.getElementById('connectionText');
const scanProgress = document.getElementById('scanProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const speedSlider = document.getElementById('speedSlider');
const brightnessSlider = document.getElementById('brightnessSlider');
const bangButtons = document.querySelectorAll('[data-bang-color]');
const bangRandomBtn = document.getElementById('bangRandom');
const bangWhiteBtn = document.getElementById('bangWhite');

// Canvas contexts
let overlayCtx = null;
let analysisCanvas = null;
let analysisCtx = null;
let virtualCanvas = null;
let virtualCtx = null;

// ==========================================
// SOCKET CONNECTION
// ==========================================

function connectSocket() {
  socket = io(window.location.origin, {
    reconnection: true,
    reconnectionDelay: 3000
  });

  socket.on('connect', () => {
    console.log('[CONTROLLER] Connected to server');
    isConnected = true;
    updateConnectionStatus(true);
    
    socket.emit('register', {
      type: 'controller',
      name: 'Main Controller'
    });
  });

  socket.on('registered', (data) => {
    console.log(`[CONTROLLER] Registered: ${data.id}`);
  });

  socket.on('screenList', (data) => {
    console.log('[CONTROLLER] Screen list updated:', data);
    screens = data;
    renderScreenList();
    updateControls();
  });

  socket.on('disconnect', () => {
    console.log('[CONTROLLER] Disconnected');
    isConnected = false;
    updateConnectionStatus(false);
  });
}

function updateConnectionStatus(connected) {
  if (connectionDot) {
    connectionDot.classList.toggle('connected', connected);
  }
  if (connectionText) {
    connectionText.textContent = connected ? 'Conectado' : 'Desconectado';
  }
}

// ==========================================
// WEBCAM
// ==========================================

async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    
    webcamVideo.srcObject = webcamStream;
    await webcamVideo.play();
    
    // Hide placeholder
    videoPlaceholder.style.display = 'none';
    webcamVideo.style.display = 'block';
    
    // Setup canvases
    setupCanvases();
    
    console.log('[CONTROLLER] Webcam started');
    updateControls();
    
  } catch (err) {
    console.error('[CONTROLLER] Webcam error:', err);
    alert('No se pudo acceder a la webcam. Verifica los permisos.');
  }
}

function setupCanvases() {
  const videoWidth = webcamVideo.videoWidth;
  const videoHeight = webcamVideo.videoHeight;
  
  // Overlay canvas (for drawing detected positions)
  overlayCanvas.width = videoWidth;
  overlayCanvas.height = videoHeight;
  overlayCtx = overlayCanvas.getContext('2d');
  
  // Analysis canvas (hidden, for pixel analysis)
  analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = videoWidth;
  analysisCanvas.height = videoHeight;
  analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  
  // Virtual animation canvas
  virtualCanvas = document.createElement('canvas');
  virtualCanvas.width = CONFIG.canvasSize;
  virtualCanvas.height = CONFIG.canvasSize;
  virtualCtx = virtualCanvas.getContext('2d');
}

// ==========================================
// SCREEN LIST RENDERING
// ==========================================

function renderScreenList() {
  if (screens.length === 0) {
    screenList.innerHTML = '<div class="no-screens">Esperando pantallas...</div>';
    return;
  }
  
  screenList.innerHTML = screens.map(screen => {
    const hasPosition = screen.position != null;
    const hasArea = screen.area != null;
    
    let positionInfo = 'Sin detectar';
    if (hasPosition) {
      positionInfo = `Pos: (${(screen.position.x * 100).toFixed(1)}%, ${(screen.position.y * 100).toFixed(1)}%)`;
      if (hasArea) {
        positionInfo += `<br>Área: ${(screen.area.width * 100).toFixed(1)}% × ${(screen.area.height * 100).toFixed(1)}%`;
      }
    }
    
    return `
      <div class="screen-item" data-id="${screen.socketId}">
        <div class="screen-color" style="background: ${screen.color ? rgbToHex(screen.color) : '#333'}"></div>
        <div class="screen-info">
          <div class="screen-name">${screen.name} <span class="text-muted">(${screen.socketId.slice(0, 6)})</span></div>
          <div class="screen-position">${positionInfo}</div>
        </div>
        <span class="screen-status ${hasPosition ? 'detected' : 'pending'}">
          ${hasPosition ? '✓ OK' : '⏳'}
        </span>
      </div>
    `;
  }).join('');
  
  // Update overlay with positions
  drawOverlay();
}

function rgbToHex(color) {
  if (typeof color === 'string') return color;
  if (color.hex) return color.hex;
  if (color.r !== undefined) {
    return `#${[color.r, color.g, color.b].map(x => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
  }
  return '#333';
}

// ==========================================
// OVERLAY DRAWING - Shows detected areas
// ==========================================

function drawOverlay() {
  if (!overlayCtx) return;
  
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  
  screens.forEach((screen, index) => {
    if (screen.position) {
      const centerRect = denormalizeRectFromSquare({
        x: screen.position.x,
        y: screen.position.y,
        width: 0,
        height: 0
      }, overlayCanvas.width, overlayCanvas.height);
      const x = centerRect.x;
      const y = centerRect.y;
      
      // If we have area data, draw the bounding box
      if (screen.area) {
        const denormBox = denormalizeRectFromSquare(screen.area, overlayCanvas.width, overlayCanvas.height);
        const boxX = denormBox.x;
        const boxY = denormBox.y;
        const boxW = denormBox.width;
        const boxH = denormBox.height;
        
        // Draw bounding box with fill
        overlayCtx.fillStyle = 'rgba(74, 158, 255, 0.2)';
        overlayCtx.fillRect(boxX, boxY, boxW, boxH);
        
        // Draw border
        overlayCtx.strokeStyle = '#4a9eff';
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(boxX, boxY, boxW, boxH);
        
        // Draw corner markers
        const cornerSize = 10;
        overlayCtx.strokeStyle = '#fff';
        overlayCtx.lineWidth = 3;
        
        // Top-left
        overlayCtx.beginPath();
        overlayCtx.moveTo(boxX, boxY + cornerSize);
        overlayCtx.lineTo(boxX, boxY);
        overlayCtx.lineTo(boxX + cornerSize, boxY);
        overlayCtx.stroke();
        
        // Top-right
        overlayCtx.beginPath();
        overlayCtx.moveTo(boxX + boxW - cornerSize, boxY);
        overlayCtx.lineTo(boxX + boxW, boxY);
        overlayCtx.lineTo(boxX + boxW, boxY + cornerSize);
        overlayCtx.stroke();
        
        // Bottom-left
        overlayCtx.beginPath();
        overlayCtx.moveTo(boxX, boxY + boxH - cornerSize);
        overlayCtx.lineTo(boxX, boxY + boxH);
        overlayCtx.lineTo(boxX + cornerSize, boxY + boxH);
        overlayCtx.stroke();
        
        // Bottom-right
        overlayCtx.beginPath();
        overlayCtx.moveTo(boxX + boxW - cornerSize, boxY + boxH);
        overlayCtx.lineTo(boxX + boxW, boxY + boxH);
        overlayCtx.lineTo(boxX + boxW, boxY + boxH - cornerSize);
        overlayCtx.stroke();
      }
      
      // Draw center point
      overlayCtx.beginPath();
      overlayCtx.arc(x, y, 8, 0, Math.PI * 2);
      overlayCtx.fillStyle = '#4a9eff';
      overlayCtx.fill();
      overlayCtx.strokeStyle = '#fff';
      overlayCtx.lineWidth = 2;
      overlayCtx.stroke();
      
      // Draw label with background
      const label = screen.name;
      overlayCtx.font = 'bold 12px sans-serif';
      const textWidth = overlayCtx.measureText(label).width;
      
      overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      overlayCtx.fillRect(x - textWidth / 2 - 4, y + 15, textWidth + 8, 18);
      
      overlayCtx.fillStyle = '#fff';
      overlayCtx.textAlign = 'center';
      overlayCtx.fillText(label, x, y + 28);
    }
  });
}

// ==========================================
// ADVANCED SCANNING ALGORITHM
// ==========================================

async function startScan() {
  if (!webcamStream || screens.length === 0) return;
  
  isScanning = true;
  scanBtn.disabled = true;
  playBtn.disabled = true;
  if (scanProgress) scanProgress.classList.add('active');
  if (progressFill) progressFill.style.width = '0%';
  
  // Clear previous positions
  socket.emit('clearPositions');
  
  console.log('[SCAN] Starting advanced scan...');
  
  // Step 1: All screens to black, wait for stabilization
  socket.emit('broadcastColor', { color: { r: 0, g: 0, b: 0 } });
  await sleep(600);
  
  // Step 2: Capture multiple base frames and average them (noise reduction)
  progressText.textContent = 'Capturando referencia...';
  const baseFrames = [];
  for (let i = 0; i < 3; i++) {
    baseFrames.push(captureFrame());
    await sleep(50);
  }
  const baseFrame = averageFrames(baseFrames);
  console.log('[SCAN] Base frame captured (averaged from 3 frames)');
  
  // Step 3: Scan each screen with enhanced detection
  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i];
    
    // Update progress
    if (progressFill) {
      progressFill.style.width = `${((i + 1) / screens.length) * 100}%`;
    }
    progressText.textContent = `Escaneando ${screen.name}... (${i + 1}/${screens.length})`;
    
    // Flash this screen white at maximum brightness
    socket.emit('sendColor', { 
      screenId: screen.socketId, 
      color: { r: 255, g: 255, b: 255 } 
    });
    
    // Wait longer for LCD response
    await sleep(CONFIG.scanFlashDuration);
    
    // Capture multiple frames for more accurate detection
    const activeFrames = [];
    for (let j = 0; j < 3; j++) {
      activeFrames.push(captureFrame());
      await sleep(30);
    }
    const activeFrame = averageFrames(activeFrames);
    
    // Advanced detection with area calculation
    const detection = detectScreenArea(baseFrame, activeFrame);
    
    if (detection) {
      console.log(`[SCAN] ${screen.name} detected:`, {
        center: `(${(detection.center.x * 100).toFixed(1)}%, ${(detection.center.y * 100).toFixed(1)}%)`,
        area: `${(detection.area.width * 100).toFixed(1)}% × ${(detection.area.height * 100).toFixed(1)}%`,
        pixels: detection.pixelCount
      });
      
      socket.emit('reportPosition', {
        screenId: screen.socketId,
        x: detection.center.x,
        y: detection.center.y,
        area: detection.area
      });
    } else {
      console.warn(`[SCAN] ${screen.name} not detected`);
    }
    
    // Turn off this screen
    socket.emit('sendColor', { 
      screenId: screen.socketId, 
      color: { r: 0, g: 0, b: 0 } 
    });
    
    await sleep(CONFIG.scanCooldown);
  }
  
  console.log('[SCAN] Scan complete');
  isScanning = false;
  if (scanProgress) scanProgress.classList.remove('active');
  updateControls();
}

function captureFrame() {
  analysisCtx.drawImage(webcamVideo, 0, 0);
  return analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
}

// Average multiple frames to reduce noise
function averageFrames(frames) {
  const width = frames[0].width;
  const height = frames[0].height;
  const result = new ImageData(width, height);
  const numFrames = frames.length;
  
  for (let i = 0; i < result.data.length; i++) {
    let sum = 0;
    for (let f = 0; f < numFrames; f++) {
      sum += frames[f].data[i];
    }
    result.data[i] = Math.round(sum / numFrames);
  }
  
  return result;
}

// ==========================================
// GEOMETRY HELPERS (aspect-ratio aware)
// ==========================================

function normalizeRectToSquare(rect, width, height) {
  const landscape = width >= height;
  if (landscape) {
    const scale = height / width;
    const padY = (1 - scale) / 2;
    return {
      x: (rect.x / width),
      y: (rect.y / height) * scale + padY,
      width: (rect.width / width),
      height: (rect.height / height) * scale
    };
  }
  const scale = width / height;
  const padX = (1 - scale) / 2;
  return {
    x: (rect.x / width) * scale + padX,
    y: (rect.y / height),
    width: (rect.width / width) * scale,
    height: (rect.height / height)
  };
}

function normalizePointToSquare(x, y, width, height) {
  const landscape = width >= height;
  if (landscape) {
    const scale = height / width;
    const padY = (1 - scale) / 2;
    return {
      x: x / width,
      y: (y / height) * scale + padY
    };
  }
  const scale = width / height;
  const padX = (1 - scale) / 2;
  return {
    x: (x / width) * scale + padX,
    y: y / height
  };
}

function denormalizeRectFromSquare(rect, width, height) {
  const landscape = width >= height;
  if (landscape) {
    const scale = height / width;
    const padY = (1 - scale) / 2;
    return {
      x: rect.x * width,
      y: ((rect.y - padY) / scale) * height,
      width: rect.width * width,
      height: (rect.height / scale) * height
    };
  }
  const scale = width / height;
  const padX = (1 - scale) / 2;
  return {
    x: ((rect.x - padX) / scale) * width,
    y: rect.y * height,
    width: (rect.width / scale) * width,
    height: rect.height * height
  };
}

function clampRect(rect) {
  const x = Math.min(Math.max(rect.x, 0), 1);
  const y = Math.min(Math.max(rect.y, 0), 1);
  const width = Math.min(Math.max(rect.width, CONFIG.minNormalizedArea), CONFIG.maxNormalizedArea);
  const height = Math.min(Math.max(rect.height, CONFIG.minNormalizedArea), CONFIG.maxNormalizedArea);
  return { x, y, width, height };
}

// ==========================================
// ADVANCED SCREEN DETECTION
// ==========================================

function detectScreenArea(baseFrame, activeFrame) {
  const width = baseFrame.width;
  const height = baseFrame.height;
  const baseData = baseFrame.data;
  const activeData = activeFrame.data;
  
  // Step 1: Create difference map with Gaussian-weighted brightness
  const diffMap = new Float32Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      
      // Calculate luminance difference (weighted RGB)
      const baseLum = baseData[i] * 0.299 + baseData[i + 1] * 0.587 + baseData[i + 2] * 0.114;
      const activeLum = activeData[i] * 0.299 + activeData[i + 1] * 0.587 + activeData[i + 2] * 0.114;
      
      diffMap[y * width + x] = Math.max(0, activeLum - baseLum);
    }
  }
  
  // Step 2: Apply Gaussian blur to reduce noise
  const blurredDiff = gaussianBlur(diffMap, width, height, CONFIG.gaussianBlurRadius);
  
  // Step 3: Adaptive thresholding
  const threshold = calculateAdaptiveThreshold(blurredDiff, width, height);
  
  // Step 4: Create binary mask
  const binaryMask = new Uint8Array(width * height);
  for (let i = 0; i < blurredDiff.length; i++) {
    binaryMask[i] = blurredDiff[i] > threshold ? 255 : 0;
  }
  
  // Step 5: Morphological operations (dilate then erode to close gaps)
  let processedMask = dilate(binaryMask, width, height, CONFIG.morphologyKernel);
  processedMask = erode(processedMask, width, height, CONFIG.morphologyKernel);
  
  // Step 6: Find connected components and get the largest blob
  const blob = findLargestBlob(processedMask, width, height);
  
  if (!blob || blob.pixels.length < CONFIG.minBlobSize) {
    return null;
  }
  
  // Step 7: Calculate precise bounding box
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let totalX = 0, totalY = 0, totalWeight = 0;
  
  blob.pixels.forEach(({ x, y }) => {
    const weight = blurredDiff[y * width + x];
    
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    
    // Weighted centroid calculation
    totalX += x * weight;
    totalY += y * weight;
    totalWeight += weight;
  });
  
  // Step 8: Refine bounding box edges using gradient analysis
  const refinedBox = refineBoundingBox(blurredDiff, width, height, minX, minY, maxX, maxY);
  
  // Calculate center (weighted centroid)
  const centerX = totalWeight > 0 ? totalX / totalWeight : (minX + maxX) / 2;
  const centerY = totalWeight > 0 ? totalY / totalWeight : (minY + maxY) / 2;

  // Normalize to square space to avoid aspect distortion when mapping to animations
  const normalizedArea = clampRect(normalizeRectToSquare({
    x: refinedBox.minX,
    y: refinedBox.minY,
    width: refinedBox.maxX - refinedBox.minX,
    height: refinedBox.maxY - refinedBox.minY
  }, width, height));

  const normalizedCenter = normalizePointToSquare(centerX, centerY, width, height);
  
  return {
    center: {
      x: normalizedCenter.x,
      y: normalizedCenter.y
    },
    area: {
      x: normalizedArea.x,
      y: normalizedArea.y,
      width: normalizedArea.width,
      height: normalizedArea.height
    },
    pixelCount: blob.pixels.length
  };
}

// Gaussian blur implementation
function gaussianBlur(data, width, height, radius) {
  const kernel = createGaussianKernel(radius);
  const result = new Float32Array(data.length);
  
  // Horizontal pass
  const temp = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, weightSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const px = Math.min(Math.max(x + k, 0), width - 1);
        const weight = kernel[k + radius];
        sum += data[y * width + px] * weight;
        weightSum += weight;
      }
      temp[y * width + x] = sum / weightSum;
    }
  }
  
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, weightSum = 0;
      for (let k = -radius; k <= radius; k++) {
        const py = Math.min(Math.max(y + k, 0), height - 1);
        const weight = kernel[k + radius];
        sum += temp[py * width + x] * weight;
        weightSum += weight;
      }
      result[y * width + x] = sum / weightSum;
    }
  }
  
  return result;
}

function createGaussianKernel(radius) {
  const sigma = radius / 2;
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  
  for (let i = -radius; i <= radius; i++) {
    kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
    sum += kernel[i + radius];
  }
  
  // Normalize
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }
  
  return kernel;
}

// Calculate adaptive threshold based on image statistics
function calculateAdaptiveThreshold(data, width, height) {
  // Calculate mean and standard deviation
  let sum = 0, sumSq = 0, count = 0;
  
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 5) { // Ignore very dark pixels
      sum += data[i];
      sumSq += data[i] * data[i];
      count++;
    }
  }
  
  if (count === 0) return CONFIG.brightnessThreshold;
  
  const mean = sum / count;
  const variance = (sumSq / count) - (mean * mean);
  const stdDev = Math.sqrt(variance);
  
  // Threshold = mean + 1.5 * stdDev (adjustable)
  return Math.max(CONFIG.brightnessThreshold, mean + stdDev * 1.5);
}

// Morphological dilation
function dilate(mask, width, height, kernelSize) {
  const result = new Uint8Array(mask.length);
  const half = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxVal = 0;
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const ny = Math.min(Math.max(y + ky, 0), height - 1);
          const nx = Math.min(Math.max(x + kx, 0), width - 1);
          maxVal = Math.max(maxVal, mask[ny * width + nx]);
        }
      }
      result[y * width + x] = maxVal;
    }
  }
  
  return result;
}

// Morphological erosion
function erode(mask, width, height, kernelSize) {
  const result = new Uint8Array(mask.length);
  const half = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minVal = 255;
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const ny = Math.min(Math.max(y + ky, 0), height - 1);
          const nx = Math.min(Math.max(x + kx, 0), width - 1);
          minVal = Math.min(minVal, mask[ny * width + nx]);
        }
      }
      result[y * width + x] = minVal;
    }
  }
  
  return result;
}

// Find largest connected component (flood fill)
function findLargestBlob(mask, width, height) {
  const visited = new Uint8Array(width * height);
  let largestBlob = null;
  let largestSize = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 255 && !visited[idx]) {
        const blob = floodFill(mask, visited, width, height, x, y);
        if (blob.length > largestSize) {
          largestSize = blob.length;
          largestBlob = { pixels: blob };
        }
      }
    }
  }
  
  return largestBlob;
}

// Flood fill algorithm (BFS)
function floodFill(mask, visited, width, height, startX, startY) {
  const pixels = [];
  const queue = [{ x: startX, y: startY }];
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  
  visited[startY * width + startX] = 1;
  
  while (queue.length > 0) {
    const { x, y } = queue.shift();
    pixels.push({ x, y });
    
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = ny * width + nx;
        if (mask[idx] === 255 && !visited[idx]) {
          visited[idx] = 1;
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  
  return pixels;
}

// Refine bounding box using gradient analysis
function refineBoundingBox(diffMap, width, height, minX, minY, maxX, maxY) {
  const padding = 5;
  
  // Expand search area
  const searchMinX = Math.max(0, minX - padding);
  const searchMaxX = Math.min(width - 1, maxX + padding);
  const searchMinY = Math.max(0, minY - padding);
  const searchMaxY = Math.min(height - 1, maxY + padding);
  
  // Find edges using gradient magnitude
  let refinedMinX = maxX, refinedMaxX = minX;
  let refinedMinY = maxY, refinedMaxY = minY;
  
  const edgeThreshold = 20;
  
  for (let y = searchMinY; y <= searchMaxY; y++) {
    for (let x = searchMinX; x <= searchMaxX; x++) {
      const val = diffMap[y * width + x];
      if (val > edgeThreshold) {
        refinedMinX = Math.min(refinedMinX, x);
        refinedMaxX = Math.max(refinedMaxX, x);
        refinedMinY = Math.min(refinedMinY, y);
        refinedMaxY = Math.max(refinedMaxY, y);
      }
    }
  }
  
  return { minX: refinedMinX, maxX: refinedMaxX, minY: refinedMinY, maxY: refinedMaxY };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// ANIMATION WITH AREA-BASED MAPPING
// ==========================================

function startAnimation() {
  if (isAnimating) return;
  
  isAnimating = true;
  playBtn.disabled = true;
  stopBtn.disabled = false;
  
  const detectedScreens = screens.filter(s => s.position);
  if (detectedScreens.length === 0) {
    console.warn('[ANIMATION] No screens with positions');
    return;
  }
  
  console.log(`[ANIMATION] Starting: ${currentAnimation}`);
  lastColors.clear();
  
  let startTime = performance.now();
  const frameInterval = 1000 / CONFIG.animationFPS;
  let lastFrameTime = 0;
  
  function animate(currentTime) {
    if (!isAnimating) return;
    
    // Throttle to target FPS
    if (currentTime - lastFrameTime < frameInterval) {
      animationFrame = requestAnimationFrame(animate);
      return;
    }
    lastFrameTime = currentTime;
    
    const elapsed = (currentTime - startTime) / 1000 * animationSpeed;
    
    // Render animation to virtual canvas
    renderAnimation(currentAnimation, elapsed);
    
    // Map colors to screens with area-aware sampling
    const colors = [];
    detectedScreens.forEach(screen => {
      const color = sampleAreaColor(screen);
      
      // Apply brightness
      const finalColor = {
        r: Math.round(color.r * animationBrightness),
        g: Math.round(color.g * animationBrightness),
        b: Math.round(color.b * animationBrightness)
      };
      
      // Delta encoding - only send if color changed significantly
      const lastColor = lastColors.get(screen.socketId);
      if (!lastColor || colorDiff(lastColor, finalColor) > 3) {
        colors.push({
          screenId: screen.socketId,
          color: finalColor
        });
        lastColors.set(screen.socketId, finalColor);
      }
    });
    
    // Send colors that changed
    if (colors.length > 0) {
      socket.emit('sendColors', colors);
    }
    
    animationFrame = requestAnimationFrame(animate);
  }
  
  animationFrame = requestAnimationFrame(animate);
}

// Sample color from the screen's area (not just center point)
function sampleAreaColor(screen) {
  const canvasSize = CONFIG.canvasSize;
  
  if (screen.area) {
    const normalized = clampRect(screen.area);
    // Sample multiple points within the screen's area and average
    const areaX = Math.floor(normalized.x * canvasSize);
    const areaY = Math.floor(normalized.y * canvasSize);
    const areaW = Math.max(1, Math.floor(normalized.width * canvasSize));
    const areaH = Math.max(1, Math.floor(normalized.height * canvasSize));
    
    // Get all pixels in the area
    const imageData = virtualCtx.getImageData(areaX, areaY, areaW, areaH);
    const data = imageData.data;
    
    // Calculate weighted average (center pixels weight more)
    let totalR = 0, totalG = 0, totalB = 0, totalWeight = 0;
    const centerX = areaW / 2;
    const centerY = areaH / 2;
    
    for (let y = 0; y < areaH; y++) {
      for (let x = 0; x < areaW; x++) {
        const i = (y * areaW + x) * 4;
        
        // Gaussian weight based on distance from center
        const dx = (x - centerX) / (areaW / 2);
        const dy = (y - centerY) / (areaH / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const weight = Math.exp(-dist * dist);
        
        totalR += data[i] * weight;
        totalG += data[i + 1] * weight;
        totalB += data[i + 2] * weight;
        totalWeight += weight;
      }
    }
    
    return {
      r: Math.round(totalR / totalWeight),
      g: Math.round(totalG / totalWeight),
      b: Math.round(totalB / totalWeight)
    };
  } else {
    // Fallback to single point sampling
    const pixelX = Math.floor(screen.position.x * canvasSize);
    const pixelY = Math.floor(screen.position.y * canvasSize);
    const pixel = virtualCtx.getImageData(pixelX, pixelY, 1, 1).data;
    
    return { r: pixel[0], g: pixel[1], b: pixel[2] };
  }
}

// Calculate color difference for delta encoding
function colorDiff(c1, c2) {
  return Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b);
}

function stopAnimation() {
  isAnimating = false;
  
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  
  playBtn.disabled = false;
  stopBtn.disabled = true;
  lastColors.clear();
  
  console.log('[ANIMATION] Stopped');
}

function getDetectedScreens() {
  return screens.filter(s => s.position);
}

function sampleAndSendFrame(detectedScreens) {
  const colors = [];

  detectedScreens.forEach(screen => {
    const color = sampleAreaColor(screen);

    const finalColor = {
      r: Math.round(color.r * animationBrightness),
      g: Math.round(color.g * animationBrightness),
      b: Math.round(color.b * animationBrightness)
    };

    const lastColor = lastColors.get(screen.socketId);
    if (!lastColor || colorDiff(lastColor, finalColor) > 3) {
      colors.push({ screenId: screen.socketId, color: finalColor });
      lastColors.set(screen.socketId, finalColor);
    }
  });

  if (colors.length > 0) {
    socket.emit('sendColors', colors);
  }
}

function runOneShot(animationType, durationMs) {
  if (oneShotRunning) return;
  oneShotRunning = true;

  const detectedScreens = getDetectedScreens();
  if (detectedScreens.length === 0) {
    // Fallback: single global flash if there's no mapping
    triggerBang({ r: 255, g: 255, b: 255 });
    oneShotRunning = false;
    return;
  }

  if (!virtualCtx) {
    // If webcam hasn't been started yet, we still can render to a virtual canvas.
    virtualCanvas = document.createElement('canvas');
    virtualCanvas.width = CONFIG.canvasSize;
    virtualCanvas.height = CONFIG.canvasSize;
    virtualCtx = virtualCanvas.getContext('2d');
  }

  lastColors.clear();
  const start = performance.now();
  const frameInterval = 1000 / CONFIG.animationFPS;
  let lastFrameTime = 0;

  function frame(now) {
    const elapsedMs = now - start;
    if (elapsedMs >= durationMs) {
      // Final frame
      renderAnimation(animationType, (durationMs / 1000) * animationSpeed);
      sampleAndSendFrame(detectedScreens);
      oneShotRunning = false;
      return;
    }

    if (now - lastFrameTime >= frameInterval) {
      lastFrameTime = now;
      renderAnimation(animationType, (elapsedMs / 1000) * animationSpeed);
      sampleAndSendFrame(detectedScreens);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

async function startAudioBeatMode() {
  if (audioBeatEnabled) return;
  audioBeatEnabled = true;
  oneShotRunning = false;

  stopAnimation();
  updateControls();

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioSource = audioCtx.createMediaStreamSource(audioStream);
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 2048;
    audioAnalyser.smoothingTimeConstant = 0.75;
    audioSource.connect(audioAnalyser);

    audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioBaseline = 0;
    lastBeatAt = 0;

    progressText.textContent = 'AudioRítmico: escuchando graves...';

    const minHz = 40;
    const maxHz = 140;
    const cooldownMs = 280;
    const thresholdFactor = 1.75;
    const minEnergy = 28;

    const tick = () => {
      if (!audioBeatEnabled || !audioAnalyser) return;

      audioAnalyser.getByteFrequencyData(audioData);

      const nyquist = audioCtx.sampleRate / 2;
      const minBin = Math.max(0, Math.floor((minHz / nyquist) * audioData.length));
      const maxBin = Math.min(audioData.length - 1, Math.ceil((maxHz / nyquist) * audioData.length));

      let sum = 0;
      let count = 0;
      for (let i = minBin; i <= maxBin; i++) {
        sum += audioData[i];
        count++;
      }
      const energy = count ? sum / count : 0;

      // Exponential moving average baseline
      audioBaseline = audioBaseline ? (audioBaseline * 0.92 + energy * 0.08) : energy;

      const now = performance.now();
      const boom = energy > Math.max(minEnergy, audioBaseline * thresholdFactor);

      if (boom && now - lastBeatAt > cooldownMs) {
        lastBeatAt = now;
        // One-shot sequence: a single pulse (no loop) per boom
        runOneShot('pulse', 1200);
      }

      audioRaf = requestAnimationFrame(tick);
    };

    audioRaf = requestAnimationFrame(tick);
  } catch (err) {
    console.error('[AUDIO] Could not start audio mode:', err);
    audioBeatEnabled = false;
    progressText.textContent = 'AudioRítmico: sin permiso de micrófono';
    updateControls();
  }
}

function stopAudioBeatMode() {
  if (!audioBeatEnabled) return;
  audioBeatEnabled = false;
  oneShotRunning = false;

  if (audioRaf) {
    cancelAnimationFrame(audioRaf);
    audioRaf = null;
  }

  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
    audioStream = null;
  }

  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  audioSource = null;
  audioAnalyser = null;
  audioData = null;

  if (progressText) {
    progressText.textContent = 'Idle';
  }

  updateControls();
}

function blackout() {
  stopAnimation();
  socket.emit('broadcastColor', { color: { r: 0, g: 0, b: 0 } });
}

// Quick flash with smooth decay
function triggerBang(color) {
  stopAnimation();
  const steps = 18;
  const hold = 120;
  const duration = 900;
  const fadeDuration = duration - hold;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const factor = i === 0 ? 1 : Math.pow(1 - t, 1.6);
    const payload = {
      r: Math.round(color.r * factor),
      g: Math.round(color.g * factor),
      b: Math.round(color.b * factor)
    };
    const delay = hold + Math.round(fadeDuration * t);
    setTimeout(() => {
      socket.emit('broadcastColor', { color: payload });
    }, delay);
  }
}

// ==========================================
// ANIMATION RENDERING (uses animations.js)
// ==========================================

function renderAnimation(type, time) {
  if (!virtualCtx) return;
  
  switch (type) {
    case 'audioBeat':
      // Fallback rendering: use pulse (audio mode triggers one-shots separately)
      Animations.pulse(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'gradient':
      Animations.gradient(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'radial':
      Animations.radial(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'rainbow':
      Animations.rainbow(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'bounce':
      Animations.bounce(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'pulse':
      Animations.pulse(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'matrix':
      Animations.matrix(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'sweep':
      Animations.sweep(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'circleSweep':
      Animations.circleSweep(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'spiral':
      Animations.spiral(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'crossSweep':
      Animations.crossSweep(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    case 'ripple':
      Animations.ripple(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
      break;
    default:
      Animations.gradient(virtualCtx, CONFIG.canvasSize, CONFIG.canvasSize, time);
  }
}

// ==========================================
// UI CONTROLS
// ==========================================

function updateControls() {
  const hasWebcam = !!webcamStream;
  const hasScreens = screens.length > 0;
  const hasDetectedScreens = screens.some(s => s.position);
  
  scanBtn.disabled = !hasWebcam || !hasScreens || isScanning;
  if (audioBeatEnabled) {
    playBtn.disabled = true;
    stopBtn.disabled = true;
  } else {
    playBtn.disabled = !hasDetectedScreens || isAnimating;
    stopBtn.disabled = !isAnimating;
  }
}

// Animation selection
animationGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.control-btn');
  if (!btn) return;
  
  // Update active state
  animationGrid.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  const next = btn.dataset.animation;

  if (next === 'audioBeat') {
    startAudioBeatMode();
    currentAnimation = 'audioBeat';
    console.log('[AUDIO] AudioRítmico enabled');
  } else {
    stopAudioBeatMode();
    currentAnimation = next;
    console.log(`[ANIMATION] Selected: ${currentAnimation}`);
  }
});

// Sliders
speedSlider.addEventListener('input', (e) => {
  animationSpeed = parseFloat(e.target.value);
});

brightnessSlider.addEventListener('input', (e) => {
  animationBrightness = parseFloat(e.target.value);
});

// Buttons
startWebcamBtn.addEventListener('click', startWebcam);
scanBtn.addEventListener('click', startScan);
playBtn.addEventListener('click', startAnimation);
stopBtn.addEventListener('click', stopAnimation);
blackoutBtn.addEventListener('click', blackout);

bangButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const [r, g, b] = btn.dataset.bangColor.split(',').map(Number);
    triggerBang({ r, g, b });
  });
});

if (bangRandomBtn) {
  bangRandomBtn.addEventListener('click', () => {
    const hue = Math.random() * 360;
    const rgb = hslToRgb(hue / 360, 1, 0.5);
    triggerBang(rgb);
  });
}

if (bangWhiteBtn) {
  bangWhiteBtn.addEventListener('click', () => {
    triggerBang({ r: 255, g: 255, b: 255 });
  });
}

// ==========================================
// INITIALIZATION
// ==========================================

function init() {
  console.log('[CONTROLLER] Initializing with advanced detection...');
  connectSocket();
  updateControls();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
