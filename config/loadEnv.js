// Loads the correct environment file based on NODE_ENV.
//   NODE_ENV=development -> .env.development  (local Docker stack: local Mongo + Mailhog)
//   anything else        -> .env             (production / Render dashboard variables)
// This keeps local development fully isolated from the live database.
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });
