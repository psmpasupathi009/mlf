/**
 * Regenerates client deliverables from one content source:
 *   docs/MLF-Complete-Site-User-Guide.pdf
 *   docs/MLF-Complete-Site-User-Guide.xlsx
 *   docs/MLF-Complete-Site-User-Guide.docx
 *
 * Run: node scripts/generate-client-guide.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(__dirname, "..", "docs");
const GENERATED = new Date().toLocaleDateString("en-IN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** Shared guide content — single source of truth for PDF / Excel / Word */
const guide = {
  title: "MLF Complete Site User Guide",
  brand: "Manitham Law Foundation",
  short: "MLF",
  tagline: "Advocate office portal — how to access and use every module",
  subtitle:
    "One complete document for office staff, advocates, accountants, and administrators.",
  officeNote:
    "Primary practice: Gobichettipalayam / Nambiyur region, Erode District, Tamil Nadu (also Karnataka matters as applicable).",

  sections: [
    {
      id: "1",
      title: "What this portal is",
      paragraphs: [
        "MLF (Manitham Law Foundation) is the firm’s internal office portal. Use it to manage clients, cases, hearings, appointments, cash payments, postal dak, work allotment, HR attendance/leave, reports, employees, and permissions — in one place.",
        "You open the site in a web browser (desktop recommended). You sign in with your Indian mobile number and a 6-digit PIN. What you see in the left menu depends on your role and permissions. Important actions are logged in Activity.",
      ],
      bullets: [
        "This guide is for using the live site (not a developer/setup manual).",
        "If a menu item is missing, you lack permission or the module is off — ask Admin.",
      ],
    },
    {
      id: "2",
      title: "How to access the site",
      subsections: [
        {
          title: "2.1 Open the portal",
          steps: [
            "Open the portal URL provided by your office.",
            "If you are not logged in, you are taken to the Login page.",
            "After a successful login you land on Home.",
          ],
        },
        {
          title: "2.2 First-time setup (new user / no PIN yet)",
          steps: [
            "Enter your 10-digit Indian mobile number (must start with 6–9).",
            "Continue — the system detects that you need PIN setup.",
            "Request OTP. An SMS OTP is sent to your mobile.",
            "Enter the OTP and verify.",
            "Create a 6-digit PIN and confirm it. Avoid weak PINs (000000, 123456, repeated digits).",
            "You are signed in and redirected to Home.",
          ],
        },
        {
          title: "2.3 Returning user (daily login)",
          steps: [
            "Enter your 10-digit mobile number.",
            "Enter your 6-digit PIN.",
            "Submit — a secure session is set and you go to Home.",
          ],
        },
        {
          title: "2.4 Forgot PIN",
          steps: [
            "On the PIN screen, choose Forgot PIN.",
            "Request OTP → enter OTP from SMS → verify.",
            "Set a new 6-digit PIN (confirm it).",
            "You are signed in with the new PIN.",
          ],
        },
        {
          title: "2.5 PIN lockout, logout, session expiry",
          paragraphs: [
            "Too many wrong PIN attempts locks the PIN temporarily. Wait for the countdown, or use Forgot PIN.",
            "Logout: open the user menu in the header → Logout. Cookies are cleared; you return to Login.",
            "If your session expires while working, the app clears cookies and sends you back to Login. Sign in again with mobile + PIN.",
          ],
        },
      ],
    },
    {
      id: "3",
      title: "Roles & what each person can do",
      paragraphs: [
        "Access is role-based. Admin has full control. Other roles get a default permission set (Admin can adjust on the Permissions page).",
      ],
      table: {
        headers: ["Role", "Meant for", "Typical access"],
        rows: [
          ["Admin", "Firm owner / full control", "Everything — cannot be restricted"],
          [
            "Sub admin",
            "Office / HR manager",
            "Ops: clients, cases, HRMS approve, employees, reports",
          ],
          [
            "Staff",
            "Clerks, PA, reception",
            "Clients, cases, appointments, dak, tasks",
          ],
          [
            "Advocate",
            "Counsel / advocates",
            "Clients, cases, appointments, dak, tasks",
          ],
          [
            "Accountant",
            "Accounts team",
            "Accounts cash book, view clients/cases, reports",
          ],
        ],
      },
      bullets: [
        "Everyone gets: Home view, HRMS view + own attendance + own leave, Notifications, Profile.",
        "Permission actions: View, Create, Edit, Upload/import, Deactivate, Cancel, Own attendance, Own leave, Team attendance, Approve leave.",
      ],
    },
    {
      id: "4",
      title: "Screen layout & navigation",
      paragraphs: [
        "Left sidebar — modules grouped as Workspace, Matters, Schedule, Office, Admin.",
        "Header — global search (⌘K / Ctrl+K), notification bell, user menu.",
        "Main content — lists, filters, forms, and detail panels for the selected module.",
      ],
      table: {
        headers: ["Group", "Menu label", "Opens"],
        rows: [
          ["Workspace", "Home", "Dashboard summary"],
          ["Matters", "Clients", "Client registry"],
          ["Matters", "Cases", "Case pipeline & hearings"],
          ["Matters", "Day board", "Day view: hearings + appointments + tasks"],
          ["Schedule", "Appointments", "Consultations / bookings"],
          ["Schedule", "Availability", "Advocate hours & blocks"],
          ["Office", "Accounts", "Cash payments / fees"],
          ["Office", "HRMS", "Attendance, leave, holidays"],
          ["Office", "Postal", "In/out dak register"],
          ["Office", "Work allotment", "Office tasks"],
          ["Office", "Reports", "Excel exports"],
          ["Admin", "Employees", "Staff & advocate users"],
          ["Admin", "Activity", "Audit log"],
          ["Admin", "Permissions", "Role permission matrix"],
        ],
      },
      bullets: [
        "Notifications — header bell → full inbox (not always in main nav).",
        "Profile — user menu → your details / photo; office address PDF may be linked here.",
        "Documents — inside Case / Client screens (no separate Documents menu).",
      ],
    },
    {
      id: "5",
      title: "Home dashboard & global search",
      steps: [
        "After login, open Home (or click Home in the sidebar).",
        "Review summary cards / today’s focus (hearings, appointments, tasks as permitted).",
        "Press ⌘K (Mac) or Ctrl+K (Windows) for global search.",
        "Type a client name, case id, mobile fragment, etc., then select a result to jump there.",
      ],
    },
    {
      id: "6",
      title: "Clients",
      paragraphs: [
        "Clients is the party registry. Most cases and payments link to a client (IDs like CLI-00001).",
        "Required intake: name + mobile. Recommended: father/spouse, address, city, district, state, matter brief. SMS consent may be collected for hearing reminders.",
      ],
      steps: [
        "Open Clients from Matters → search / open a row.",
        "Create: enter name, 10-digit mobile, other fields → Save (needs clients.create). A CLI-… id is generated.",
        "Edit existing clients as needed (clients.edit).",
        "Bulk import via CSV — see Section 15 (recommended first when migrating data).",
      ],
    },
    {
      id: "7",
      title: "Cases, hearings & documents",
      paragraphs: [
        "Cases track matters from enquiry through disposal. Each case links to a client and may have advocates, hearings, documents, and fee payments. Case IDs look like CSE-00001.",
      ],
      table: {
        headers: ["Status", "Meaning"],
        rows: [
          ["Enquiry", "Consultation / early enquiry"],
          ["Engaged", "Client engaged the firm"],
          ["Pre-filing", "Draft / preparation before filing"],
          ["Under filing", "Being filed"],
          ["Filing defect", "Returned with defect"],
          ["Active", "Numbered / active matter"],
          ["Reserved", "Judgment reserved"],
          ["Disposed", "Disposed"],
          ["Withdrawn", "Withdrawn"],
          ["Transferred", "Transferred"],
          ["Archived", "Archived"],
        ],
      },
      subsections: [
        {
          title: "7.1 Create & manage a case",
          steps: [
            "Open Cases → Create (cases.create).",
            "Select the client (must exist first).",
            "Fill opposing party, court, status, advocates (optional), and other matter fields → Save.",
            "Open case detail to review client, pipeline, hearings, documents, and fee snippet.",
            "Update status when the matter moves (cases.edit). Invalid jumps are blocked.",
            "Complete filing checklist items if shown.",
          ],
        },
        {
          title: "7.2 Hearings",
          steps: [
            "On case detail, add a hearing (date/time, notes as required).",
            "Saving updates the case next-hearing date; notifications may be sent.",
            "Adjourn creates a replacement hearing.",
            "Bulk hearings can be imported via CSV (Section 15).",
            "A scheduled job can SMS clients about tomorrow’s hearings; Day board may also offer notify tools.",
          ],
        },
        {
          title: "7.3 Documents",
          steps: [
            "Open the Documents panel on the case (or client) screen.",
            "Upload allowed files: PDF, JPEG, PNG, WebP — max 10 MB each.",
            "Download later from the same panel (permission follows case/accounts rules by document type).",
          ],
        },
      ],
    },
    {
      id: "8",
      title: "Day board (diary)",
      paragraphs: [
        "Day board shows one IST calendar day: hearings + appointments + tasks together. You can open it if you have view access to Cases, Appointments, or Tasks.",
      ],
      steps: [
        "Open Day board from Matters.",
        "Pick the date (defaults to today).",
        "Review sections: court hearings, appointments, allotted work.",
        "Click an item to open its full record.",
        "Use notify / hearing SMS actions if available and permitted.",
      ],
    },
    {
      id: "9",
      title: "Appointments & advocate availability",
      subsections: [
        {
          title: "9.1 Appointments",
          steps: [
            "Open Appointments under Schedule.",
            "Create: client/contact, advocate, date-time, purpose (IDs like APT-00001).",
            "Edit or cancel as needed (cancel needs appointments.cancel).",
            "Convert to enquiry case when the consultation becomes a matter.",
          ],
        },
        {
          title: "9.2 Availability",
          steps: [
            "Open Availability under Schedule.",
            "Set advocate weekly hours.",
            "Add time blocks (leave, court, unavailable windows).",
            "Booking screens use these rules so slots respect hours and blocks.",
          ],
        },
      ],
    },
    {
      id: "10",
      title: "Accounts (cash / payments)",
      paragraphs: [
        "Accounts is the cash ledger for client/case fees and related payments (IDs like PAY-00001). Accountants typically work here daily.",
        "Payment purposes include: Advance, Stage/partial, Full/final, Consultation, Court fee, Stamp, Copying, Travel, Clerkage, Other. Fee rollup uses fee-type purposes (advance/partial/full/consultation).",
      ],
      steps: [
        "Open Accounts under Office → filter by client, case, date, or purpose.",
        "Record a payment: link client (and case if known), amount, purpose, mode/notes → Save.",
        "To reverse a wrong entry, use Void (keeps the audit trail).",
        "Case detail may show fee rollup filtered for that case.",
        "CSV import uses payments.sample.csv (needs accounts.upload).",
      ],
    },
    {
      id: "11",
      title: "HRMS (attendance & leave)",
      steps: [
        "Open HRMS → Check in at start of work; check out at end (own attendance).",
        "Submit leave with dates and reason (own leave).",
        "Managers approve/reject leave (approve leave) and may manage team attendance.",
        "Maintain office holidays under Holidays when permitted.",
      ],
    },
    {
      id: "12",
      title: "Postal register (DAK)",
      paragraphs: [
        "Postal / DAK tracks inward and outward office dak — letters, parcels, courier (IDs like DAK-00001).",
      ],
      steps: [
        "Open Postal under Office.",
        "Create an entry: in/out, reference, parties, date, remarks.",
        "Edit when status or details change.",
        "Import historical dak via CSV if migrating (Section 15).",
      ],
    },
    {
      id: "13",
      title: "Work allotment (tasks)",
      paragraphs: [
        "Office tasks assign work to staff/advocates, often linked to a case (IDs like TSK-00001).",
      ],
      steps: [
        "Open Work allotment under Office.",
        "Create a task: title, assignee, due date, linked case (optional).",
        "Update status as work progresses (assignees may get notifications).",
        "Due items also appear on Day board for the selected day.",
      ],
    },
    {
      id: "14",
      title: "Reports & Excel exports",
      paragraphs: [
        "Open Reports (needs reports.view). Each export also needs view permission on that domain.",
      ],
      table: {
        headers: ["Export", "Also needs"],
        rows: [
          ["Cases register", "cases.view"],
          ["Clients register", "clients.view"],
          ["Employees register", "employees.view"],
          ["Tasks", "tasks.view"],
          ["Postal / Dak", "dak.view"],
          ["Accounts / payments", "accounts.view"],
          ["Appointments", "appointments.view"],
          ["Fees outstanding", "accounts.view (+ related)"],
          ["Attendance", "hrms / attendance rights as shown"],
        ],
      },
      bullets: [
        "Some list pages (e.g. Cases) also offer filtered Export on that page.",
        "Day board / diary may offer printable day views where enabled.",
      ],
    },
    {
      id: "15",
      title: "CSV bulk import",
      paragraphs: [
        "Most list screens offer Import. Always dry-run first, then confirm. Sample CSVs download from the Import dialog. Max about 500 rows per import.",
      ],
      steps: [
        "Open the module → Import.",
        "Download the sample CSV for that module.",
        "Fill rows; save as UTF-8 CSV with the header row.",
        "Upload → Dry run. Fix any row errors shown.",
        "Confirm import (writes data + audit).",
      ],
      table: {
        headers: ["Order", "Module", "Sample / permission"],
        rows: [
          ["1", "Clients", "clients.sample.csv · clients.create (+edit upsert)"],
          ["2", "Cases", "cases.sample.csv · cases.upload (+edit upsert)"],
          ["3+", "Hearings", "hearings.sample.csv · cases.edit"],
          ["3+", "Payments", "payments.sample.csv · accounts.upload"],
          ["3+", "Dak / Tasks / Appointments", "matching *.sample.csv · create perms"],
          ["Any", "Employees", "employees.sample.csv · employees.create"],
        ],
      },
      bullets: [
        "Dates: YYYY-MM-DD (IST). Appointment scheduledAt may be full ISO datetime.",
        "Mobile: 10 digits (system normalizes to 91…).",
        "Link related rows with *UnitId columns only (CLI-…, CSE-…, etc.).",
        "Empty unitId on clients/cases/employees → auto-generated.",
        "Unknown extra columns are ignored (shown in dry-run).",
      ],
    },
    {
      id: "16",
      title: "Employees & user accounts",
      steps: [
        "Admin/Sub-admin opens Employees.",
        "Create employee: name, mobile, role(s), designation (IDs like EMP-00001).",
        "The person signs in with that mobile and sets/uses a PIN (OTP on first login).",
        "Edit details; upload photo if supported.",
        "Deactivate when someone leaves; reactivate if they return.",
        "Force reset PIN when a user is locked out and cannot use OTP themselves.",
      ],
      bullets: [
        "Only Admin can assign the Admin role. Sub-admin manages other employees within policy.",
      ],
    },
    {
      id: "17",
      title: "Permissions administration",
      steps: [
        "Admin opens Permissions.",
        "Review the matrix: each role × each module.action.",
        "Turn allowed on/off for Sub-admin, Staff, Advocate, Accountant as policy requires.",
        "Save. Users get the union of permissions from all their roles.",
      ],
      bullets: ["Admin remains full access by design."],
    },
    {
      id: "18",
      title: "Notifications & profile",
      steps: [
        "Click the bell in the header for recent alerts; open the full Notifications page if needed.",
        "Mark items read as you handle them.",
        "Open user menu → Profile to update display details / photo.",
        "From Profile you may download the office address & mail PDF (signed-in).",
        "Logout from the same menu when finished.",
      ],
    },
    {
      id: "19",
      title: "Activity (audit log)",
      steps: [
        "Open Activity under Admin (activity.view).",
        "Filter/search creates, updates, voids, imports, and other audited actions.",
        "Use this for accountability and “who changed what”.",
      ],
    },
    {
      id: "20",
      title: "End-to-end office workflows",
      subsections: [
        {
          title: "20.1 New client → case → hearing → fee",
          steps: [
            "Create Client (or find existing).",
            "Create Case linked to that client; set status (often Enquiry or Engaged).",
            "Assign advocates; move status through pre-filing / filing / active.",
            "Add Hearings; watch Day board for the hearing day.",
            "Upload Documents on the case.",
            "Record fee Payments in Accounts against client/case.",
            "When finished, move status to Disposed / Withdrawn / Archived as appropriate.",
          ],
        },
        {
          title: "20.2 Consultation → appointment → case",
          steps: [
            "Set advocate Availability.",
            "Book Appointment.",
            "After meeting, Convert appointment to enquiry Case if engaged.",
            "Continue on the Cases workflow above.",
          ],
        },
        {
          title: "20.3 Daily office rhythm",
          steps: [
            "Login → check Home + Notifications.",
            "Open Day board for today.",
            "HRMS check-in.",
            "Work Cases / Clients / Accounts / Dak / Tasks as assigned.",
            "Export Reports if needed.",
            "HRMS check-out → Logout.",
          ],
        },
        {
          title: "20.4 Onboarding a new staff member",
          steps: [
            "Admin creates Employee with correct role.",
            "Adjust Permissions if the default role matrix is not enough.",
            "Staff opens site → OTP → set PIN → starts work.",
          ],
        },
      ],
    },
    {
      id: "21",
      title: "Quick reference checklist",
      table: {
        headers: ["I need to…", "Go to"],
        rows: [
          ["Register a party", "Clients"],
          ["Open / move a matter", "Cases"],
          ["See today’s court & meetings", "Day board"],
          ["Book a consultation", "Appointments"],
          ["Set advocate free slots", "Availability"],
          ["Record a fee / cash entry", "Accounts"],
          ["Check in / apply leave", "HRMS"],
          ["Log inward/outward post", "Postal"],
          ["Assign office work", "Work allotment"],
          ["Download Excel", "Reports"],
          ["Bulk upload CSV", "Module → Import (dry-run first)"],
          ["Add a staff login", "Employees"],
          ["Change who can do what", "Permissions"],
          ["See who changed data", "Activity"],
          ["Upload case papers", "Case detail → Documents"],
          ["Office address PDF", "Profile → office files link"],
        ],
      },
      bullets: [
        "Unit IDs: EMP employees · CLI clients · CSE cases · HRG hearings · APT appointments · PAY payments · DOC documents · DAK postal · TSK tasks · LVE leave · ATT attendance · NTF notifications · HOL holidays.",
        "Always use these unit IDs in CSV imports and when speaking with support.",
      ],
    },
  ],
};

