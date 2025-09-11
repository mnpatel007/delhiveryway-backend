const nodemailer = require('nodemailer');

function createTransport() {
    // Priority 1: Generic SMTP settings
    if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
            auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            } : undefined,
        });
    }

    // Priority 2: Gmail (requires App Password or OAuth2; App Password simplest)
    if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS,
            },
        });
    }

    throw new Error('Email transport not configured. Set SMTP_HOST + SMTP_* or GMAIL_USER + GMAIL_PASS env vars.');
}

async function sendMail({ to, subject, text, html, replyTo }) {
    const transporter = createTransport();

    const from = process.env.MAIL_FROM || 'DelhiveryWay Support <no-reply@delhiveryway.com>';

    const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
        replyTo,
    });

    return info;
}

module.exports = { sendMail };

