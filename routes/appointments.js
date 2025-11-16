import express from "express";
import prisma from "../utils/prisma.js";
import { protect, authorize } from "../middleware/auth.js";
import { preprocessDate } from "../utils/helpers.js";

const router = express.Router();

/**
 * @desc Get all appointments (admin/counsellor) or student's own appointments
 * @route GET /api/appointments
 * @access Private
 */
router.get("/", protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "",
      type = "",
      priority = "",
      date = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

    if (req.user.role === "student") {
      where.studentId = req.user.id;
    }

    if (status) where.status = status;
    if (type) where.type = type;
    if (priority) where.priority = priority;

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);

      where.requestedDate = {
        gte: start,
        lt: end,
      };
    }

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip,
      take: parseInt(limit),
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            usn: true,
          },
        },
        counsellor: {
          select: { name: true, email: true },
        },
      },
    });

    const total = await prisma.appointment.count({ where });

    res.json({
      success: true,
      data: {
        appointments,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit),
        },
      },
    });
  } catch (err) {
    console.error("Get appointments error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching appointments",
    });
  }
});

/**
 * @desc Get single appointment
 * @route GET /api/appointments/:id
 * @access Private
 */
router.get("/:id", protect, async (req, res) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        student: true,
        counsellor: true,
        actionItems: true,
        recurringPattern: true,
      },
    });

    if (!appointment)
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });

    res.json({ success: true, data: { appointment } });
  } catch (err) {
    console.error("Get appointment error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching appointment",
    });
  }
});

/**
 * @desc Create new appointment
 * @route POST /api/appointments
 * @access Private
 */
router.post("/", protect, async (req, res) => {
  try {
    

    let {
      appointmentDetails,
      reason
    } = req.body;

    let {
      studentId,
      counsellorId,
      requestedDate,
      requestedTime,
      type,
      mode,
      priority,
      status,
      studentConcerns,
    } = appointmentDetails;

    if (req.user.role === "student") {
      studentId = req.user.id;
    }

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required",
      });
    }

    const { date: formattedDate, error } = preprocessDate(requestedDate);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error,
      });
    }
    

    const data = {
      student: { connect: { id: Number(studentId) } },
      requestedDate: formattedDate,
      reason,
      status: status || "Pending",
    };

    if (counsellorId)
      data.counsellor = { connect: { id: Number(counsellorId) } };

    if (requestedTime) data.requestedTime = requestedTime;
    if (type) data.type = type;
    if (mode) data.mode = mode;
    if (priority) data.priority = priority;
    if (studentConcerns) data.studentConcerns = studentConcerns;

    const appointment = await prisma.appointment.create({
      data,
      include: { student: true },
    });

    res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      data: { appointment },
    });
  } catch (err) {
    console.error("Create appointment error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while creating appointment",
    });
  }
});


/**
 * @desc Update appointment
 * @route PUT /api/appointments/:id
 * @access Private
 */
router.patch("/:id", protect, async (req, res) => {
  try {
    const appointmentId = Number(req.params.id);
    
    
    const userRole = req.user.role; 
    const userId = req.user.id;

    // 1. Define Allowed Fields
    const studentAllowedFields = [
      "requestedDate", "requestedTime", "reason", "studentConcerns", 
      "type", "mode", "priority"
    ];

    const adminAllowedFields = [
      "counsellorId", "confirmedDate", "confirmedTime", "status", 
      "preSessionNotes", "sessionSummary", "recommendations", 
      "nextSteps", "followUpRequired", "followUpDate", "urgencyLevel","mode","priority"
    ];

    let allowedFields = [];

    if (userRole === 'student') {
        const existingAppointment = await prisma.appointment.findUnique({
            where: { id: appointmentId }
        });

        if (!existingAppointment) {
             return res.status(404).json({ success: false, message: "Appointment not found" });
        }

        if (existingAppointment.studentId !== userId) {
            return res.status(403).json({ success: false, message: "Not authorized to edit this appointment" });
        }
        
        allowedFields = studentAllowedFields;

    } else if (['admin', 'counsellor'].includes(userRole)) { 
        allowedFields = adminAllowedFields;
    } else {
        return res.status(403).json({ success: false, message: "Unauthorized role" });
    }

    const updateData = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    if (updateData.requestedDate) {
      const { formattedDate, error } = preprocessDate(updateData.requestedDate);
      if (error) {
        return res.status(400).json({ success: false, message: error });
      }
      updateData.requestedDate = formattedDate;
    }

    // 5. Logic: Reset status if student reschedules
    if (userRole === 'student' && (updateData.requestedDate || updateData.requestedTime)) {
        updateData.status = "Pending"; 
        updateData.confirmedDate = null; 
        updateData.confirmedTime = null;
    }

    if (Object.keys(updateData).length === 0) {
         return res.status(400).json({ success: false, message: "No valid fields provided for update" });
    }

    // 6. Perform the Update
    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        ...updateData,
      },
      include: {
        student: true, 
        counsellor: true 
      },
    });

    res.json({
      success: true,
      message: "Appointment updated successfully",
      data: { appointment },
    });

  } catch (err) {
    console.error("Update appointment error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while updating appointment",
    });
  }
});

