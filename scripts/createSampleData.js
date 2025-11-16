import prisma from "../utils/prisma.js";
import bcrypt from "bcryptjs";

// Utility → Insert subjects array
async function insertSubjects(studentId, subjects) {
  if (!subjects) return;

  for (const sub of subjects) {
    await prisma.subject.create({
      data: {
        studentId,
        value: sub,
      },
    });
  }
}

// Utility → Insert interests
async function insertInterests(studentId, interests) {
  if (!interests) return;

  for (const i of interests) {
    await prisma.interest.create({
      data: {
        studentId,
        value: i,
      },
    });
  }
}

async function createSampleData() {
  try {
    console.log("🔧 Clearing old data...");

    await prisma.counselingNote.deleteMany();
    await prisma.actionItem.deleteMany();
    await prisma.recurringPattern.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.mark.deleteMany();
    await prisma.subject.deleteMany();
    await prisma.interest.deleteMany();
    await prisma.student.deleteMany();

    // But DO NOT delete admins
    const adminCount = await prisma.admin.count();

    if (adminCount === 0) {
      console.log("Creating default admin...");

      await prisma.admin.create({
        data: {
          name: "Admin User",
          email: "admin@atmachetna.com",
          password: await bcrypt.hash("admin123", 12),
          role: "admin",
          isActive: true,
        },
      });
    }

    const admin = await prisma.admin.findFirst();

    console.log("➡ Creating sample students...");

    const sampleStudents = [
      {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@student.com",
        phone: "9876543210",
        dateOfBirth: new Date("2005-05-15"),
        gender: "Male",
        street: "123 Main St",
        city: "Bangalore",
        state: "Karnataka",
        pincode: "560001",
        currentClass: "4th Year",
        school: "Computer Science and Engineering",
        board: "VTU",
        subjects: [
          "Data Structures",
          "Algorithms",
          "Database Systems",
          "Software Engineering",
        ],
        interests: ["Programming", "Web Development", "Problem Solving"],
        careerGoals: "Software Engineer",
        riskLevel: "Low",
        specialNeeds: "None",
        parent: {
          name: "Jane Doe",
          relationship: "Mother",
          phone: "9876543211",
          email: "jane.doe@parent.com",
        },
      },

      {
        firstName: "Alice",
        lastName: "Smith",
        email: "alice.smith@student.com",
        phone: "9876543212",
        dateOfBirth: new Date("2006-03-22"),
        gender: "Female",
        street: "456 Oak Ave",
        city: "Mysore",
        state: "Karnataka",
        pincode: "570001",
        currentClass: "3rd Year",
        school: "Bio Technology",
        board: "VTU",
        subjects: [
          "Biochemistry",
          "Molecular Biology",
          "Genetics",
          "Bioprocess Engineering",
        ],
        interests: ["Research", "Biotechnology", "Life Sciences"],
        careerGoals: "Biotechnology Researcher",
        riskLevel: "Medium",
        specialNeeds: "Study anxiety",
        parent: {
          name: "Robert Smith",
          relationship: "Father",
          phone: "9876543213",
          email: "robert.smith@parent.com",
        },
      },

      {
        firstName: "Michael",
        lastName: "Johnson",
        email: "michael.johnson@student.com",
        phone: "9876543214",
        dateOfBirth: new Date("2004-11-08"),
        gender: "Male",
        street: "789 Pine St",
        city: "Hubli",
        state: "Karnataka",
        pincode: "580020",
        currentClass: "2nd Year",
        school: "Artificial Intelligence and Machine Learning",
        board: "VTU",
        subjects: [
          "Machine Learning",
          "Python Programming",
          "Statistics",
          "Linear Algebra",
        ],
        interests: ["AI/ML", "Data Science", "Innovation"],
        careerGoals: "AI Engineer",
        riskLevel: "High",
        specialNeeds: "Social anxiety",
        parent: {
          name: "Sarah Johnson",
          relationship: "Mother",
          phone: "9876543215",
          email: "sarah.johnson@parent.com",
        },
      },
    ];

    const createdStudents = [];

    // Insert each student
    for (const s of sampleStudents) {
      const student = await prisma.student.create({
        data: {
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          phone: s.phone,
          gender: s.gender,
          dateOfBirth: s.dateOfBirth,
          street: s.street,
          city: s.city,
          state: s.state,
          pincode: s.pincode,

          currentClass: s.currentClass,
          school: s.school,
          board: s.board,
          careerGoals: s.careerGoals,

          riskLevel: s.riskLevel,
          specialNeeds: s.specialNeeds,

          parentName: s.parent.name,
          parentRelationship: s.parent.relationship,
          parentPhone: s.parent.phone,
          parentEmail: s.parent.email,

          password: await bcrypt.hash("student123", 12),
          role: "student",
        },
      });

      // Insert subjects and interests for each student
      await insertSubjects(student.id, s.subjects);
      await insertInterests(student.id, s.interests);

      createdStudents.push(student);
    }

    console.log(`✔ Created ${createdStudents.length} students`);

    console.log("➡ Creating sample appointments...");

    const appointmentsToCreate = [
      {
        student: createdStudents[0],
        type: "Academic Counseling",
        date: 1,
        status: "Confirmed",
        reason: "Need guidance on course selection for engineering",
        time: "10:00 AM",
        concerns: "Confused about engineering branch",
      },
      {
        student: createdStudents[1],
        type: "Stress Management",
        date: -3,
        status: "Completed",
        time: "2:00 PM",
        concerns: "Exam pressure",
        reason: "Study related stress",
        summary: "Discussed stress management",
        items: ["Breathing exercises", "Study schedule", "Breaks"],
        followUp: true,
      },
      {
        student: createdStudents[2],
        type: "Personal Counseling",
        date: 2,
        status: "Pending",
        time: "11:30 AM",
        reason: "Social anxiety",
        concerns: "Peer interaction issues",
      },
    ];

    for (const apt of appointmentsToCreate) {
      const date = new Date(Date.now() + apt.date * 86400000);

      const appointment = await prisma.appointment.create({
        data: {
          studentId: apt.student.id,
          counsellorId: admin.id,
          requestedDate: date,
          requestedTime: apt.time,
          confirmedDate: apt.status === "Confirmed" ? date : null,
          confirmedTime: apt.status === "Confirmed" ? apt.time : null,
          duration: 60,
          type: apt.type,
          mode: "In-Person",
          priority: "Medium",
          reason: apt.reason,
          status: apt.status,
          studentConcerns: apt.concerns,
        },
      });

      if (apt.status === "Completed") {
        await prisma.actionItem.createMany({
          data: apt.items.map((value) => ({
            appointmentId: appointment.id,
            value,
          })),
        });
      }
    }

    console.log("✔ Appointments created successfully!");

    console.log("\n🎉 Sample data created:");
    console.log("Admin: admin@atmachetna.com / admin123");
    console.log("Students:");
    createdStudents.forEach((s) =>
      console.log(`  ${s.email} / student123`)
    );
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await prisma.$disconnect();
    console.log("🔌 Database disconnected.");
    process.exit(0);
  }
}

createSampleData();
