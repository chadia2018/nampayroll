const http = require("http");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const { calculatePayroll, normalizePayrollInput, SOURCE_LIST } = require("./lib/payroll");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const AFRICASTALKING_USERNAME = process.env.AFRICASTALKING_USERNAME || "";
const AFRICASTALKING_API_KEY = process.env.AFRICASTALKING_API_KEY || "";
const AFRICASTALKING_FROM = process.env.AFRICASTALKING_FROM || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "db.json");
const SQLITE_PATH = path.join(DATA_DIR, "payroll.sqlite");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
let writeQueue = Promise.resolve();
let mutationQueue = Promise.resolve();
let sqliteDb = null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function defaultCompany() {
  return {
    name: "Desert Bloom Trading",
    taxReference: "NAM-IRP-001",
    sscRegistration: "SSC-001",
    email: "",
    cellphone: "",
    physicalAddress: "",
    website: "",
    logoPath: "",
    registeredAt: "",
    adminNotificationEmail: "",
    adminNotificationCellphone: "",
    notifyAdminOnLeaveRequest: true,
    notifyAdminOnLoanRequest: true,
    notifyAdminOnTimesheet: true,
  };
}

function defaultLeaveBalances() {
  return {
    annualLeaveUsed: 0,
    sickLeaveUsed: 0,
  };
}

function defaultEmployeeProfile() {
  return {
    personalEmail: "",
    cellphone: "",
    physicalAddress: "",
    nextOfKinName: "",
    nextOfKinPhone: "",
  };
}

function buildEmployeePortal(employeeNumber, idNumber = "") {
  const safeNumber = String(employeeNumber || "").trim() || "employee";
  const safeId = String(idNumber || "").replace(/\D/g, "");
  const tempPassword = safeId.slice(-6) || "welcome123";
  return {
    username: `${safeNumber.toLowerCase()}-${safeId.slice(-4) || "0000"}`,
    tempPassword,
    passwordHash: "",
  };
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function sha(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function verifyPassword(password, storedHash) {
  const [salt, key] = String(storedHash || "").split(":");
  if (!salt || !key) return false;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey));
    });
  });
}

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  if (!sqliteDb) {
    sqliteDb = new DatabaseSync(SQLITE_PATH);
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  const existing = sqliteDb.prepare("SELECT payload FROM app_state WHERE id = 1").get();
  if (existing?.payload) return;

  let seed;
  try {
    const legacyRaw = await fs.readFile(LEGACY_JSON_PATH, "utf8");
    seed = JSON.parse(legacyRaw);
  } catch {
    const adminPassword = "admin123!";
    const adminPasswordHash = await hashPassword(adminPassword);
    seed = {
      company: {
        ...defaultCompany(),
      },
      users: [
        {
          id: id("user"),
          username: "admin",
          name: "Payroll Admin",
          role: "admin",
          passwordHash: adminPasswordHash,
        },
      ],
      sessions: [],
      employees: [
        {
          id: id("emp"),
          employeeNumber: "EMP-001",
          fullName: "Anna Nghipondoka",
          idNumber: "90010100000",
          department: "Operations",
          title: "Payroll Clerk",
          workerCategory: "general",
          startDate: "2025-01-06",
          payFrequency: "monthly",
          daysPerWeek: 5,
          hoursPerDay: 9,
          basicWage: 18500,
          taxableAllowances: 1200,
          standardBonus: 0,
          bankName: "Bank Windhoek",
          accountNumber: "0812345678",
          leaveBalances: {
            ...defaultLeaveBalances(),
            annualLeaveUsed: 2,
            sickLeaveUsed: 1,
          },
          profile: {
            ...defaultEmployeeProfile(),
          },
          portalAccess: {
            ...buildEmployeePortal("EMP-001", "90010100000"),
          },
          status: "active",
          createdAt: new Date().toISOString(),
        },
      ],
      leaveRequests: [],
      loanRequests: [],
      timesheets: [],
      notifications: [],
      passwordResetRequests: [],
      payrollRuns: [],
      auditLog: [
        {
          id: id("audit"),
          action: "seeded-db",
          at: new Date().toISOString(),
          actor: "system",
          detail: "Seeded local database with default admin user and one sample employee.",
        },
      ],
    };

    seed.employees[0].portalAccess.passwordHash = await hashPassword(seed.employees[0].portalAccess.tempPassword);
  }

  sqliteDb
    .prepare("INSERT OR REPLACE INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)")
    .run(JSON.stringify(seed), new Date().toISOString());
}

async function readDb() {
  await ensureDb();
  const row = sqliteDb.prepare("SELECT payload FROM app_state WHERE id = 1").get();
  const db = JSON.parse(row.payload);
  db.company = {
    ...defaultCompany(),
    ...(db.company || {}),
  };
  db.leaveRequests = db.leaveRequests || [];
  db.loanRequests = db.loanRequests || [];
  db.timesheets = db.timesheets || [];
  db.notifications = db.notifications || [];
  db.passwordResetRequests = db.passwordResetRequests || [];
  const seenUsernames = new Set();
  const migratedEmployees = [];
  for (const employee of db.employees || []) {
    const basePortal = employee.portalAccess || buildEmployeePortal(employee.employeeNumber, employee.idNumber);
    let username = basePortal.username || buildEmployeePortal(employee.employeeNumber, employee.idNumber).username;
    let suffix = 2;
    while (seenUsernames.has(username)) {
      username = `${basePortal.username}-${suffix}`;
      suffix += 1;
    }
    seenUsernames.add(username);
    const portalAccess = {
      ...basePortal,
      username,
      tempPassword: basePortal.tempPassword || buildEmployeePortal(employee.employeeNumber, employee.idNumber).tempPassword,
      passwordHash: basePortal.passwordHash || "",
    };
    if (!portalAccess.passwordHash) {
      portalAccess.passwordHash = await hashPassword(portalAccess.tempPassword);
    }
    migratedEmployees.push({
      ...employee,
      leaveBalances: {
        ...defaultLeaveBalances(),
        ...(employee.leaveBalances || {}),
      },
      profile: {
        ...defaultEmployeeProfile(),
        ...(employee.profile || {}),
      },
      portalAccess,
    });
  }
  db.employees = migratedEmployees;
  return db;
}

async function writeDb(db) {
  const payload = JSON.stringify(db, null, 2);
  writeQueue = writeQueue.then(() =>
    Promise.resolve(
      sqliteDb
        .prepare("INSERT OR REPLACE INTO app_state (id, payload, updated_at) VALUES (1, ?, ?)")
        .run(payload, new Date().toISOString()),
    ),
  );
  await writeQueue;
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

function sendBuffer(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/octet-stream",
    ...headers,
  });
  res.end(payload);
}

function sanitizeEmployee(employee) {
  return {
    ...employee,
    portalAccess: employee.portalAccess
      ? {
          username: employee.portalAccess.username,
          tempPassword: employee.portalAccess.tempPassword,
        }
      : null,
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    employeeId: user.employeeId || null,
  };
}

function sanitizeCompany(company) {
  return {
    ...defaultCompany(),
    ...(company || {}),
  };
}

function sanitizeLeaveRequest(request) {
  return {
    ...request,
  };
}

function calculateLeaveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((end - start) / millisecondsPerDay) + 1;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getNamibiaPublicHolidays(year) {
  const easter = easterSunday(year);
  const holidays = [
    new Date(year, 0, 1),
    addDays(easter, -2),
    addDays(easter, 1),
    new Date(year, 2, 21),
    new Date(year, 4, 1),
    new Date(year, 4, 4),
    addDays(easter, 39),
    new Date(year, 4, 25),
    new Date(year, 7, 26),
    new Date(year, 11, 10),
    new Date(year, 11, 25),
    new Date(year, 11, 26),
  ];

  const keys = new Set(holidays.map(formatDateKey));
  holidays.forEach((holiday) => {
    if (holiday.getDay() === 0) {
      let observed = addDays(holiday, 1);
      while (keys.has(formatDateKey(observed))) {
        observed = addDays(observed, 1);
      }
      keys.add(formatDateKey(observed));
    }
  });

  return keys;
}

function isOrdinaryWorkday(date, daysPerWeek) {
  const day = date.getDay();
  const workDays = Math.max(1, Math.min(7, Number(daysPerWeek || 5)));
  if (workDays >= 7) return true;
  if (workDays === 6) return day !== 0;
  return day >= 1 && day <= 5;
}

function calculateWorkingLeaveDays(startDate, endDate, daysPerWeek) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  const holidayCache = new Map();
  let count = 0;

  for (let current = new Date(start); current <= end; current = addDays(current, 1)) {
    if (!isOrdinaryWorkday(current, daysPerWeek)) continue;
    const year = current.getFullYear();
    if (!holidayCache.has(year)) {
      holidayCache.set(year, getNamibiaPublicHolidays(year));
    }
    if (holidayCache.get(year).has(formatDateKey(current))) continue;
    count += 1;
  }

  return count;
}

function dateRangesOverlap(startA, endA, startB, endB) {
  const aStart = new Date(`${startA}T00:00:00`).getTime();
  const aEnd = new Date(`${endA}T00:00:00`).getTime();
  const bStart = new Date(`${startB}T00:00:00`).getTime();
  const bEnd = new Date(`${endB}T00:00:00`).getTime();

  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

function findOverlappingLeaveRequest(leaveRequests, candidate) {
  return leaveRequests.find((request) => {
    if (request.employeeId !== candidate.employeeId) return false;
    if (request.id === candidate.id) return false;
    if (!["pending", "approved"].includes(request.status)) return false;
    return dateRangesOverlap(request.startDate, request.endDate, candidate.startDate, candidate.endDate);
  });
}

function getBalanceFieldForLeaveType(leaveType) {
  if (leaveType === "annual") return "annualLeaveUsed";
  if (leaveType === "sick") return "sickLeaveUsed";
  return null;
}

function applyLeaveRequestBalanceEffect(employee, request, nextStatus) {
  const balanceField = getBalanceFieldForLeaveType(request.leaveType);
  if (!balanceField) {
    request.appliedToBalance = false;
    request.appliedDays = 0;
    return;
  }

  employee.leaveBalances = employee.leaveBalances || {
    annualLeaveUsed: 0,
    sickLeaveUsed: 0,
  };

  const previouslyApplied = Boolean(request.appliedToBalance);
  const appliedDays = Number(request.appliedDays || request.daysRequested || 0);

  if (previouslyApplied) {
    employee.leaveBalances[balanceField] = Math.max(
      Number(employee.leaveBalances[balanceField] || 0) - appliedDays,
      0,
    );
    request.appliedToBalance = false;
    request.appliedDays = 0;
  }

  if (nextStatus === "approved") {
    employee.leaveBalances[balanceField] = Number(employee.leaveBalances[balanceField] || 0) + Number(request.daysRequested || 0);
    request.appliedToBalance = true;
    request.appliedDays = Number(request.daysRequested || 0);
  }
}

async function persistLogo(dataUrl) {
  if (!dataUrl) return "";
  const match = String(dataUrl).match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) {
    throw new Error("Logo must be a PNG, JPG, JPEG, or WEBP image.");
  }

  const mime = match[1];
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error("Logo file is too large. Keep it under 2MB.");
  }

  const filename = `company-logo-${Date.now()}.${extension}`;
  const outputPath = path.join(UPLOADS_DIR, filename);
  await fs.writeFile(outputPath, buffer);
  return `/uploads/${filename}`;
}

async function getSession(req) {
  const db = await readDb();
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (!token) return { db, session: null, user: null };
  const tokenHash = sha(token);
  const session = db.sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > new Date().toISOString());
  if (!session) return { db, session: null, user: null };
  let user = db.users.find((item) => item.id === session.userId) || null;
  if (!user && session.role === "employee" && session.employeeId) {
    const employee = db.employees.find((item) => item.id === session.employeeId && item.status !== "archived");
    if (employee) {
      user = {
        id: `employee-login-${employee.id}`,
        username: employee.portalAccess?.username || employee.employeeNumber.toLowerCase(),
        name: employee.fullName,
        role: "employee",
        employeeId: employee.id,
      };
    }
  }
  return { db, session, user };
}

function requireAuth(handler) {
  return async (req, res, params) => {
    const sessionState = await getSession(req);
    if (!sessionState.user) {
      sendJson(res, 401, { error: "Authentication required." });
      return;
    }
    await handler(req, res, params, sessionState);
  };
}

function requireAdmin(handler) {
  return requireAuth(async (req, res, params, sessionState) => {
    if (sessionState.user.role !== "admin") {
      sendJson(res, 403, { error: "Admin access required." });
      return;
    }
    await handler(req, res, params, sessionState);
  });
}

function requireEmployeeOrAdmin(handler) {
  return requireAuth(async (req, res, params, sessionState) => {
    await handler(req, res, params, sessionState);
  });
}

function getEmployeeForSession(sessionState) {
  if (sessionState.user.role === "employee") {
    return sessionState.db.employees.find((item) => item.id === sessionState.user.employeeId && item.status !== "archived") || null;
  }
  return null;
}

function findRunForEmployee(db, employeeId, runId) {
  return (db.payrollRuns || []).find((item) => item.id === runId && item.employeeId === employeeId);
}

function sanitizeLoanRequest(request) {
  const amount = Number(request.amount || 0);
  const repaymentMonths = Math.max(Number(request.repaymentMonths || 1), 1);
  const monthlyInstallment = amount / repaymentMonths;
  const approvedAt = request.reviewedAt || request.requestedAt;
  const now = new Date();
  const approvedDate = new Date(approvedAt);
  const elapsedMonths =
    request.status === "approved" && !Number.isNaN(approvedDate.getTime())
      ? Math.max(0, (now.getUTCFullYear() - approvedDate.getUTCFullYear()) * 12 + (now.getUTCMonth() - approvedDate.getUTCMonth()))
      : 0;
  const paidMonthsEstimate = Math.min(elapsedMonths, repaymentMonths);
  return {
    ...request,
    monthlyInstallment,
    estimatedOutstandingBalance:
      request.status === "approved"
        ? Math.max(amount - monthlyInstallment * paidMonthsEstimate, 0)
        : amount,
    paidMonthsEstimate,
  };
}

function sanitizeTimesheet(entry) {
  return {
    ...entry,
  };
}

function sanitizeNotification(entry) {
  return {
    ...entry,
  };
}

function createNotification(db, payload) {
  db.notifications = db.notifications || [];
  const entry = {
    id: id("note"),
    employeeId: payload.employeeId,
    type: payload.type || "info",
    title: String(payload.title || "").trim(),
    body: String(payload.body || "").trim(),
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  db.notifications.unshift(entry);
  return entry;
}

async function sendResendEmail(to, subject, text) {
  if (!RESEND_API_KEY || !to) return { skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "NamPayroll <notifications@nam-payroll.local>",
      to: [to],
      subject,
      text,
    }),
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Email delivery failed: ${payload}`);
  }
  return response.json();
}

async function sendAfricasTalkingSms(to, body) {
  if (!AFRICASTALKING_USERNAME || !AFRICASTALKING_API_KEY || !to || !body) return { skipped: true };
  const payload = new URLSearchParams({
    username: AFRICASTALKING_USERNAME,
    to,
    message: body,
  });
  if (AFRICASTALKING_FROM) {
    payload.set("from", AFRICASTALKING_FROM);
  }
  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      Accept: "application/json",
      apiKey: AFRICASTALKING_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SMS delivery failed: ${text}`);
  }
  return response.json();
}

async function sendAdminRequestAlert(db, type, subject, message) {
  const company = sanitizeCompany(db.company);
  const shouldSend =
    (type === "leave" && company.notifyAdminOnLeaveRequest) ||
    (type === "loan" && company.notifyAdminOnLoanRequest) ||
    (type === "timesheet" && company.notifyAdminOnTimesheet);
  if (!shouldSend) return;

  const adminUsers = (db.users || []).filter((user) => user.role === "admin");
  db.auditLog = db.auditLog || [];

  for (const admin of adminUsers) {
    db.auditLog.push({
      id: id("audit"),
      action: "admin-alert-generated",
      at: new Date().toISOString(),
      actor: "system",
      detail: `Prepared ${type} request alert for ${admin.username}.`,
    });
  }

  const deliveries = [];
  if (company.adminNotificationEmail) {
    deliveries.push(sendResendEmail(company.adminNotificationEmail, subject, message));
  }
  if (company.adminNotificationCellphone) {
    deliveries.push(sendAfricasTalkingSms(company.adminNotificationCellphone, message));
  }
  if (!deliveries.length) return;
  await Promise.allSettled(deliveries);
}

function buildPayrollRunRecord(employee, body, createdBy, company) {
  const input = normalizePayrollInput({
    payrollMonth: body.payrollMonth,
    employeeName: employee.fullName,
    workerCategory: employee.workerCategory,
    startDate: employee.startDate,
    daysPerWeek: employee.daysPerWeek,
    hoursPerDay: employee.hoursPerDay,
    basicWage: employee.basicWage,
    allowances: Number(body.allowances ?? employee.taxableAllowances),
    bonus: Number(body.bonus ?? employee.standardBonus),
    otherDeductions: Number(body.otherDeductions || 0),
    overtimeHours: Number(body.overtimeHours || 0),
    maxDailyOvertime: Number(body.maxDailyOvertime || 0),
    maxWeeklyOvertime: Number(body.maxWeeklyOvertime || 0),
    sundayHours: Number(body.sundayHours || 0),
    ordinarilyWorksSunday: Boolean(body.ordinarilyWorksSunday),
    publicHolidayHours: Number(body.publicHolidayHours || 0),
    publicHolidayOrdinaryDay: Boolean(body.publicHolidayOrdinaryDay),
    nightHours: Number(body.nightHours || 0),
    annualLeaveUsed: Number(body.annualLeaveUsed ?? employee.leaveBalances.annualLeaveUsed),
    sickLeaveUsed: Number(body.sickLeaveUsed ?? employee.leaveBalances.sickLeaveUsed),
  });

  return {
    run: {
      id: id("run"),
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.fullName,
      payrollMonth: input.payrollMonth,
      status: "active",
      createdAt: new Date().toISOString(),
      createdBy,
      companySnapshot: sanitizeCompany(company),
      input,
      result: calculatePayroll(input),
    },
    input,
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  rows.forEach((row) => {
    lines.push(row.map(csvEscape).join(","));
  });
  return lines.join("\n");
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(current);
      current = "";
    } else if (char === "\n") {
      row.push(current.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current.length || row.length) {
    row.push(current.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => String(cell || "").trim()));
}

async function createBackupFile(db, label = "manual") {
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(db, null, 2));
  return filename;
}

async function listBackupFiles() {
  const names = await fs.readdir(BACKUPS_DIR);
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        const filePath = path.join(BACKUPS_DIR, name);
        const stat = await fs.stat(filePath);
        return {
          name,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
        };
      }),
  );
  return files.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function buildFinanceExport(db, month, type) {
  const runs = (db.payrollRuns || []).filter((item) => item.payrollMonth === month);
  const employees = new Map((db.employees || []).map((item) => [item.id, item]));

  if (type === "bank-payments") {
    return {
      filename: `bank-payments-${month}.csv`,
      contentType: "text/csv; charset=utf-8",
      content: toCsv(
        ["Employee Number", "Employee", "Bank", "Account Number", "Net Pay", "Reference"],
        runs.map((run) => {
          const employee = employees.get(run.employeeId) || {};
          return [
            run.employeeNumber,
            run.employeeName,
            employee.bankName || "",
            employee.accountNumber || "",
            Number(run.result?.metrics?.netPay || 0).toFixed(2),
            `Payroll ${run.payrollMonth}`,
          ];
        }),
      ),
    };
  }

  if (type === "payroll-journal") {
    return {
      filename: `payroll-journal-${month}.csv`,
      contentType: "text/csv; charset=utf-8",
      content: toCsv(
        ["Employee", "Department", "Gross", "PAYE", "Employee SSC", "Employer SSC", "Net Pay", "Employer Cost"],
        runs.map((run) => {
          const employee = employees.get(run.employeeId) || {};
          return [
            run.employeeName,
            employee.department || "Unassigned",
            Number(run.result?.metrics?.taxableGross || 0).toFixed(2),
            Number(run.result?.metrics?.paye || 0).toFixed(2),
            Number(run.result?.metrics?.employeeSsc || 0).toFixed(2),
            Number(run.result?.metrics?.employerSsc || 0).toFixed(2),
            Number(run.result?.metrics?.netPay || 0).toFixed(2),
            Number(run.result?.metrics?.totalEmployerCost || 0).toFixed(2),
          ];
        }),
      ),
    };
  }

  if (type === "deduction-schedule") {
    return {
      filename: `deduction-schedule-${month}.csv`,
      contentType: "text/csv; charset=utf-8",
      content: toCsv(
        ["Employee", "PAYE", "Employee SSC", "Other Deductions", "Total Deductions"],
        runs.map((run) => {
          const paye = Number(run.result?.metrics?.paye || 0);
          const employeeSsc = Number(run.result?.metrics?.employeeSsc || 0);
          const other = Number(run.input?.otherDeductions || 0);
          return [
            run.employeeName,
            paye.toFixed(2),
            employeeSsc.toFixed(2),
            other.toFixed(2),
            (paye + employeeSsc + other).toFixed(2),
          ];
        }),
      ),
    };
  }

  return null;
}

