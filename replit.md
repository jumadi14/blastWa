# WhatsApp Blast Jumadi — Backend

## Overview
Express.js backend for a WhatsApp blast (broadcast) system. Provides REST APIs for authentication, devices, messaging, templates, inbox, sent messages, scheduling, and dashboard stats. Real-time updates are pushed over Socket.IO. WhatsApp sessions are managed via `whatsapp-web.js` / `venom-bot` with Puppeteer.

## Tech Stack
- Node.js 20 + Express 4 (ES modules, `"type": "module"`)
- Socket.IO 4 for real-time events
- MySQL via `mysql2/promise` (configured for Aiven-style remote MySQL with SSL)
- Puppeteer + `whatsapp-web.js` / `venom-bot` for WhatsApp automation
- `node-cron` and an internal 30-second scheduler loop for due-message processing
- `multer` for file uploads, `xlsx` for spreadsheet parsing, `jsonwebtoken` + `bcryptjs` for auth

## Project Layout
- `server.js` — Express + Socket.IO bootstrap, route mounting, scheduler loop
- `routes/` — Express routers (`authRoutes`, `deviceRoutes`, `messageRoutes`, `templateRoutes`, `inboxRoutes`, `sentRoutes`, `schedulerRoutes`, `dashboardRoutes`, `userRoutes`)
- `controllers/` — Route handlers / business logic
- `services/` — `whatsappService`, `schedulerService`, `inboxService`, `sentService`, `excelService`, `templateApi`
- `models/` — `db.js` (MySQL pool + default admin seed), `userModel.js`

## Replit Setup
- Workflow `Start application` runs `npm run dev` (nodemon) and listens on `0.0.0.0:5000` (webview).
- The HTTP server binds to `HOST=0.0.0.0` and `PORT=5000` (overridable via `PORT` env var).
- `npm install` is run with `--ignore-scripts` so the `postinstall` Puppeteer Chrome download is skipped (Puppeteer is bundled / installed on demand by the WhatsApp libraries).
- Deployment target: `vm` (run command `npm start`). VM is required because the app holds persistent WhatsApp sessions, Socket.IO connections, and a 30-second scheduler loop.

## Environment Variables
The following secrets are read by `models/db.js` via `dotenv`. They must be provided for the database-backed features to work; without them the server still boots but DB calls log connection errors.

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — MySQL connection (SSL is enabled with `rejectUnauthorized: false`)
- `PORT` (optional) — overrides the default port `5000`

Other code paths may read additional secrets (e.g. JWT secret) — set them as needed in the Replit Secrets panel.

## Default Admin
On first startup, `models/db.js` seeds a default admin user (`admin` / `admin123`) into the `Users` table if it is empty.

## Recent Changes
- 2026-04-27: Imported from GitHub. Bound server to `0.0.0.0:5000`, added Replit workflow, configured VM deployment.
