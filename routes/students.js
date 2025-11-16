import express from "express";
import prisma from "../utils/prisma.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();



router.get("/me", protect, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is only accessible to students",
      });
    }

    const student = await prisma.student.findUnique({
      where: { id: req.user.id },
      include: {
        counselingNotes: {
          include: {
            counsellor: { select: { name: true } },
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    res.json({ success: true, data: { student } });
  } catch (err) {
    console.error("Get student profile error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



router.put("/me", protect, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "This endpoint is only accessible to students",
      });
    }

    const body = req.body;

    const flatData = {
      firstName: body.personalInfo?.firstName,
      lastName: body.personalInfo?.lastName,
      // email: body.personalInfo?.email,
      phone: body.personalInfo?.phone,
      dateOfBirth: body.personalInfo?.dateOfBirth
        ? new Date(body.personalInfo.dateOfBirth)
        : undefined,
      gender: body.personalInfo?.gender,
      street: body.personalInfo?.address?.street,
      city: body.personalInfo?.address?.city,
      state: body.personalInfo?.address?.state,
      pincode: body.personalInfo?.address?.pincode,

      currentClass: body.academicInfo?.currentClass,
      school: body.academicInfo?.school,
      board: body.academicInfo?.board,
      careerGoals: body.academicInfo?.careerGoals,

      parentName: body.counselingInfo?.parentGuardianInfo?.name,
      parentRelationship: body.counselingInfo?.parentGuardianInfo?.relationship,
      parentPhone: body.counselingInfo?.parentGuardianInfo?.phone,
      parentEmail: body.counselingInfo?.parentGuardianInfo?.email,

      updatedAt: new Date(),
    };

    Object.keys(flatData).forEach(
      (k) => flatData[k] === undefined && delete flatData[k]
    );

    const student = await prisma.student.update({
      where: { id: req.user.id },
      data: flatData,
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: { student },
    });
  } catch (err) {
    console.error("Update student profile error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while updating profile",
    });
  }
});



router.get("/", protect, authorize("admin", "counsellor"), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
      status = "",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    let whereClause = {};
    if (status) whereClause.status = status;

    let students;
    let total;

    if (search) {
      students = await prisma.$queryRawUnsafe(`
        SELECT *
        FROM Student
        WHERE 
          (firstName LIKE '%${search}%' OR
           lastName LIKE '%${search}%' OR
           email LIKE '%${search}%' OR
           phone LIKE '%${search}%' OR
           usn LIKE '%${search}%')
        ${status ? `AND status = '${status}'` : ""}
        ORDER BY ${sortBy} ${sortOrder === "desc" ? "DESC" : "ASC"}
        LIMIT ${Number(limit)} OFFSET ${skip};
      `);

      const countResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) AS total
        FROM Student
        WHERE 
          (firstName LIKE '%${search}%' OR
           lastName LIKE '%${search}%' OR
           email LIKE '%${search}%' OR
           phone LIKE '%${search}%' OR
           usn LIKE '%${search}%')
        ${status ? `AND status = '${status}'` : ""};
      `);

      total = countResult[0].total;
    } else {
      total = await prisma.student.count({ where: whereClause });

      students = await prisma.student.findMany({
        where: whereClause,
        skip,
        take: Number(limit),
        orderBy: { [sortBy]: sortOrder },
      });
    }

    res.json({
      success: true,
      data: {
        students,
        pagination: {
          current: Number(page),
          pages: Math.ceil(total / limit),
          total,
          limit: Number(limit),
        },
      },
    });
  } catch (err) {
    console.error("Get students error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching students",
    });
  }
});



router.get("/:id", protect, async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.json({ success: true, data: { student } });
  } catch (err) {
    console.error("Get student error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



router.post("/", protect, async (req, res) => {
  try {
    const data = {
      ...req.body,
    };

    const student = await prisma.student.create({ data });

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: { student },
    });
  } catch (err) {
    console.error("Create student error:", err);

    if (err.code === "P2002") {
      return res.status(400).json({
        success: false,
        message: "Student with this email or USN already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while creating student",
    });
  }
});



router.put("/:id", protect, async (req, res) => {
  try {
    const student = await prisma.student.update({
      where: { id: Number(req.params.id) },
      data: { ...req.body, updatedAt: new Date() },
    });

    res.json({
      success: true,
      message: "Student updated successfully",
      data: { student },
    });
  } catch (err) {
    console.error("Update student error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while updating student",
    });
  }
});



router.delete("/:id", protect, async (req, res) => {
  try {
    await prisma.student.delete({
      where: { id: Number(req.params.id) },
    });

    res.json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (err) {
    console.error("Delete student error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while deleting student",
    });
  }
});



router.get("/stats/overview", protect, async (req, res) => {
  try {
    const total = await prisma.student.count();
    const active = await prisma.student.count({ where: { status: "Active" } });
    const inactive = await prisma.student.count({ where: { status: "Inactive" } });
    const graduated = await prisma.student.count({ where: { status: "Graduated" } });

    res.json({
      success: true,
      data: { total, active, inactive, graduated },
    });
  } catch (err) {
    console.error("Get student stats error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching statistics",
    });
  }
});

export default router;
