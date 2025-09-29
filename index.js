require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const winston = require('winston');
const session = require('express-session');

// MQTT Service Integration
const MQTTService = require('./mqtt-service');

// === Logger Setup ===
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp} [${level.toUpperCase()}]: ${message}`
    )
  ),
  transports: [new winston.transports.Console()],
});

// === Simple User Database (در production از دیتابیس واقعی استفاده کنید) ===
const users = {
  admin: { username: 'admin', password: 'admin123', role: 'admin' },
  kitchen: { username: 'kitchen', password: 'kitchen123', role: 'kitchen' },
  manager: { username: 'manager', password: 'manager123', role: 'manager' },
  robot: { username: 'robot', password: 'robot123', role: 'robot' },
  cashier:{ username:'cashier',password:'cashier123', role: 'cashier'}
};

const app = express();
const server = http.createServer(app);
const userRouter = require('./userRouter');

// === Session Configuration ===
app.use(session({
  secret: process.env.SESSION_SECRET || 'cafe_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // true for HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// === Socket.IO با حداقل محدودیت ===
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: false
  },
});

// === Initialize MQTT Service ===
const mqttService = new MQTTService({
  brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  username: process.env.MQTT_USERNAME || 'cafe_user',
  password: process.env.MQTT_PASSWORD || 'cafe_password_2024',
  clientId: `cafe_server_${Math.random().toString(16).substr(2, 8)}`
});

// MQTT Event Handlers
mqttService.on('connected', () => {
  logger.info('✅ MQTT Service Connected');
  io.emit('mqtt_status', { connected: true, timestamp: new Date().toISOString() });
});

mqttService.on('robotStatus', (data) => {
  logger.info('🤖 Robot Status Update:', data);
  io.emit('robot_status', data);
});

mqttService.on('robotLocation', (data) => {
  logger.info('📍 Robot Location Update:', data);
  io.emit('robot_location', data);
});

mqttService.on('deliveryComplete', (data) => {
  logger.info('✅ Delivery Complete:', data);
  io.emit('delivery_complete', data);
  
  if (data.order_id) {
    io.emit('auto_update_order_status', {
      orderId: data.order_id,
      status: 'delivered',
      source: 'robot_delivery_complete'
    });
  }
});

mqttService.on('emergency', (data) => {
  logger.error('🚨 Emergency Alert:', data);
  io.emit('emergency_alert', data);
});

mqttService.on('authenticationFailed', (error) => {
  logger.error('🔐 MQTT Authentication Failed:', error);
});

mqttService.on('maxReconnectAttemptsReached', () => {
  logger.error('❌ MQTT Max Reconnection Attempts Reached');
});

// === حذف تمام Security Headers ===
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Resource-Policy');
  res.removeHeader('Origin-Agent-Cluster');
  res.removeHeader('Referrer-Policy');
  res.removeHeader('Strict-Transport-Security');
  res.removeHeader('X-Content-Type-Options');
  res.removeHeader('X-Frame-Options');
  res.removeHeader('X-XSS-Protection');
  
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// === Middleware ساده ===
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true })); // برای form data

// === CORS با کمترین محدودیت ===
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// === Rate Limiting ساده ===
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => false
}));

// === Authentication Middleware ===
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    return res.redirect('/login');
  }
}

function requireRole(role) {
  return function(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === role) {
      return next();
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
  };
}

// === Authentication Routes ===
// Route for serving login page from external HTML file
app.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('dashboard');
  }
  
  // Send the external HTML file
  const loginFilePath = path.join(__dirname, 'public', 'login_page.html');
  res.sendFile(loginFilePath, (err) => {
    if (err) {
      logger.error('❌ Error serving login file:', err);
      res.status(500).send('Error loading login page');
    }
  });
});

// Alternative method using Express static middleware (recommended)
// Add this line to serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));



// Your existing POST route for login (keep this as is)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  logger.info(`🔐 Login attempt for user: ${username}`);
  
  const user = users[username];
  if (user && user.password === password) {
    req.session.user = {
      username: user.username,
      role: user.role
    };
    
    logger.info(`✅ Login successful for user: ${username} (${user.role})`);
    res.redirect('/dashboard');
  } else {
    logger.warn(`❌ Login failed for user: ${username}`);
    res.redirect('/login?error=1');
  }
});

// Your existing logout and status routes (keep these as is)
app.get('/api/auth/logout', (req, res) => {
  const username = req.session.user ? req.session.user.username : 'unknown';
  req.session.destroy((err) => {
    if (err) {
      logger.error('❌ Session destruction error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    logger.info(`👋 User logged out: ${username}`);
    res.redirect('/login');
  });
});

app.get('/api/auth/status', (req, res) => {
  if (req.session && req.session.user) {
    res.json({
      authenticated: true,
      user: req.session.user
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// === Static Files ===
// === Flutter Static Files با Debug کامل ===
const flutterBuildPath = path.join(__dirname, 'build', 'web');

console.log('🔍 Debug Info:');
console.log('Current Directory:', __dirname);
console.log('Flutter Path:', flutterBuildPath);
console.log('Flutter Path Exists:', fs.existsSync(flutterBuildPath));

if (fs.existsSync(flutterBuildPath)) {
  // فهرست فایل‌های موجود
  try {
    const files = fs.readdirSync(flutterBuildPath);
    console.log('📁 Files in Flutter directory:', files);
  } catch (err) {
    console.error('❌ Error reading Flutter directory:', err);
  }

  // Static files middleware با debug
  app.use('/flutter', (req, res, next) => {
    console.log(`📥 Flutter Request: ${req.method} ${req.url}`);
    console.log(`📥 Full URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
    next();
  }, express.static(flutterBuildPath, {
    setHeaders: (res, filePath) => {
      console.log(`📤 Serving file: ${filePath}`);
      
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.header('Pragma', 'no-cache');
      res.header('Expires', '0');
      
      // حذف security headers که ممکن است مشکل ایجاد کنند
      res.removeHeader('Cross-Origin-Opener-Policy');
      res.removeHeader('Cross-Origin-Resource-Policy');
      res.removeHeader('Origin-Agent-Cluster');
      res.removeHeader('Referrer-Policy');
      res.removeHeader('Strict-Transport-Security');
      res.removeHeader('X-Content-Type-Options');
      res.removeHeader('X-Frame-Options');
      res.removeHeader('X-XSS-Protection');
      
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      } else if (filePath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }
    },
    fallthrough: true,
    index: ['index.html']
  }));
  
  logger.info(`✅ Flutter static middleware configured for: ${flutterBuildPath}`);
} else {
  logger.warn('⚠️ Flutter build/web folder not found at:', flutterBuildPath);
}

