import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma.js";
import { protect, authorize } from "../middleware/auth.js";
import nodemailer from "nodemailer";

const router = express.Router();

/**
 * @desc Login (student or admin)
 * @route POST /api/auth/login
 * @access Public
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password, userType = "student" } = req.body;

    if (!email || !password)
      return res.status(400).json({
        success: false,
        message: "Email and password required",
      });

    let user;

    if (userType === "student") {
      user = await prisma.student.findUnique({
        where: { email },
      });
    } else {
      user = await prisma.admin.findUnique({
        where: { email },
      });
    }

    if (!user)
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });

    if (userType === "student" && !user.isVerified)
      return res.status(403).json({
        success: false,
        message: "Email not verified",
      });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    if (userType === "student") {
      await prisma.student.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });
    }

    res.json({
      success: true,
      message: "Login successful",
      data: { token, user: payload },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({
        success: false,
        message: "Email and password required",
      });

    const exists = await prisma.student.findUnique({ where: { email } });

    if (exists && exists.isVerified)
      return res.status(400).json({
        success: false,
        message: "User already exists, please login.",
      });

    if (exists && !exists.isVerified)
      await prisma.student.delete({ where: { email } });

    const nameParts = (name || "").trim().split(" ");
    const firstName = nameParts[0] || email.split("@")[0];
    const lastName = nameParts.slice(1).join(" ") || "Student";

    const otp = (Math.floor(1000 + Math.random() * 9000)).toString();

    const hashed = await bcrypt.hash(password, 12);

    const student = await prisma.student.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashed,
        gender: "Other",
        phone: "0000000000",
        currentClass: "Not specified",
        school: "Not specified",
        otp,
        otpExpires: new Date(Date.now() + 10 * 60000),
        role: "student",
        isVerified: false,
        dateOfBirth: new Date("2000-01-01"),

      },
    });

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Account",
      html: `<h1>Your OTP is ${otp}</h1>`,
    });

    res.status(201).json({
      success: true,
      message: "Signup complete — verify OTP",
      data: { id: student.id, email: student.email },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// used for otp verification during both signup, possword reset
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await prisma.student.findUnique({ where: { email } });

    if (!user)
      return res.status(400).json({
        success: false,
        message: "Invalid email",
      });

    // During password reset, user may already be verified — that's fine.
// So do NOT block if isVerified = true.


    if (!user.otp || user.otp !== otp)
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });

    if (user.otpExpires < new Date())
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });

    await prisma.student.update({
      where: { email },
      data: {
  otp: null,
  otpExpires: null,
  ...(user.isVerified ? {} : { isVerified: true, status: "Active" })
},

    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: "student" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Account verified",
      data: { token },
    });
  } catch (err) {
    console.error("OTP error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.student.findUnique({ where: { email } });

    if (!user)
      return res.status(404).json({
        success: false,
        message: "User not found",
      });

    if (user.isVerified)
      return res.status(400).json({
        success: false,
        message: "Already verified",
      });

    const otp = (Math.floor(1000 + Math.random() * 9000)).toString();

    await prisma.student.update({
      where: { email },
      data: {
        otp,
        otpExpires: new Date(Date.now() + 10 * 60000),
      },
    });

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      html: `<h1>${otp}</h1>`,
    });

    res.json({
      success: true,
      message: "OTP resent",
    });
  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post(
  "/create-staff",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { name, email, password, role = "counsellor" } = req.body;

      if (!name || !email || !password)
        return res.status(400).json({
          success: false,
          message: "Name, email, password required",
        });

      if (!["admin", "counsellor"].includes(role))
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });

      const exists = await prisma.admin.findUnique({ where: { email } });
      if (exists)
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });

      const hashed = await bcrypt.hash(password, 12);

      const user = await prisma.admin.create({
        data: {
          name,
          email,
          password: hashed,
          role,
          isActive: true,
        },
      });

      res.status(201).json({
        success: true,
        message: `${role} created`,
        data: { id: user.id, email: user.email },
      });
    } catch (err) {
      console.error("Create staff error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ------------------------------- CURRENT USER ------------------------------- */
router.get("/me", protect, async (req, res) => {
  try {
    let user;

    if (req.user.role === "student") {
      user = await prisma.student.findUnique({
        where: { id: req.user.id },
      });
    } else {
      user = await prisma.admin.findUnique({
        where: { id: req.user.id },
      });
    }

    if (!user)
      return res.status(404).json({
        success: false,
        message: "User not found",
      });

    res.json({
      success: true,
      data: { user },
    });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ------------------------------- LOGOUT ------------------------------- */
router.post("/logout", protect, (req, res) => {
  res.json({
    success: true,
    message: "Logged out",
  });
});

/* ------------------------------- CHANGE PASSWORD ------------------------------- */
router.put("/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
      return res.status(400).json({
        success: false,
        message: "Provide current & new password",
      });

    let user;
    if (req.user.role === "student") {
      user = await prisma.student.findUnique({
        where: { id: req.user.id },
      });
    } else {
      user = await prisma.admin.findUnique({
        where: { id: req.user.id },
      });
    }

    if (!user)
      return res.status(404).json({
        success: false,
        message: "User not found",
      });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({
        success: false,
        message: "Incorrect current password",
      });

    const hashed = await bcrypt.hash(newPassword, 12);

    await prisma[user.role].update({
      where: { id: user.id },
      data: { password: hashed },
    });

    res.json({
      success: true,
      message: "Password changed",
    });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ------------------------------- REQUEST PASSWORD RESET ------------------------------- */
router.post("/reset-password/request", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });

    const user = await prisma.student.findUnique({ where: { email } });

    if (!user)
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });

    // Generate OTP
    const otp = (Math.floor(1000 + Math.random() * 9000)).toString();

    await prisma.student.update({
      where: { email },
      data: {
        otp,
        otpExpires: new Date(Date.now() + 10 * 60000), // 10 min expiry
      },
    });

    /* SEND OTP EMAIL */
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP",
      html: `<h2>Your password reset OTP is <b>${otp}</b></h2>`,
    });

    res.json({
      success: true,
      message: "OTP sent to email",
    });
  } catch (err) {
    console.error("Reset-password request error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ------------------------------- RESET PASSWORD CONFIRM ------------------------------- */
router.post("/reset-password/confirm", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword)
      return res.status(400).json({
        success: false,
        message: "Email and new password required",
      });

    const user = await prisma.student.findUnique({ where: { email } });

    if (!user)
      return res.status(404).json({
        success: false,
        message: "User not found",
      });

    // Ensure OTP was validated (i.e. otp is null)
    if (user.otp !== null)
      return res.status(400).json({
        success: false,
        message: "OTP not verified",
      });

    const hashed = await bcrypt.hash(newPassword, 12);

    await prisma.student.update({
      where: { email },
      data: { password: hashed },
    });

    res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (err) {
    console.error("Reset-password confirm error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});



export default router;
