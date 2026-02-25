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

        const recipient = process.env.GMAIL_USER || 'delhiveryway@gmail.com';
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

        // --- Auto-reply to the customer ---
        const customerSubject = `We got your message! - DelhiveryWay`;

        const customerHtml = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4f46e5;">Hello ${safe(name)},</h2>
                
                <p>Thank you so much for reaching out to us! We have received your message and our team will get back to you as soon as possible.</p>
                
                <p>In the meantime, we'd love for you to join our growing community online! Follow us for the latest updates, tips, and personal shopping experiences:</p>
                
                <div style="margin: 25px 0;">
                    <a href="https://instagram.com/delhiveryway" style="display: inline-block; padding: 10px 20px; background-color: #e1306c; color: white; text-decoration: none; border-radius: 5px; margin-right: 10px; font-weight: bold;">Follow on Instagram</a>
                    <a href="https://facebook.com/delhiveryway" style="display: inline-block; padding: 10px 20px; background-color: #1877f2; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Like on Facebook</a>
                </div>
                
                <p>If you have any urgent queries, you can always reply directly to this email.</p>
                
                <p>Warm regards,<br/><strong>The DelhiveryWay Team</strong></p>
                
                <hr style="border:none;border-top:1px solid #e5e7eb; margin: 30px 0;" />
                <p style="color:#6b7280;font-size:12px;text-align:center;">This is an automated response to your contact form submission.</p>
            </div>
        `;

        const customerText = `Hello \${name},\n\nThank you for reaching out to us! We have received your message and will get back to you as soon as possible.\n\nIn the meantime, join our community:\nInstagram: https://instagram.com/delhiveryway\nFacebook: https://facebook.com/delhiveryway\n\nWarm regards,\nThe DelhiveryWay Team`;

        // Send the confirmation email to the user
        await sendMail({
            to: email, // Reply to the user who filled the form
            subject: customerSubject,
            text: customerText,
            html: customerHtml,
        });

        return res.json({ success: true, message: 'Message sent successfully.' });
    } catch (err) {
        console.error('Contact send error:', err);
        const hint = process.env.SMTP_HOST || process.env.GMAIL_USER ? '' : ' (email not configured)';
        return res.status(500).json({ success: false, message: `Failed to send message${hint}.` });
    }
};

