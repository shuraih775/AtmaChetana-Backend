import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import prisma from "./utils/prisma.js";
import { initializeAdmin } from "./utils/initializeAdmin.js";

import authRoutes from "./routes/auth.js";
import studentRoutes from "./routes/students.js";
import appointmentRoutes from "./routes/appointments.js";
import emailRoutes from "./routes/email.js";
import statsRoutes from "./routes/stats.js";

import { errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


app.use(helmet());


const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: "Too many requests. Try again later." },
});
app.use("/api", limiter);


app.use(
  cors({
    origin: process.env.APP_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);


app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("combined"));


app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Atma-Chethana API is running",
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || "v1",
  });
});


app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/stats", statsRoutes);


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});


app.use(errorHandler);


async function startServer() {
  try {
    await prisma.$connect();
    console.log("🔗 Connected to MySQL via Prisma");

    await initializeAdmin();

    app.listen(PORT, () => {
      console.log(`🌟 ${process.env.APP_NAME || "Atma-Chethana"} API running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔗 http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("❌ Error starting server:", error);
    process.exit(1);
  }
}

startServer();


process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down gracefully...");

  await prisma.$disconnect();
  console.log("🔥 Prisma: MySQL connection closed.");

  process.exit(0);
});

export default app;
