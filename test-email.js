const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
    try {
        console.log('🔍 Testing email configuration...');
        console.log('GMAIL_USER:', process.env.GMAIL_USER);
        console.log('GMAIL_PASS:', process.env.GMAIL_PASS ? '***hidden***' : 'NOT SET');

        if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
            console.error('❌ GMAIL_USER or GMAIL_PASS not set in environment variables');
            return;
        }

        const transporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS
            }
        });

        console.log('📧 Sending test email...');

        const info = await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, // Send to self for testing
            subject: 'Test Email - DelhiveryWay',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4a90e2;">Test Email from DelhiveryWay</h2>
                    <p>This is a test email to verify that the email configuration is working correctly.</p>
                    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                    <p>If you receive this email, the email service is working properly!</p>
                </div>
            `
        });

        console.log('✅ Test email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);

    } catch (error) {
        console.error('❌ Email test failed:', error.message);

        if (error.code === 'EAUTH') {
            console.error('🔐 Authentication failed. Please check:');
            console.error('1. Gmail username and password are correct');
            console.error('2. You are using an App Password (not your regular Gmail password)');
            console.error('3. 2-Factor Authentication is enabled on your Gmail account');
            console.error('4. App Password is generated correctly');
        } else if (error.code === 'ECONNECTION') {
            console.error('🌐 Connection failed. Please check your internet connection.');
        } else {
            console.error('📧 Email error details:', error);
        }
    }
}

testEmail();
