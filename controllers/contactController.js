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
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>We got your message!</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                    body { font-family: 'Inter', Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
                    .header { background: linear-gradient(135deg, #4f46e5, #3730a3); color: #ffffff; padding: 40px 30px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
                    .header p { margin: 10px 0 0; font-size: 15px; opacity: 0.9; }
                    .content { padding: 40px 30px; text-align: center; }
                    .greeting { font-size: 18px; font-weight: 600; color: #111827; margin-top: 0; margin-bottom: 20px; }
                    .message { color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 30px; }
                    .footer { background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
                    .socials { margin: 20px 0; }
                    .socials a { display: inline-block; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; margin: 0 5px; color: #ffffff; transition: transform 0.2s; }
                    .btn-insta { background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); }
                    .btn-fb { background-color: #1877f2; }
                    .disclaimer { font-size: 12px; color: #9ca3af; margin: 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Thank you!</h1>
                        <p>We've received your message</p>
                    </div>
                    
                    <div class="content">
                        <p class="greeting">Hello ${safe(name)},</p>
                        <p class="message">Thank you so much for reaching out to us! Our team will review your message and get back to you as soon as possible.</p>
                        <p class="message" style="margin-bottom: 0;">If you have any urgent queries, you can always reply directly to this email.</p>
                    </div>
                    
                    <div class="footer">
                        <h3 style="margin-top:0; color:#374151; font-size: 16px;">Love DelhiveryWay?</h3>
                        <p style="color:#6b7280; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">Join our community online and never miss an update on incredible discoveries from your local stores.</p>
                        
                        <div class="socials">
                            <a href="https://instagram.com/delhiveryway" class="btn-insta">Follow Instagram</a>
                            <a href="https://facebook.com/delhiveryway" class="btn-fb">Like Facebook</a>
                        </div>
                        
                        <p class="disclaimer">This is an automated response to your contact form submission.</p>
                        <p class="disclaimer" style="margin-top: 10px;">&copy; ${new Date().getFullYear()} DelhiveryWay. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
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