// ─── PDF ─────────────────────────────────────────────────
async function writePdf() {
  const outPath = path.join(DOCS, "MLF-Complete-Site-User-Guide.pdf");
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    bufferPages: true,
    info: {
      Title: `${guide.brand} — ${guide.title}`,
      Author: guide.short,
      Subject: guide.tagline,
    },
  });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const PAGE_W = 595.28;
  const MARGIN = 56;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const PAGE_BOTTOM = 760;

  function ensureSpace(needed = 80) {
    if (doc.y + needed > PAGE_BOTTOM) doc.addPage();
  }
  function h1(text) {
    ensureSpace(60);
    doc.moveDown(0.35);
    doc.fontSize(16).fillColor("#0f2744").font("Helvetica-Bold").text(text, {
      width: CONTENT_W,
    });
    doc.moveDown(0.2);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + CONTENT_W, doc.y)
      .strokeColor("#c9a227")
      .lineWidth(1.5)
      .stroke();
    doc.moveDown(0.45);
    doc.fillColor("#111111").font("Helvetica");
  }
  function h2(text) {
    ensureSpace(44);
    doc.moveDown(0.25);
    doc.fontSize(12).fillColor("#1a3a5c").font("Helvetica-Bold").text(text, {
      width: CONTENT_W,
    });
    doc.moveDown(0.2);
    doc.fillColor("#111111").font("Helvetica").fontSize(10);
  }
  function p(text) {
    ensureSpace(32);
    doc.fontSize(10).font("Helvetica").fillColor("#222222").text(text, {
      width: CONTENT_W,
      lineGap: 2,
    });
    doc.moveDown(0.3);
  }
  function bullet(text) {
    ensureSpace(26);
    doc.fontSize(10).font("Helvetica").fillColor("#222222");
    doc.text("•  " + text, MARGIN + 8, doc.y, {
      width: CONTENT_W - 8,
      lineGap: 1.5,
    });
    doc.moveDown(0.12);
  }
  function step(n, text) {
    ensureSpace(26);
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#0f2744");
    doc.text(`Step ${n}: `, MARGIN, doc.y, { continued: true });
    doc.font("Helvetica").fillColor("#222222").text(text, {
      width: CONTENT_W,
      lineGap: 1.5,
    });
    doc.moveDown(0.15);
  }
  function table(headers, rows) {
    const colW = headers.map((_, i) =>
      i === 0 ? Math.min(140, CONTENT_W / headers.length) : 0
    );
    const rest = CONTENT_W - colW[0] * (headers.length > 1 ? 1 : 0);
    if (headers.length === 2) {
      colW[0] = Math.floor(CONTENT_W * 0.32);
      colW[1] = CONTENT_W - colW[0];
    } else if (headers.length === 3) {
      colW[0] = 90;
      colW[1] = 150;
      colW[2] = CONTENT_W - 240;
    }
    ensureSpace(36);
    const startX = MARGIN;
    const headerH = 17;
    const rowH = 15;
    doc.rect(startX, doc.y, CONTENT_W, headerH).fill("#0f2744");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
    let x = startX;
    const hy = doc.y + 4;
    headers.forEach((h, i) => {
      doc.text(h, x + 3, hy, { width: colW[i] - 6, ellipsis: true });
      x += colW[i];
    });
    doc.y += headerH;
    rows.forEach((row, ri) => {
      ensureSpace(rowH + 2);
      doc.rect(startX, doc.y, CONTENT_W, rowH).fill(ri % 2 ? "#ffffff" : "#f5f7fa");
      doc.fillColor("#222222").font("Helvetica").fontSize(8);
      x = startX;
      const ty = doc.y + 3;
      row.forEach((cell, i) => {
        doc.text(String(cell), x + 3, ty, {
          width: colW[i] - 6,
          ellipsis: true,
        });
        x += colW[i];
      });
      doc.y += rowH;
    });
    doc.moveDown(0.5);
    doc.fillColor("#111111").font("Helvetica");
  }

  function renderSection(sec) {
    h1(`${sec.id}. ${sec.title}`);
    (sec.paragraphs || []).forEach(p);
    (sec.steps || []).forEach((s, i) => step(i + 1, s));
    if (sec.table) table(sec.table.headers, sec.table.rows);
    (sec.bullets || []).forEach(bullet);
    for (const sub of sec.subsections || []) {
      h2(sub.title);
      (sub.paragraphs || []).forEach(p);
      (sub.steps || []).forEach((s, i) => step(i + 1, s));
      if (sub.table) table(sub.table.headers, sub.table.rows);
      (sub.bullets || []).forEach(bullet);
    }
  }

  // Cover
  doc.rect(0, 0, PAGE_W, 841.89).fill("#0f2744");
  doc.fillColor("#c9a227").font("Helvetica-Bold").fontSize(11);
  doc.text(guide.brand.toUpperCase(), MARGIN, 180, {
    width: CONTENT_W,
    align: "center",
  });
  doc.moveDown(1);
  doc.fillColor("#ffffff").fontSize(26).font("Helvetica-Bold");
  doc.text("Complete Site", { align: "center", width: CONTENT_W });
  doc.text("User Guide", { align: "center", width: CONTENT_W });
  doc.moveDown(1);
  doc.fillColor("#d4dce8").fontSize(11).font("Helvetica");
  doc.text(guide.tagline, { align: "center", width: CONTENT_W });
  doc.moveDown(0.6);
  doc.fillColor("#a8b4c4").fontSize(9);
  doc.text(guide.officeNote, { align: "center", width: CONTENT_W });
  doc.moveDown(1.5);
  doc.fillColor("#c9a227").fontSize(10);
  doc.text(guide.subtitle, { align: "center", width: CONTENT_W });
  doc.moveDown(0.8);
  doc.fillColor("#8899aa").fontSize(9);
  doc.text(`Updated: ${GENERATED}`, { align: "center", width: CONTENT_W });
  doc.fillColor("#667788").fontSize(8);
  doc.text("Confidential — for authorized MLF office users", MARGIN, 760, {
    width: CONTENT_W,
    align: "center",
  });

  doc.addPage();
  doc.fillColor("#111111");
  h1("Table of contents");
  guide.sections.forEach((s) => bullet(`${s.id}. ${s.title}`));
  guide.sections.forEach(renderSection);

  doc.moveDown(1);
  ensureSpace(60);
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f2744");
  doc.text("End of guide", { align: "center", width: CONTENT_W });
  doc.moveDown(0.3);
  doc.fontSize(9).font("Helvetica").fillColor("#555555");
  doc.text(
    "If a button or menu is missing, ask Admin to grant the matching permission or confirm the module is enabled.",
    { align: "center", width: CONTENT_W }
  );

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === range.start) continue;
    doc.fontSize(8).fillColor("#666666");
    doc.text(
      `${guide.short} Portal — Complete User Guide  ·  Page ${i - range.start}`,
      MARGIN,
      800,
      { width: CONTENT_W, align: "center", lineBreak: false }
    );
  }

  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  console.log("Wrote", outPath);
}

