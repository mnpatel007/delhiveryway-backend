const { sendMail } = require('../utils/mailer');

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase());
}

exports.sendContactMessage = async (req, res) => {
    try {
        const { name, email, subject, message } = req.body || {};

        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
        }

        const recipient = process.env.GMAIL_USER || 'meetnp007@gmail.com';
        const finalSubject = `[Contact] ${subject && subject.trim() ? subject.trim() : 'New message from customer'}`;

        const safe = (v) => String(v || '').replace(/[<>]/g, '');

        const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111">
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${safe(name)}</p>
                <p><strong>Email:</strong> ${safe(email)}</p>
                <hr style="border:none;border-top:1px solid #ddd" />
                <p><strong>Message:</strong></p>
                <p style="white-space: pre-wrap">${safe(message)}</p>
                <br/>
                <p style="color:#666;font-size:12px">Sent from DelhiveryWay Customer Portal</p>
            </div>
        `;
        const text = `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\n--\nSent from DelhiveryWay Customer Portal`;

        await sendMail({
            to: recipient,
            subject: finalSubject,
            text,
            html,
            replyTo: email,
        });

        return res.json({ success: true, message: 'Message sent successfully.' });
    } catch (err) {
        console.error('Contact send error:', err);
        const hint = process.env.SMTP_HOST || process.env.GMAIL_USER ? '' : ' (email not configured)';
        return res.status(500).json({ success: false, message: `Failed to send message${hint}.` });
    }
};

