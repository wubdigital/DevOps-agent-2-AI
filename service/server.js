import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const SCENARIO = process.env.SCENARIO || "healthy";
const VERSION = SCENARIO === "bad_deploy" ? "1.1.0" : "1.0.0";
const startedAt = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== Logs: נשמרים בזיכרון כדי שהסוכן יוכל לקרוא אותם =====
const logs = [];
function log(level, message) {
  const entry = { time: new Date().toISOString(), level, message };
  logs.push(entry);
  if (logs.length > 200) logs.shift();
  console.log(`[${entry.time}] ${level.toUpperCase()} ${message}`);
}

// ===== "מסד נתונים" פשוט בזיכרון =====
const db = {
  connected: SCENARIO !== "db_down",
  orders: [
    { id: 1, item: "Laptop", price: 4500, status: "paid" },
    { id: 2, item: "Mouse", price: 120, status: "pending" },
  ],
};

function queryOrders() {
  if (!db.connected) {
    throw new Error(
      "ECONNREFUSED 10.0.0.5:5432 - could not connect to orders-db",
    );
  }
  return db.orders;
}

// ===== ספק תשלומים חיצוני מדומה =====
async function checkPaymentProvider() {
  if (SCENARIO === "payment_down") {
    await sleep(2000);
    throw new Error("ETIMEDOUT api.payments-provider.com:443 after 2000ms");
  }
  return "ok";
}

// ===== Middleware: רושם כל בקשה ללוג, כולל זמן תגובה =====
app.use((req, res, next) => {
  if (req.path === "/logs") return next();
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : ms > 2000 ? "warn" : "info";
    log(level, `${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ===== תקלה: תגובה איטית =====
app.use(async (req, res, next) => {
  if (SCENARIO === "slow_response" && req.path.startsWith("/api/orders")) {
    await sleep(2500 + Math.random() * 1500);
  }
  next();
});

// ===== API של ההזמנות =====
app.get("/api/orders", (req, res) => {
  try {
    res.json(queryOrders());
  } catch (err) {
    log("error", `GET /api/orders failed: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/orders", async (req, res) => {
  const { item, price } = req.body;
  if (!item || !price) {
    log("warn", "POST /api/orders missing item or price");
    return res.status(400).json({ error: "item and price are required" });
  }

  try {
    const orders = queryOrders();

    // פיצ'ר חדש בגרסה 1.1.0: קופון הנחה (עם באג - מניח שתמיד נשלח coupon)
    if (VERSION === "1.1.0") {
      const discount = req.body.coupon.code === "SALE10" ? 0.1 : 0;
    }

    await checkPaymentProvider(); // יצירת הזמנה דורשת את ספק התשלומים

    const order = { id: orders.length + 1, item, price, status: "pending" };
    orders.push(order);
    log("info", `Order ${order.id} created`);
    res.status(201).json(order);
  } catch (err) {
    log("error", `POST /api/orders failed: ${err.name}: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== נקודות הקצה שהסוכן ישתמש בהן =====
app.get("/health", async (req, res) => {
  const checks = {
    database: db.connected ? "ok" : "down",
    paymentProvider: "ok",
  };
  if (!db.connected) log("error", "Health check: database unreachable");

  try {
    await checkPaymentProvider();
  } catch (err) {
    checks.paymentProvider = "down";
    log("error", `Health check: payment provider failed - ${err.message}`);
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    checks,
  });
});

app.get("/version", (req, res) => {
  res.json({
    service: "orders-service",
    version: VERSION,
    node: process.version,
  });
});

app.get("/logs", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(logs.slice(-limit));
});

app.listen(PORT, (err) => {
  if (err) {
    console.error(`Failed to start on port ${PORT}: ${err.message}`);
    process.exit(1);
  }
  log("info", `Orders service v${VERSION} listening on port ${PORT}`);
});