function buildDataExport(db, type) {
  if (type === "full-json") {
    return {
      filename: `payroll-data-${new Date().toISOString().slice(0, 10)}.json`,
      contentType: "application/json; charset=utf-8",
      content: JSON.stringify(db, null, 2),
    };
  }

  if (type === "employees-csv") {
    return {
      filename: "employees.csv",
      contentType: "text/csv; charset=utf-8",
      content: toCsv(
        [
          "employeeNumber",
          "fullName",
          "idNumber",
          "department",
          "title",
          "workerCategory",
          "startDate",
          "daysPerWeek",
          "hoursPerDay",
          "basicWage",
          "taxableAllowances",
          "standardBonus",
          "bankName",
          "accountNumber",
          "annualLeaveUsed",
          "sickLeaveUsed",
        ],
        (db.employees || [])
          .filter((employee) => employee.status !== "archived")
          .map((employee) => [
            employee.employeeNumber,
            employee.fullName,
            employee.idNumber,
            employee.department,
            employee.title,
            employee.workerCategory,
            employee.startDate,
            employee.daysPerWeek,
            employee.hoursPerDay,
            employee.basicWage,
            employee.taxableAllowances,
            employee.standardBonus,
            employee.bankName,
            employee.accountNumber,
            employee.leaveBalances?.annualLeaveUsed || 0,
            employee.leaveBalances?.sickLeaveUsed || 0,
          ]),
      ),
    };
  }

  if (type === "payroll-runs-csv") {
    return {
      filename: "payroll-runs.csv",
      contentType: "text/csv; charset=utf-8",
      content: toCsv(
        ["payrollMonth", "employeeNumber", "employeeName", "gross", "paye", "employeeSsc", "netPay"],
        (db.payrollRuns || []).map((run) => [
          run.payrollMonth,
          run.employeeNumber,
          run.employeeName,
          Number(run.result?.metrics?.taxableGross || 0).toFixed(2),
          Number(run.result?.metrics?.paye || 0).toFixed(2),
          Number(run.result?.metrics?.employeeSsc || 0).toFixed(2),
          Number(run.result?.metrics?.netPay || 0).toFixed(2),
        ]),
      ),
    };
  }

  return null;
}

function monthsBetween(startDate, endDate = new Date()) {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, (endDate.getUTCFullYear() - start.getUTCFullYear()) * 12 + (endDate.getUTCMonth() - start.getUTCMonth()));
}

function buildLeaveAccrualRules(employees) {
  return (employees || [])
    .filter((employee) => employee.status !== "archived")
    .map((employee) => {
      const months = monthsBetween(employee.startDate);
      const annualEntitlement = Number(employee.daysPerWeek || 5) * 4;
      const accruedDays = Math.min((annualEntitlement / 12) * Math.min(months, 12), annualEntitlement);
      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        employeeNumber: employee.employeeNumber,
        monthsOfService: months,
        annualEntitlement,
        accruedDays,
        annualUsed: Number(employee.leaveBalances?.annualLeaveUsed || 0),
        annualRemaining: Math.max(accruedDays - Number(employee.leaveBalances?.annualLeaveUsed || 0), 0),
      };
    })
    .sort((left, right) => right.monthsOfService - left.monthsOfService);
}

