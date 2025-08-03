const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Utility function to sanitize log inputs
const sanitizeForLog = (input) => {
    if (typeof input === 'string') {
        return encodeURIComponent(input).replace(/[\r\n]/g, '');
    }
    return JSON.stringify(input).replace(/[\r\n]/g, '');
};

const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

exports.signup = async (req, res) => {
    console.log('⚙️ Received signup request');

    try {
        const { name, email, password, role } = req.body;
        console.log('📩 Incoming data:', { name: sanitizeForLog(name), email: sanitizeForLog(email), role: sanitizeForLog(role) });

        if (!name || !email || !password || !role) {
            console.log('❌ Missing fields in signup request');
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            console.log('🚫 User already exists:', sanitizeForLog(email));
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashed = await bcrypt.hash(password, 10);
        console.log('🔐 Password hashed');



        const verificationToken = crypto.randomBytes(32).toString('hex');
        console.log('🔑 Verification token generated');

        const user = await User.create({
            name,
            email,
            password: hashed,
            role,
            isVerified: false,
            verificationToken
        });
        console.log('✅ User created in MongoDB:', sanitizeForLog(user._id.toString()));
        const customerURL = process.env.FRONTEND_URL;
        const vendorURL = process.env.VENDOR_FRONTEND_URL;

        const frontendURL = role === 'vendor' ? vendorURL : customerURL;

        const verificationLink = `${frontendURL}/verify-email?token=${verificationToken}&email=${email}`;

        console.log('🔗 Verification link generated for user:', sanitizeForLog(email));

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Verify your email - DelhiveryWay',
            html: `<p>Click the link to verify your email:</p><a href="${verificationLink}">${verificationLink}</a>`
        });

        console.log('📧 Email sent successfully to:', sanitizeForLog(email));

        res.status(201).json({ message: 'Verification email sent to your email address' });

    } catch (err) {
        console.error('🔥 Signup failed:', sanitizeForLog(err.message));
        res.status(500).json({ message: 'Signup failed', error: err.message });
    }
};

// Verify email route handler
exports.verifyEmail = async (req, res) => {
    try {
        const { token, email } = req.query;
        console.log('🔍 Incoming verification request for email:', sanitizeForLog(email));

        const user = await User.findOne({ email, verificationToken: token });

        if (!user) {
            console.log('❌ No matching user found for verification.');
            return res.status(400).json({ message: 'Invalid or expired verification link' });
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        console.log('✅ Email verified successfully for:', sanitizeForLog(user.email));

        res.status(200).json({ message: 'Email verified successfully', user });
    } catch (err) {
        console.error('🔥 Verification failed:', sanitizeForLog(err.message));
        res.status(500).json({ message: 'Verification failed', error: err.message });
    }
};



exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        // Check if email is verified
        if (!user.isVerified) {
            return res.status(403).json({ message: 'Email not verified. Please check your inbox.' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Invalid credentials' });

        const token = generateToken(user);
        res.status(200).json({ user, token });
    } catch (err) {
        res.status(500).json({ message: 'Login failed', error: err.message });
    }
};

// New Google login/signup controller
exports.googleLogin = async (req, res) => {
    try {
        const { email, name, googleId, role } = req.body;

        if (!email || !name || !googleId || !role) {
            return res.status(400).json({ message: 'Google login: Missing required fields' });
        }

        // Check if user exists
        let user = await User.findOne({ email });

        if (user) {
            // Ensure role matches
            if (user.role !== role) {
                return res.status(400).json({ message: `User role mismatch: expected ${user.role} got ${role}` });
            }
            const token = generateToken(user);
            return res.status(200).json({ user, token });
        }

        // User doesn't exist - create new user
        const randomPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        user = await User.create({
            name,
            email,
            password: hashedPassword,
            role,
        });

        const token = generateToken(user);
        res.status(201).json({ user, token });
    } catch (err) {
        console.error('Google login error:', err);
        res.status(500).json({ message: 'Google login failed', error: err.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'No user found with this email' });

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 1000 * 60 * 30; // 30 minutes
        await user.save();

        const frontendURL = user.role === 'vendor'
            ? process.env.VENDOR_FRONTEND_URL
            : process.env.FRONTEND_URL;

        const resetLink = `${frontendURL}/reset-password?token=${resetToken}&email=${email}`;

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset - DelhiveryWay',
            html: `<p>Click below to reset your password:</p><a href="${resetLink}">${resetLink}</a>`
        });

        res.json({ message: 'Password reset email sent' });
    } catch (err) {
        console.error('Forgot Password Error:', err);
        res.status(500).json({ message: 'Something went wrong', error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { token, email, newPassword } = req.body;

        const user = await User.findOne({
            email,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

        user.password = await bcrypt.hash(newPassword, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: 'Password reset successful' });
    } catch (err) {
        console.error('Reset Password Error:', err);
        res.status(500).json({ message: 'Failed to reset password', error: err.message });
    }
};
