// backend/server.js
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const socketIo = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://delhiveryway-deliveryboy.vercel.app',
            'https://delhiveryway-vendor.vercel.app',
            'https://delhiveryway-customer.vercel.app',
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
    },
});

// Make io accessible in routes
app.set('io', io);

// Stripe webhook must be registered before body parsers
app.use('/api/webhook', require('./routes/webhook'));

app.use(
    cors({
        origin: [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://delhiveryway-vendor.vercel.app',
            'https://delhiveryway-customer.vercel.app',
            'https://delhiveryway-deliveryboy.vercel.app',
        ],
        credentials: true,
    })
);

app.use(express.json());
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

    socket.on('registerVendor', (vendorId) => {
        socket.join(vendorId);
        socket.join(`vendor_${vendorId}`);
        console.log(`📦 Vendor ${vendorId} joined their socket rooms`);
    });

    socket.on('registerCustomer', (customerId) => {
        socket.join(customerId);
        socket.join(`customer_${customerId}`);
        console.log(`👤 Customer ${customerId} joined their socket rooms`);
    });

    socket.on('registerDelivery', (deliveryBoyId) => {
        socket.join('deliveryBoys');
        socket.join(`delivery_${deliveryBoyId}`);
        console.log(`🚴 Delivery boy ${deliveryBoyId} joined delivery rooms`);
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

        // All routes after DB connection
        app.use('/api/auth', require('./routes/authRoutes'));
        app.use('/api/shops', require('./routes/shopRoutes'));
        app.use('/api/products', require('./routes/productRoutes'));
        app.use('/api/orders', require('./routes/orderRoutes'));
        app.use('/api/vendor/orders', require('./routes/vendororderRoutes'));
        app.use('/api/payment', require('./routes/paymentRoutes'));
        app.use('/api/vendor', require('./routes/vendorStatsRoutes'));
        app.use('/api/temp-orders', require('./routes/tempOrderRoutes'));
        app.use('/api/delivery/auth', require('./routes/deliveryAuthRoutes'));
        app.use('/api/delivery', require('./routes/deliveryRoutes'));

        app.get('/', (req, res) => {
            res.send('DelhiveryWay Backend API Running ✅');
        });

        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () =>
            console.log(`🚀 Server running with Socket.IO on port ${PORT}`)
        );
    })
    .catch((err) => {
        console.error('❌ MongoDB connection error:', err);
    });