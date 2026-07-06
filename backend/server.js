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
const jwt = require('jsonwebtoken');

const app = express();
app.set('trust proxy', true);
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

// Serve uploaded media files securely using Dual-Token system
app.use('/uploads', (req, res, next) => {
  const token = req.query.token;

  if (!token) {
    return res.status(401).send('Vault Access Denied: No token provided.');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_change_in_production');
    
    if (decoded.role === 'admin') {
      // Admin tokens are always allowed
      return next();
    }
    
    if (decoded.role === 'viewer') {
      // Viewer tokens are locked to the specific IP address
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
      if (decoded.ip !== clientIp) {
         return res.status(403).send('Vault Access Denied: IP mismatch on Viewer Token.');
      }
      return next();
    }
    
    return res.status(403).send('Vault Access Denied: Invalid role.');
  } catch (err) {
    return res.status(403).send('Vault Access Denied: Token expired or invalid.');
  }
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
