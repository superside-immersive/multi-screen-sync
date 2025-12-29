import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DEBUG = process.env.DEBUG === 'true';

// Persist simple state so new screens inherit the last order even if controller is closed
const lastState = {
  broadcastColor: null
};

// Middleware
app.use(cors());
app.use(express.static(join(__dirname, 'public')));

// ==========================================
// DATA STRUCTURES
// ==========================================

// Map of all connected devices: socketId → { id, type, name, position }
const connectedDevices = new Map();

// Helper to get all screens
function getScreens() {
  const screens = [];
  connectedDevices.forEach((device, socketId) => {
    if (device.type === 'screen') {
      screens.push({ ...device, socketId });
    }
  });
  return screens;
}

// Helper to get controller socket
function getController() {
  for (const [socketId, device] of connectedDevices) {
    if (device.type === 'controller') {
      return { ...device, socketId };
    }
  }
  return null;
}

// Broadcast screen list to all controllers
function broadcastScreenList() {
  const screens = getScreens();
  connectedDevices.forEach((device, socketId) => {
    if (device.type === 'controller') {
      io.to(socketId).emit('screenList', screens);
    }
  });
  if (DEBUG) console.log(`[BROADCAST] Screen list updated: ${screens.length} screens`);
}

// ==========================================
// SOCKET.IO EVENTS
// ==========================================

io.on('connection', (socket) => {
  console.log(`[CONNECT] New connection: ${socket.id}`);

  // Device registration
  socket.on('register', (data) => {
    const { type, name } = data;
    const device = {
      id: socket.id,
      type: type, // 'screen' or 'controller'
      name: name || `Device-${socket.id.slice(0, 6)}`,
      position: null, // Will be set after scanning
      color: null // Current color for screens
    };
    
    connectedDevices.set(socket.id, device);
    socket.emit('registered', { id: socket.id, name: device.name });
    
    console.log(`[REGISTER] ${device.type.toUpperCase()}: ${device.name} (${socket.id})`);
    
    // If it's a screen, notify controllers and push last broadcast color if any
    if (type === 'screen') {
      if (lastState.broadcastColor) {
        device.color = lastState.broadcastColor;
        io.to(socket.id).emit('setColor', lastState.broadcastColor);
      }
      broadcastScreenList();
    }
    
    // If it's a controller, send current screen list
    if (type === 'controller') {
      socket.emit('screenList', getScreens());
    }
  });

  // Controller requests a specific screen to flash
  socket.on('requestFlash', (data) => {
    const { screenId, color, duration } = data;
    if (DEBUG) console.log(`[FLASH] Requesting ${screenId} to flash ${color}`);
    io.to(screenId).emit('flash', { color: color || 'white', duration: duration || 300 });
  });

  // Controller reports detected position and area of a screen
  socket.on('reportPosition', (data) => {
    const { screenId, x, y, area } = data;
    const device = connectedDevices.get(screenId);
    if (device) {
      device.position = { x, y };
      device.area = area || null; // { x, y, width, height } normalized 0-1
      connectedDevices.set(screenId, device);
      
      if (area) {
        console.log(`[POSITION] ${device.name}: center(${x.toFixed(3)}, ${y.toFixed(3)}) area(${(area.width * 100).toFixed(1)}% × ${(area.height * 100).toFixed(1)}%)`);
      } else {
        console.log(`[POSITION] ${device.name}: (${x.toFixed(3)}, ${y.toFixed(3)})`);
      }
      broadcastScreenList();
    }
  });

  // Controller sends color to a specific screen
  socket.on('sendColor', (data) => {
    const { screenId, color } = data;
    const device = connectedDevices.get(screenId);
    if (device) {
      device.color = color;
    }
    io.to(screenId).emit('setColor', color);
  });

  // Controller sends colors to multiple screens at once (optimized)
  socket.on('sendColors', (data) => {
    // data is array of { screenId, color }
    data.forEach(({ screenId, color }) => {
      const device = connectedDevices.get(screenId);
      if (device) {
        device.color = color;
      }
      io.to(screenId).emit('setColor', color);
    });
  });

  // Controller broadcasts same color to ALL screens
  socket.on('broadcastColor', (data) => {
    const { color } = data;
    if (DEBUG) console.log(`[BROADCAST] Color to all: ${JSON.stringify(color)}`);
    lastState.broadcastColor = color;
    connectedDevices.forEach((device, socketId) => {
      if (device.type === 'screen') {
        device.color = color;
        io.to(socketId).emit('setColor', color);
      }
    });
  });

  // Controller starts an animation
  socket.on('startAnimation', (data) => {
    const { animationType, params } = data;
    console.log(`[ANIMATION] Starting: ${animationType}`);
    // Animation runs on controller, this is just for logging/sync
  });

  // Clear all positions (for re-scanning)
  socket.on('clearPositions', () => {
    connectedDevices.forEach((device, socketId) => {
      if (device.type === 'screen') {
        device.position = null;
        device.area = null;
      }
    });
    broadcastScreenList();
    console.log('[CLEAR] All screen positions and areas cleared');
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const device = connectedDevices.get(socket.id);
    if (device) {
      console.log(`[DISCONNECT] ${device.type.toUpperCase()}: ${device.name}`);
      connectedDevices.delete(socket.id);
      
      if (device.type === 'screen') {
        broadcastScreenList();
      }
    }
  });
});

// ==========================================
// HTTP ROUTES
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', screens: getScreens().length });
});

// Get current state (for debugging)
app.get('/api/state', (req, res) => {
  res.json({
    screens: getScreens(),
    controller: getController(),
    lastState
  });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║       MULTI-SCREEN SYNC SERVER                            ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  🌐 Server running on http://localhost:${PORT}              ║`);
  console.log('║                                                           ║');
  console.log('║  📱 Screens:     http://localhost:' + PORT + '/screen.html      ║');
  console.log('║  🖥️  Controller:  http://localhost:' + PORT + '/controller.html ║');
  console.log('║                                                           ║');
  console.log('║  💡 TIP: Connect from other devices using your local IP  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
});