function buildHolidayCalendar(year) {
  const keys = [...getNamibiaPublicHolidays(year)].sort();
  return keys.map((key) => ({
    date: key,
    label: new Date(`${key}T00:00:00`).toLocaleDateString("en-NA", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
  }));
}

function buildComplianceSummary(db, month, year) {
  const runs = (db.payrollRuns || []).filter((item) => item.payrollMonth === month);
  const leaveRules = buildLeaveAccrualRules(db.employees);
  const sscAssessable = runs.reduce((sum, item) => sum + Number(item.result?.metrics?.sscAssessableBasic || 0), 0);
  return {
    emp201: {
      month,
      employeesFiled: runs.length,
      taxableRemuneration: runs.reduce((sum, item) => sum + Number(item.result?.metrics?.taxableGross || 0), 0),
      payeDue: runs.reduce((sum, item) => sum + Number(item.result?.metrics?.paye || 0), 0),
      employeeSscWithheld: runs.reduce((sum, item) => sum + Number(item.result?.metrics?.employeeSsc || 0), 0),
      employerSscContribution: runs.reduce((sum, item) => sum + Number(item.result?.metrics?.employerSsc || 0), 0),
    },
    sscRemittance: {
      month,
      employeesCovered: runs.length,
      assessableBasicWages: sscAssessable,
      employeeContribution: runs.reduce((sum, item) => sum + Number(item.result?.metrics?.employeeSsc || 0), 0),
      employerContribution: runs.reduce((sum, item) => sum + Number(item.result?.metrics?.employerSsc || 0), 0),
      dueDateHint: "Within 20 days after month-end.",
    },
    leaveAccrualRules: leaveRules,
    holidayCalendar: buildHolidayCalendar(year),
  };
}

function moneyValue(value) {
  return `N$${Number(value || 0).toFixed(2)}`;
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdfDocument(contentStream) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function buildPdfFromLines(lines) {
  const contentStream = [
    "BT",
    "/F1 12 Tf",
    "50 790 Td",
    "16 TL",
    ...lines.map((line, index) => `${index === 0 ? "" : "T* "}(${escapePdfText(line)}) Tj`.trim()),
    "ET",
  ].join("\n");
  return buildPdfDocument(contentStream);
}

function pdfText(x, y, text, options = {}) {
  const font = options.bold ? "/F2" : "/F1";
  const size = options.size || 12;
  const color = options.color || "0 0 0";
  return `BT ${color} rg ${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`;
}

function pdfRect(x, y, width, height, color) {
  return `${color} rg ${x} ${y} ${width} ${height} re f`;
}

function pdfLine(x1, y1, x2, y2, color = "0.85 0.88 0.92", width = 1) {
  return `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function wrapPdfText(value, maxChars = 44) {
  const text = String(value || "").trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function buildPayslipPdf(run, company) {
  const metrics = run.result.metrics;
  const pdfCompany = sanitizeCompany(company || run.companySnapshot || {});
  const totalDeductions = Number(metrics.employeeSsc || 0) + Number(metrics.paye || 0) + Number(run.input.otherDeductions || 0);
  const addressLines = wrapPdfText(pdfCompany.physicalAddress || "", 54);
  const contactLine = [pdfCompany.email, pdfCompany.cellphone, pdfCompany.website].filter(Boolean).join("   |   ");
  const commands = [
    pdfRect(0, 0, 595, 842, "1 1 1"),
    pdfText(44, 795, pdfCompany.name || "NamPayroll", { bold: true, size: 22, color: "0 0 0" }),
    pdfText(44, 775, "Employee Payslip", { size: 11, color: "0 0 0" }),
    pdfLine(44, 768, 551, 768, "0 0 0", 1.2),
    pdfText(44, 744, `Payroll Month  ${run.payrollMonth}`, { bold: true, size: 12, color: "0 0 0" }),
    pdfText(360, 744, `Net Pay  ${moneyValue(metrics.netPay)}`, { bold: true, size: 12, color: "0 0 0" }),
    pdfRect(28, 608, 260, 72, "1 1 1"),
    pdfRect(307, 608, 260, 72, "1 1 1"),
    pdfText(44, 660, "Employee", { size: 9, color: "0.35 0.35 0.35" }),
    pdfText(44, 640, run.employeeName, { bold: true, size: 15, color: "0 0 0" }),
    pdfText(44, 620, `${run.employeeNumber}   |   Created by ${run.createdBy}`, { size: 10, color: "0.25 0.25 0.25" }),
    pdfText(323, 660, "Company Contact", { size: 9, color: "0.35 0.35 0.35" }),
    ...addressLines.map((line, index) => pdfText(323, 640 - index * 14, line, { bold: index === 0 && addressLines.length === 1, size: 10, color: "0 0 0" })),
    ...(contactLine ? [pdfText(323, 612, contactLine, { size: 9, color: "0.25 0.25 0.25" })] : []),
    pdfText(44, 575, "Earnings", { bold: true, size: 12, color: "0 0 0" }),
    pdfText(323, 575, "Deductions and Leave", { bold: true, size: 12, color: "0 0 0" }),
    pdfRect(28, 340, 260, 220, "1 1 1"),
    pdfRect(307, 340, 260, 220, "1 1 1"),
  ];

  const earnings = [
    ["Basic wage", moneyValue(run.input.basicWage)],
    ["Allowances", moneyValue(run.input.allowances)],
    ["Bonus", moneyValue(run.input.bonus)],
    ["Overtime", moneyValue(metrics.overtimePay)],
    ["Sunday pay", moneyValue(metrics.sundayPay)],
    ["Holiday pay", moneyValue(metrics.publicHolidayPay)],
    ["Night premium", moneyValue(metrics.nightPremium)],
    ["Gross remuneration", moneyValue(metrics.taxableGross)],
  ];
  const deductions = [
    ["Employee SSC", moneyValue(metrics.employeeSsc)],
    ["PAYE", moneyValue(metrics.paye)],
    ["Other deductions", moneyValue(run.input.otherDeductions)],
    ["Total deductions", moneyValue(totalDeductions)],
    ["Annual leave left", `${Number(run.result.leave?.annualRemaining || 0).toFixed(1)} days`],
    ["Sick leave left", `${Number(run.result.leave?.sickRemaining || 0).toFixed(1)} days`],
    ["Hourly basic", moneyValue(metrics.hourlyBasic)],
    ["Minimum hourly", moneyValue(metrics.minimumHourly)],
  ];

  earnings.forEach(([label, value], index) => {
    const y = 540 - index * 24;
    commands.push(pdfText(44, y, label, { size: 10, color: "0.34 0.39 0.45" }));
    commands.push(pdfText(256, y, value, { bold: true, size: 10, color: "0.10 0.13 0.17" }));
    if (index < earnings.length - 1) commands.push(pdfLine(42, y - 8, 274, y - 8));
  });

  deductions.forEach(([label, value], index) => {
    const y = 540 - index * 24;
    commands.push(pdfText(323, y, label, { size: 10, color: "0.34 0.39 0.45" }));
    commands.push(pdfText(530, y, value, { bold: true, size: 10, color: "0.10 0.13 0.17" }));
    if (index < deductions.length - 1) commands.push(pdfLine(321, y - 8, 553, y - 8));
  });

  commands.push(
    pdfRect(28, 256, 168, 64, "1 1 1"),
    pdfRect(214, 256, 168, 64, "1 1 1"),
    pdfRect(400, 256, 167, 64, "1 1 1"),
    pdfLine(28, 320, 196, 320, "0 0 0", 1),
    pdfLine(214, 320, 382, 320, "0 0 0", 1),
    pdfLine(400, 320, 567, 320, "0 0 0", 1),
    pdfText(44, 298, "Gross", { size: 10, color: "0.25 0.25 0.25" }),
    pdfText(44, 274, moneyValue(metrics.taxableGross), { bold: true, size: 18, color: "0 0 0" }),
    pdfText(230, 298, "Deductions", { size: 10, color: "0.25 0.25 0.25" }),
    pdfText(230, 274, moneyValue(totalDeductions), { bold: true, size: 18, color: "0 0 0" }),
    pdfText(416, 298, "Net Pay", { size: 10, color: "0.25 0.25 0.25" }),
    pdfText(416, 274, moneyValue(metrics.netPay), { bold: true, size: 18, color: "0 0 0" }),
    pdfText(44, 220, "Generated by NamPayroll", { size: 9, color: "0.34 0.39 0.45" }),
  );

  if (run.status === "cancelled") {
    commands.push(
      pdfRect(28, 816, 160, 16, "0.74 0.30 0.20"),
      pdfText(36, 820, "CANCELLED PAYROLL RUN", { bold: true, size: 9, color: "1 1 1" }),
    );
  }

  return buildPdfDocument(commands.join("\n"));
}

function documentTypeLabel(documentType) {
  if (documentType === "offer-letter") return "Offer Letter";
  if (documentType === "leave-form") return "Leave Form";
  if (documentType === "disciplinary-letter") return "Disciplinary Letter";
  if (documentType === "termination-form") return "Termination Form";
  return "HR Document";
}

function buildHrDocumentPdf(employee, company, payload) {
  const docType = String(payload.documentType || "");
  const title = documentTypeLabel(docType);
  const issueDate = String(payload.issueDate || new Date().toISOString().slice(0, 10));
  const effectiveDate = String(payload.effectiveDate || employee.startDate || "");
  const subject = String(payload.subject || "").trim();
  const leaveType = String(payload.leaveType || "").trim();
  const startDate = String(payload.startDate || "").trim();
  const endDate = String(payload.endDate || "").trim();
  const incidentDate = String(payload.incidentDate || "").trim();
  const compensation = String(payload.compensation || "").trim();
  const reason = String(payload.reason || "").trim();
  const notes = String(payload.notes || "").trim();
  const signatory = String(payload.signatory || "HR Manager").trim();
  const pdfCompany = sanitizeCompany(company);

  const lines = [
    pdfCompany.name || "Company",
    pdfCompany.physicalAddress || "",
    [pdfCompany.email, pdfCompany.cellphone, pdfCompany.website].filter(Boolean).join(" | "),
    "",
    title,
    `Issue date: ${issueDate}`,
    "",
    `Employee: ${employee.fullName}`,
    `Employee number: ${employee.employeeNumber}`,
    `Department: ${employee.department || "Unassigned"}`,
    `Position: ${employee.title || "Employee"}`,
    "",
  ];

  if (docType === "offer-letter") {
    lines.push(
      `Start date: ${effectiveDate || "To be confirmed"}`,
      `Monthly basic wage: ${compensation ? `N$${Number(compensation || 0).toFixed(2)}` : moneyValue(employee.basicWage)}`,
      `Subject: ${subject || "Employment offer"}`,
      "",
      `We are pleased to offer ${employee.fullName} employment with ${pdfCompany.name || "the company"}.`,
      notes || "This appointment is subject to the company policies, labour law requirements, and the signed employment contract.",
    );
  } else if (docType === "leave-form") {
    lines.push(
      `Leave type: ${leaveType || "Annual leave"}`,
      `Start date: ${startDate || "Not set"}`,
      `End date: ${endDate || "Not set"}`,
      `Reason: ${reason || "Not provided"}`,
      "",
      notes || "This form records the employee leave request and approval details for internal payroll and labour compliance records.",
    );
  } else if (docType === "disciplinary-letter") {
    lines.push(
      `Subject: ${subject || "Notice of disciplinary action"}`,
      `Incident date: ${incidentDate || "Not set"}`,
      `Effective date: ${effectiveDate || issueDate}`,
      `Reason: ${reason || "Conduct matter"}`,
      "",
      notes || "You are required to respond to this notice in line with the disciplinary process and company code of conduct.",
    );
  } else if (docType === "termination-form") {
    lines.push(
      `Termination date: ${effectiveDate || "Not set"}`,
      `Reason: ${reason || "Operational or employment separation reason"}`,
      `Subject: ${subject || "Termination of employment"}`,
      "",
      notes || "This form records the termination decision, notice details, and handover expectations for payroll and HR administration.",
    );
  } else {
    lines.push(notes || "No document details supplied.");
  }

  lines.push("", `Signed by: ${signatory}`);
  return buildPdfFromLines(lines.filter((line, index, items) => line || (index > 0 && items[index - 1])));
}

function matchRoute(method, pathname, routeMethod, routePath) {
  if (method !== routeMethod) return null;
  const actual = pathname.split("/").filter(Boolean);
  const expected = routePath.split("/").filter(Boolean);
  if (actual.length !== expected.length) return null;
  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    const target = expected[index];
    const value = actual[index];
    if (target.startsWith(":")) params[target.slice(1)] = value;
    else if (target !== value) return null;
  }
  return params;
}

function monthlySummary(payrollRuns, month) {
  const runs = activePayrollRuns(payrollRuns).filter((item) => item.payrollMonth === month);
  return {
    month,
    runCount: runs.length,
    gross: runs.reduce((sum, item) => sum + item.result.metrics.taxableGross, 0),
    net: runs.reduce((sum, item) => sum + item.result.metrics.netPay, 0),
    paye: runs.reduce((sum, item) => sum + item.result.metrics.paye, 0),
    employeeSsc: runs.reduce((sum, item) => sum + item.result.metrics.employeeSsc, 0),
    employerSsc: runs.reduce((sum, item) => sum + item.result.metrics.employerSsc, 0),
    employerCost: runs.reduce((sum, item) => sum + item.result.metrics.totalEmployerCost, 0),
  };
}

function monthWindow(month) {
  const [yearString, monthString] = String(month || "").split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    const fallback = new Date();
    return monthWindow(fallback.toISOString().slice(0, 7));
  }
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, end };
}

function isIsoInMonth(isoValue, month) {
  if (!isoValue) return false;
  const { start, end } = monthWindow(month);
  const value = new Date(isoValue);
  return value >= start && value < end;
}

function isCancelledPayrollRun(run) {
  return String(run?.status || "").toLowerCase() === "cancelled";
}

function activePayrollRuns(runs) {
  return (runs || []).filter((run) => !isCancelledPayrollRun(run));
}

function buildDepartmentPayrollCost(runs, employees) {
  const employeeMap = new Map((employees || []).map((employee) => [employee.id, employee]));
  const totals = new Map();

  runs.forEach((run) => {
    const employee = employeeMap.get(run.employeeId);
    const department = employee?.department || "Unassigned";
    const current = totals.get(department) || { department, gross: 0, net: 0, employerCost: 0, employees: new Set() };
    current.gross += Number(run.result?.metrics?.taxableGross || 0);
    current.net += Number(run.result?.metrics?.netPay || 0);
    current.employerCost += Number(run.result?.metrics?.totalEmployerCost || 0);
    current.employees.add(run.employeeId);
    totals.set(department, current);
  });

  return [...totals.values()]
    .map((item) => ({
      department: item.department,
      gross: item.gross,
      net: item.net,
      employerCost: item.employerCost,
      employeeCount: item.employees.size,
    }))
    .sort((left, right) => right.employerCost - left.employerCost);
}

function buildOvertimeTrend(payrollRuns, month) {
  const { start } = monthWindow(month);
  const points = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - offset, 1));
    const label = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}`;
    const runs = activePayrollRuns(payrollRuns).filter((run) => run.payrollMonth === label);
    points.push({
      month: label,
      overtimeHours: runs.reduce((sum, run) => sum + Number(run.input?.overtimeHours || 0), 0),
      overtimePay: runs.reduce((sum, run) => sum + Number(run.result?.metrics?.overtimePay || 0), 0),
      sundayHours: runs.reduce((sum, run) => sum + Number(run.input?.sundayHours || 0), 0),
      publicHolidayHours: runs.reduce((sum, run) => sum + Number(run.input?.publicHolidayHours || 0), 0),
    });
  }

  return points;
}

function buildLeaveLiability(employees) {
  return (employees || [])
    .filter((employee) => employee.status !== "archived")
    .map((employee) => {
      const annualEntitlement = Number(employee.daysPerWeek || 5) * 4;
      const annualUsed = Number(employee.leaveBalances?.annualLeaveUsed || 0);
      const remainingDays = Math.max(annualEntitlement - annualUsed, 0);
      const hourlyRate = Number(employee.basicWage || 0) / Math.max(Number(employee.daysPerWeek || 5) * Number(employee.hoursPerDay || 8) * 4.333, 1);
      const dailyRate = hourlyRate * Number(employee.hoursPerDay || 8);
      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        employeeNumber: employee.employeeNumber,
        department: employee.department || "Unassigned",
        remainingDays,
        estimatedValue: remainingDays * dailyRate,
      };
    })
    .sort((left, right) => right.estimatedValue - left.estimatedValue);
}

function buildLoanExposure(loanRequests, month) {
  const items = (loanRequests || [])
    .filter((request) => request.status === "approved")
    .map((request) => ({
      id: request.id,
      employeeName: request.employeeName,
      employeeNumber: request.employeeNumber,
      amount: Number(request.amount || 0),
      repaymentMonths: Number(request.repaymentMonths || 0),
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt || null,
    }))
    .sort((left, right) => right.amount - left.amount);

  return {
    approvedCount: items.length,
    approvedThisMonth: items.filter((item) => isIsoInMonth(item.reviewedAt || item.requestedAt, month)).length,
    totalOutstandingEstimate: items.reduce((sum, item) => sum + item.amount, 0),
    averageLoanSize: items.length ? items.reduce((sum, item) => sum + item.amount, 0) / items.length : 0,
    largestLoans: items.slice(0, 5),
  };
}

