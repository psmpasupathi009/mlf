/**
 * One-off generator: MLF Complete Site User Guide (PDF) for client delivery.
 * Run: node scripts/generate-client-guide.mjs
 */
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "docs", "MLF-Complete-Site-User-Guide.pdf");

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 56, bottom: 64, left: 56, right: 56 },
  bufferPages: true,
  info: {
    Title: "MLF Law Firm Portal — Complete Site User Guide",
    Author: "MLF",
    Subject: "How to access and use every part of the MLF office portal",
  },
});

const stream = fs.createWriteStream(outPath);
doc.pipe(stream);

const PAGE_W = 595.28;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PAGE_BOTTOM = 760;

function ensureSpace(needed = 80) {
  if (doc.y + needed > PAGE_BOTTOM) {
    doc.addPage();
  }
}

function h1(text) {
  ensureSpace(60);
  doc.moveDown(0.4);
  doc.fontSize(18).fillColor("#0f2744").font("Helvetica-Bold").text(text, {
    width: CONTENT_W,
  });
  doc.moveDown(0.25);
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT_W, doc.y)
    .strokeColor("#c9a227")
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor("#111111").font("Helvetica");
}

function h2(text) {
  ensureSpace(50);
  doc.moveDown(0.35);
  doc.fontSize(13).fillColor("#1a3a5c").font("Helvetica-Bold").text(text, {
    width: CONTENT_W,
  });
  doc.moveDown(0.25);
  doc.fillColor("#111111").font("Helvetica").fontSize(10);
}

function h3(text) {
  ensureSpace(40);
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor("#243447").font("Helvetica-Bold").text(text, {
    width: CONTENT_W,
  });
  doc.moveDown(0.15);
  doc.fillColor("#111111").font("Helvetica").fontSize(10);
}

function p(text) {
  ensureSpace(36);
  doc.fontSize(10).font("Helvetica").fillColor("#222222").text(text, {
    width: CONTENT_W,
    align: "left",
    lineGap: 2,
  });
  doc.moveDown(0.35);
}

function bullet(text, indent = 12) {
  ensureSpace(28);
  const x = MARGIN + indent;
  const bulletW = CONTENT_W - indent;
  doc.fontSize(10).font("Helvetica").fillColor("#222222");
  doc.text("•  " + text, x, doc.y, { width: bulletW, lineGap: 1.5 });
  doc.moveDown(0.15);
}

function step(n, text) {
  ensureSpace(28);
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#0f2744");
  doc.text(`Step ${n}: `, MARGIN, doc.y, { continued: true });
  doc.font("Helvetica").fillColor("#222222").text(text, {
    width: CONTENT_W,
    lineGap: 1.5,
  });
  doc.moveDown(0.2);
}

function note(text) {
  const body = "Note: " + text;
  doc.fontSize(9).font("Helvetica-Oblique");
  const h = doc.heightOfString(body, { width: CONTENT_W - 20 });
  ensureSpace(h + 20);
  const startY = doc.y;
  doc.rect(MARGIN, startY, CONTENT_W, h + 12).fill("#fff8e6");
  doc.fillColor("#4a3b12");
  doc.text(body, MARGIN + 10, startY + 4, {
    width: CONTENT_W - 20,
    lineGap: 1,
  });
  doc.y = startY + h + 16;
  doc.fillColor("#111111").font("Helvetica");
}

function table(headers, rows, colWidths) {
  ensureSpace(40 + rows.length * 16);
  const startX = MARGIN;
  let x = startX;
  const rowH = 16;
  const headerH = 18;

  // Header
  doc.rect(startX, doc.y, CONTENT_W, headerH).fill("#0f2744");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
  x = startX;
  const hy = doc.y + 5;
  headers.forEach((h, i) => {
    doc.text(h, x + 4, hy, { width: colWidths[i] - 8, ellipsis: true });
    x += colWidths[i];
  });
  doc.y += headerH;

  rows.forEach((row, ri) => {
    ensureSpace(rowH + 4);
    const bg = ri % 2 === 0 ? "#f5f7fa" : "#ffffff";
    doc.rect(startX, doc.y, CONTENT_W, rowH).fill(bg);
    doc.fillColor("#222222").font("Helvetica").fontSize(8);
    x = startX;
    const ty = doc.y + 4;
    row.forEach((cell, i) => {
      doc.text(String(cell), x + 4, ty, {
        width: colWidths[i] - 8,
        ellipsis: true,
      });
      x += colWidths[i];
    });
    doc.y += rowH;
  });
  doc.moveDown(0.6);
  doc.fillColor("#111111").font("Helvetica");
}

