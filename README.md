# B Company — PostgreSQL Edition

## Local
1. Install Node.js 18+.
2. Run `npm install`.
3. Set environment variables from `.env.example`.
4. Start with `npm start`.

## Render deployment
1. Create a PostgreSQL database on your hosting provider.
2. Copy its connection string into the web service environment variable `DATABASE_URL`.
3. Add `JWT_SECRET` and a strong `ADMIN_PASSWORD`.
4. Build command: `npm install`
5. Start command: `npm start`

The database schema is created automatically on first start.

IMPORTANT:
- Never commit `.env`.
- Never expose DATABASE_URL, JWT_SECRET or ADMIN_PASSWORD.
- Because the form collects mobile numbers, use HTTPS and restrict admin access.