// ─── Excel ───────────────────────────────────────────────
async function writeExcel() {
  const outPath = path.join(DOCS, "MLF-Complete-Site-User-Guide.xlsx");
  const wb = new ExcelJS.Workbook();
  wb.creator = guide.short;
  wb.created = new Date();
  wb.title = guide.title;

  function styleHeader(row) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F2744" },
    };
    row.alignment = { vertical: "middle", wrapText: true };
  }
  function addSheet(name, headers, rows, widths) {
    const ws = wb.addWorksheet(name.slice(0, 31));
    ws.columns = headers.map((h, i) => ({
      header: h,
      key: `c${i}`,
      width: widths[i] || 22,
    }));
    styleHeader(ws.getRow(1));
    for (const r of rows) ws.addRow(Array.isArray(r) ? r : Object.values(r));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return ws;
  }

  addSheet(
    "01 Overview",
    ["Topic", "Details"],
    [
      ["Product", `${guide.brand} (${guide.short})`],
      ["Tagline", guide.tagline],
      ["Office", guide.officeNote],
      ["Access", "Browser → portal URL → Mobile + 6-digit PIN (OTP for setup / forgot PIN)"],
      ["Roles", "Admin, Sub admin, Staff, Advocate, Accountant"],
      ["Updated", GENERATED],
      ["Companions", "Also see .pdf and .docx in the same docs folder"],
    ],
    [18, 85]
  );

  addSheet(
    "02 Login steps",
    ["Scenario", "Step", "Action"],
    [
      ["First time", "1", "Open portal URL"],
      ["First time", "2", "Enter 10-digit Indian mobile (starts 6–9)"],
      ["First time", "3", "Request OTP from SMS"],
      ["First time", "4", "Verify OTP"],
      ["First time", "5", "Set & confirm 6-digit PIN (avoid weak PINs)"],
      ["First time", "6", "Land on Home"],
      ["Daily login", "1", "Enter mobile"],
      ["Daily login", "2", "Enter PIN"],
      ["Daily login", "3", "Go to Home"],
      ["Forgot PIN", "1", "Forgot PIN → OTP → verify"],
      ["Forgot PIN", "2", "Set new PIN → signed in"],
      ["Logout", "1", "User menu → Logout"],
      ["Session expired", "1", "Returned to Login → sign in again"],
    ],
    [16, 8, 58]
  );

  addSheet(
    "03 Menu map",
    ["Group", "Menu", "Opens", "Typical permission"],
    [
      ["Workspace", "Home", "Dashboard", "dashboard.view"],
      ["Matters", "Clients", "Client registry", "clients.view"],
      ["Matters", "Cases", "Case pipeline & hearings", "cases.view"],
      ["Matters", "Day board", "Hearings + appointments + tasks", "cases|appointments|tasks.view"],
      ["Schedule", "Appointments", "Consultations", "appointments.view"],
      ["Schedule", "Availability", "Advocate hours & blocks", "appointments.view"],
      ["Office", "Accounts", "Cash / fee ledger", "accounts.view"],
      ["Office", "HRMS", "Attendance & leave", "hrms.view"],
      ["Office", "Postal", "In/out dak", "dak.view"],
      ["Office", "Work allotment", "Office tasks", "tasks.view"],
      ["Office", "Reports", "Excel exports", "reports.view"],
      ["Admin", "Employees", "Staff users", "employees.view"],
      ["Admin", "Activity", "Audit log", "activity.view"],
      ["Admin", "Permissions", "Role matrix", "permissions.view"],
      ["Header", "Bell", "Notifications", "any logged-in user"],
      ["Header", "Profile", "Own profile + office PDF", "any logged-in user"],
      ["Case UI", "Documents", "Upload/download (PDF/JPG/PNG/WebP ≤10MB)", "cases.* / accounts.*"],
    ],
    [12, 16, 42, 30]
  );

  addSheet(
    "04 Roles",
    ["Role", "Who", "Typical access"],
    guide.sections.find((s) => s.id === "3").table.rows,
    [14, 24, 58]
  );

  const howToRows = [];
  for (const sec of guide.sections) {
    if (sec.steps) {
      sec.steps.forEach((s, i) => howToRows.push([sec.title, String(i + 1), s]));
    }
    for (const sub of sec.subsections || []) {
      (sub.steps || []).forEach((s, i) =>
        howToRows.push([sub.title, String(i + 1), s])
      );
    }
  }
  addSheet("05 Module how-to", ["Module / section", "Step", "What to do"], howToRows, [
    28,
    8,
    70,
  ]);

  addSheet(
    "06 Case statuses",
    ["Status", "Meaning"],
    guide.sections.find((s) => s.id === "7").table.rows,
    [16, 45]
  );

  addSheet(
    "07 CSV import",
    ["Order", "Module", "Sample / permission"],
    guide.sections.find((s) => s.id === "15").table.rows,
    [10, 28, 55]
  );

  addSheet(
    "08 Reports exports",
    ["Export", "Also needs"],
    guide.sections.find((s) => s.id === "14").table.rows,
    [28, 40]
  );

  addSheet(
    "09 Quick jobs",
    ["I need to…", "Go to"],
    guide.sections.find((s) => s.id === "21").table.rows,
    [36, 42]
  );

  addSheet(
    "10 Unit IDs",
    ["Prefix", "Entity"],
    [
      ["EMP", "Employees"],
      ["CLI", "Clients"],
      ["CSE", "Cases"],
      ["HRG", "Hearings"],
      ["APT", "Appointments"],
      ["PAY", "Payments"],
      ["DOC", "Documents"],
      ["DAK", "Postal / dak"],
      ["TSK", "Office tasks"],
      ["LVE", "Leave"],
      ["ATT", "Attendance"],
      ["NTF", "Notifications"],
      ["HOL", "Holidays"],
    ],
    [12, 24]
  );

  await wb.xlsx.writeFile(outPath);
  console.log("Wrote", outPath);
}