// ─── COVER ───────────────────────────────────────────────
doc.rect(0, 0, PAGE_W, 841.89).fill("#0f2744");
doc.fillColor("#c9a227").font("Helvetica-Bold").fontSize(11);
doc.text("LAW FIRM OFFICE PORTAL", MARGIN, 200, {
  width: CONTENT_W,
  align: "center",
});
doc.moveDown(1);
doc.fillColor("#ffffff").fontSize(28).font("Helvetica-Bold");
doc.text("MLF Complete Site", { align: "center", width: CONTENT_W });
doc.text("User Guide", { align: "center", width: CONTENT_W });
doc.moveDown(1.2);
doc.fillColor("#d4dce8").fontSize(12).font("Helvetica");
doc.text(
  "One complete document: how to access the portal and how every module works, step by step.",
  { align: "center", width: CONTENT_W }
);
doc.moveDown(2);
doc.fillColor("#c9a227").fontSize(10);
doc.text("For office staff, advocates, accountants, and administrators", {
  align: "center",
  width: CONTENT_W,
});
doc.moveDown(0.5);
doc.fillColor("#8899aa").fontSize(9);
doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`, {
  align: "center",
  width: CONTENT_W,
});
doc.fillColor("#667788").fontSize(8);
doc.text("Confidential — for authorized MLF office users", MARGIN, 760, {
  width: CONTENT_W,
  align: "center",
});

// Start content on a fresh page after cover
doc.addPage();
doc.fillColor("#111111");

// ─── TOC ─────────────────────────────────────────────────
h1("Table of contents");
const toc = [
  "1. What this portal is",
  "2. How to access (login, PIN, OTP, logout)",
  "3. Roles & what each person can do",
  "4. Screen layout & navigation",
  "5. Home dashboard & global search",
  "6. Clients",
  "7. Cases, hearings & documents",
  "8. Day board (diary)",
  "9. Appointments & advocate availability",
  "10. Accounts (cash / payments)",
  "11. HRMS (attendance & leave)",
  "12. Postal register (DAK)",
  "13. Work allotment (tasks)",
  "14. Reports & Excel exports",
  "15. CSV bulk import",
  "16. Employees & user accounts",
  "17. Permissions administration",
  "18. Notifications & profile",
  "19. Activity (audit log)",
  "20. End-to-end office workflows",
  "21. Quick reference checklist",
];
toc.forEach((t) => bullet(t, 0));

// ─── 1 ───────────────────────────────────────────────────
h1("1. What this portal is");
p(
  "MLF is the law firm’s internal office portal. It is used to manage clients, cases, hearings, appointments, cash payments, postal dak, work allotment, HR attendance/leave, reports, and staff permissions — in one place."
);
p("Typical users: Admin, Sub-admin (office/HR manager), Staff (clerks, PA, receptionist), Advocates, and Accountants.");
bullet("You open the site in a web browser (desktop recommended).");
bullet("You sign in with your Indian mobile number and a 6-digit PIN.");
bullet("What you see in the left menu depends on your role and permissions.");
bullet("All important actions are logged in Activity for accountability.");
note(
  "This guide is for using the live site. It is not a developer/setup manual."
);

// ─── 2 ───────────────────────────────────────────────────
h1("2. How to access the site");
h2("2.1 Open the portal");
step(1, "Open the portal URL provided by your office (for example the production website address).");
step(2, "If you are not logged in, you are taken to the Login page.");
step(3, "After a successful login you land on Home (/).");

h2("2.2 First-time setup (new user / no PIN yet)");
step(1, "Enter your 10-digit Indian mobile number (must start with 6–9).");
step(2, "Continue. The system detects that you need PIN setup.");
step(3, "Request OTP. An SMS OTP is sent to your mobile (via 2Factor).");
step(4, "Enter the OTP and verify.");
step(5, "Create a 6-digit PIN (and confirm it). Avoid weak PINs such as 000000, 123456, or repeated digits.");
step(6, "You are signed in and redirected to Home.");

h2("2.3 Returning user (normal daily login)");
step(1, "Enter your 10-digit mobile number.");
step(2, "Enter your 6-digit PIN.");
step(3, "Submit. A secure session cookie is set and you go to Home.");

h2("2.4 Forgot PIN");
step(1, "On the PIN screen, choose Forgot PIN.");
step(2, "Request OTP → enter OTP from SMS → verify.");
step(3, "Set a new 6-digit PIN (confirm it).");
step(4, "You are signed in with the new PIN.");

h2("2.5 PIN lockout");
p(
  "Too many wrong PIN attempts locks the PIN temporarily. Wait for the countdown, or use Forgot PIN to reset via OTP."
);

h2("2.6 Logout");
step(1, "Open the user menu (profile area in the header).");
step(2, "Choose Logout. Session cookies are cleared and you return to Login.");

h2("2.7 Session expired");
p(
  "If your session expires while working, the app clears cookies and sends you back to Login. Sign in again with mobile + PIN."
);

// ─── 3 ───────────────────────────────────────────────────
h1("3. Roles & what each person can do");
p(
  "Access is role-based. Admin has full control. Other roles get a default set of permissions (which Admin can adjust on the Permissions page)."
);

table(
  ["Role", "Meant for", "Typical access"],
  [
    ["Admin", "Firm owner / full control", "Everything; cannot be restricted"],
    ["Sub admin", "Office / HR manager", "Ops: clients, cases, HRMS approve, employees, reports"],
    ["Staff", "Clerks, PA, reception", "Clients, cases, appointments, dak, tasks"],
    ["Advocate", "Counsel / advocates", "Clients, cases, appointments, dak, tasks"],
    ["Accountant", "Accounts team", "Accounts cash book, view clients/cases, reports"],
  ],
  [80, 140, 263]
);

h3("Everyone gets");
bullet("Home (dashboard) view");
bullet("HRMS view + own attendance check-in/out + own leave requests");
bullet("Notifications inbox (bell) and Profile");

h3("Permission actions you may see");
bullet("View — open list/detail screens");
bullet("Create — add new records");
bullet("Edit — change existing records");
bullet("Upload / import — CSV bulk import (and related uploads)");
bullet("Deactivate — deactivate employees");
bullet("Cancel — cancel appointments");
bullet("Own attendance / Own leave / Team attendance / Approve leave — HRMS splits");

note(
  "If a menu item is missing, you do not have permission (or the module is disabled). Ask Admin."
);

// ─── 4 ───────────────────────────────────────────────────
h1("4. Screen layout & navigation");
h2("4.1 Main areas");
bullet("Left sidebar — modules grouped as Workspace, Matters, Schedule, Office, Admin.");
bullet("Header — global search (⌘K / Ctrl+K), notification bell, user menu.");
bullet("Main content — list, filters, forms, detail panels for the selected module.");

h2("4.2 Menu map");
table(
  ["Group", "Menu label", "Opens"],
  [
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
  [90, 120, 273]
);

h3("Also reachable (not always in main nav)");
bullet("Notifications — header bell → full inbox");
bullet("Profile — user menu → your photo / details");
bullet("Documents — inside Case / Client screens (no separate Documents menu)");

// ─── 5 ───────────────────────────────────────────────────
h1("5. Home dashboard & global search");
h2("5.1 Home");
step(1, "After login, open Home (or click Home in the sidebar).");
step(2, "Review summary cards / today’s focus (hearings, appointments, tasks as permitted).");
step(3, "Use shortcuts from the dashboard into Cases, Day board, or other modules.");

h2("5.2 Global search");
step(1, "Press ⌘K (Mac) or Ctrl+K (Windows), or open the search control in the header.");
step(2, "Type a client name, case id, mobile fragment, etc.");
step(3, "Select a result to jump to that record.");

// ─── 6 ───────────────────────────────────────────────────
h1("6. Clients");
p("Clients is the party registry. Most cases and payments link to a client record (IDs like CLI-00001).");

h2("6.1 View clients");
step(1, "Open Clients from Matters.");
step(2, "Use search / pagination to find a client.");
step(3, "Open a row to see detail.");

h2("6.2 Create a client");
step(1, "Click Create / Add (needs clients.create).");
step(2, "Enter name, mobile (10 digits), and other intake fields (including SMS consent if shown).");
step(3, "Save. A client unit ID is generated automatically.");

h2("6.3 Edit a client");
step(1, "Open the client.");
step(2, "Edit fields and save (needs clients.edit).");

h2("6.4 Import clients (CSV)");
p("See Section 15. Recommended first import when migrating data.");

// ─── 7 ───────────────────────────────────────────────────
h1("7. Cases, hearings & documents");
p(
  "Cases track matters from enquiry through disposal. Each case links to a client and may have advocates, hearings, documents, and fee payments."
);

h2("7.1 Case pipeline statuses");
table(
  ["Status", "Meaning"],
  [
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
  [120, 363]
);
p("Status changes follow allowed transitions only (the system blocks invalid jumps).");

h2("7.2 Create a case");
step(1, "Open Cases → Create (needs cases.create).");
step(2, "Select the client (must exist first).");
step(3, "Fill opposing party, court, stage/status, advocates (optional), and other matter fields.");
step(4, "Save. A case unit ID is generated (e.g. CAS-00001).");

h2("7.3 Open case detail");
step(1, "From the Cases list, open a case.");
step(2, "Review client link, status pipeline, hearings list, documents, and fee snippet.");
step(3, "Update status when the matter moves (needs cases.edit).");
step(4, "Complete filing checklist items if shown.");

h2("7.4 Hearings");
step(1, "On case detail, add a hearing (date/time, court notes as required).");
step(2, "Saving updates the case next hearing date; notifications may be sent.");
step(3, "To adjourn: use adjourn on the hearing — this creates a replacement hearing.");
step(4, "Bulk hearings can be imported via CSV (see Section 15).");

h2("7.5 Documents on a case / client");
step(1, "Open the Documents panel on the case (or client) screen.");
step(2, "Upload a file (allowed types/sizes enforced by the system).");
step(3, "Download later from the same panel (permission follows cases / accounts rules by document type).");
note(
  "There is no standalone Documents page in the main menu — documents live on the related case/client."
);

h2("7.6 Hearing SMS (automatic reminder)");
p(
  "A scheduled job can SMS clients about tomorrow’s hearings. Manual triggers may also exist from Day board / diary tools for authorized users."
);

// ─── 8 ───────────────────────────────────────────────────
h1("8. Day board (diary)");
p(
  "Day board shows one IST calendar day: hearings + appointments + tasks together. You can open it if you have view access to Cases, Appointments, or Tasks."
);
step(1, "Open Day board from Matters.");
step(2, "Pick the date (defaults to today).");
step(3, "Review each section: court hearings, appointments, allotted work.");
step(4, "Click an item to open its full record.");
step(5, "Use notify / hearing SMS actions if available and permitted.");

// ─── 9 ───────────────────────────────────────────────────
h1("9. Appointments & advocate availability");
h2("9.1 Appointments");
step(1, "Open Appointments under Schedule.");
step(2, "Create an appointment: client/contact, advocate, date-time, purpose.");
step(3, "Edit or cancel as needed (cancel needs appointments.cancel).");
step(4, "Convert to enquiry case when the consultation becomes a matter (Convert action on the appointment).");

h2("9.2 Availability");
step(1, "Open Availability under Schedule.");
step(2, "Set advocate weekly hours.");
step(3, "Add time blocks (leave, court, unavailable windows).");
step(4, "Booking screens use these rules so slots respect hours and blocks.");

// ─── 10 ──────────────────────────────────────────────────
h1("10. Accounts (cash / payments)");
p(
  "Accounts is the cash ledger for client/case fees and related payments. Accountants typically work here daily."
);
step(1, "Open Accounts under Office.");
step(2, "Filter by client, case, date, or purpose as needed.");
step(3, "Record a payment: link client (and case if known), amount, purpose, mode/notes.");
step(4, "Save. A payment unit ID is created.");
step(5, "To reverse a wrong entry, use Void (do not delete casually — void keeps the audit trail).");
step(6, "On a case detail screen, fee rollup may show payments filtered for that case.");
p("CSV import of payments is available (sample file is named payments.sample.csv). Needs accounts.upload.");

// ─── 11 ──────────────────────────────────────────────────
h1("11. HRMS (attendance & leave)");
h2("11.1 Own attendance");
step(1, "Open HRMS.");
step(2, "Check in at the start of work; check out at the end (own_attendance).");
step(3, "Review your attendance history on the same screen.");

h2("11.2 Own leave");
step(1, "In HRMS, open Leave.");
step(2, "Submit a leave request with dates and reason (own_leave).");
step(3, "Wait for approval from a manager who has approve_leave.");

h2("11.3 Managers");
step(1, "Approve or reject pending leave (approve_leave).");
step(2, "Manage team attendance / corrections if you have manage_attendance.");
step(3, "Maintain office holidays under Holidays (as permitted).");

// ─── 12 ──────────────────────────────────────────────────
h1("12. Postal register (DAK)");
p("Postal / DAK tracks inward and outward office dak (letters, parcels, courier).");
step(1, "Open Postal under Office.");
step(2, "Create an entry: in/out, reference, parties, date, remarks.");
step(3, "Edit when status or details change.");
step(4, "Import historical dak via CSV if migrating (Section 15).");

// ─── 13 ──────────────────────────────────────────────────
h1("13. Work allotment (tasks)");
p("Office tasks assign work to staff/advocates, often linked to a case.");
step(1, "Open Work allotment under Office.");
step(2, "Create a task: title, assignee, due date, linked case (optional).");
step(3, "Update status as work progresses (assignees may get notifications).");
step(4, "Due items also appear on Day board for the selected day.");

// ─── 14 ──────────────────────────────────────────────────
h1("14. Reports & Excel exports");
step(1, "Open Reports (needs reports.view).");
step(2, "Choose an export type (examples: cases, clients, employees, tasks, dak, accounts, appointments, fees outstanding, and other types listed in the UI).");
step(3, "Download the Excel file.");
note(
  "Each export also requires view permission on that domain (e.g. cases export needs cases.view as well as reports.view)."
);

// ─── 15 ──────────────────────────────────────────────────
h1("15. CSV bulk import");
p(
  "Most list screens offer Import. Always dry-run first, then confirm. Sample CSVs download from the Import dialog."
);

h2("15.1 Safe import procedure (every time)");
step(1, "Open the module → Import.");
step(2, "Download the sample CSV for that module.");
step(3, "Fill rows in Excel/Sheets; save as UTF-8 CSV with the header row.");
step(4, "Upload → Dry run. Fix any row errors shown.");
step(5, "Confirm import (writes data + audit).");

h2("15.2 Recommended import order");
table(
  ["Order", "Module", "Why"],
  [
    ["1", "Clients", "Creates CLI-… IDs used later"],
    ["2", "Cases", "Needs clientUnitId from step 1"],
    ["3+", "Hearings / Payments / Dak / Tasks / Appointments", "Link with caseUnitId / clientUnitId"],
    ["Any", "Employees", "Independent user roster (admin)"],
  ],
  [50, 160, 273]
);

h2("15.3 CSV rules");
bullet("UTF-8 CSV; header row required.");
bullet("Dates: YYYY-MM-DD (IST). Appointment scheduledAt may be full ISO datetime.");
bullet("Mobile: 10 digits (system normalizes to 91…).");
bullet("Link related rows with *UnitId columns only.");
bullet("Empty unitId on clients/cases/employees → auto-generated.");
bullet("Unknown extra columns are ignored (shown in dry-run as ignored).");

h2("15.4 Permissions for import");
table(
  ["Import", "Permission needed"],
  [
    ["Clients", "clients.create (+ edit for upsert)"],
    ["Cases", "cases.upload (+ edit for upsert)"],
    ["Hearings", "cases.edit"],
    ["Accounts / payments", "accounts.upload"],
    ["Employees", "employees.create (+ edit for upsert)"],
    ["DAK", "dak.create"],
    ["Tasks", "tasks.create"],
    ["Appointments", "appointments.create"],
  ],
  [200, 283]
);

// ─── 16 ──────────────────────────────────────────────────
h1("16. Employees & user accounts");
step(1, "Admin/Sub-admin opens Employees.");
step(2, "Create employee: name, mobile, role(s), designation as required.");
step(3, "The person signs in with that mobile and sets/uses a PIN (OTP flow on first login).");
step(4, "Edit profile details; upload photo if supported.");
step(5, "Deactivate when someone leaves (deactivate permission). Reactivate if they return.");
step(6, "Force reset PIN when a user is locked out and cannot use OTP themselves (admin tools).");
note(
  "Only Admin can assign the Admin role. Sub-admin can manage other employees within policy."
);

// ─── 17 ──────────────────────────────────────────────────
h1("17. Permissions administration");
step(1, "Admin opens Permissions (permissions.view / edit).");
step(2, "Review the matrix: each role × each module.action.");
step(3, "Turn allowed on/off for Sub-admin, Staff, Advocate, Accountant as your office policy requires.");
step(4, "Save. Users get the union of permissions from all their roles on next session use.");
p("Admin remains full access by design.");

// ─── 18 ──────────────────────────────────────────────────
h1("18. Notifications & profile");
h2("18.1 Notifications");
step(1, "Click the bell in the header to see recent alerts.");
step(2, "Open the full Notifications page from there if needed.");
step(3, "Mark items read as you handle them.");
p(
  "Alerts are created by office events (e.g. task assigned, hearing updates). Live push may be enabled on some deployments; otherwise the UI polls."
);

h2("18.2 Profile");
step(1, "Open user menu → Profile.");
step(2, "Update display details / photo as allowed.");
step(3, "Logout from the same menu when finished for the day.");

// ─── 19 ──────────────────────────────────────────────────
h1("19. Activity (audit log)");
step(1, "Open Activity under Admin (activity.view).");
step(2, "Filter/search recent creates, updates, voids, imports, and other audited actions.");
step(3, "Use this for accountability and troubleshooting “who changed what”.");

// ─── 20 ──────────────────────────────────────────────────
h1("20. End-to-end office workflows");

h2("20.1 New client → case → hearing → fee");
step(1, "Create Client (or find existing).");
step(2, "Create Case linked to that client; set status (often Enquiry or Engaged).");
step(3, "Assign advocates; move status through pre-filing / filing / active as work progresses.");
step(4, "Add Hearings; watch Day board for the hearing day.");
step(5, "Upload Documents on the case.");
step(6, "Record fee Payments in Accounts against client/case.");
step(7, "When finished, move status to Disposed / Withdrawn / Archived as appropriate.");

h2("20.2 Consultation → appointment → case");
step(1, "Set advocate Availability.");
step(2, "Book Appointment.");
step(3, "After meeting, Convert appointment to enquiry Case if engaged.");
step(4, "Continue on the Cases workflow above.");

h2("20.3 Daily office rhythm");
step(1, "Login → check Home + Notifications.");
step(2, "Open Day board for today — hearings, appointments, tasks.");
step(3, "HRMS check-in.");
step(4, "Work Cases / Clients / Accounts / Dak / Tasks as assigned.");
step(5, "Export Reports if needed for accounts or management.");
step(6, "HRMS check-out → Logout.");

h2("20.4 Onboarding a new staff member");
step(1, "Admin creates Employee with correct role.");
step(2, "Adjust Permissions if the default role matrix is not enough.");
step(3, "Staff opens site → OTP → set PIN → starts work.");

// ─── 21 ──────────────────────────────────────────────────
h1("21. Quick reference checklist");
h2("Access");
bullet("URL → Login → Mobile → PIN (or OTP setup / forgot PIN) → Home");
bullet("Logout from user menu; session expiry returns to Login");

h2("Where to do common jobs");
table(
  ["I need to…", "Go to"],
  [
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
  ],
  [220, 263]
);

h2("IDs you will see");
bullet("CLI-… clients");
bullet("CAS-… cases (and similar unit IDs for hearings, payments, tasks, etc.)");
bullet("Public IDs are these unit IDs — use them in imports and when speaking with support.");

doc.moveDown(1.5);
ensureSpace(80);
doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f2744");
doc.text("End of guide", { align: "center", width: CONTENT_W });
doc.moveDown(0.4);
doc.fontSize(9).font("Helvetica").fillColor("#555555");
doc.text(
  "If a button or menu is missing, ask your Admin to grant the matching permission or confirm the module is enabled.",
  { align: "center", width: CONTENT_W }
);

// Footers on all pages except cover (index 0)
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  if (i === range.start) continue; // cover
  const label = `MLF Portal — Complete User Guide  ·  Page ${i - range.start}`;
  doc.fontSize(8).fillColor("#666666");
  doc.text(label, MARGIN, 800, {
    width: CONTENT_W,
    align: "center",
    lineBreak: false,
  });
}

doc.end();

await new Promise((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
});

console.log("Wrote", outPath);
