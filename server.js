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
        origin: ['http://localhost:3000', 'http://localhost:3001', 'https://delhiveryway-vendor.vercel.app', 'https://delhiveryway-customer.vercel.app'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

// ✅ Make io accessible in routes like webhook.js
app.set('io', io);

// ✅ Stripe webhook must be registered before body parsers
app.use('/api/webhook', require('./routes/webhook'));

app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://delhiveryway-vendor.vercel.app',
        'https://delhiveryway-customer.vercel.app'
    ],
    credentials: true
}));


app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Socket.IO logic
io.on('connection', (socket) => {
    console.log('🟢 Socket connected:', socket.id);

    socket.on('registerVendor', (vendorId) => {
        socket.join(vendorId);
        console.log(`📦 Vendor ${vendorId} joined their socket room`);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected:', socket.id);
    });
});

// ✅ MongoDB and route setup
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');

        // All routes after DB connection
        const authRoutes = require('./routes/authRoutes');
        const shopRoutes = require('./routes/shopRoutes');
        const productRoutes = require('./routes/productRoutes');
        const orderRoutes = require('./routes/orderRoutes');
        const vendorOrderRoutes = require('./routes/vendororderRoutes');
        const paymentRoutes = require('./routes/paymentRoutes');
        const vendorStatsRoutes = require('./routes/vendorStatsRoutes');

        app.use('/api/auth', authRoutes);
        app.use('/api/shops', shopRoutes);
        app.use('/api/products', productRoutes);
        app.use('/api/orders', orderRoutes);
        app.use('/api/vendor/orders', vendorOrderRoutes);
        app.use('/api/vendor', vendorStatsRoutes);
        app.use('/api/payment', paymentRoutes);

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