/**
 * @desc Delete appointment
 * @route DELETE /api/appointments/:id
 * @access Private
 */
router.delete("/:id", protect, async (req, res) => {
  try {
    await prisma.appointment.delete({
      where: { id: Number(req.params.id) },
    });

    res.json({
      success: true,
      message: "Appointment deleted successfully",
    });
  } catch (err) {
    console.error("Delete appointment error:", err);

    res.status(500).json({
      success: false,
      message: "Server error while deleting appointment",
    });
  }
});

/**
 * @desc Get pending appointments
 * @route GET /api/appointments/status/pending
 * @access Private
 */
router.get("/status/pending", protect, async (req, res) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { status: "Pending" },
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          select: { firstName: true, lastName: true, email: true, usn: true },
        },
      },
    });

    res.json({ success: true, data: { appointments } });
  } catch (err) {
    console.error("Pending appointments error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching pending appointments",
    });
  }
});

/**
 * @desc Confirm appointment
 * @route PATCH /api/appointments/:id/confirm
 * @access Private
 */
router.patch("/:id/confirm", protect, async (req, res) => {
  try {
    const { confirmedDate, confirmedTime } = req.body;

    const appointment = await prisma.appointment.update({
      where: { id: Number(req.params.id) },
      data: {
        status: "Confirmed",
        confirmedDate: confirmedDate ? new Date(confirmedDate) : undefined,
        confirmedTime,
      },
      include: {
        student: true,
      },
    });

    res.json({
      success: true,
      message: "Appointment confirmed successfully",
      data: { appointment },
    });
  } catch (err) {
    console.error("Confirm appointment error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while confirming appointment",
    });
  }
});

/**
 * @desc Complete appointment
 * @route PATCH /api/appointments/:id/complete
 * @access Private
 */
router.patch("/:id/complete", protect, async (req, res) => {
  try {
    const { sessionSummary, actionItems, recommendations, followUpDate } =
      req.body;

    const appointment = await prisma.appointment.update({
      where: { id: Number(req.params.id) },
      data: {
        status: "Completed",
        sessionSummary,
        recommendations,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
      },
      include: { student: true },
    });

    // Insert action items if present
    if (actionItems?.length) {
      await prisma.actionItem.createMany({
        data: actionItems.map((item) => ({
          appointmentId: appointment.id,
          value: item,
        })),
      });
    }

    res.json({
      success: true,
      message: "Appointment completed successfully",
      data: { appointment },
    });
  } catch (err) {
    console.error("Complete appointment error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while completing appointment",
    });
  }
});

/**
 * @desc Update appointment status
 * @route PATCH /api/appointments/:id/status
 * @access Private
 */
router.patch(
  "/:id/status",
  protect,
  authorize("admin", "counsellor"),
  async (req, res) => {
    try {
      const { status } = req.body;

      const valid = ["Pending", "Confirmed", "Completed", "Cancelled"];
      if (!valid.includes(status))
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });

      const appointment = await prisma.appointment.update({
        where: { id: Number(req.params.id) },
        data: {
          status,
          updatedAt: new Date(),
        },
        include: {
          student: true,
          counsellor: true,
        },
      });

      res.json({
        success: true,
        message: `Appointment marked as ${status}`,
        data: { appointment },
      });
    } catch (err) {
      console.error("Status update error:", err);
      res.status(500).json({
        success: false,
        message: "Server error updating appointment status",
      });
    }
  }
);

export default router;
