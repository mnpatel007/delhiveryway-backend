// backend/server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const socketIo = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');

dotenv.config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    'http://localhost:3000', // Customer app
    'http://localhost:3001', // Admin app
    'http://localhost:3002', // Personal Shopper app
    'https://delhiveryway-customer.vercel.app',
    'https://delhiveryway-shopper.vercel.app',
    'https://delhiveryway-admin.vercel.app',
    process.env.FRONTEND_URL,
    process.env.ADMIN_FRONTEND_URL,
    process.env.SHOPPER_FRONTEND_URL
].filter(Boolean);

const io = socketIo(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true,
    },
});

// Make io accessible in routes
app.set('io', io);

// Stripe webhook must be registered before body parsers
app.use('/api/webhook', require('./routes/webhook'));

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);

            // Allow all localhost and development origins
            if (origin.includes('localhost') || origin.includes('local-credentialless') || origin.includes('webcontainer-api.io')) {
                console.log('✅ Allowing development origin:', origin);
                return callback(null, true);
            }

            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.log('❌ CORS blocked origin:', origin);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'X-CSRF-Token',
            'Accept',
            'Origin',
            'Cache-Control',
            'X-File-Name'
        ],
        exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
        preflightContinue: false,
        optionsSuccessStatus: 200
    })
);

// Handle preflight requests explicitly
app.options('*', cors());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-session-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ------------------------------------------------------------------ */
/*  Socket.IO logic                                                   */
/* ------------------------------------------------------------------ */
io.on('connection', (socket) => {
    console.log('🟢 Socket connected:', socket.id);

    // Generic join room handler
    socket.on('join', (roomName) => {
        socket.join(roomName);
        console.log(`✅ Socket ${socket.id} joined room: ${roomName}`);
    });

    // Legacy handlers for backward compatibility
    socket.on('authenticate', ({ userId }) => {
        socket.join(userId);
        console.log(`✅ User ${userId} joined room ${userId}`);
    });

    socket.on('registerCustomer', (customerId) => {
        socket.join(customerId);
        socket.join(`customer_${customerId}`);
        console.log(`👤 Customer ${customerId} joined their socket rooms`);
    });

    socket.on('registerPersonalShopper', (shopperId) => {
        socket.join('personalShoppers');
        socket.join(`shopper_${shopperId}`);
        console.log(`🛒 Personal Shopper ${shopperId} joined shopper rooms`);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected:', socket.id);
    });
});

/* ------------------------------------------------------------------ */
/*  MongoDB & routes                                                  */
/* ------------------------------------------------------------------ */
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');

        // API Routes
        app.use('/api/auth', require('./routes/authRoutes'));
        app.use('/api/shops', require('./routes/shopRoutes'));
        app.use('/api/products', require('./routes/productRoutes'));
        app.use('/api/orders', require('./routes/orderRoutes'));
        app.use('/api/payment', require('./routes/paymentRoutes'));
        app.use('/api/shopper/auth', require('./routes/shopperAuthRoutes'));
        app.use('/api/shopper/orders', require('./routes/shopperOrderRoutes'));
        app.use('/api/admin', require('./routes/adminRoutes'));

        app.get('/', (req, res) => {
            res.send('DelhiveryWay Backend API Running ✅');
        });

        app.get('/api/debug/products', async (req, res) => {
            const Product = require('./models/Product');
            const Shop = require('./models/Shop');
            const products = await Product.find({}).populate('shopId', 'name');
            const shops = await Shop.find({});
            res.json({
                totalProducts: products.length,
                totalShops: shops.length,
                products: products.slice(0, 5),
                shops: shops.slice(0, 5)
            });
        });

        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () =>
            console.log(`🚀 Server running with Socket.IO on port ${PORT}`)
        );
    })
    .catch((err) => {
        console.error('❌ MongoDB connection error:', err);
    });