// Flutter fallback route - SPA routing
app.get('/flutter*', (req, res, next) => {
  console.log(`🔄 Flutter fallback route: ${req.url}`);
  
  const indexPath = path.join(flutterBuildPath, 'index.html');
  console.log(`📍 Looking for index.html at: ${indexPath}`);
  console.log(`📍 Index file exists: ${fs.existsSync(indexPath)}`);
  
  if (fs.existsSync(indexPath)) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.removeHeader('Origin-Agent-Cluster');
    
    // خواندن و نمایش محتوای index.html
    try {
      const content = fs.readFileSync(indexPath, 'utf8');
      console.log(`📄 Index.html content length: ${content.length}`);
      res.send(content);
    } catch (err) {
      console.error('❌ Error reading index.html:', err);
      res.status(500).send('Error loading Flutter app');
    }
  } else {
    console.error('❌ Flutter index.html not found');
    res.status(404).send(`Flutter app not found. Looking at: ${indexPath}`);
  }
});

// اضافه کردن route برای تست مستقیم
app.get('/test-flutter', (req, res) => {
  const indexPath = path.join(flutterBuildPath, 'index.html');
  
  res.json({
    flutterPath: flutterBuildPath,
    indexPath: indexPath,
    pathExists: fs.existsSync(flutterBuildPath),
    indexExists: fs.existsSync(indexPath),
    files: fs.existsSync(flutterBuildPath) ? fs.readdirSync(flutterBuildPath) : [],
    currentDir: __dirname
  });
});
// === Dashboard Static Files ===
app.use('/static', express.static(path.join(__dirname,'public'), {
  setHeaders: (res, path) => {
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.header('Access-Control-Allow-Origin', '*');
  }
}));

// === Protected Routes ===
app.use('/api/users', requireAuth, userRouter);

// === Routes ===
try {
  const orderRouter = require('./order');
  
  if (orderRouter.setSocketIO) {
    orderRouter.setSocketIO(io);
    logger.info('✅ Socket.IO set for order router');
  }
  
  if (orderRouter.setMQTTService) {
    orderRouter.setMQTTService(mqttService);
    logger.info('✅ MQTT Service set for order router');
  }
  
  // app.use('/api/orders', requireAuth, orderRouter);
  app.use('/api/orders', orderRouter);  // بدون requireAuth

// یا اضافه کن route جدید برای تست:
app.use('/api/orders-test', orderRouter);  // بدون authentication

// همچنین اضافه کن:
app.post('/api/test-order-simple', (req, res) => {
  console.log('📤 Test order received:', req.body);
  
  const testOrder = {
    id: Date.now(),
    ...req.body,
    status: 'received',
    createdAt: new Date().toISOString(),
    testMode: true
  };
  
  // ارسال به تمام کلاینت‌ها
  io.emit('new_order', testOrder);
  
  res.json({
    success: true,
    message: 'Test order received successfully!',
    order: testOrder
  });
});
  logger.info('✅ Order routes loaded');
} catch (error) {
  logger.error('❌ Failed to load order router:', error.message);
}

