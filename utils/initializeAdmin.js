import prisma from "../utils/prisma.js";
import bcrypt from "bcryptjs";


export const initializeAdmin = async () => {
  try {
    // Check if any admin exists
    const adminExists = await prisma.admin.findFirst();

    if (!adminExists) {
      console.log("🔧 No admin found. Creating default admin...");

      const password = process.env.ADMIN_PASSWORD || "admin123";
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create default admin
      const defaultAdmin = await prisma.admin.create({
        data: {
          name: process.env.ADMIN_NAME || "Counsellor Admin",
          email: process.env.ADMIN_EMAIL || "counsellor@atmachetna.com",
          password: hashedPassword,
          role: "admin",
          isActive: true,
          lastLogin: null,
          loginAttempts: 0,
          lockUntil: null,
        },
      });

      console.log("✅ Default admin created successfully");
      console.log(`📧 Email: ${defaultAdmin.email}`);
      console.log(`🔑 Password: ${password}`);
      console.log("⚠️  Please change the default password after first login");
    } else {
      console.log("✅ Admin user already exists");
    }
  } catch (error) {
    console.error("❌ Error initializing admin:", error);
  }
};
