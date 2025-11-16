import express from "express";
import nodemailer from "nodemailer";
import prisma from "../utils/prisma.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });


router.post("/appointment-confirmation", protect, async (req, res) => {
  try {
    const { appointmentId, customMessage } = req.body;

    const appointment = await prisma.appointment.findUnique({
      where: { id: Number(appointmentId) },
      include: {
        student: true,
      },
    });

    if (!appointment)
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });

    const student = appointment.student;
    const studentName = `${student.firstName} ${student.lastName}`;

    const appointmentDate = new Date(
      appointment.confirmedDate || appointment.requestedDate
    ).toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const appointmentTime =
      appointment.confirmedTime || appointment.requestedTime;

    const emailSubject = `Appointment Confirmation - ${process.env.APP_NAME}`;

    const emailBody = `
      <div style="font-family: Arial; padding:20px;">
        <h2>Appointment Confirmation</h2>
        <p>Dear <b>${studentName}</b>,</p>
        <p>Your appointment is confirmed. Details:</p>

        <p><b>Date:</b> ${appointmentDate}</p>
        <p><b>Time:</b> ${appointmentTime}</p>
        <p><b>Type:</b> ${appointment.type}</p>

        ${customMessage ? `<p><b>Note:</b> ${customMessage}</p>` : ""}
      </div>
    `;

    const transporter = createTransporter();

    await transporter.sendMail({
      from: `${process.env.APP_NAME} <${process.env.EMAIL_FROM ||
        process.env.EMAIL_USER}>`,
      to: student.email,
      subject: emailSubject,
      html: emailBody,
    });

    await prisma.appointment.update({
      where: { id: Number(appointmentId) },
      data: {
        emailSent: true,
        emailSentAt: new Date(),
        emailSentBy: req.user.id,
      },
    });

    res.json({
      success: true,
      message: "Confirmation email sent",
      data: { sentTo: student.email, sentAt: new Date() },
    });
  } catch (err) {
    console.error("Send email error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send confirmation email",
    });
  }
});

router.post("/follow-up", protect, async (req, res) => {
  try {
    const { studentId, subject, message, appointmentId } = req.body;

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
    });

    if (!student)
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });

    const emailSubject = subject || `Follow-up - ${process.env.APP_NAME}`;
    const studentName = `${student.firstName} ${student.lastName}`;

    const emailBody = `
      <div style="font-family: Arial; padding:20px;">
        <h2>Follow-up Message</h2>
        <p>Dear <b>${studentName}</b>,</p>
        <div style="margin-top: 10px;">
          ${message
            .split("\n")
            .map(
              (para) =>
                `<p style="line-height:1.6; margin-bottom:10px;">${para}</p>`
            )
            .join("")}
        </div>
      </div>
    `;

    const transporter = createTransporter();

    await transporter.sendMail({
      from: `${process.env.APP_NAME} <${process.env.EMAIL_FROM ||
        process.env.EMAIL_USER}>`,
      to: student.email,
      subject: emailSubject,
      html: emailBody,
    });

    if (appointmentId) {
      await prisma.followUpEmail.create({
        data: {
          appointmentId: Number(appointmentId),
          studentId: student.id,
          subject: emailSubject,
          message,
          sentAt: new Date(),
          sentBy: req.user.id,
        },
      });
    }

    res.json({
      success: true,
      message: "Follow-up email sent",
      data: { sentTo: student.email, sentAt: new Date() },
    });
  } catch (err) {
    console.error("Follow-up email error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send follow-up email",
    });
  }
});

router.post("/test", protect, async (req, res) => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    res.json({
      success: true,
      message: "Email config works correctly",
    });
  } catch (err) {
    console.error("Email test error:", err);
    res.status(500).json({
      success: false,
      message: "Email config test failed",
    });
  }
});

export default router;
