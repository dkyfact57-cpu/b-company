const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PRODUCTION";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
if (JWT_SECRET === "CHANGE_ME_IN_PRODUCTION" || ADMIN_PASSWORD === "change-me") {
  console.warn("WARNING: Set JWT_SECRET and ADMIN_PASSWORD before production.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name VARCHAR(40) NOT NULL,
      area VARCHAR(80) NOT NULL,
      mobile VARCHAR(10) NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

function clean(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function validMobile(value) {
  return /^[6-9]\d{9}$/.test(value);
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

app.post("/api/join", joinLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name, 40);
    const area = clean(req.body.area, 80);
    const mobile = clean(req.body.mobile, 10);

    if (!name || !area || !validMobile(mobile)) {
      return res.status(400).json({
        error: "Please enter valid name, area and 10-digit mobile number."
      });
    }

    const result = await pool.query(
      `INSERT INTO members (name, area, mobile)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, area, mobile]
    );

    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const username = clean(req.body.username, 50);
  const password = String(req.body.password || "");

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = jwt.sign(
    { username, role: "admin" },
    JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ token });
});

app.get("/api/admin/members", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, area, mobile,
             TO_CHAR(joined_at AT TIME ZONE 'Asia/Kolkata',
                     'YYYY-MM-DD HH24:MI:SS') AS joined_at
      FROM members
      ORDER BY id DESC
    `);
    res.json({ members: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/admin/export.csv", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, area, mobile,
             TO_CHAR(joined_at AT TIME ZONE 'Asia/Kolkata',
                     'YYYY-MM-DD HH24:MI:SS') AS joined_at
      FROM members
      ORDER BY id ASC
    `);

    const escapeCsv = value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    let csv = "ID,Name,Area,Mobile,Joined At\n";
    for (const m of result.rows) {
      csv += [m.id, m.name, m.area, m.mobile, m.joined_at]
        .map(escapeCsv).join(",") + "\n";
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="b-company-members.csv"'
    );
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send("Export failed");
  }
});

app.delete("/api/admin/members/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const result = await pool.query(
      "DELETE FROM members WHERE id = $1",
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Member not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`B Company running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Database initialization failed:", err);
    process.exit(1);
  });
