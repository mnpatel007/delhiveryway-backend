const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const socketIO = require('socket.io');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const vendororderRoutes = require('./routes/vendororderRoutes');
const customerRoutes = require('./routes/customerRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const webhookRoute = require('./routes/webhook');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: [
            'https://delhiveryway-customer.vercel.app',
            'https://delhiveryway-vendor.vercel.app',
            'http://localhost:3000'
        ],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// ✅ Socket instance accessible in routes
app.set('io', io);

// ✅ CORS setup
const allowedOrigins = [
    'https://delhiveryway-customer.vercel.app',
    'https://delhiveryway-vendor.vercel.app',
    'http://localhost:3000'
];
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Webhook route (must use raw body parsing)
app.use('/api/webhook', webhookRoute);

// ✅ Main API routes
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/vendor', vendororderRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/payment', paymentRoutes);

// ✅ Socket.IO connection
io.on('connection', (socket) => {
    console.log('🟢 Socket connected:', socket.id);

    socket.on('joinVendorRoom', (vendorId) => {
        socket.join(vendorId);
        console.log(`📦 Vendor ${vendorId} joined their socket room`);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected:', socket.id);
    });
});

// ✅ Connect to MongoDB and start server
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Connected to MongoDB');
    server.listen(process.env.PORT || 5000, () => {
        console.log('🚀 Server running with Socket.IO on port', process.env.PORT || 5000);
    });
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});
