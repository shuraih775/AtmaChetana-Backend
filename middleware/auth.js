import jwt from "jsonwebtoken";
import prisma from "../utils/prisma.js";


const protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized to access this route",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    let user = null;

    if (decoded.role === "student") {
      user = await prisma.student.findUnique({
        where: { id: decoded.id },
      });
    } else {
      user = await prisma.admin.findUnique({
        where: { id: decoded.id },
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No user found with this token",
      });
    }

    delete user.password;
    delete user.otp;
    delete user.otpExpires;

    req.user = user;
    req.admin = user; 

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    res.status(500).json({
      success: false,
      message: "Server error in authentication",
    });
  }
};


const authorize = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user.role;

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "User role is not authorized to access this route",
      });
    }

    next();
  };
};

export { protect, authorize };