// === MQTT Status Endpoint ===
app.get('/api/mqtt/status', requireAuth, (req, res) => {
  res.json({
    status: 'success',
    mqtt: mqttService.getStatus(),
    stats: mqttService.getStats(),
    timestamp: new Date().toISOString()
  });
});

// === MQTT Control Endpoints ===
app.post('/api/mqtt/robot/send-order/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderData = req.body;
    
    await mqttService.sendOrderToRobot(orderData);
    logger.info(`📤 Order #${orderId} sent to robot via MQTT by ${req.session.user.username}`);
    
    res.json({
      success: true,
      message: `Order #${orderId} sent to robot`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to send order to robot:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/mqtt/robot/goto-table/:tableNumber', requireAuth, async (req, res) => {
  try {
    const { tableNumber } = req.params;
    
    await mqttService.sendRobotToLocation(parseInt(tableNumber), 'go_to_table');
    logger.info(`🤖 Robot sent to table ${tableNumber} by ${req.session.user.username}`);
    
    res.json({
      success: true,
      message: `Robot sent to table ${tableNumber}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to send robot to table:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/mqtt/emergency-stop', requireAuth, async (req, res) => {
  try {
    await mqttService.emergencyStop();
    logger.info(`🚨 Emergency stop triggered by ${req.session.user.username}`);
    
    res.json({
      success: true,
      message: 'Emergency stop triggered',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to trigger emergency stop:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// === HTML Routes (Protected) ===
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

app.get('/dashboard', requireAuth, (req, res) => {
  const dashboardPath = path.join(__dirname, 'orders_dashboard.html');
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
    logger.info(`📊 Dashboard served to ${req.session.user.username}`);
  } else {
    logger.error('❌ Dashboard file not found');
    res.status(404).send('Dashboard not found');
  }
});

app.get('/flutter/*', (req, res) => {
  const indexPath = path.join(flutterBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Flutter app not found');
  }
});

// === Health Check ===
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    mqtt: mqttService.getStatus()
  });
});

// === Socket.IO Connection ===
let connectedClients = 0;

io.on('connection', (socket) => {
  connectedClients++;
  logger.info(`📱 Client connected: ${socket.id} (Total: ${connectedClients})`);
  
  socket.emit('connection_confirmed', {
    message: 'Successfully connected to server',
    socketId: socket.id,
    timestamp: new Date().toISOString(),
    mqtt_connected: mqttService.isConnected
  });
  
  socket.emit('mqtt_status', {
    connected: mqttService.isConnected,
    status: mqttService.getStatus(),
    timestamp: new Date().toISOString()
  });
  
  socket.on('disconnect', (reason) => {
    connectedClients--;
    logger.info(`📱 Client disconnected: ${socket.id} (Reason: ${reason}) (Total: ${connectedClients})`);
  });
  
  socket.on('error', (error) => {
    logger.error(`❌ Socket error for ${socket.id}:`, error);
  });
  
  socket.on('send_order_to_robot', async (data) => {
    try {
      await mqttService.sendOrderToRobot(data.orderData);
      socket.emit('order_sent_to_robot', {
        success: true,
        orderId: data.orderData.id,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('order_sent_to_robot', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  socket.on('robot_goto_table', async (data) => {
    try {
      await mqttService.sendRobotToLocation(data.tableNumber, 'go_to_table');
      socket.emit('robot_command_sent', {
        success: true,
        command: 'goto_table',
        tableNumber: data.tableNumber,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('robot_command_sent', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
});

// === Error Handlers ===
app.use((req, res, next) => {
  logger.warn(`🚫 404 Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    status: 'error', 
    message: 'Route not found',
    path: req.url 
  });
});

app.use((err, req, res, next) => {
  logger.error(`❌ Server Error: ${err.stack}`);
  res.status(500).json({ 
    status: 'error', 
    message: 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});
// === Graceful Shutdown ===
process.on('SIGINT', async () => {
  logger.info('🛑 Shutting down gracefully...');
  
  try {
    await mqttService.disconnect();
    server.close(() => {
      logger.info('✅ Server closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down...');
  await mqttService.disconnect();
  server.close(() => {
    logger.info('✅ Server terminated');
    process.exit(0);
  });
});
// === Server Start ===
const PORT = process.env.PORT || 8888;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
  logger.info(`🔐 Login: http://192.168.137.1:${PORT}/login`);
  logger.info(`📊 Dashboard: http://192.168.137.1:${PORT}/dashboard`);
  logger.info(`📊 Management: http://192.168.137.1:${PORT}/managment`);
  logger.info(`👨‍🍳 Kitchen: http://192.168.137.1:${PORT}/kitchen`);
  logger.info(`📱 Flutter: http://192.168.137.1:${PORT}/flutter`);
  logger.info(`💾 Memory usage: ${JSON.stringify(process.memoryUsage())}`);
  logger.info(`🔌 MQTT Status: ${mqttService.isConnected ? 'Connected' : 'Connecting...'}`);
});

// Global access for other modules
global.mqttService = mqttService;

module.exports = { app, server, io, mqttService };