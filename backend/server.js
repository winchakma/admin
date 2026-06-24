require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const { startScheduler } = require('./scheduler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Attach Socket.io instance to app for router access
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded media files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve local stream outputs
app.use('/stream', express.static(path.join(__dirname, 'stream')));

// Connect to MongoDB
connectDB();

// API Routes
app.use('/api', apiRoutes);

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
