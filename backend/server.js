require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const connectDB = require('./config/db');
const seedSuperAdmin = require('./seed');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { startScheduler } = require('./scheduler');

const app = express();
const server = http.createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*';
const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  maxAge: 86400 // Cache preflight for 24 hours
};

const io = socketIo(server, { cors: corsOptions });

// Attach Socket.io instance to app for router access
app.set('io', io);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "*"],
      mediaSrc: ["'self'", "*"],
      imgSrc: ["'self'", "data:", "*"]
    }
  }
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Serve uploaded media files with Vault Guard
app.use('/uploads', (req, res, next) => {
  const referer = req.get('Referer') || req.get('Origin');
  // Allow requests from live.ptv.com.bd or localhost, and allow requests with no referer ONLY if they have valid token (if we add tokens later).
  // For now, strict referer checking:
  const allowedHosts = ['live.ptv.com.bd', 'localhost', '194.242.57.190'];
  
  // Browsers sending requests from your frontend will include a Referer or Origin header
  const isValidRequest = referer && allowedHosts.some(host => referer.includes(host));
  
  if (!isValidRequest) {
    return res.status(403).send('Vault Access Denied: Direct video downloads are disabled.');
  }
  
  next();
}, express.static(path.join(__dirname, 'uploads'), { maxAge: '1d' }));
// Serve local stream outputs
app.use('/stream', express.static(path.join(__dirname, 'stream'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (filePath.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/MP2T');
    }
  }
}));

// Connect Database and Seed
connectDB().then(() => {
  seedSuperAdmin();
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Healthcheck
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

// Socket.io connection logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start active streaming scheduler
startScheduler(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`IPTV Backend server running on port ${PORT}`);
});

// Set unlimited timeout for massive video uploads
server.timeout = 0;

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

// Graceful Shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await mongoose.connection.close(false);
      console.log('MongoDB connection closed.');
    } catch (err) {
      console.error('Error closing MongoDB connection:', err);
    }
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
