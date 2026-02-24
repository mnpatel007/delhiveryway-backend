const nodemailer = require('nodemailer');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');

async function sendMail({ to, subject, text, html, replyTo }) {
    const from = process.env.MAIL_FROM || `DelhiveryWay <${process.env.GMAIL_USER || 'meetnp007@gmail.com'}>`;

    // Priority 1: Generic SMTP settings (if you upgrade hosting in the future)
    if (process.env.SMTP_HOST) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
            auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            } : undefined,
        });
        return await transporter.sendMail({
            from, to, subject, text, html, replyTo
        });
    }

    // Priority 2: Use Gmail REST API over HTTP to bypass Render's SMTP block
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {

        const oAuth2Client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

        try {
            const { token } = await oAuth2Client.getAccessToken();

            // 1. Generate raw MIME string using nodemailer's stream transport
            const streamTransporter = nodemailer.createTransport({
                streamTransport: true,
                buffer: true
            });

            const info = await streamTransporter.sendMail({
                from,
                to,
                subject,
                text,
                html,
                replyTo
            });

            // 2. Format it to base64url for the Gmail API
            const encodedMessage = info.message.toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            // 3. Send over HTTP (port 443 allows bypass of Render SMTP block)
            const response = await axios.post(
                'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
                { raw: encodedMessage },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Email successfully sent via Gmail API over HTTP!');
            return response.data;
        } catch (error) {
            console.error('CRITICAL: Gmail API HTTP Error:', error?.response?.data || error.message);
            throw error;
        }
    }

    throw new Error('Email transport not configured. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN or SMTP_HOST.');
}

module.exports = { sendMail };
