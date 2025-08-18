const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../models/User');
const PersonalShopper = require('../models/PersonalShopper');
const Shop = require('../models/Shop');
const Product = require('../models/Product');
const Order = require('../models/Order');

const resetDatabase = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Clear all collections
        await User.deleteMany({});
        await PersonalShopper.deleteMany({});
        await Shop.deleteMany({});
        await Product.deleteMany({});
        await Order.deleteMany({});
        console.log('🗑️ Cleared all collections');

        // Create sample shops
        const shops = await Shop.insertMany([
            {
                name: "Fresh Mart Grocery",
                description: "Your neighborhood grocery store with fresh produce",
                category: "grocery",
                address: {
                    street: "123 Main Street",
                    city: "Mumbai",
                    state: "Maharashtra",
                    zipCode: "400001",
                    coordinates: { lat: 19.0760, lng: 72.8777 }
                },
                contact: {
                    phone: "+91 9876543210",
                    email: "freshmart@example.com"
                },
                operatingHours: {
                    monday: { open: "08:00", close: "22:00", closed: false },
                    tuesday: { open: "08:00", close: "22:00", closed: false },
                    wednesday: { open: "08:00", close: "22:00", closed: false },
                    thursday: { open: "08:00", close: "22:00", closed: false },
                    friday: { open: "08:00", close: "22:00", closed: false },
                    saturday: { open: "08:00", close: "22:00", closed: false },
                    sunday: { open: "09:00", close: "21:00", closed: false }
                },
                tags: ["grocery", "fresh", "vegetables", "fruits"],
                deliveryFee: 25,
                minOrderValue: 100
            },
            {
                name: "MedPlus Pharmacy",
                description: "24/7 pharmacy with all medicines and health products",
                category: "pharmacy",
                address: {
                    street: "456 Health Avenue",
                    city: "Mumbai",
                    state: "Maharashtra",
                    zipCode: "400002",
                    coordinates: { lat: 19.0825, lng: 72.8811 }
                },
                contact: {
                    phone: "+91 9876543211",
                    email: "medplus@example.com"
                },
                operatingHours: {
                    monday: { open: "00:00", close: "23:59", closed: false },
                    tuesday: { open: "00:00", close: "23:59", closed: false },
                    wednesday: { open: "00:00", close: "23:59", closed: false },
                    thursday: { open: "00:00", close: "23:59", closed: false },
                    friday: { open: "00:00", close: "23:59", closed: false },
                    saturday: { open: "00:00", close: "23:59", closed: false },
                    sunday: { open: "00:00", close: "23:59", closed: false }
                },
                tags: ["pharmacy", "medicines", "health", "24x7"],
                deliveryFee: 15,
                minOrderValue: 50
            },
            {
                name: "TechZone Electronics",
                description: "Latest gadgets and electronics at best prices",
                category: "electronics",
                address: {
                    street: "789 Tech Park",
                    city: "Mumbai",
                    state: "Maharashtra",
                    zipCode: "400003",
                    coordinates: { lat: 19.0896, lng: 72.8656 }
                },
                contact: {
                    phone: "+91 9876543212",
                    email: "techzone@example.com"
                },
                operatingHours: {
                    monday: { open: "10:00", close: "21:00", closed: false },
                    tuesday: { open: "10:00", close: "21:00", closed: false },
                    wednesday: { open: "10:00", close: "21:00", closed: false },
                    thursday: { open: "10:00", close: "21:00", closed: false },
                    friday: { open: "10:00", close: "21:00", closed: false },
                    saturday: { open: "10:00", close: "21:00", closed: false },
                    sunday: { open: "11:00", close: "20:00", closed: false }
                },
                tags: ["electronics", "gadgets", "mobile", "laptop"],
                deliveryFee: 50,
                minOrderValue: 500
            }
        ]);
        console.log('🏪 Created sample shops');

        // Create sample products
        const products = await Product.insertMany([
            // Fresh Mart Products
            {
                name: "Fresh Bananas",
                description: "Organic bananas - 1 dozen",
                shopId: shops[0]._id,
                category: "fruits",
                price: 60,
                originalPrice: 70,
                discount: 14,
                unit: "dozen",
                tags: ["organic", "fresh", "healthy"]
            },
            {
                name: "Basmati Rice",
                description: "Premium basmati rice - 5kg pack",
                shopId: shops[0]._id,
                category: "grains",
                price: 450,
                unit: "5kg",
                tags: ["premium", "basmati", "rice"]
            },
            {
                name: "Fresh Milk",
                description: "Full cream fresh milk - 1 liter",
                shopId: shops[0]._id,
                category: "dairy",
                price: 55,
                unit: "liter",
                tags: ["fresh", "dairy", "milk"]
            },
            // MedPlus Products
            {
                name: "Paracetamol 500mg",
                description: "Pain relief tablets - Strip of 10",
                shopId: shops[1]._id,
                category: "medicines",
                price: 25,
                unit: "strip",
                tags: ["medicine", "paracetamol", "pain-relief"]
            },
            {
                name: "Hand Sanitizer",
                description: "Alcohol-based hand sanitizer - 500ml",
                shopId: shops[1]._id,
                category: "hygiene",
                price: 120,
                unit: "bottle",
                tags: ["sanitizer", "hygiene", "alcohol-based"]
            },
            // TechZone Products
            {
                name: "Wireless Earbuds",
                description: "Bluetooth 5.0 wireless earbuds with charging case",
                shopId: shops[2]._id,
                category: "audio",
                price: 2999,
                originalPrice: 3999,
                discount: 25,
                unit: "piece",
                tags: ["wireless", "bluetooth", "earbuds", "audio"]
            },
            {
                name: "Phone Charger",
                description: "Fast charging USB-C cable - 2 meter",
                shopId: shops[2]._id,
                category: "accessories",
                price: 299,
                unit: "piece",
                tags: ["charger", "usb-c", "fast-charging"]
            }
        ]);
        console.log('📦 Created sample products');

        // Create sample users
        const hashedPassword = await bcrypt.hash('SAMPLE_PASSWORD', 12);
        
        const users = await User.insertMany([
            {
                name: "John Doe",
                email: "john@example.com",
                password: hashedPassword,
                phone: "+91 9876543213",
                address: {
                    street: "101 Customer Street",
                    city: "Mumbai",
                    state: "Maharashtra",
                    zipCode: "400004",
                    coordinates: { lat: 19.0728, lng: 72.8826 }
                }
            },
            {
                name: "Jane Smith",
                email: "jane@example.com",
                password: hashedPassword,
                phone: "+91 9876543214",
                address: {
                    street: "202 Buyer Avenue",
                    city: "Mumbai",
                    state: "Maharashtra",
                    zipCode: "400005",
                    coordinates: { lat: 19.0785, lng: 72.8785 }
                }
            }
        ]);
        console.log('👥 Created sample users');

        // Create sample personal shoppers
        const shoppers = await PersonalShopper.insertMany([
            {
                name: "Raj Kumar",
                email: "raj@shopper.com",
                password: hashedPassword,
                phone: "+91 9876543215",
                currentLocation: {
                    latitude: 19.0760,
                    longitude: 72.8777,
                    address: "Bandra West, Mumbai"
                },
                stats: {
                    totalOrders: 45,
                    completedOrders: 42,
                    cancelledOrders: 3,
                    totalEarnings: 12500,
                    thisMonthEarnings: 4500,
                    avgDeliveryTime: 28
                },
                availability: {
                    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                },
                verification: {
                    isVerified: true,
                    verifiedAt: new Date()
                },
                preferences: {
                    maxOrderValue: 5000,
                    preferredAreas: ['Bandra', 'Khar', 'Santacruz'],
                    vehicleType: 'bike'
                }
            },
            {
                name: "Priya Sharma",
                email: "priya@shopper.com",
                password: hashedPassword,
                phone: "+91 9876543216",
                currentLocation: {
                    latitude: 19.0825,
                    longitude: 72.8811,
                    address: "Andheri East, Mumbai"
                },
                stats: {
                    totalOrders: 67,
                    completedOrders: 65,
                    cancelledOrders: 2,
                    totalEarnings: 18750,
                    thisMonthEarnings: 6200,
                    avgDeliveryTime: 25
                },
                availability: {
                    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                },
                verification: {
                    isVerified: true,
                    verifiedAt: new Date()
                },
                preferences: {
                    maxOrderValue: 8000,
                    preferredAreas: ['Andheri', 'Juhu', 'Versova'],
                    vehicleType: 'car'
                }
            }
        ]);
        console.log('🛒 Created sample personal shoppers');

        console.log('✅ Database reset complete with sample data!');
        console.log('\n📊 Summary:');
        console.log(`- ${shops.length} shops created`);
        console.log(`- ${products.length} products created`);
        console.log(`- ${users.length} users created`);
        console.log(`- ${shoppers.length} personal shoppers created`);
        console.log('\n🔑 Login credentials:');
        console.log('Personal Shoppers:');
        console.log('- raj@shopper.com / 123456');
        console.log('- priya@shopper.com / 123456');
        console.log('Customers:');
        console.log('- john@example.com / 123456');
        console.log('- jane@example.com / 123456');

    } catch (error) {
        console.error('❌ Error resetting database:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
};

resetDatabase();