function buildHeadcount(employees) {
  const activeEmployees = (employees || []).filter((employee) => employee.status !== "archived");
  const departments = new Map();

  activeEmployees.forEach((employee) => {
    const department = employee.department || "Unassigned";
    departments.set(department, (departments.get(department) || 0) + 1);
  });

  return {
    total: activeEmployees.length,
    active: activeEmployees.filter((employee) => (employee.status || "active") === "active").length,
    departments: [...departments.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((left, right) => right.count - left.count),
  };
}

const routes = [
  {
    method: "GET",
    path: "/api/health",
    handler: async (req, res) => {
      sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    },
  },
  {
    method: "GET",
    path: "/api/sources",
    handler: async (req, res) => {
      sendJson(res, 200, { items: SOURCE_LIST });
    },
  },
  {
    method: "POST",
    path: "/api/login",
    handler: async (req, res) => {
      const db = await readDb();
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      let user = db.users.find((item) => item.username === username);

      if (!user) {
        const employee = db.employees.find(
          (item) => item.portalAccess?.username === username && item.status !== "archived",
        );
        if (employee && employee.portalAccess?.passwordHash && (await verifyPassword(password, employee.portalAccess.passwordHash))) {
          user = {
            id: `employee-login-${employee.id}`,
            username: employee.portalAccess.username,
            name: employee.fullName,
            role: "employee",
            employeeId: employee.id,
          };
        }
      } else if (!(await verifyPassword(password, user.passwordHash))) {
        user = null;
      }

      if (!user) {
        sendJson(res, 401, { error: "Invalid username or password." });
        return;
      }

      const rawToken = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      db.sessions = db.sessions.filter((item) => item.userId !== user.id);
      db.sessions.push({
        id: id("sess"),
        userId: user.id,
        role: user.role,
        employeeId: user.employeeId || null,
        tokenHash: sha(rawToken),
        createdAt: new Date().toISOString(),
        expiresAt,
      });
      db.auditLog.push({
        id: id("audit"),
        action: "login",
        at: new Date().toISOString(),
        actor: user.username,
        detail: "User logged in.",
      });
      await writeDb(db);

      sendJson(
        res,
        200,
        {
          user: sanitizeUser(user),
          company: sanitizeCompany(db.company),
          bootstrapPasswordWarning: username === "admin" && password === "admin123!",
        },
        {
          "Set-Cookie": `session=${rawToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`,
        },
      );
    },
  },
  {
    method: "POST",
    path: "/api/password-reset-requests",
    handler: async (req, res) => {
      const db = await readDb();
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const idNumber = String(body.idNumber || "").replace(/\D/g, "");
      const employee = (db.employees || []).find(
        (item) =>
          item.status !== "archived" &&
          item.portalAccess?.username === username &&
          (!idNumber || String(item.idNumber || "").replace(/\D/g, "").endsWith(idNumber.slice(-6))),
      );

      if (employee) {
        const request = {
          id: id("reset"),
          employeeId: employee.id,
          employeeName: employee.fullName,
          username,
          requestedAt: new Date().toISOString(),
          status: "pending",
        };
        db.passwordResetRequests.push(request);
        db.auditLog.push({
          id: id("audit"),
          action: "password-reset-requested",
          at: new Date().toISOString(),
          actor: username || "anonymous",
          detail: `Password reset requested for ${employee.fullName}.`,
        });
        createNotification(db, {
          employeeId: employee.id,
          type: "info",
          title: "Password reset request received",
          body: "Your password reset request has been recorded and is awaiting admin action.",
        });
        await writeDb(db);
      }

      sendJson(res, 200, { ok: true, detail: "If the employee details matched, a password reset request has been recorded." });
    },
  },
  {
    method: "POST",
    path: "/api/register-company",
    handler: async (req, res) => {
      const db = await readDb();
      const body = await parseBody(req);

      if (db.company?.registeredAt) {
        sendJson(res, 400, { error: "Company registration has already been completed. Sign in to manage the account." });
        return;
      }

      const companyName = String(body.companyName || "").trim();
      const email = String(body.email || "").trim();
      const cellphone = String(body.cellphone || "").trim();
      const physicalAddress = String(body.physicalAddress || "").trim();
      const website = String(body.website || "").trim();
      const adminName = String(body.adminName || "").trim();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const confirmPassword = String(body.confirmPassword || "");

      if (!companyName || !adminName || !username || !password) {
        sendJson(res, 400, { error: "Company name, admin name, username, and password are required." });
        return;
      }

      if (password.length < 8) {
        sendJson(res, 400, { error: "Password must be at least 8 characters long." });
        return;
      }

      if (password !== confirmPassword) {
        sendJson(res, 400, { error: "Password confirmation does not match." });
        return;
      }

      const usernameTaken =
        (db.users || []).some((item) => item.username === username) ||
        (db.employees || []).some((item) => item.portalAccess?.username === username);
      if (usernameTaken) {
        sendJson(res, 400, { error: "That username is already in use." });
        return;
      }

      const passwordHash = await hashPassword(password);
      const adminUser = {
        id: id("user"),
        username,
        name: adminName,
        role: "admin",
        passwordHash,
      };

      db.company = sanitizeCompany({
        ...db.company,
        name: companyName,
        email,
        cellphone,
        physicalAddress,
        website,
        registeredAt: new Date().toISOString(),
      });
      db.users = [adminUser];
      db.sessions = [];
      db.employees = [];
      db.leaveRequests = [];
      db.loanRequests = [];
      db.timesheets = [];
      db.notifications = [];
      db.passwordResetRequests = [];
      db.payrollRuns = [];
      db.auditLog.push({
        id: id("audit"),
        action: "company-registered",
        at: new Date().toISOString(),
        actor: username,
        detail: `Registered ${companyName} and created the first admin account.`,
      });

      const rawToken = crypto.randomBytes(24).toString("hex");
      db.sessions.push({
        id: id("sess"),
        userId: adminUser.id,
        role: adminUser.role,
        employeeId: null,
        tokenHash: sha(rawToken),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
      });

      await writeDb(db);
      sendJson(
        res,
        200,
        {
          user: sanitizeUser(adminUser),
          company: sanitizeCompany(db.company),
        },
        {
          "Set-Cookie": `session=${rawToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`,
        },
      );
    },
  },
  {
    method: "POST",
    path: "/api/logout",
    handler: requireAuth(async (req, res, params, sessionState) => {
      sessionState.db.sessions = sessionState.db.sessions.filter((item) => item.id !== sessionState.session.id);
      await writeDb(sessionState.db);
      sendJson(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": "session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
        },
      );
    }),
  },
  {
    method: "GET",
    path: "/api/session",
    handler: async (req, res) => {
      const sessionState = await getSession(req);
      if (!sessionState.user) {
        sendJson(res, 200, { authenticated: false });
        return;
      }
      sendJson(res, 200, {
        authenticated: true,
        user: sanitizeUser(sessionState.user),
        company: sanitizeCompany(sessionState.db.company),
      });
    },
  },
  {
    method: "GET",
    path: "/api/company",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      sendJson(res, 200, { item: sanitizeCompany(sessionState.db.company) });
    }),
  },
  {
    method: "PUT",
    path: "/api/company",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      let logoPath = sessionState.db.company.logoPath || "";
      const notifyAdminOnLeaveRequest = body.notifyAdminOnLeaveRequest !== false && body.notifyAdminOnLeaveRequest !== "false";
      const notifyAdminOnLoanRequest = body.notifyAdminOnLoanRequest !== false && body.notifyAdminOnLoanRequest !== "false";
      const notifyAdminOnTimesheet = body.notifyAdminOnTimesheet !== false && body.notifyAdminOnTimesheet !== "false";
      const adminNotificationCellphone = String(body.adminNotificationCellphone || "").trim();

      if (body.removeLogo) {
        logoPath = "";
      }

      if (body.logoDataUrl) {
        logoPath = await persistLogo(body.logoDataUrl);
      }

      if ((notifyAdminOnLeaveRequest || notifyAdminOnLoanRequest || notifyAdminOnTimesheet) && !adminNotificationCellphone) {
        sendJson(res, 400, { error: "Admin alert SMS must be filled in before enabling request notifications." });
        return;
      }

      sessionState.db.company = sanitizeCompany({
        ...sessionState.db.company,
        name: String(body.name || sessionState.db.company.name || "").trim(),
        taxReference: String(body.taxReference || "").trim(),
        sscRegistration: String(body.sscRegistration || "").trim(),
        email: String(body.email || "").trim(),
        cellphone: String(body.cellphone || "").trim(),
        physicalAddress: String(body.physicalAddress || "").trim(),
        website: String(body.website || "").trim(),
        adminNotificationEmail: String(body.adminNotificationEmail || "").trim(),
        adminNotificationCellphone,
        notifyAdminOnLeaveRequest,
        notifyAdminOnLoanRequest,
        notifyAdminOnTimesheet,
        logoPath,
      });

      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "company-updated",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: "Updated company profile.",
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { item: sanitizeCompany(sessionState.db.company) });
    }),
  },
  {
    method: "GET",
    path: "/api/dashboard",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const month = new Date().toISOString().slice(0, 7);
      sendJson(res, 200, {
        company: sanitizeCompany(sessionState.db.company),
        user: sanitizeUser(sessionState.user),
        employees: sessionState.db.employees.filter((item) => item.status !== "archived").length,
        pendingLeaveRequests: (sessionState.db.leaveRequests || []).filter((item) => item.status === "pending").length,
        pendingPasswordResets: (sessionState.db.passwordResetRequests || []).filter((item) => item.status === "pending").length,
        currentMonth: monthlySummary(sessionState.db.payrollRuns, month),
        recentRuns: sessionState.db.payrollRuns.slice(-5).reverse(),
      });
    }),
  },
  {
    method: "GET",
    path: "/api/data/status",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const backups = await listBackupFiles();
      sendJson(res, 200, {
        storage: {
          engine: "sqlite",
          sqlitePath: SQLITE_PATH,
          legacyJsonPath: LEGACY_JSON_PATH,
        },
        counts: {
          employees: (sessionState.db.employees || []).filter((item) => item.status !== "archived").length,
          payrollRuns: (sessionState.db.payrollRuns || []).length,
          leaveRequests: (sessionState.db.leaveRequests || []).length,
          loanRequests: (sessionState.db.loanRequests || []).length,
          timesheets: (sessionState.db.timesheets || []).length,
        },
        backups,
      });
    }),
  },
  {
    method: "GET",
    path: "/api/data/export",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const type = url.searchParams.get("type") || "full-json";
      const exportFile = buildDataExport(sessionState.db, type);
      if (!exportFile) {
        sendJson(res, 400, { error: "Invalid data export type." });
        return;
      }
      sendText(res, 200, exportFile.content, {
        "Content-Type": exportFile.contentType,
        "Content-Disposition": `attachment; filename="${exportFile.filename}"`,
      });
    }),
  },
  {
    method: "POST",
    path: "/api/data/import/employees",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      const csvText = String(body.csvText || "");
      if (!csvText.trim()) {
        sendJson(res, 400, { error: "CSV content is required." });
        return;
      }
      const rows = parseCsv(csvText);
      if (rows.length < 2) {
        sendJson(res, 400, { error: "CSV must include a header row and at least one employee row." });
        return;
      }
      const [headers, ...items] = rows;
      const index = Object.fromEntries(headers.map((name, idx) => [String(name || "").trim(), idx]));
      const created = [];

      for (const row of items) {
        const employeeNumber = String(row[index.employeeNumber] || "").trim();
        const fullName = String(row[index.fullName] || "").trim();
        if (!employeeNumber || !fullName) continue;
        const existing = (sessionState.db.employees || []).find((item) => item.employeeNumber === employeeNumber);
        if (existing) continue;
        const idNumber = String(row[index.idNumber] || "").trim();
        const portalAccess = buildEmployeePortal(employeeNumber, idNumber);
        portalAccess.passwordHash = await hashPassword(portalAccess.tempPassword);
        const employee = {
          id: id("emp"),
          employeeNumber,
          fullName,
          idNumber,
          department: String(row[index.department] || "").trim(),
          title: String(row[index.title] || "").trim(),
          workerCategory: String(row[index.workerCategory] || "general").trim() || "general",
          startDate: String(row[index.startDate] || "").trim(),
          payFrequency: "monthly",
          daysPerWeek: Number(row[index.daysPerWeek] || 5),
          hoursPerDay: Number(row[index.hoursPerDay] || 8),
          basicWage: Number(row[index.basicWage] || 0),
          taxableAllowances: Number(row[index.taxableAllowances] || 0),
          standardBonus: Number(row[index.standardBonus] || 0),
          bankName: String(row[index.bankName] || "").trim(),
          accountNumber: String(row[index.accountNumber] || "").trim(),
          leaveBalances: {
            ...defaultLeaveBalances(),
            annualLeaveUsed: Number(row[index.annualLeaveUsed] || 0),
            sickLeaveUsed: Number(row[index.sickLeaveUsed] || 0),
          },
          profile: {
            ...defaultEmployeeProfile(),
          },
          portalAccess,
          status: "active",
          createdAt: new Date().toISOString(),
        };
        sessionState.db.employees.push(employee);
        created.push(sanitizeEmployee(employee));
      }

      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "employees-imported",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Imported ${created.length} employees from CSV.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { items: created, imported: created.length });
    }),
  },
  {
    method: "GET",
    path: "/api/data/backups",
    handler: requireAdmin(async (req, res) => {
      sendJson(res, 200, { items: await listBackupFiles() });
    }),
  },
  {
    method: "POST",
    path: "/api/data/backups",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const filename = await createBackupFile(sessionState.db, "backup");
      sendJson(res, 201, { filename });
    }),
  },
  {
    method: "POST",
    path: "/api/data/restore",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      let nextDb;
      if (body.backupName) {
        const raw = await fs.readFile(path.join(BACKUPS_DIR, path.basename(String(body.backupName))), "utf8");
        nextDb = JSON.parse(raw);
      } else if (body.jsonText) {
        nextDb = JSON.parse(String(body.jsonText));
      } else {
        sendJson(res, 400, { error: "Provide either a backup name or JSON content to restore." });
        return;
      }
      await writeDb(nextDb);
      sendJson(res, 200, { ok: true });
    }),
  },
  {
    method: "GET",
    path: "/api/employees",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      sendJson(res, 200, {
        items: sessionState.db.employees
          .filter((item) => item.status !== "archived")
          .map(sanitizeEmployee),
      });
    }),
  },
  {
    method: "POST",
    path: "/api/employees",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      const portalAccess = buildEmployeePortal(body.employeeNumber || `EMP-${String(sessionState.db.employees.length + 1).padStart(3, "0")}`, body.idNumber);
      portalAccess.passwordHash = await hashPassword(portalAccess.tempPassword);
      const employee = {
        id: id("emp"),
        employeeNumber: String(body.employeeNumber || "").trim() || `EMP-${String(sessionState.db.employees.length + 1).padStart(3, "0")}`,
        fullName: String(body.fullName || "").trim(),
        idNumber: String(body.idNumber || "").trim(),
        department: String(body.department || "").trim(),
        title: String(body.title || "").trim(),
        workerCategory: String(body.workerCategory || "general"),
        startDate: String(body.startDate || ""),
        payFrequency: "monthly",
        daysPerWeek: Number(body.daysPerWeek || 5),
        hoursPerDay: Number(body.hoursPerDay || 9),
        basicWage: Number(body.basicWage || 0),
        taxableAllowances: Number(body.taxableAllowances || 0),
        standardBonus: Number(body.standardBonus || 0),
        bankName: String(body.bankName || "").trim(),
        accountNumber: String(body.accountNumber || "").trim(),
        leaveBalances: {
          ...defaultLeaveBalances(),
          annualLeaveUsed: Number(body.annualLeaveUsed || 0),
          sickLeaveUsed: Number(body.sickLeaveUsed || 0),
        },
        profile: {
          ...defaultEmployeeProfile(),
          personalEmail: String(body.personalEmail || "").trim(),
          cellphone: String(body.cellphone || "").trim(),
        },
        portalAccess,
        status: "active",
        createdAt: new Date().toISOString(),
      };

      sessionState.db.employees.push(employee);
      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "employee-created",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Created employee ${employee.fullName}.`,
      });
      createNotification(sessionState.db, {
        employeeId: employee.id,
        type: "info",
        title: "Portal account created",
        body: `Your employee self-service account is ready with username ${employee.portalAccess.username}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 201, { item: sanitizeEmployee(employee) });
    }),
  },
  {
    method: "PUT",
    path: "/api/employees/:employeeId",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const employee = sessionState.db.employees.find((item) => item.id === params.employeeId);
      if (!employee) {
        sendJson(res, 404, { error: "Employee not found." });
        return;
      }

      const body = await parseBody(req);
      const nextEmployeeNumber = String(body.employeeNumber || employee.employeeNumber).trim();
      const nextIdNumber = String(body.idNumber || employee.idNumber).trim();

      Object.assign(employee, {
        employeeNumber: nextEmployeeNumber,
        fullName: String(body.fullName || employee.fullName).trim(),
        idNumber: nextIdNumber,
        department: String(body.department || employee.department).trim(),
        title: String(body.title || employee.title).trim(),
        workerCategory: String(body.workerCategory || employee.workerCategory),
        startDate: String(body.startDate || employee.startDate),
        daysPerWeek: Number(body.daysPerWeek || employee.daysPerWeek),
        hoursPerDay: Number(body.hoursPerDay || employee.hoursPerDay),
        basicWage: Number(body.basicWage || employee.basicWage),
        taxableAllowances: Number(body.taxableAllowances || employee.taxableAllowances),
        standardBonus: Number(body.standardBonus || employee.standardBonus),
        bankName: String(body.bankName || employee.bankName).trim(),
        accountNumber: String(body.accountNumber || employee.accountNumber).trim(),
        leaveBalances: {
          ...defaultLeaveBalances(),
          annualLeaveUsed: Number(body.annualLeaveUsed ?? employee.leaveBalances.annualLeaveUsed),
          sickLeaveUsed: Number(body.sickLeaveUsed ?? employee.leaveBalances.sickLeaveUsed),
        },
        profile: {
          ...defaultEmployeeProfile(),
          ...(employee.profile || {}),
          personalEmail: String(body.personalEmail || employee.profile?.personalEmail || "").trim(),
          cellphone: String(body.cellphone || employee.profile?.cellphone || "").trim(),
        },
      });
      if (employee.portalAccess) {
        employee.portalAccess.username = nextEmployeeNumber.toLowerCase();
        if (!employee.portalAccess.passwordHash) {
          employee.portalAccess.passwordHash = await hashPassword(employee.portalAccess.tempPassword || buildEmployeePortal(nextEmployeeNumber, nextIdNumber).tempPassword);
        }
      }

      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "employee-updated",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Updated employee ${employee.fullName}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { item: sanitizeEmployee(employee) });
    }),
  },
  {
    method: "DELETE",
    path: "/api/employees/:employeeId",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const employee = sessionState.db.employees.find((item) => item.id === params.employeeId);
      if (!employee) {
        sendJson(res, 404, { error: "Employee not found." });
        return;
      }

      employee.status = "archived";
      employee.archivedAt = new Date().toISOString();

      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "employee-archived",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Archived employee ${employee.fullName}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { ok: true, item: sanitizeEmployee(employee) });
    }),
  },
  {
    method: "GET",
    path: "/api/leave-requests",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const items = (sessionState.db.leaveRequests || []).slice().reverse().map(sanitizeLeaveRequest);
      sendJson(res, 200, { items });
    }),
  },
  {
    method: "POST",
    path: "/api/leave-requests",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      const scopedEmployeeId = sessionState.user.role === "employee" ? sessionState.user.employeeId : body.employeeId;
      const employee = sessionState.db.employees.find((item) => item.id === scopedEmployeeId && item.status !== "archived");
      if (!employee) {
        sendJson(res, 404, { error: "Employee not found." });
        return;
      }

      const startDate = String(body.startDate || "");
      const endDate = String(body.endDate || "");
      const daysRequested = calculateWorkingLeaveDays(startDate, endDate, employee.daysPerWeek);
      if (!daysRequested) {
        sendJson(res, 400, { error: "Enter a valid start and end date that includes at least one ordinary work day after weekends and public holidays are excluded." });
        return;
      }

      const leaveRequest = {
        id: id("leave"),
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        employeeName: employee.fullName,
        leaveType: String(body.leaveType || "annual"),
        startDate,
        endDate,
        daysRequested,
        calendarDaysRequested: calculateLeaveDays(startDate, endDate),
        reason: String(body.reason || "").trim(),
        status: "pending",
        appliedToBalance: false,
        appliedDays: 0,
        requestedAt: new Date().toISOString(),
        requestedBy: sessionState.user.username,
      };

      sessionState.db.leaveRequests = sessionState.db.leaveRequests || [];
      const overlappingRequest = findOverlappingLeaveRequest(sessionState.db.leaveRequests, leaveRequest);
      if (overlappingRequest) {
        sendJson(res, 409, {
          error: `Leave request overlaps with ${overlappingRequest.employeeName}'s ${overlappingRequest.status} request from ${overlappingRequest.startDate} to ${overlappingRequest.endDate}.`,
        });
        return;
      }

      sessionState.db.leaveRequests.push(leaveRequest);
      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "leave-request-created",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Created ${leaveRequest.leaveType} leave request for ${employee.fullName}.`,
      });
      await sendAdminRequestAlert(
        sessionState.db,
        "leave",
        `Leave request from ${employee.fullName}`,
        `${employee.fullName} requested ${leaveRequest.leaveType} leave from ${leaveRequest.startDate} to ${leaveRequest.endDate}.`,
      );
      await writeDb(sessionState.db);
      sendJson(res, 201, { item: sanitizeLeaveRequest(leaveRequest) });
    }),
  },
  {
    method: "PATCH",
    path: "/api/leave-requests/:requestId",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const request = (sessionState.db.leaveRequests || []).find((item) => item.id === params.requestId);
      if (!request) {
        sendJson(res, 404, { error: "Leave request not found." });
        return;
      }

      const body = await parseBody(req);
      const nextStatus = String(body.status || "").trim();
      if (!["pending", "approved", "declined"].includes(nextStatus)) {
        sendJson(res, 400, { error: "Invalid leave request status." });
        return;
      }

      const employee = sessionState.db.employees.find((item) => item.id === request.employeeId);
      if (!employee) {
        sendJson(res, 404, { error: "Employee linked to this leave request was not found." });
        return;
      }

      if (["pending", "approved"].includes(nextStatus)) {
        const overlappingRequest = findOverlappingLeaveRequest(sessionState.db.leaveRequests || [], {
          ...request,
          status: nextStatus,
        });
        if (overlappingRequest) {
          sendJson(res, 409, {
            error: `Leave request overlaps with another ${overlappingRequest.status} request from ${overlappingRequest.startDate} to ${overlappingRequest.endDate}.`,
          });
          return;
        }
      }

      applyLeaveRequestBalanceEffect(employee, request, nextStatus);
      request.status = nextStatus;
      request.reviewedAt = new Date().toISOString();
      request.reviewedBy = sessionState.user.username;
      request.reviewNote = String(body.reviewNote || "").trim();
      createNotification(sessionState.db, {
        employeeId: request.employeeId,
        type: nextStatus === "approved" ? "success" : "info",
        title: `Leave request ${nextStatus}`,
        body: `${request.leaveType} leave from ${request.startDate} to ${request.endDate} was ${nextStatus}.`,
      });

      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "leave-request-reviewed",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `${nextStatus} leave request ${request.id} for ${request.employeeName}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { item: sanitizeLeaveRequest(request) });
    }),
  },
  {
    method: "GET",
    path: "/api/loan-requests",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      sendJson(res, 200, { items: (sessionState.db.loanRequests || []).slice().reverse().map(sanitizeLoanRequest) });
    }),
  },
  {
    method: "PATCH",
    path: "/api/loan-requests/:requestId",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const request = (sessionState.db.loanRequests || []).find((item) => item.id === params.requestId);
      if (!request) {
        sendJson(res, 404, { error: "Loan request not found." });
        return;
      }

      const body = await parseBody(req);
      const nextStatus = String(body.status || "").trim();
      if (!["pending", "approved", "declined"].includes(nextStatus)) {
        sendJson(res, 400, { error: "Invalid loan request status." });
        return;
      }

      request.status = nextStatus;
      request.reviewedAt = new Date().toISOString();
      request.reviewedBy = sessionState.user.username;
      request.reviewNote = String(body.reviewNote || "").trim();
      createNotification(sessionState.db, {
        employeeId: request.employeeId,
        type: nextStatus === "approved" ? "success" : "info",
        title: `Loan request ${nextStatus}`,
        body: `Your loan request for ${moneyValue(request.amount)} was ${nextStatus}.`,
      });

      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "loan-request-reviewed",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `${nextStatus} loan request ${request.id} for ${request.employeeName}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { item: sanitizeLoanRequest(request) });
    }),
  },
  {
    method: "POST",
    path: "/api/loan-requests",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      const employeeId = sessionState.user.role === "employee" ? sessionState.user.employeeId : body.employeeId;
      const employee = sessionState.db.employees.find((item) => item.id === employeeId && item.status !== "archived");
      if (!employee) {
        sendJson(res, 404, { error: "Employee not found." });
        return;
      }

      const request = {
        id: id("loan"),
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        employeeName: employee.fullName,
        amount: Number(body.amount || 0),
        reason: String(body.reason || "").trim(),
        repaymentMonths: Number(body.repaymentMonths || 1),
        status: "pending",
        requestedAt: new Date().toISOString(),
        requestedBy: sessionState.user.username,
      };
      sessionState.db.loanRequests.push(request);
      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "loan-request-created",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Created loan request for ${employee.fullName}.`,
      });
      await sendAdminRequestAlert(
        sessionState.db,
        "loan",
        `Loan request from ${employee.fullName}`,
        `${employee.fullName} requested a loan of ${moneyValue(request.amount)} over ${request.repaymentMonths} month(s).`,
      );
      await writeDb(sessionState.db);
      sendJson(res, 201, { item: sanitizeLoanRequest(request) });
    }),
  },
  {
    method: "GET",
    path: "/api/timesheets",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      sendJson(res, 200, { items: (sessionState.db.timesheets || []).slice().reverse().map(sanitizeTimesheet) });
    }),
  },
  {
    method: "PATCH",
    path: "/api/timesheets/:timesheetId",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const entry = (sessionState.db.timesheets || []).find((item) => item.id === params.timesheetId);
      if (!entry) {
        sendJson(res, 404, { error: "Timesheet not found." });
        return;
      }

      const body = await parseBody(req);
      const nextStatus = String(body.status || "").trim();
      if (!["submitted", "approved", "rejected"].includes(nextStatus)) {
        sendJson(res, 400, { error: "Invalid timesheet status." });
        return;
      }

      entry.status = nextStatus;
      entry.reviewedAt = new Date().toISOString();
      entry.reviewedBy = sessionState.user.username;
      entry.reviewNote = String(body.reviewNote || "").trim();
      createNotification(sessionState.db, {
        employeeId: entry.employeeId,
        type: nextStatus === "approved" ? "success" : "info",
        title: `Timesheet ${nextStatus}`,
        body: `Your timesheet for ${entry.weekStart} to ${entry.weekEnd} was ${nextStatus}.`,
      });

      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "timesheet-reviewed",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `${nextStatus} timesheet ${entry.id} for ${entry.employeeName}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { item: sanitizeTimesheet(entry) });
    }),
  },
  {
    method: "POST",
    path: "/api/timesheets",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      const employeeId = sessionState.user.role === "employee" ? sessionState.user.employeeId : body.employeeId;
      const employee = sessionState.db.employees.find((item) => item.id === employeeId && item.status !== "archived");
      if (!employee) {
        sendJson(res, 404, { error: "Employee not found." });
        return;
      }

      const entry = {
        id: id("timesheet"),
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        employeeName: employee.fullName,
        weekStart: String(body.weekStart || ""),
        weekEnd: String(body.weekEnd || ""),
        regularHours: Number(body.regularHours || 0),
        overtimeHours: Number(body.overtimeHours || 0),
        sundayHours: Number(body.sundayHours || 0),
        publicHolidayHours: Number(body.publicHolidayHours || 0),
        notes: String(body.notes || "").trim(),
        status: "submitted",
        submittedAt: new Date().toISOString(),
        submittedBy: sessionState.user.username,
      };
      sessionState.db.timesheets.push(entry);
      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "timesheet-submitted",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Submitted timesheet for ${employee.fullName}.`,
      });
      await sendAdminRequestAlert(
        sessionState.db,
        "timesheet",
        `Timesheet submitted by ${employee.fullName}`,
        `${employee.fullName} submitted a timesheet for ${entry.weekStart} to ${entry.weekEnd}.`,
      );
      await writeDb(sessionState.db);
      sendJson(res, 201, { item: sanitizeTimesheet(entry) });
    }),
  },
  {
    method: "POST",
    path: "/api/employee/change-password",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const employee = getEmployeeForSession(sessionState);
      if (!employee) {
        sendJson(res, 403, { error: "Employee access required." });
        return;
      }

      const body = await parseBody(req);
      const currentPassword = String(body.currentPassword || "");
      const nextPassword = String(body.newPassword || "");
      const confirmPassword = String(body.confirmPassword || "");

      if (!currentPassword || !nextPassword || !confirmPassword) {
        sendJson(res, 400, { error: "Current password, new password, and confirmation are required." });
        return;
      }
      if (!(await verifyPassword(currentPassword, employee.portalAccess.passwordHash))) {
        sendJson(res, 400, { error: "Current password is incorrect." });
        return;
      }
      if (nextPassword.length < 8) {
        sendJson(res, 400, { error: "New password must be at least 8 characters long." });
        return;
      }
      if (nextPassword !== confirmPassword) {
        sendJson(res, 400, { error: "New password confirmation does not match." });
        return;
      }

      employee.portalAccess.passwordHash = await hashPassword(nextPassword);
      employee.portalAccess.tempPassword = "";

      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "employee-password-changed",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Employee portal password changed for ${employee.fullName}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { success: true });
    }),
  },
  {
    method: "PATCH",
    path: "/api/employee/profile",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const employee = getEmployeeForSession(sessionState);
      if (!employee) {
        sendJson(res, 403, { error: "Employee access required." });
        return;
      }
      const body = await parseBody(req);
      employee.profile = {
        ...defaultEmployeeProfile(),
        ...(employee.profile || {}),
        personalEmail: String(body.personalEmail || employee.profile?.personalEmail || "").trim(),
        cellphone: String(body.cellphone || employee.profile?.cellphone || "").trim(),
        physicalAddress: String(body.physicalAddress || employee.profile?.physicalAddress || "").trim(),
        nextOfKinName: String(body.nextOfKinName || employee.profile?.nextOfKinName || "").trim(),
        nextOfKinPhone: String(body.nextOfKinPhone || employee.profile?.nextOfKinPhone || "").trim(),
      };
      employee.bankName = String(body.bankName || employee.bankName || "").trim();
      employee.accountNumber = String(body.accountNumber || employee.accountNumber || "").trim();
      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "employee-profile-updated",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Employee profile updated for ${employee.fullName}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { item: sanitizeEmployee(employee) });
    }),
  },
  {
    method: "GET",
    path: "/api/employee/notifications",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const employee = getEmployeeForSession(sessionState);
      if (!employee) {
        sendJson(res, 403, { error: "Employee access required." });
        return;
      }
      const items = (sessionState.db.notifications || [])
        .filter((item) => item.employeeId === employee.id)
        .slice()
        .map(sanitizeNotification);
      sendJson(res, 200, { items });
    }),
  },
  {
    method: "PATCH",
    path: "/api/employee/notifications/:notificationId",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const employee = getEmployeeForSession(sessionState);
      if (!employee) {
        sendJson(res, 403, { error: "Employee access required." });
        return;
      }
      const notification = (sessionState.db.notifications || []).find(
        (item) => item.id === params.notificationId && item.employeeId === employee.id,
      );
      if (!notification) {
        sendJson(res, 404, { error: "Notification not found." });
        return;
      }
      notification.readAt = notification.readAt || new Date().toISOString();
      await writeDb(sessionState.db);
      sendJson(res, 200, { item: sanitizeNotification(notification) });
    }),
  },
  {
    method: "GET",
    path: "/api/employee/me",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const employee = getEmployeeForSession(sessionState);
      if (!employee) {
        sendJson(res, 403, { error: "Employee access required." });
        return;
      }

      const leaveRequests = (sessionState.db.leaveRequests || [])
        .filter((item) => item.employeeId === employee.id)
        .slice()
        .reverse()
        .map(sanitizeLeaveRequest);
      const loanRequests = (sessionState.db.loanRequests || [])
        .filter((item) => item.employeeId === employee.id)
        .slice()
        .reverse()
        .map(sanitizeLoanRequest);
      const timesheets = (sessionState.db.timesheets || [])
        .filter((item) => item.employeeId === employee.id)
        .slice()
        .reverse()
        .map(sanitizeTimesheet);
      const payslips = (sessionState.db.payrollRuns || [])
        .filter((item) => item.employeeId === employee.id && !isCancelledPayrollRun(item))
        .slice()
        .reverse();
      const notifications = (sessionState.db.notifications || [])
        .filter((item) => item.employeeId === employee.id)
        .slice()
        .map(sanitizeNotification);

      sendJson(res, 200, {
        company: sanitizeCompany(sessionState.db.company),
        employee: sanitizeEmployee(employee),
        leaveRequests,
        loanRequests,
        timesheets,
        payslips,
        notifications,
      });
    }),
  },
  {
    method: "GET",
    path: "/api/employee/payslips/:runId",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const employee = getEmployeeForSession(sessionState);
      if (!employee) {
        sendJson(res, 403, { error: "Employee access required." });
        return;
      }
      const run = (sessionState.db.payrollRuns || []).find(
        (item) => item.id === params.runId && item.employeeId === employee.id && !isCancelledPayrollRun(item),
      );
      if (!run) {
        sendJson(res, 404, { error: "Payslip not found." });
        return;
      }
      sendJson(res, 200, { item: run });
    }),
  },
  {
    method: "GET",
    path: "/api/employee/payslips/:runId/pdf",
    handler: requireEmployeeOrAdmin(async (req, res, params, sessionState) => {
      const employee = getEmployeeForSession(sessionState);
      if (!employee) {
        sendJson(res, 403, { error: "Employee access required." });
        return;
      }
      const run = findRunForEmployee(sessionState.db, employee.id, params.runId);
      if (!run) {
        sendJson(res, 404, { error: "Payslip not found." });
        return;
      }
      const pdf = buildPayslipPdf(run, run.companySnapshot || sessionState.db.company);
      sendBuffer(res, 200, pdf, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${run.payrollMonth}-${run.employeeNumber}.pdf"`,
      });
    }),
  },
  {
    method: "GET",
    path: "/api/documents/export",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const employeeId = url.searchParams.get("employeeId");
      const documentType = url.searchParams.get("documentType");
      const employee = (sessionState.db.employees || []).find((item) => item.id === employeeId && item.status !== "archived");

      if (!employee) {
        sendJson(res, 404, { error: "Employee not found." });
        return;
      }
      if (!["offer-letter", "leave-form", "disciplinary-letter", "termination-form"].includes(documentType)) {
        sendJson(res, 400, { error: "Invalid document type." });
        return;
      }

      const payload = {
        documentType,
        issueDate: url.searchParams.get("issueDate") || "",
        effectiveDate: url.searchParams.get("effectiveDate") || "",
        subject: url.searchParams.get("subject") || "",
        leaveType: url.searchParams.get("leaveType") || "",
        startDate: url.searchParams.get("startDate") || "",
        endDate: url.searchParams.get("endDate") || "",
        incidentDate: url.searchParams.get("incidentDate") || "",
        compensation: url.searchParams.get("compensation") || "",
        reason: url.searchParams.get("reason") || "",
        notes: url.searchParams.get("notes") || "",
        signatory: url.searchParams.get("signatory") || "",
      };

      const pdf = buildHrDocumentPdf(employee, sessionState.db.company, payload);
      sendBuffer(res, 200, pdf, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${documentType}-${employee.employeeNumber}.pdf"`,
      });
    }),
  },
  {
    method: "GET",
    path: "/api/password-reset-requests",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      sendJson(res, 200, { items: (sessionState.db.passwordResetRequests || []).slice().reverse() });
    }),
  },
  {
    method: "POST",
    path: "/api/password-reset-requests/:requestId/reset",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const request = (sessionState.db.passwordResetRequests || []).find((item) => item.id === params.requestId);
      if (!request) {
        sendJson(res, 404, { error: "Password reset request not found." });
        return;
      }
      const employee = (sessionState.db.employees || []).find((item) => item.id === request.employeeId);
      if (!employee) {
        sendJson(res, 404, { error: "Employee not found." });
        return;
      }
      const nextPortal = buildEmployeePortal(employee.employeeNumber, employee.idNumber);
      employee.portalAccess.tempPassword = nextPortal.tempPassword;
      employee.portalAccess.passwordHash = await hashPassword(nextPortal.tempPassword);
      request.status = "completed";
      request.completedAt = new Date().toISOString();
      request.completedBy = sessionState.user.username;
      createNotification(sessionState.db, {
        employeeId: employee.id,
        type: "success",
        title: "Password reset completed",
        body: `Your temporary password has been reset. Use the last 6 digits of your ID to sign in, then change it immediately.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, {
        item: request,
        tempPassword: nextPortal.tempPassword,
        username: employee.portalAccess.username,
      });
    }),
  },
  {
    method: "GET",
    path: "/api/finance/exports",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
      const type = url.searchParams.get("type") || "bank-payments";
      const exportFile = buildFinanceExport(sessionState.db, month, type);
      if (!exportFile) {
        sendJson(res, 400, { error: "Invalid finance export type." });
        return;
      }
      sendText(res, 200, exportFile.content, {
        "Content-Type": exportFile.contentType,
        "Content-Disposition": `attachment; filename="${exportFile.filename}"`,
      });
    }),
  },
  {
    method: "GET",
    path: "/api/compliance/summary",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
      const year = Number(url.searchParams.get("year") || month.slice(0, 4));
      sendJson(res, 200, {
        item: buildComplianceSummary(sessionState.db, month, year),
      });
    }),
  },
  {
    method: "POST",
    path: "/api/payroll-runs",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      const employee = sessionState.db.employees.find((item) => item.id === body.employeeId);
      if (!employee) {
        sendJson(res, 404, { error: "Employee not found." });
        return;
      }
      const { run: payrollRun, input } = buildPayrollRunRecord(
        employee,
        body,
        sessionState.user.username,
        sessionState.db.company,
      );

      sessionState.db.payrollRuns.push(payrollRun);
      employee.leaveBalances = {
        annualLeaveUsed: input.annualLeaveUsed,
        sickLeaveUsed: input.sickLeaveUsed,
      };
      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "payroll-run-created",
        at: new Date().toISOString(),
        actor: sessionState.user.username,
        detail: `Created payroll run ${payrollRun.id} for ${employee.fullName}.`,
      });
      createNotification(sessionState.db, {
        employeeId: employee.id,
        type: "success",
        title: "New payslip available",
        body: `Your payslip for ${payrollRun.payrollMonth} is now available in the portal.`,
      });
      await writeDb(sessionState.db);

      sendJson(res, 201, { item: payrollRun });
    }),
  },
  {
    method: "POST",
    path: "/api/payroll-runs/bulk",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const body = await parseBody(req);
      const payrollMonth = String(body.payrollMonth || "").trim();
      if (!payrollMonth) {
        sendJson(res, 400, { error: "Payroll month is required." });
        return;
      }

      const employees = (sessionState.db.employees || []).filter((item) => item.status !== "archived");
      const created = [];
      const skipped = [];

      for (const employee of employees) {
        const existingRun = (sessionState.db.payrollRuns || []).find(
          (item) => item.employeeId === employee.id && item.payrollMonth === payrollMonth && item.status !== "cancelled",
        );
        if (existingRun) {
          skipped.push({
            employeeId: employee.id,
            employeeName: employee.fullName,
            employeeNumber: employee.employeeNumber,
            reason: "Active payroll run already exists for this month.",
          });
          continue;
        }

        const { run: payrollRun, input } = buildPayrollRunRecord(
          employee,
          { ...body, payrollMonth },
          sessionState.user.username,
          sessionState.db.company,
        );

        sessionState.db.payrollRuns.push(payrollRun);
        employee.leaveBalances = {
          annualLeaveUsed: input.annualLeaveUsed,
          sickLeaveUsed: input.sickLeaveUsed,
        };
        sessionState.db.auditLog.push({
          id: id("audit"),
          action: "payroll-run-created",
          at: new Date().toISOString(),
          actor: sessionState.user.username,
          detail: `Created payroll run ${payrollRun.id} for ${employee.fullName}.`,
        });
        createNotification(sessionState.db, {
          employeeId: employee.id,
          type: "success",
          title: "New payslip available",
          body: `Your payslip for ${payrollRun.payrollMonth} is now available in the portal.`,
        });
        created.push(payrollRun);
      }

      await writeDb(sessionState.db);
      sendJson(res, 201, {
        month: payrollMonth,
        createdCount: created.length,
        skippedCount: skipped.length,
        items: created,
        skipped,
      });
    }),
  },
  {
    method: "GET",
    path: "/api/payroll-runs",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      sendJson(res, 200, { items: sessionState.db.payrollRuns.slice().reverse() });
    }),
  },
  {
    method: "GET",
    path: "/api/payroll-runs/:runId",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const run = sessionState.db.payrollRuns.find((item) => item.id === params.runId);
      if (!run) {
        sendJson(res, 404, { error: "Payroll run not found." });
        return;
      }
      sendJson(res, 200, { item: run });
    }),
  },
  {
    method: "PATCH",
    path: "/api/payroll-runs/:runId/cancel",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const run = sessionState.db.payrollRuns.find((item) => item.id === params.runId);
      if (!run) {
        sendJson(res, 404, { error: "Payroll run not found." });
        return;
      }
      if (isCancelledPayrollRun(run)) {
        sendJson(res, 400, { error: "Payroll run has already been cancelled." });
        return;
      }
      const body = await parseBody(req);
      run.status = "cancelled";
      run.cancelledAt = new Date().toISOString();
      run.cancelledBy = sessionState.user.username;
      run.cancellationReason = String(body.reason || "").trim();
      sessionState.db.auditLog.push({
        id: id("audit"),
        action: "payroll-run-cancelled",
        at: run.cancelledAt,
        actor: sessionState.user.username,
        detail: `Cancelled payroll run ${run.id} for ${run.employeeName}.`,
      });
      await writeDb(sessionState.db);
      sendJson(res, 200, { item: run });
    }),
  },
  {
    method: "GET",
    path: "/api/payroll-runs/:runId/pdf",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const run = sessionState.db.payrollRuns.find((item) => item.id === params.runId);
      if (!run) {
        sendJson(res, 404, { error: "Payroll run not found." });
        return;
      }
      const pdf = buildPayslipPdf(run, run.companySnapshot || sessionState.db.company);
      sendBuffer(res, 200, pdf, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${run.payrollMonth}-${run.employeeNumber}.pdf"`,
      });
    }),
  },
  {
    method: "GET",
    path: "/api/reports/monthly",
    handler: requireAdmin(async (req, res, params, sessionState) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
      const summary = monthlySummary(sessionState.db.payrollRuns, month);
      const runs = activePayrollRuns(sessionState.db.payrollRuns).filter((item) => item.payrollMonth === month);
      const analytics = {
        headcount: buildHeadcount(sessionState.db.employees),
        departmentPayrollCost: buildDepartmentPayrollCost(runs, sessionState.db.employees),
        overtimeTrends: buildOvertimeTrend(sessionState.db.payrollRuns, month),
        leaveLiability: buildLeaveLiability(sessionState.db.employees),
        loanExposure: buildLoanExposure(sessionState.db.loanRequests, month),
      };
      sendJson(res, 200, {
        summary,
        analytics,
        compliance: buildComplianceSummary(sessionState.db, month, Number(month.slice(0, 4))),
        items: runs,
      });
    }),
  },
];

async function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/uploads/")) {
    const uploadRelative = pathname.replace(/^\/uploads\//, "");
    const uploadPath = path.join(UPLOADS_DIR, path.normalize(uploadRelative));
    if (!uploadPath.startsWith(UPLOADS_DIR)) {
      sendText(res, 403, "Forbidden");
      return;
    }
    try {
      const content = await fs.readFile(uploadPath);
      const ext = path.extname(uploadPath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(content);
    } catch {
      sendText(res, 404, "Not found");
    }
    return;
  }

  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    sendText(res, 404, "Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    for (const route of routes) {
      const params = matchRoute(req.method, pathname, route.method, route.path);
      if (params) {
        if (req.method === "GET") {
          await route.handler(req, res, params);
          return;
        }

        const task = mutationQueue.then(() => route.handler(req, res, params));
        mutationQueue = task.catch(() => {});
        await task;
        return;
      }
    }

    if (pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "Route not found." });
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, { error: "Server error.", detail: error.message });
  }
});

ensureDb()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Namibia Payroll Desk running at http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