// ─── Word (.docx) ────────────────────────────────────────
async function writeDocx() {
  const outPath = path.join(DOCS, "MLF-Complete-Site-User-Guide.docx");
  const children = [];

  const pushP = (text, opts = {}) => {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        ...opts,
        children: [
          new TextRun({
            text,
            size: opts.size || 20,
            bold: opts.bold,
            italics: opts.italics,
            color: opts.color || "222222",
            font: "Calibri",
          }),
        ],
      })
    );
  };

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: guide.brand.toUpperCase(),
          bold: true,
          size: 22,
          color: "C9A227",
          font: "Calibri",
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: guide.title,
          bold: true,
          size: 36,
          color: "0F2744",
          font: "Calibri",
        }),
      ],
    })
  );
  pushP(guide.tagline, { size: 22 });
  pushP(guide.officeNote, { italics: true, size: 18, color: "555555" });
  pushP(`Updated: ${GENERATED}`, { size: 18, color: "666666" });
  pushP("Confidential — for authorized MLF office users", {
    size: 18,
    color: "666666",
  });

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 160 },
      children: [
        new TextRun({
          text: "Table of contents",
          bold: true,
          size: 28,
          color: "0F2744",
          font: "Calibri",
        }),
      ],
    })
  );
  for (const s of guide.sections) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: `${s.id}. ${s.title}`,
            size: 20,
            font: "Calibri",
          }),
        ],
      })
    );
  }

  function docTable(headers, rows) {
    const colCount = headers.length;
    const widths = headers.map((_, i) =>
      colCount === 2 ? (i === 0 ? 2800 : 6500) : Math.floor(9300 / colCount)
    );
    const border = {
      style: BorderStyle.SINGLE,
      size: 4,
      color: "CCCCCC",
    };
    const borders = { top: border, bottom: border, left: border, right: border };
    const headerRow = new TableRow({
      children: headers.map(
        (h, i) =>
          new TableCell({
            borders,
            width: { size: widths[i], type: WidthType.DXA },
            shading: { fill: "0F2744" },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: h,
                    bold: true,
                    color: "FFFFFF",
                    size: 18,
                    font: "Calibri",
                  }),
                ],
              }),
            ],
          })
      ),
    });
    const body = rows.map(
      (row, ri) =>
        new TableRow({
          children: row.map(
            (cell, i) =>
              new TableCell({
                borders,
                width: { size: widths[i], type: WidthType.DXA },
                shading: { fill: ri % 2 ? "FFFFFF" : "F5F7FA" },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: String(cell),
                        size: 18,
                        font: "Calibri",
                      }),
                    ],
                  }),
                ],
              })
          ),
        })
    );
    children.push(
      new Table({
        width: { size: 9300, type: WidthType.DXA },
        rows: [headerRow, ...body],
      })
    );
    children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
  }

  function renderSec(sec) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
        children: [
          new TextRun({
            text: `${sec.id}. ${sec.title}`,
            bold: true,
            size: 28,
            color: "0F2744",
            font: "Calibri",
          }),
        ],
      })
    );
    for (const t of sec.paragraphs || []) pushP(t);
    (sec.steps || []).forEach((s, i) =>
      pushP(`Step ${i + 1}: ${s}`, { size: 20 })
    );
    if (sec.table) docTable(sec.table.headers, sec.table.rows);
    for (const b of sec.bullets || []) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: `•  ${b}`, size: 20, font: "Calibri" }),
          ],
        })
      );
    }
    for (const sub of sec.subsections || []) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 220, after: 120 },
          children: [
            new TextRun({
              text: sub.title,
              bold: true,
              size: 24,
              color: "1A3A5C",
              font: "Calibri",
            }),
          ],
        })
      );
      for (const t of sub.paragraphs || []) pushP(t);
      (sub.steps || []).forEach((s, i) =>
        pushP(`Step ${i + 1}: ${s}`, { size: 20 })
      );
      if (sub.table) docTable(sub.table.headers, sub.table.rows);
      for (const b of sub.bullets || []) {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: `•  ${b}`, size: 20, font: "Calibri" }),
            ],
          })
        );
      }
    }
  }

  guide.sections.forEach(renderSec);

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: "End of guide",
          bold: true,
          size: 22,
          color: "0F2744",
          font: "Calibri",
        }),
      ],
    })
  );
  pushP(
    "If a button or menu is missing, ask Admin to grant the matching permission or confirm the module is enabled."
  );

  const document = new Document({
    creator: guide.short,
    title: guide.title,
    description: guide.tagline,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote", outPath);
}

await writePdf();
await writeExcel();
await writeDocx();
console.log("All client guide files updated in docs/");
