const User = require('../models/User');
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

// Signup
exports.signup = async (req, res) => {
    try {
        const { name, email, password, phone, role = 'customer' } = req.body;

        // Validate required fields
        if (!name || !email || !password || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, password, and phone are required'
            });
        }

        // Validate email format
        const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address'
            });
        }

        // Validate phone format
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid 10-digit phone number'
            });
        }

        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { phone }]
        });

        if (existingUser) {
            const field = existingUser.email === email ? 'email' : 'phone number';
            return res.status(409).json({
                success: false,
                message: `User with this ${field} already exists`
            });
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Create user (password will be hashed by pre-save middleware)
        const user = new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            phone: phone.trim(),
            role,
            verificationToken,
            isVerified: process.env.NODE_ENV === 'development' // Auto-verify in development
        });

        await user.save();

        // Send verification email if not in development
        if (process.env.NODE_ENV !== 'development') {
            try {
                const frontendURL = role === 'vendor'
                    ? process.env.VENDOR_FRONTEND_URL
                    : process.env.FRONTEND_URL;

                const verificationLink = `${frontendURL}/verify-email?token=${verificationToken}&email=${email}`;

                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.GMAIL_USER,
                        pass: process.env.GMAIL_PASS
                    }
                });

                await transporter.sendMail({
                    from: process.env.GMAIL_USER,
                    to: email,
                    subject: 'Verify your email - DelhiveryWay',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #4a90e2;">Welcome to DelhiveryWay!</h2>
                            <p>Thank you for signing up. Please verify your email address to complete your registration.</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${verificationLink}" 
                                   style="background-color: #4a90e2; color: white; padding: 12px 30px; 
                                          text-decoration: none; border-radius: 5px; display: inline-block;">
                                    Verify Email Address
                                </a>
                            </div>
                            <p style="color: #666; font-size: 14px;">
                                If the button doesn't work, copy and paste this link into your browser:<br>
                                <a href="${verificationLink}">${verificationLink}</a>
                            </p>
                            <p style="color: #666; font-size: 12px;">
                                This link will expire in 24 hours. If you didn't create an account, please ignore this email.
                            </p>
                        </div>
                    `
                });

                console.log('📧 Verification email sent to:', sanitizeForLog(email));
            } catch (emailError) {
                console.error('📧 Email sending failed:', emailError);
                // Don't fail signup if email fails
            }
        }

        res.status(201).json({
            success: true,
            message: process.env.NODE_ENV === 'development'
                ? 'Account created successfully. You can now log in.'
                : 'Account created successfully. Please check your email to verify your account.',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isVerified: user.isVerified
                }
            }
        });

    } catch (error) {
        console.error('Signup error:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Account creation failed. Please try again.'
        });
    }
};

// Login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user and include password for comparison
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if account is locked
        if (user.isLocked) {
            return res.status(423).json({
                success: false,
                message: 'Account temporarily locked due to too many failed login attempts. Please try again later.'
            });
        }

        // Check if email is verified
        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Please verify your email before logging in. Check your inbox for verification link.'
            });
        }

        // Compare password
        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            // Increment login attempts
            await user.incLoginAttempts();

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Reset login attempts on successful login
        if (user.loginAttempts > 0) {
            await user.resetLoginAttempts();
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user);

        // Remove sensitive data from response
        const userResponse = user.toJSON();

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: userResponse,
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

// Verify email
exports.verifyEmail = async (req, res) => {
    try {
        const { token, email } = req.query;

        if (!token || !email) {
            return res.status(400).json({
                success: false,
                message: 'Token and email are required'
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase(),
            verificationToken: token
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification link'
            });
        }

        if (user.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();

        console.log('✅ Email verified successfully for:', sanitizeForLog(user.email));

        res.json({
            success: true,
            message: 'Email verified successfully. You can now log in.',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isVerified: user.isVerified
                }
            }
        });

    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Email verification failed. Please try again.'
        });
    }
};

// Google login/signup
exports.googleLogin = async (req, res) => {
    try {
        const { email, name, googleId, role = 'customer' } = req.body;

        if (!email || !name || !googleId) {
            return res.status(400).json({
                success: false,
                message: 'Email, name, and Google ID are required'
            });
        }

        // Check if user exists
        let user = await User.findOne({ email });

        if (user) {
            // User exists, check role compatibility
            if (user.role !== role) {
                return res.status(400).json({
                    success: false,
                    message: `This email is registered as ${user.role}. Please use the correct app.`
                });
            }

            // Update last login
            user.lastLogin = new Date();
            await user.save();

            const token = generateToken(user);
            return res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: user.toJSON(),
                    token
                }
            });
        }

        // User doesn't exist - create new user
        const randomPassword = crypto.randomBytes(16).toString('hex');

        user = new User({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: randomPassword,
            phone: '0000000000', // Placeholder, user can update later
            role,
            isVerified: true // Google accounts are pre-verified
        });

        await user.save();

        const token = generateToken(user);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            data: {
                user: user.toJSON(),
                token
            }
        });

    } catch (error) {
        console.error('Google login error:', error);
        res.status(500).json({
            success: false,
            message: 'Google login failed. Please try again.'
        });
    }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No account found with this email address'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
        await user.save();

        // Send reset email
        try {
            const frontendURL = user.role === 'vendor'
                ? process.env.VENDOR_FRONTEND_URL
                : process.env.FRONTEND_URL;

            const resetLink = `${frontendURL}/reset-password?token=${resetToken}&email=${email}`;

            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_PASS,
                },
            });

            await transporter.sendMail({
                from: process.env.GMAIL_USER,
                to: email,
                subject: 'Password Reset - DelhiveryWay',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #4a90e2;">Password Reset Request</h2>
                        <p>You requested a password reset for your DelhiveryWay account.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetLink}" 
                               style="background-color: #4a90e2; color: white; padding: 12px 30px; 
                                      text-decoration: none; border-radius: 5px; display: inline-block;">
                                Reset Password
                            </a>
                        </div>
                        <p style="color: #666; font-size: 14px;">
                            If the button doesn't work, copy and paste this link into your browser:<br>
                            <a href="${resetLink}">${resetLink}</a>
                        </p>
                        <p style="color: #666; font-size: 12px;">
                            This link will expire in 30 minutes. If you didn't request this reset, please ignore this email.
                        </p>
                    </div>
                `
            });

            console.log('📧 Password reset email sent to:', sanitizeForLog(email));
        } catch (emailError) {
            console.error('📧 Password reset email failed:', emailError);
            // Reset the token if email fails
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();

            return res.status(500).json({
                success: false,
                message: 'Failed to send password reset email. Please try again.'
            });
        }

        res.json({
            success: true,
            message: 'Password reset email sent. Please check your inbox.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Password reset request failed. Please try again.'
        });
    }
};

// Reset password
exports.resetPassword = async (req, res) => {
    try {
        const { token, email, newPassword } = req.body;

        if (!token || !email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Token, email, and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase(),
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Update password (will be hashed by pre-save middleware)
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        // Reset login attempts if any
        user.loginAttempts = 0;
        user.lockUntil = undefined;

        await user.save();

        console.log('✅ Password reset successful for:', sanitizeForLog(user.email));

        res.json({
            success: true,
            message: 'Password reset successful. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Password reset failed. Please try again.'
        });
    }
};

// Get current user profile
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: { user: user.toJSON() }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
};

// Update user profile
exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, address } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update allowed fields
        if (name) user.name = name.trim();
        if (phone) {
            const phoneRegex = /^[0-9]{10}$/;
            if (!phoneRegex.test(phone)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid 10-digit phone number'
                });
            }
            user.phone = phone.trim();
        }
        if (address) user.address = address;

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: { user: user.toJSON() }
        });

    } catch (error) {
        console.error('Update profile error:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Profile update failed. Please try again.'
        });
    }
};

// Change password
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        const user = await User.findById(req.user._id).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);

        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password (will be hashed by pre-save middleware)
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Password change failed. Please try again.'
        });
    }
};