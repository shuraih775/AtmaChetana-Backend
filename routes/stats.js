import express from "express";
import prisma from "../utils/prisma.js";
import { protect } from "../middleware/auth.js";
import { sanitizeBigInt } from "../utils/helpers.js";

const router = express.Router();



router.get("/dashboard", protect, async (req, res) => {
  try {
   if (req.user.role === "student") {
      const studentId = req.user.id;
      const now = new Date();

      const totalAppointments = await prisma.appointment.count({
        where: { studentId },
      });

      const completedAppointments = await prisma.appointment.count({
        where: { studentId, status: "Completed" },
      });

      const upcomingAppointments = await prisma.appointment.count({
        where: {
          studentId,
          status: "Confirmed",
          requestedDate: { gte: now },
        },
      });

      const pendingAppointments = await prisma.appointment.count({
        where: { studentId, status: "Pending" },
      });

      const lastAppointment = await prisma.appointment.findFirst({
        where: { studentId, status: "Completed" },
        orderBy: { confirmedDate: "desc" },
        include: { counsellor: true },
      });

      const nextAppointment = await prisma.appointment.findFirst({
        where: {
          studentId,
          status: "Confirmed",
          requestedDate: { gte: now },
        },
        orderBy: { requestedDate: "asc" },
        include: { counsellor: true },
      });

      return res.json(sanitizeBigInt(
        {
        success: true,
        data: {
          overview: {
            totalAppointments,
            completedAppointments,
            upcomingAppointments,
            pendingAppointments,
            lastAppointment,
            nextAppointment,
          },
        },
      }
      ));
    }

    
    const totalStudents = await prisma.student.count({
      where: { isActive: true },
    });

    const activeStudents = await prisma.student.count({
      where: { status: "Active" },
    });

    const totalAppointments = await prisma.appointment.count();
    const pendingAppointments = await prisma.appointment.count({
      where: { status: "Pending" },
    });
    const confirmedAppointments = await prisma.appointment.count({
      where: { status: "Confirmed" },
    });
    const completedAppointments = await prisma.appointment.count({
      where: { status: "Completed" },
    });

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todaysAppointments = await prisma.appointment.count({
      where: {
        requestedDate: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
          lt: new Date(tomorrow.setHours(0, 0, 0, 0)),
        },
      },
    });

    const highPriorityStudents = await prisma.student.count({
      where: { riskLevel: "High" },
    });

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentAppointments = await prisma.appointment.count({
      where: {
        createdAt: { gte: weekAgo },
      },
    });

    const appointmentTypes = await prisma.appointment.groupBy({
      by: ["type"],
      _count: { type: true },
    });

    const monthlyTrend = await prisma.$queryRaw`
      SELECT 
        YEAR(createdAt) AS year,
        MONTH(createdAt) AS month,
        COUNT(*) AS count
      FROM Appointment
      WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY year, month
      ORDER BY year, month;
    `;

    return res.json(sanitizeBigInt({
      success: true,
      data: {
        overview: {
          totalStudents,
          activeStudents,
          totalAppointments,
          pendingAppointments,
          confirmedAppointments,
          completedAppointments,
          todaysAppointments,
          highPriorityStudents,
          recentAppointments,
        },
        appointmentTypes,
        monthlyTrend,
      },
    }));
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


router.get("/students", protect, async (req, res) => {
  try {
    const statusStats = await prisma.student.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    // Risk level (priority) distribution
    const priorityStats = await prisma.student.groupBy({
      by: ["riskLevel"],
      _count: { riskLevel: true },
    });

    // Registration trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRegistrations = await prisma.student.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    });

    const total = await prisma.student.count();

    res.json({
      success: true,
      data: {
        statusStats,
        priorityStats,
        recentRegistrations,
        total,
      },
    });
  } catch (err) {
    console.error("Student stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


router.get("/appointments", protect, async (req, res) => {
  try {
    const statusStats = await prisma.appointment.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    const typeStats = await prisma.appointment.groupBy({
      by: ["type"],
      _count: { type: true },
    });

    const priorityStats = await prisma.appointment.groupBy({
      by: ["priority"],
      _count: { priority: true },
    });

    const totalAppointments = await prisma.appointment.count();
    const completedAppointments = await prisma.appointment.count({
      where: { status: "Completed" },
    });

    const completionRate =
      totalAppointments === 0
        ? 0
        : Number(((completedAppointments / totalAppointments) * 100).toFixed(2));

    // ---------------- Weekly Stats for Current Month (SQL RAW) ----------------

    const weeklyStats = await prisma.$queryRaw`
      SELECT 
        WEEK(requestedDate, 1) AS week,
        COUNT(*) AS count
      FROM Appointment
      WHERE MONTH(requestedDate) = MONTH(CURDATE())
        AND YEAR(requestedDate) = YEAR(CURDATE())
      GROUP BY week
      ORDER BY week;
    `;

    res.json({
      success: true,
      data: {
        statusStats,
        typeStats,
        priorityStats,
        weeklyStats,
        completionRate,
        total: totalAppointments,
      },
    });
  } catch (err) {
    console.error("Appointment stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


router.get("/calendar", protect, async (req, res) => {
  try {
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    const now = new Date();
    const targetMonth = month || now.getMonth() + 1;
    const targetYear = year || now.getFullYear();

    const dailyAppointments = await prisma.$queryRaw`
      SELECT 
        DAY(requestedDate) AS day,
        COUNT(*) AS count,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            "id", id,
            "time", requestedTime,
            "status", status,
            "type", type,
            "studentId", studentId
          )
        ) AS appointments
      FROM Appointment
      WHERE MONTH(requestedDate) = ${targetMonth}
        AND YEAR(requestedDate) = ${targetYear}
      GROUP BY day
      ORDER BY day;
    `;

    res.json({
      success: true,
      data: {
        month: targetMonth,
        year: targetYear,
        dailyAppointments,
      },
    });
  } catch (err) {
    console.error("Calendar stats error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
