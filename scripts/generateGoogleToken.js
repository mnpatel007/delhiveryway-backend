const { OAuth2Client } = require('google-auth-library');
const express = require('express');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Load backend .env

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 5001;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`; // Explicit IP is more reliable than 'localhost' on Windows

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file.');
    process.exit(1);
}

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const app = express();
let server;

app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        res.send('❌ No code provided!');
        return;
    }

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        res.send('<h1>✅ Success! You can close this window and check your terminal.</h1>');

        console.log('\n✅ Your New Refresh Token Is:\n');
        console.log('\x1b[32m%s\x1b[0m', tokens.refresh_token); // Print in green
        console.log('\n👉 IMPORTANT: Add this to your Render Environment Variables (or local .env) as GOOGLE_REFRESH_TOKEN');
        console.log('\n(Also note: If your Google Cloud app is currently in "Testing" mode, OAuth tokens expire every 7 days. Go to Google Cloud Console -> APIs & Services -> OAuth consent screen -> and click "Publish App" if you want the token to never expire!)');

        server.close();
        process.exit(0);
    } catch (error) {
        res.send('❌ Error retrieving access token: ' + error.message);
        console.error('❌ Error:', error.message);
        server.close();
        process.exit(1);
    }
});

const { exec } = require('child_process');

server = app.listen(PORT, '127.0.0.1', () => {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Forces to get a refresh token
        scope: SCOPES,
    });

    console.log(`\x1b[33m%s\x1b[0m`, `🚀 Server started on http://127.0.0.1:${PORT}`);
    console.log(`\x1b[31m%s\x1b[0m`, `⚠️  IMPORTANT: Ensure your Google Cloud Redirect URI is set to: http://127.0.0.1:${PORT}/oauth2callback (Note: 127.0.0.1 is DIFFERENT than localhost for Google!)`);
    console.log('\n🔗 Opening your browser to authorize...');
    console.log('\nIf the browser doesn\'t open, copy this URL manually:');
    console.log('\x1b[36m%s\x1b[0m\n', authUrl);

    // Automatically open browser
    const start = process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open';
    exec(`${start} "${authUrl.replace(/&/g, '^&')}"`); // Escape & for Windows CMD
});
