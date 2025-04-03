require("dotenv").config();
const express = require("express");
const pgp = require("pg-promise")();
const cors = require("cors");
const winston = require("winston");
const { Client } = require("pg");

const app = express();
app.use(express.json());

const corsOptions = {
  origin: ["https://myimc.in/"], // Change this to your frontend domain
  methods: "GET",
};
app.use(cors(corsOptions));

// Logger setup
const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "server.log" }),
  ],
});

// PostgreSQL Connection
const dbConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const db = pgp(dbConfig);

// Fetch all customers
app.get("/api/customers", async (req, res) => {
  try {
    const customers = await db.any(
      "SELECT name FROM acc_master ORDER BY code DESC"
    );
    res.json(customers);
  } catch (error) {
    logger.error(`Error fetching customers: ${error.stack}`);
    res.status(500).json({ error: "Database error. Please try again later." });
  }
});

// SSE using PostgreSQL LISTEN/NOTIFY
const pgClient = new Client(dbConfig);
pgClient.connect();
pgClient.query("LISTEN customers_update");

let activeClients = [];

pgClient.on("notification", (msg) => {
  const newCustomer = JSON.parse(msg.payload);
  activeClients.forEach((res) => {
    res.write(`data: ${JSON.stringify(newCustomer)}\n\n`);
  });
});

app.get("/api/customers/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  activeClients.push(res);

  req.on("close", () => {
    activeClients = activeClients.filter((client) => client !== res);
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
