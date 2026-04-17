const money = (value) =>
  new Intl.NumberFormat("en-NA", {
    style: "currency",
    currency: "NAD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const number = (value, digits = 2) =>
  new Intl.NumberFormat("en-NA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

const percent = (value, digits = 2) => `${number(value, digits)}%`;

const state = {
  session: null,
  company: null,
  portalData: null,
  view: "dashboard",
  dashboard: null,
  dataStatus: null,
  employees: [],
  runs: [],
  leaveRequests: [],
  loanRequests: [],
  shifts: [],
  timesheets: [],
  passwordResetRequests: [],
  superAdminWorkspaces: [],
  sources: [],
  activeRun: null,
  reportMonth: new Date().toISOString().slice(0, 7),
  report: null,
  dashboardSection: "overview",
  reportSection: "summary",
  requestsTab: "leave",
  requestDrawerOpen: false,
  settingsSection: "company",
  peopleProfileTab: "profile",
  payrollStep: "period",
  requestsSelectedId: "",
  editingEmployeeId: null,
  removeLogo: false,
  showEmployeeForm: false,
  globalSearch: "",
  employeeSearch: "",
  selectedEmployeeId: "",
  employeeDepartment: "all",
  employeeStatus: "active",
  leaveStatusFilter: "all",
  leaveError: "",
  leaveCalendarMonth: new Date().toISOString().slice(0, 7),
  leaveEmployeeFilter: "all",
  leaveTypeFilter: "all",
  leaveViewMode: "list",
  showLeaveForm: false,
  reviewError: "",
  companyError: "",
  companyNotice: "",
  employeePortalView: "overview",
  employeePortalSearch: "",
  portalTimesheetStatus: "all",
  portalTimesheetMonth: "",
  portalShiftStatus: "all",
  portalShiftMonth: new Date().toISOString().slice(0, 7),
  activeChatEmployeeId: "",
  employeePortalError: "",
  employeePortalNotice: "",
  loginView: "signin",
  mobileNavOpen: false,
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "same-origin",
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(payload.error || payload.detail || "Request failed.");
  }

  return payload;
}

function appShell(content) {
  return `<div class="shell">${content}</div>`;
}

function matchesSearch(query, ...values) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}

function initials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "NP";
}

function employeeAvatar(employee, className = "") {
  return `<span class="employee-avatar ${className}">${initials(employee?.fullName)}</span>`;
}

function buildLineComparisonChart(items, primaryKey, secondaryKey, labelKey) {
  if (!items.length) {
    return `<div class="empty">Not enough report data for a trend chart yet.</div>`;
  }

  const width = 520;
  const height = 220;
  const padding = 24;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const values = items.flatMap((item) => [Number(item[primaryKey] || 0), Number(item[secondaryKey] || 0)]);
  const max = Math.max(...values, 1);
  const xStep = items.length > 1 ? chartWidth / (items.length - 1) : 0;
  const scaleY = (value) => height - padding - (Number(value || 0) / max) * chartHeight;
  const point = (value, index) => `${padding + xStep * index},${scaleY(value)}`;
  const primaryPoints = items.map((item, index) => point(item[primaryKey], index)).join(" ");
  const secondaryPoints = items.map((item, index) => point(item[secondaryKey], index)).join(" ");

  return `
    <div class="report-line-card">
      <svg viewBox="0 0 ${width} ${height}" class="report-line-chart" role="img" aria-label="Payroll trend chart">
        <defs>
          <linearGradient id="line-fill-primary" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="rgba(15, 166, 178, 0.28)" />
            <stop offset="100%" stop-color="rgba(15, 166, 178, 0.02)" />
          </linearGradient>
        </defs>
        ${[0.25, 0.5, 0.75, 1].map((tick) => `
          <line x1="${padding}" y1="${height - padding - chartHeight * tick}" x2="${width - padding}" y2="${height - padding - chartHeight * tick}" stroke="rgba(64, 89, 122, 0.16)" stroke-width="1" />
        `).join("")}
        <polyline fill="none" stroke="#1396a3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${primaryPoints}" />
        <polyline fill="none" stroke="#ff8a1f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${secondaryPoints}" />
      </svg>
      <div class="report-line-labels">
        ${items.map((item) => `<span>${item[labelKey]}</span>`).join("")}
      </div>
    </div>
  `;
}

function buildDonutLegend(items) {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!total) {
    return `<div class="empty">No deduction split available yet.</div>`;
  }

  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += (Number(item.value || 0) / total) * 100;
    return `${item.color} ${start}% ${cursor}%`;
  }).join(", ");

  return `
    <div class="deduction-donut-shell">
      <div class="deduction-donut" style="background: conic-gradient(${stops});"></div>
      <div class="deduction-legend">
        ${items.map((item) => `
          <div class="deduction-legend-item">
            <span class="deduction-dot" style="background:${item.color};"></span>
            <strong>${item.label}</strong>
            <span>${money(item.value)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function loanProgress(request) {
  const progress = Math.max(0, Math.min(Number(request.progressPercent || 0), 100));
  return `
    <div class="loan-progress">
      <div class="loan-progress-meta">
        <span>${request.paidMonthsEstimate || 0} of ${request.repaymentMonths || 0} installments</span>
        <strong>${number(progress, 0)}%</strong>
      </div>
      <div class="leave-progress-track">
        <span class="loan-progress-fill" style="width:${progress}%"></span>
      </div>
    </div>
  `;
}

function buildBarChart(items, valueKey, labelKey, formatter) {
  const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 0);
  return `
    <div class="chart-list">
      ${items.map((item) => `
        <article class="chart-row">
          <div class="chart-meta">
            <strong>${item[labelKey]}</strong>
            <span>${formatter(Number(item[valueKey] || 0))}</span>
          </div>
          <div class="chart-track">
            <span class="chart-fill" style="width:${max ? Math.max((Number(item[valueKey] || 0) / max) * 100, 6) : 0}%"></span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function sectionToggle(name, current, label, dataAction, dataValueKey = "section") {
  return `<button class="${current === name ? "primary" : "secondary"}" data-action="${dataAction}" data-${dataValueKey}="${name}" type="button">${label}</button>`;
}

function adminNavItem(view, label, icon) {
  return `
    <button class="workspace-nav-item ${state.view === view ? "active" : ""}" data-view="${view}" type="button">
      <span class="workspace-nav-icon">${icon}</span>
      <span>${label}</span>
    </button>
  `;
}

function employeePortalMainNavButton(view, label) {
  return `<button class="pane-nav-button ${state.employeePortalView === view ? "active" : "secondary"}" data-employee-view="${view}"><span>${label}</span></button>`;
}

function employeePortalSecondaryNavButton(view, label) {
  return `<button class="secondary pane-nav-button" data-employee-view="${view}"><span>${label}</span></button>`;
}

function payrollReadiness(employee) {
  if (!employee) return { ready: false, issues: ["Select an employee or use all active employees to continue."] };
  const issues = [];
  if (!employee.idNumber) issues.push("Missing ID or passport number.");
  if (!employee.basicWage) issues.push("Missing basic wage.");
  if (!employee.department) issues.push("Missing department.");
  if (!employee.bankName || !employee.accountNumber) issues.push("Missing bank payment details.");
  return { ready: issues.length === 0, issues };
}

function getRequestsDataset() {
  const statusOrder = {
    pending: 0,
    submitted: 0,
    scheduled: 1,
    late: 1,
    clocked_in: 1,
    approved: 2,
    completed: 2,
    declined: 3,
    rejected: 3,
    missed: 3,
    cancelled: 4,
  };

  let items;

  if (state.requestsTab === "leave") {
    items = state.leaveRequests.map((item) => ({
      id: item.id,
      title: item.employeeName,
      subtitle: `${item.leaveType} · ${item.startDate} to ${item.endDate}`,
      meta: `${item.daysRequested} working day${item.daysRequested === 1 ? "" : "s"}`,
      status: item.status,
      kind: "leave",
      item,
    }));
  } else if (state.requestsTab === "loans") {
    items = state.loanRequests.map((item) => ({
      id: item.id,
      title: item.employeeName,
      subtitle: `${money(item.amount)} · ${item.repaymentMonths} month repayment`,
      meta: item.requestedAt.slice(0, 10),
      status: item.status,
      kind: "loan",
      item,
    }));
  } else if (state.requestsTab === "timesheets") {
    items = state.timesheets.map((item) => ({
      id: item.id,
      title: item.employeeName,
      subtitle: `${item.weekStart} to ${item.weekEnd}`,
      meta: `${number(item.regularHours, 2)} regular · ${number(item.overtimeHours, 2)} OT`,
      status: item.status,
      kind: "timesheet",
      item,
    }));
  } else {
    items = state.shifts.map((item) => ({
      id: item.id,
      title: item.employeeName,
      subtitle: `${item.shiftDate} · ${item.shiftType === "off_day" ? "Off day" : `${item.startTime} to ${item.endTime}`}`,
      meta: item.location || "No location",
      status: item.attendanceStatus,
      kind: "attendance",
      item,
    }));
  }

  return items
    .filter((entry) =>
      matchesSearch(
        state.globalSearch,
        entry.title,
        entry.subtitle,
        entry.meta,
        entry.status,
        entry.item?.reason,
        entry.item?.notes,
      ),
    )
    .sort((left, right) => {
      const statusDelta = (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99);
      if (statusDelta !== 0) return statusDelta;
      return String(right.item?.requestedAt || right.item?.createdAt || right.item?.shiftDate || "").localeCompare(
        String(left.item?.requestedAt || left.item?.createdAt || left.item?.shiftDate || ""),
      );
    });
}

function syncRequestsSelection() {
  const items = getRequestsDataset();
  if (!items.length) {
    state.requestsSelectedId = "";
    return { items, selected: null };
  }
  if (!items.some((entry) => entry.id === state.requestsSelectedId)) {
    state.requestsSelectedId = items[0].id;
  }
  return {
    items,
    selected: items.find((entry) => entry.id === state.requestsSelectedId) || items[0],
  };
}

function requestSummaryCard(label, value, tone = "default") {
  return `
    <article class="request-summary-card ${tone !== "default" ? `request-summary-${tone}` : ""}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function requestReviewCard(entry) {
  return `
    <button class="request-review-card ${state.requestsSelectedId === entry.id ? "selected" : ""}" data-action="select-request-item" data-id="${entry.id}" type="button">
      <div class="record-head">
        <div>
          <h3>${entry.title}</h3>
          <p class="muted">${entry.subtitle}</p>
        </div>
        <span class="status-badge status-${entry.status}">${entry.status.replace("_", " ")}</span>
      </div>
      <p class="muted">${entry.meta}</p>
    </button>
  `;
}

function requestReviewDetail(entry) {
  if (!entry) {
    return `<div class="empty">Select a request to review it on the right.</div>`;
  }

  if (entry.kind === "leave") {
    const request = entry.item;
    return `
      <section class="request-detail-section">
        <p class="section-kicker">Leave review</p>
        <h2>${request.employeeName}</h2>
        <div class="facts">
          <div class="fact"><span class="label">Type</span><span class="value">${request.leaveType}</span></div>
          <div class="fact"><span class="label">Dates</span><span class="value">${request.startDate} to ${request.endDate}</span></div>
          <div class="fact"><span class="label">Working days</span><span class="value">${request.daysRequested}</span></div>
          <div class="fact"><span class="label">Status</span><span class="value">${request.status}</span></div>
        </div>
        <div class="notice"><p class="muted">${request.reason || "No reason provided."}</p></div>
        <div class="employee-row-actions">
          ${request.status === "pending" ? `<button class="secondary table-action" data-action="approve-leave" data-id="${request.id}">Approve</button><button class="danger-button table-action" data-action="decline-leave" data-id="${request.id}">Decline</button>` : `<span class="tag">${request.reviewedBy || "Reviewed"}</span>`}
        </div>
      </section>
    `;
  }

  if (entry.kind === "loan") {
    const request = entry.item;
    return `
      <section class="request-detail-section">
        <p class="section-kicker">Loan review</p>
        <h2>${request.employeeName}</h2>
        <div class="loan-metrics-grid">
          <div><span class="muted">Requested</span><strong>${money(request.amount)}</strong></div>
          <div><span class="muted">Repayment term</span><strong>${request.repaymentMonths} months</strong></div>
          <div><span class="muted">Interest</span><strong>${percent(request.interestRate || 0)}</strong></div>
          <div><span class="muted">Outstanding</span><strong>${money(request.estimatedOutstandingBalance || 0)}</strong></div>
        </div>
        <div class="notice"><p class="muted">${request.reason || "No reason provided."}</p></div>
        <div class="employee-row-actions">
          ${request.status === "pending" ? `<button class="secondary table-action" data-action="approve-loan" data-id="${request.id}" data-interest="${request.interestRate || 0}">Approve</button><button class="danger-button table-action" data-action="decline-loan" data-id="${request.id}">Decline</button>` : `<span class="tag">${request.reviewedBy || "Reviewed"}</span>`}
        </div>
      </section>
    `;
  }

  if (entry.kind === "timesheet") {
    const item = entry.item;
    return `
      <section class="request-detail-section">
        <p class="section-kicker">Timesheet review</p>
        <h2>${item.employeeName}</h2>
        <div class="facts">
          <div class="fact"><span class="label">Week</span><span class="value">${item.weekStart} to ${item.weekEnd}</span></div>
          <div class="fact"><span class="label">Regular</span><span class="value">${number(item.regularHours, 2)} hrs</span></div>
          <div class="fact"><span class="label">Overtime</span><span class="value">${number(item.overtimeHours, 2)} hrs</span></div>
          <div class="fact"><span class="label">Status</span><span class="value">${item.status}</span></div>
        </div>
        <div class="notice"><p class="muted">${item.notes || "No notes provided."}</p></div>
        <div class="employee-row-actions">
          ${item.status === "submitted" ? `<button class="secondary table-action" data-action="approve-timesheet" data-id="${item.id}">Approve</button><button class="danger-button table-action" data-action="reject-timesheet" data-id="${item.id}">Reject</button>` : `<span class="tag">${item.reviewedBy || "Reviewed"}</span>`}
        </div>
      </section>
    `;
  }

  const shift = entry.item;
  return `
    <section class="request-detail-section">
      <p class="section-kicker">Attendance review</p>
      <h2>${shift.employeeName}</h2>
      ${shiftCard(shift)}
      <div class="employee-row-actions">
        ${shift.attendanceStatus !== "cancelled" ? `<button class="danger-button table-action" data-action="cancel-shift" data-id="${shift.id}" data-name="${shift.employeeName}" data-date="${shift.shiftDate}">Cancel shift</button>` : `<span class="tag">Cancelled</span>`}
      </div>
    </section>
  `;
}

function payrollStepper() {
  const steps = [
    { key: "period", label: "Select period" },
    { key: "inputs", label: "Review inputs" },
    { key: "outputs", label: "Review outputs" },
    { key: "publish", label: "Approve and publish" },
  ];
  const activeIndex = steps.findIndex((step) => step.key === state.payrollStep);
  return `
    <div class="payroll-stepper">
      ${steps.map((step, index) => `
        <button class="payroll-step-card ${step.key === state.payrollStep ? "active" : index < activeIndex ? "complete" : ""}" data-action="set-payroll-step" data-step="${step.key}" type="button">
          <span class="payroll-step-number">${index + 1}</span>
          <span class="payroll-step-copy">
            <span class="payroll-step-kicker">Step ${index + 1}</span>
            <span class="payroll-step-label">${step.label}</span>
          </span>
        </button>
      `).join("")}
    </div>
  `;
}

async function logoutUser() {
  try {
    await api("/api/logout", { method: "POST" });
  } catch (error) {
    // Clear the local session even if the remote session is already gone.
  }
  state.session = null;
  state.company = null;
  state.portalData = null;
  state.activeRun = null;
  state.employeePortalError = "";
  state.employeePortalNotice = "";
  render();
}

function render() {
  const root = document.querySelector("#app");

  if (!state.session) {
    root.innerHTML = renderLogin();
    bindLogin();
    return;
  }

  if (state.session.role === "employee") {
    root.innerHTML = renderEmployeePortal();
    bindEmployeePortal();
    return;
  }

  root.innerHTML = renderApp();
  bindApp();
}

function renderLogin() {
  return appShell(`
    <section class="login-wrap">
      <div class="login-compact-shell">
        <section class="login-card compact-login-card modern-login-card">
          <div class="modern-login-grid">
            <div class="modern-login-copy">
              <div class="brand-lockup">
                <img class="brand-logo-image" src="/assets/nam-payroll-logo.png" alt="NamPayroll logo" />
                <div>
                  <p class="eyebrow">NamPayroll</p>
                  <strong class="brand-lockup-title">Namibia Payroll Desk</strong>
                </div>
              </div>
              <h1>Payroll access for modern teams.</h1>
              <p class="muted">Run payroll, manage compliance, and give employees self-service access from one secure app.</p>
              <div class="login-feature-list">
                <span class="tag">Payroll and compliance</span>
                <span class="tag">Employee self-service</span>
                <span class="tag">Payslips, leave, loans, and time</span>
              </div>
            </div>
            <div class="notice compact-login-panel modern-login-panel">
              <div class="modern-login-switcher">
                <button class="${state.loginView === "signin" ? "primary" : "secondary"}" data-action="set-login-view" data-login-view="signin" type="button">Sign in</button>
                <button class="${state.loginView === "register" ? "primary" : "secondary"}" data-action="set-login-view" data-login-view="register" type="button">Register company</button>
              </div>
              ${
                state.loginView === "signin"
                  ? `
                    <p class="section-kicker">Secure Sign In</p>
                    <h3>Welcome back</h3>
                    <p class="muted">Enter your username and password to continue.</p>
                    <form id="login-form" class="modern-login-form">
                      <label>Username <input name="username" autocomplete="username" required /></label>
                      <label>Password <input type="password" name="password" autocomplete="current-password" required /></label>
                      <div class="actions">
                        <button class="primary" type="submit">Sign in</button>
                      </div>
                    </form>
                    <p id="login-error" class="small danger hidden"></p>
                  `
                  : `
                    <p class="section-kicker">Company Setup</p>
                    <h3>Create your payroll account</h3>
                    <p class="muted">Register your company and create the first admin account.</p>
                    <form id="register-company-form" class="modern-login-form">
                      <label>Company name <input name="companyName" required /></label>
                      <label>Company email <input type="email" name="email" /></label>
                      <label>Cellphone <input name="cellphone" /></label>
                      <label>Website <input name="website" placeholder="https://example.com" /></label>
                      <label class="span-2">Physical address <textarea name="physicalAddress"></textarea></label>
                      <label>Admin full name <input name="adminName" required /></label>
                      <label>Admin username <input name="username" required /></label>
                      <label>Password <input type="password" name="password" minlength="8" required /></label>
                      <label>Confirm password <input type="password" name="confirmPassword" minlength="8" required /></label>
                      <div class="span-2 actions">
                        <button class="primary" type="submit">Register company</button>
                      </div>
                    </form>
                    <p id="register-error" class="small danger hidden"></p>
                  `
              }
            </div>
          </div>
        </section>
      </div>
    </section>
  `);
}

function employeePortalNavButton(view, label) {
  return `<button class="pane-nav-button ${state.employeePortalView === view ? "active" : "secondary"}" data-employee-view="${view}"><span>${label}</span></button>`;
}

function employeePortalQuickAction(view, title, detail) {
  return `
    <button class="portal-quick-action ${state.employeePortalView === view ? "portal-quick-action-active" : ""}" data-employee-view="${view}" type="button">
      <strong>${title}</strong>
      <span>${detail}</span>
    </button>
  `;
}

function employeePortalBottomNavButton(view, label) {
  return `
    <button class="portal-bottom-nav-button ${state.employeePortalView === view ? "active" : ""}" data-employee-view="${view}" type="button">
      ${label}
    </button>
  `;
}

function adminNavButton(view, label) {
  return `<button class="pane-nav-button ${state.view === view ? "active" : "secondary"}" data-view="${view}"><span>${label}</span></button>`;
}

function adminQuickAction(view, title, detail) {
  return `
    <button class="portal-quick-action ${state.view === view ? "portal-quick-action-active" : ""}" data-view="${view}" type="button">
      <strong>${title}</strong>
      <span>${detail}</span>
    </button>
  `;
}

function adminBottomNavButton(view, label) {
  return `
    <button class="portal-bottom-nav-button ${state.view === view ? "active" : ""}" data-view="${view}" type="button">
      ${label}
    </button>
  `;
}

function mobileSummaryCard(view, title, summary, icon, scope = "admin") {
  const attribute = scope === "employee" ? `data-employee-view="${view}"` : `data-view="${view}"`;
  const active = scope === "employee" ? state.employeePortalView === view : state.view === view;
  return `
    <button class="mobile-summary-card ${active ? "active" : ""}" ${attribute} type="button">
      <div class="mobile-summary-card-head">
        <h3>${title}</h3>
        <span class="mobile-summary-card-icon">${icon}</span>
      </div>
      <div class="mobile-summary-card-bar">${summary}</div>
    </button>
  `;
}

function employeeRailButton(view, icon, label) {
  return `
    <button class="rail-button ${state.employeePortalView === view ? "active" : ""}" data-employee-view="${view}" type="button" title="${label}" aria-label="${label}">
      <span class="rail-icon">${icon}</span>
      <span class="rail-label">${label}</span>
    </button>
  `;
}

function adminRailButton(view, icon, label) {
  return `
    <button class="rail-button ${state.view === view ? "active" : ""}" data-view="${view}" type="button" title="${label}" aria-label="${label}">
      <span class="rail-icon">${icon}</span>
      <span class="rail-label">${label}</span>
    </button>
  `;
}

function triggerDownload(url) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function employeeOverviewView() {
  const employee = state.portalData?.employee;
  const leaveRequests = (state.portalData?.leaveRequests || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.leaveType, item.reason, item.status, item.startDate, item.endDate),
  );
  const loanRequests = (state.portalData?.loanRequests || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.reason, item.status, item.amount, item.repaymentMonths),
  );
  const timesheets = (state.portalData?.timesheets || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.weekStart, item.weekEnd, item.status, item.notes),
  );
  const shifts = (state.portalData?.shifts || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.shiftDate, item.startTime, item.endTime, item.attendanceStatus, item.notes),
  );
  const payslips = (state.portalData?.payslips || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.payrollMonth, item.employeeNumber, item.employeeName),
  );
  const annualAllowance = (employee?.daysPerWeek || 5) * 4;
  const annualUsed = Number(employee?.leaveBalances?.annualLeaveUsed || 0);
  const sickUsed = Number(employee?.leaveBalances?.sickLeaveUsed || 0);
  const annualRemaining = Math.max(annualAllowance - annualUsed, 0);
  const notifications = state.portalData?.notifications || [];
  const pendingLeave = leaveRequests.filter((item) => item.status === "pending").length;
  const pendingTimesheets = timesheets.filter((item) => item.status === "submitted").length;
  const openShifts = shifts.filter((item) => ["scheduled", "late", "clocked_in"].includes(item.attendanceStatus)).length;
  const unreadNotifications = notifications.filter((item) => !item.readAt).length;
  const nextShift = shifts.find((item) => ["scheduled", "late", "clocked_in"].includes(item.attendanceStatus));
  const latestPayslip = payslips[0];
  const latestNotification = notifications[0];
  const latestTimesheet = timesheets[0];

  return `
    <section class="panel-grid">
      <section class="mobile-overview-stack">
        ${mobileSummaryCard("leave", "Leave Status", pendingLeave ? `${pendingLeave} pending request${pendingLeave === 1 ? "" : "s"}` : `${number(annualRemaining, 0)} days available`, "◌", "employee")}
        ${mobileSummaryCard("time", "Shifts", openShifts ? `Today: ${openShifts} active or upcoming` : "No active shifts", "◷", "employee")}
        ${mobileSummaryCard("time", "Timesheets", pendingTimesheets ? `${pendingTimesheets} awaiting review` : "This week: all clear", "☰", "employee")}
        ${mobileSummaryCard("payslips", "Payslips", payslips.length ? `${payslips.length} available to view` : "No payslips yet", "▣", "employee")}
        ${mobileSummaryCard("inbox", "Inbox", unreadNotifications ? `${unreadNotifications} new updates` : "Open notifications and chat", "✉", "employee")}
      </section>
      <section class="panel-grid employee-home-grid">
        <section class="panel">
          <p class="section-kicker">Home</p>
          <h2>${employee?.fullName || "Employee"} self-service</h2>
          <p class="muted">Everything you need for pay, leave, time, and updates in one place.</p>
          <div class="stats compact-stats">
            <article class="stat"><span class="stat-label">Leave balance</span><span class="stat-value">${number(annualRemaining, 0)} days</span></article>
            <article class="stat"><span class="stat-label">Latest payslip</span><span class="stat-value">${latestPayslip ? latestPayslip.payrollMonth : "Not ready"}</span></article>
            <article class="stat"><span class="stat-label">Next shift</span><span class="stat-value">${nextShift ? nextShift.shiftDate : "Not scheduled"}</span></article>
            <article class="stat"><span class="stat-label">Unread updates</span><span class="stat-value">${unreadNotifications}</span></article>
          </div>
        </section>
        <section class="panel">
          <p class="section-kicker">Latest payslip</p>
          <h2>${latestPayslip ? latestPayslip.payrollMonth : "No payslip yet"}</h2>
          ${latestPayslip
            ? `<div class="notice">
                <div class="record-head">
                  <div>
                    <h3>Net pay ${money(latestPayslip.result.metrics.netPay)}</h3>
                    <p class="muted">${latestPayslip.employeeNumber} · latest published payslip</p>
                  </div>
                  <button class="secondary table-action" data-action="open-employee-payslip" data-id="${latestPayslip.id}">View</button>
                </div>
              </div>`
            : `<div class="empty">No payslip available yet.</div>`}
        </section>
        <section class="panel">
          <p class="section-kicker">Leave balance</p>
          <h2>${number(annualRemaining, 0)} days remaining</h2>
          <div class="list">
            ${leaveRequests.slice(0, 1).map(leaveRequestCard).join("") || `<div class="empty">No leave requests yet.</div>`}
          </div>
        </section>
        <section class="panel">
          <p class="section-kicker">Next shift</p>
          <h2>${nextShift ? nextShift.shiftDate : "No shift scheduled"}</h2>
          <div class="list">
            ${nextShift ? shiftCard(nextShift) : `<div class="empty">No upcoming shift assigned yet.</div>`}
          </div>
        </section>
        <section class="panel">
          <p class="section-kicker">Timesheet status</p>
          <h2>${latestTimesheet ? latestTimesheet.status : "No timesheet yet"}</h2>
          <div class="list">
            ${latestTimesheet ? timesheetCard(latestTimesheet) : `<div class="empty">No timesheets submitted yet.</div>`}
          </div>
        </section>
        <section class="panel">
          <p class="section-kicker">Latest notification</p>
          <h2>${latestNotification ? latestNotification.title : "No updates"}</h2>
          <div class="list">
            ${latestNotification ? notificationCard(latestNotification) : `<div class="empty">No notifications yet.</div>`}
          </div>
        </section>
      </section>
    </section>
  `;
}

function employeeTimeView() {
  const shifts = (state.portalData?.shifts || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.shiftDate, item.startTime, item.endTime, item.attendanceStatus, item.notes),
  );
  const timesheets = (state.portalData?.timesheets || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.weekStart, item.weekEnd, item.status, item.notes),
  );
  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Time</p>
        <h2>Shifts and timesheets</h2>
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search shifts or timesheets" value="${state.employeePortalSearch}" />
        </div>
      </section>
      <section class="panel">
        <p class="section-kicker">Next shift</p>
        <h2>Attendance</h2>
        <div class="list">
          ${shifts.slice(0, 3).map(shiftCard).join("") || `<div class="empty">No shifts assigned yet.</div>`}
        </div>
      </section>
      <section class="panel">
        <p class="section-kicker">Timesheets</p>
        <h2>Submission status</h2>
        <div class="list">
          ${timesheets.slice(0, 3).map(timesheetCard).join("") || `<div class="empty">No timesheets submitted yet.</div>`}
        </div>
      </section>
    </section>
  `;
}

function employeeInboxView() {
  const notifications = (state.portalData?.notifications || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.title, item.body, item.createdAt),
  );
  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Inbox</p>
        <h2>Notifications and chat</h2>
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search inbox" value="${state.employeePortalSearch}" />
        </div>
      </section>
      <section class="panel">
        <p class="section-kicker">Latest notifications</p>
        <h2>Recent updates</h2>
        <div class="list">
          ${notifications.length ? notifications.slice(0, 6).map(notificationCard).join("") : `<div class="empty">No notifications yet.</div>`}
        </div>
      </section>
      ${employeeChatView()}
    </section>
  `;
}

function employeeLeaveView() {
  const employee = state.portalData?.employee;
  const annualAllowance = (employee?.daysPerWeek || 5) * 4;
  const annualUsed = Number(employee?.leaveBalances?.annualLeaveUsed || 0);
  const annualRemaining = Math.max(annualAllowance - annualUsed, 0);
  const leaveRequests = (state.portalData?.leaveRequests || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.leaveType, item.reason, item.status, item.startDate, item.endDate),
  );
  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Leave</p>
        <h2>Leave days and requests</h2>
        ${state.employeePortalNotice ? `<div class="banner success-banner">${state.employeePortalNotice}</div>` : ""}
        ${state.employeePortalError ? `<div class="banner danger-banner">${state.employeePortalError}</div>` : ""}
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search leave history" value="${state.employeePortalSearch}" />
        </div>
        <div class="stats">
          <article class="stat"><span class="stat-label">Annual allowance</span><span class="stat-value">${number(annualAllowance, 0)}</span></article>
          <article class="stat"><span class="stat-label">Annual used</span><span class="stat-value">${number(annualUsed, 0)}</span></article>
          <article class="stat"><span class="stat-label">Annual remaining</span><span class="stat-value">${number(annualRemaining, 0)}</span></article>
        </div>
        <form id="employee-leave-form" class="grid-3">
          <label>Leave type
            <select name="leaveType">
              <option value="annual">Annual leave</option>
              <option value="sick">Sick leave</option>
              <option value="compassionate">Compassionate leave</option>
              <option value="maternity">Maternity leave</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Start date <input type="date" name="startDate" required /></label>
          <label>End date <input type="date" name="endDate" required /></label>
          <label class="span-2">Reason <textarea name="reason"></textarea></label>
          <div class="actions"><button class="primary" type="submit">Request leave</button></div>
        </form>
      </section>
      <section class="panel">
        <p class="section-kicker">History</p>
        <h2>Your leave requests</h2>
        <div class="list">
          ${leaveRequests.length ? leaveRequests.map(leaveRequestCard).join("") : `<div class="empty">No leave requests yet.</div>`}
        </div>
      </section>
    </section>
  `;
}

function loanRequestCard(request) {
  return `
    <article class="notice">
      <div class="record-head">
        <div>
          <h3>${money(request.amount)}</h3>
          <p class="muted">${request.repaymentMonths} month repayment · requested ${request.requestedAt.slice(0, 10)}</p>
        </div>
        <span class="status-badge status-${request.status}">${request.status}</span>
      </div>
      <p class="muted">${request.reason || "No reason provided."}</p>
      <div class="loan-metrics-grid">
        <div><span class="muted">Interest</span><strong>${percent(request.interestRate || 0)}</strong></div>
        <div><span class="muted">Total repayable</span><strong>${money(request.totalRepayable || request.amount || 0)}</strong></div>
        <div><span class="muted">Monthly installment</span><strong>${money(request.monthlyInstallment || 0)}</strong></div>
        <div><span class="muted">Outstanding</span><strong>${money(request.estimatedOutstandingBalance || 0)}</strong></div>
      </div>
      ${request.status === "approved" ? loanProgress(request) : `<p class="muted">Interest and repayment schedule are finalized when the loan is approved.</p>`}
    </article>
  `;
}

function notificationCard(notification) {
  return `
    <article class="notice ${notification.readAt ? "" : "good"}">
      <div class="record-head">
        <div>
          <h3>${notification.title}</h3>
          <p class="muted">${notification.body}</p>
        </div>
        <div class="employee-row-actions">
          <span class="tag">${notification.createdAt.slice(0, 10)}</span>
          ${notification.readAt ? `<span class="tag">Read</span>` : `<button class="secondary table-action" data-action="mark-notification-read" data-id="${notification.id}">Mark read</button>`}
        </div>
      </div>
    </article>
  `;
}

function timesheetCard(entry) {
  return `
    <article class="notice">
      <div class="record-head">
        <div>
          <h3>${entry.weekStart} to ${entry.weekEnd}</h3>
          <p class="muted">${entry.regularHours} regular · ${entry.overtimeHours} overtime · ${entry.sundayHours} Sunday</p>
        </div>
        <span class="tag">${entry.status}</span>
      </div>
      <p class="muted">${entry.notes || "No notes."}</p>
    </article>
  `;
}

function shiftCard(shift, options = {}) {
  const actions = options.actions || "";
  const workedLabel = shift.shiftType === "off_day"
    ? "Rest day"
    : shift.clockOutAt
    ? `${number(shift.workedHours || 0, 2)} hrs worked`
    : shift.clockInAt
      ? `Clocked in ${new Date(shift.clockInAt).toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" })}`
      : "Awaiting clock-in";
  return `
    <article class="notice shift-card">
      <div class="record-head">
        <div>
          <h3>${options.showEmployee ? shift.employeeName : shift.shiftDate}</h3>
          <p class="muted">${
            shift.shiftType === "off_day"
              ? `${options.showEmployee ? `${shift.shiftDate} · ` : ""}Off day${shift.location ? ` · ${shift.location}` : ""}`
              : options.showEmployee
                ? `${shift.shiftDate} · ${shift.startTime} to ${shift.endTime}`
                : `${shift.startTime} to ${shift.endTime}${shift.location ? ` · ${shift.location}` : ""}`
          }</p>
        </div>
        <span class="status-badge status-${shift.attendanceStatus}">${shift.attendanceStatus.replace("_", " ")}</span>
      </div>
      ${options.showEmployee ? `<p class="muted">${shift.department || "No department"}${shift.location ? ` · ${shift.location}` : ""}</p>` : ""}
      <p class="muted"><strong>Instructions:</strong> ${shift.notes || "No shift notes yet."}</p>
      <div class="shift-meta-row">
        <span class="tag">${workedLabel}</span>
        ${shift.clockOutAt ? `<span class="tag">Out ${new Date(shift.clockOutAt).toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" })}</span>` : ""}
      </div>
      ${actions ? `<div class="employee-row-actions shift-actions-row">${actions}</div>` : ""}
    </article>
  `;
}

function shiftMonthChange(direction) {
  const [yearString, monthString] = state.portalShiftMonth.split("-");
  const date = new Date(Number(yearString), Number(monthString) - 1 + Number(direction || 0), 1);
  state.portalShiftMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildShiftCalendar(shifts) {
  const [yearString, monthString] = state.portalShiftMonth.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const monthStart = new Date(year, monthIndex, 1 - startOffset);
  const calendarDays = [];

  for (let dayIndex = 0; dayIndex < 42; dayIndex += 1) {
    const current = new Date(monthStart);
    current.setDate(monthStart.getDate() + dayIndex);
    const key = current.toISOString().slice(0, 10);
    const dayShifts = shifts.filter((item) => item.shiftDate === key);
    const muted = current.getMonth() !== monthIndex;
    const today = new Date().toISOString().slice(0, 10) === key;
    calendarDays.push(`
      <article class="calendar-day ${muted ? "calendar-day-muted" : ""}">
        <div class="calendar-day-frame ${today ? "calendar-day-today" : ""}">
          <div class="calendar-day-head">
            <span>${current.getDate()}</span>
            ${dayShifts.length ? `<span class="calendar-count">${dayShifts.length}</span>` : ""}
          </div>
          <div class="calendar-shift-stack">
            ${dayShifts.slice(0, 3).map((shift) => `
              <span class="calendar-shift-chip status-${shift.attendanceStatus}">
                ${shift.shiftType === "off_day" ? "Off day" : `${shift.startTime}-${shift.endTime}`}
              </span>
            `).join("")}
            ${dayShifts.length > 3 ? `<span class="calendar-shift-more">+${dayShifts.length - 3} more</span>` : ""}
          </div>
        </div>
      </article>
    `);
  }

  return `
    <section class="panel leave-calendar-panel">
      <div class="record-head">
        <div>
          <p class="section-kicker">Calendar</p>
          <h2>Shift calendar</h2>
        </div>
        <div class="calendar-controls">
          <button class="secondary table-action" type="button" data-action="shift-calendar-month" data-direction="-1">Previous</button>
          <input type="month" id="portal-shift-month" value="${state.portalShiftMonth}" />
          <button class="secondary table-action" type="button" data-action="shift-calendar-month" data-direction="1">Next</button>
        </div>
      </div>
      <div class="calendar-weekdays">
        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
      </div>
      <div class="leave-calendar-grid">
        ${calendarDays.join("")}
      </div>
    </section>
  `;
}

function employeeShiftsView() {
  const shifts = (state.portalData?.shifts || []).filter((item) => {
    const matchesPortal = matchesSearch(state.employeePortalSearch, item.shiftDate, item.startTime, item.endTime, item.attendanceStatus, item.notes, item.location);
    const matchesStatus = state.portalShiftStatus === "all" || item.attendanceStatus === state.portalShiftStatus;
    return matchesPortal && matchesStatus;
  });
  const activeShift = shifts.find((item) => item.attendanceStatus === "clocked_in")
    || shifts.find((item) => ["scheduled", "late"].includes(item.attendanceStatus) && item.shiftType !== "off_day")
    || null;
  const monthShifts = (state.portalData?.shifts || []).filter((item) => item.shiftDate.startsWith(state.portalShiftMonth));
  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Shifts and Attendance</p>
        <h2>Clock in and clock out</h2>
        ${state.employeePortalNotice ? `<div class="banner success-banner">${state.employeePortalNotice}</div>` : ""}
        ${state.employeePortalError ? `<div class="banner danger-banner">${state.employeePortalError}</div>` : ""}
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search shifts" value="${state.employeePortalSearch}" />
        </div>
        <div class="grid-2">
          <label>Status
            <select id="portal-shift-status">
              <option value="all" ${state.portalShiftStatus === "all" ? "selected" : ""}>All statuses</option>
              <option value="scheduled" ${state.portalShiftStatus === "scheduled" ? "selected" : ""}>Scheduled</option>
              <option value="late" ${state.portalShiftStatus === "late" ? "selected" : ""}>Late</option>
              <option value="clocked_in" ${state.portalShiftStatus === "clocked_in" ? "selected" : ""}>Clocked in</option>
              <option value="completed" ${state.portalShiftStatus === "completed" ? "selected" : ""}>Completed</option>
              <option value="missed" ${state.portalShiftStatus === "missed" ? "selected" : ""}>Missed</option>
              <option value="off_day" ${state.portalShiftStatus === "off_day" ? "selected" : ""}>Off day</option>
            </select>
          </label>
        </div>
        ${
          activeShift
            ? shiftCard(activeShift, {
                actions: `
                  ${
                    !activeShift.clockInAt
                      ? `<button class="primary table-action" data-action="clock-in-shift" data-id="${activeShift.id}">Clock in</button>`
                      : ""
                  }
                  ${
                    activeShift.clockInAt && !activeShift.clockOutAt
                      ? `<button class="secondary table-action" data-action="clock-out-shift" data-id="${activeShift.id}">Clock out</button>`
                      : ""
                  }
                `,
              })
            : `<div class="empty">No active shift right now. Assigned shifts will appear here.</div>`
        }
      </section>
      <section class="panel">
        <p class="section-kicker">History</p>
        <h2>Your shift attendance</h2>
        <div class="list">
          ${shifts.length ? shifts.map((shift) => shiftCard(shift)).join("") : `<div class="empty">No shifts assigned yet.</div>`}
        </div>
      </section>
      ${buildShiftCalendar(monthShifts)}
    </section>
  `;
}

function employeeLoansView() {
  const loanRequests = (state.portalData?.loanRequests || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.reason, item.status, item.amount, item.repaymentMonths),
  );
  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Loans</p>
        <h2>Request an employee loan</h2>
        ${state.employeePortalNotice ? `<div class="banner success-banner">${state.employeePortalNotice}</div>` : ""}
        ${state.employeePortalError ? `<div class="banner danger-banner">${state.employeePortalError}</div>` : ""}
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search loan requests" value="${state.employeePortalSearch}" />
        </div>
        <form id="employee-loan-form" class="grid-3">
          <label>Amount (N$) <input type="number" min="0" step="0.01" name="amount" required /></label>
          <label>Repayment months <input type="number" min="1" step="1" name="repaymentMonths" value="1" required /></label>
          <label class="span-2">Reason <textarea name="reason"></textarea></label>
          <p class="span-2 muted">Interest is set during admin approval, then repayment progress appears here automatically.</p>
          <div class="actions"><button class="primary" type="submit">Submit loan request</button></div>
        </form>
      </section>
      <section class="panel">
        <p class="section-kicker">History</p>
        <h2>Your loan requests</h2>
        <div class="list">
          ${loanRequests.length ? loanRequests.map(loanRequestCard).join("") : `<div class="empty">No loan requests yet.</div>`}
        </div>
      </section>
    </section>
  `;
}

function employeeTimesheetsView() {
  const timesheets = (state.portalData?.timesheets || []).filter((item) => {
    const matchesPortal = matchesSearch(state.employeePortalSearch, item.weekStart, item.weekEnd, item.status, item.notes);
    const matchesStatus = state.portalTimesheetStatus === "all" || item.status === state.portalTimesheetStatus;
    const matchesMonth = !state.portalTimesheetMonth || item.weekStart.startsWith(state.portalTimesheetMonth) || item.weekEnd.startsWith(state.portalTimesheetMonth);
    return matchesPortal && matchesStatus && matchesMonth;
  });
  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Timesheets</p>
        <h2>Submit weekly time</h2>
        ${state.employeePortalNotice ? `<div class="banner success-banner">${state.employeePortalNotice}</div>` : ""}
        ${state.employeePortalError ? `<div class="banner danger-banner">${state.employeePortalError}</div>` : ""}
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search timesheets" value="${state.employeePortalSearch}" />
        </div>
        <div class="grid-2">
          <label>Status
            <select id="portal-timesheet-status">
              <option value="all" ${state.portalTimesheetStatus === "all" ? "selected" : ""}>All statuses</option>
              <option value="submitted" ${state.portalTimesheetStatus === "submitted" ? "selected" : ""}>Submitted</option>
              <option value="approved" ${state.portalTimesheetStatus === "approved" ? "selected" : ""}>Approved</option>
              <option value="rejected" ${state.portalTimesheetStatus === "rejected" ? "selected" : ""}>Rejected</option>
            </select>
          </label>
          <label>Month <input type="month" id="portal-timesheet-month" value="${state.portalTimesheetMonth}" /></label>
        </div>
        <form id="employee-timesheet-form" class="grid-3">
          <label>Week start <input type="date" name="weekStart" required /></label>
          <label>Week end <input type="date" name="weekEnd" required /></label>
          <label>Regular hours <input type="number" min="0" step="0.25" name="regularHours" value="45" required /></label>
          <label>Overtime hours <input type="number" min="0" step="0.25" name="overtimeHours" value="0" required /></label>
          <label>Sunday hours <input type="number" min="0" step="0.25" name="sundayHours" value="0" required /></label>
          <label>Public holiday hours <input type="number" min="0" step="0.25" name="publicHolidayHours" value="0" required /></label>
          <label class="span-2">Notes <textarea name="notes"></textarea></label>
          <div class="actions"><button class="primary" type="submit">Submit timesheet</button></div>
        </form>
      </section>
      <section class="panel">
        <p class="section-kicker">History</p>
        <h2>Your submitted timesheets</h2>
        <div class="list">
          ${timesheets.length ? timesheets.map(timesheetCard).join("") : `<div class="empty">No timesheets yet.</div>`}
        </div>
      </section>
    </section>
  `;
}

function chatThreadMessage(message, employeeId) {
  const mine = message.senderEmployeeId === employeeId;
  return `
    <article class="chat-message ${mine ? "chat-message-mine" : ""}">
      <div class="chat-message-meta">
        <strong>${mine ? "You" : message.senderName}</strong>
        <span>${new Date(message.sentAt).toLocaleString("en-NA", { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>
      ${message.message ? `<p>${message.message}</p>` : ""}
      ${
        message.attachment
          ? `
            <a class="chat-attachment ${message.attachment.isImage ? "chat-attachment-image" : ""}" href="${message.attachment.url}" target="_blank" rel="noopener noreferrer">
              ${message.attachment.isImage ? `<img src="${message.attachment.url}" alt="${message.attachment.name}" />` : ""}
              <span>${message.attachment.name}</span>
            </a>
          `
          : ""
      }
    </article>
  `;
}

function employeeChatView() {
  const employee = state.portalData?.employee;
  const contacts = (state.portalData?.chatContacts || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.fullName, item.employeeNumber, item.department, item.title),
  );
  const activeContact = contacts.find((item) => item.id === state.activeChatEmployeeId) || contacts[0] || null;
  const messages = (state.portalData?.chats || []).filter((item) =>
    activeContact
      ? (item.senderEmployeeId === activeContact.id && item.recipientEmployeeId === employee?.id)
        || (item.senderEmployeeId === employee?.id && item.recipientEmployeeId === activeContact.id)
      : false,
  );

  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Employee Chat</p>
        <h2>Talk to coworkers</h2>
        ${state.employeePortalNotice ? `<div class="banner success-banner">${state.employeePortalNotice}</div>` : ""}
        ${state.employeePortalError ? `<div class="banner danger-banner">${state.employeePortalError}</div>` : ""}
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search coworkers" value="${state.employeePortalSearch}" />
        </div>
        <div class="chat-contact-list">
          ${contacts.length ? contacts.map((contact) => `
            <button class="chat-contact-card ${activeContact?.id === contact.id ? "chat-contact-card-active" : ""}" data-action="open-chat-contact" data-id="${contact.id}" type="button">
              <strong>${contact.fullName}</strong>
              <span>${contact.title || "Employee"}${contact.department ? ` · ${contact.department}` : ""}</span>
            </button>
          `).join("") : `<div class="empty">No coworkers available for chat yet.</div>`}
        </div>
      </section>
      <section class="panel">
        <p class="section-kicker">Conversation</p>
        <h2>${activeContact ? activeContact.fullName : "Select a coworker"}</h2>
        ${
          activeContact
            ? `
              <div class="chat-thread">
                ${messages.length ? messages.map((message) => chatThreadMessage(message, employee?.id)).join("") : `<div class="empty">No messages yet. Start the conversation.</div>`}
              </div>
              <form id="employee-chat-form" class="grid-2">
                <input type="hidden" name="recipientEmployeeId" value="${activeContact.id}" />
                <div class="span-2 chat-emoji-bar">
                  ${["😀", "👍", "🙏", "🎉", "❤️", "🔥", "✅", "🙂"].map((emoji) => `
                    <button class="secondary chat-emoji-button" type="button" data-action="insert-chat-emoji" data-emoji="${emoji}">${emoji}</button>
                  `).join("")}
                </div>
                <label class="span-2">Message <textarea name="message" placeholder="Type your message here"></textarea></label>
                <label class="span-2">Attach file <input type="file" name="attachmentFile" accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.doc,.docx,.xls,.xlsx" /></label>
                <div class="span-2 actions">
                  <button class="primary" type="submit">Send message</button>
                </div>
              </form>
            `
            : `<div class="empty">Choose a coworker to view or send messages.</div>`
        }
      </section>
    </section>
  `;
}

function payslipDownloadButton(run) {
  return `<button class="secondary table-action" data-action="download-payslip" data-id="${run.id}">Download</button>`;
}

function employeePayslipsView() {
  const payslips = (state.portalData?.payslips || []).filter((item) =>
    matchesSearch(state.employeePortalSearch, item.payrollMonth, item.employeeNumber, item.employeeName),
  );
  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Payslips</p>
        <h2>View and download payslips</h2>
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search payslips" value="${state.employeePortalSearch}" />
        </div>
        <div class="list">
          ${payslips.length
            ? payslips.map((run) => `
                <article class="run-card">
                  <div class="run-head">
                    <div>
                      <h3>${run.payrollMonth}</h3>
                      <p class="muted">Net pay ${money(run.result.metrics.netPay)}</p>
                    </div>
                    <div class="employee-row-actions">
                      <button class="secondary table-action" data-action="open-employee-payslip" data-id="${run.id}">View</button>
                      ${payslipDownloadButton(run)}
                    </div>
                  </div>
                </article>
              `).join("")
            : `<div class="empty">No payslips available yet.</div>`}
        </div>
      </section>
      <section class="panel printable">
        <p class="section-kicker">Preview</p>
        <h2>Selected payslip</h2>
        ${state.activeRun ? payslipView(state.activeRun) : `<div class="empty">Select a payslip to preview it here.</div>`}
      </section>
    </section>
  `;
}

function employeeAccountView() {
  const employee = state.portalData?.employee;
  return `
    <section class="panel-grid">
      <section class="panel">
        <p class="section-kicker">Profile</p>
        <h2>Update your profile</h2>
        <form id="employee-profile-form" class="grid-2">
          <label>Personal email <input type="email" name="personalEmail" value="${employee?.profile?.personalEmail || ""}" /></label>
          <label>Cellphone <input name="cellphone" value="${employee?.profile?.cellphone || ""}" /></label>
          <label class="span-2">Physical address <textarea name="physicalAddress">${employee?.profile?.physicalAddress || ""}</textarea></label>
          <label>Next of kin <input name="nextOfKinName" value="${employee?.profile?.nextOfKinName || ""}" /></label>
          <label>Next of kin phone <input name="nextOfKinPhone" value="${employee?.profile?.nextOfKinPhone || ""}" /></label>
          <label>Bank name <input name="bankName" value="${employee?.bankName || ""}" /></label>
          <label>Account number <input name="accountNumber" value="${employee?.accountNumber || ""}" /></label>
          <div class="span-2 actions">
            <button class="primary" type="submit">Save profile</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <p class="section-kicker">Account</p>
        <h2>Change portal password</h2>
        ${state.employeePortalNotice ? `<div class="banner success-banner">${state.employeePortalNotice}</div>` : ""}
        ${state.employeePortalError ? `<div class="banner danger-banner">${state.employeePortalError}</div>` : ""}
        <div class="mini-search-wrap">
          <input id="employee-portal-search" placeholder="Search portal" value="${state.employeePortalSearch}" />
        </div>
        <form id="employee-password-form" class="grid-2">
          <label>Username <input value="${employee?.portalAccess?.username || ""}" disabled /></label>
          <label>Current password <input type="password" name="currentPassword" required /></label>
          <label>New password <input type="password" name="newPassword" minlength="8" required /></label>
          <label>Confirm new password <input type="password" name="confirmPassword" minlength="8" required /></label>
          <div class="span-2 actions">
            <button class="primary" type="submit">Update password</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <p class="section-kicker">Security</p>
        <h2>Portal access</h2>
        <div class="list">
          <article class="notice">
            <div class="record-head">
              <div>
                <h3>${employee?.portalAccess?.username || "Employee login"}</h3>
                <p class="muted">Use a password only you know. Minimum length is 8 characters.</p>
              </div>
              <span class="tag">Active</span>
            </div>
          </article>
        </div>
      </section>
    </section>
  `;
}

function renderEmployeePortal() {
  const employee = state.portalData?.employee;
  const annualAllowance = (employee?.daysPerWeek || 5) * 4;
  const annualRemaining = Math.max(annualAllowance - Number(employee?.leaveBalances?.annualLeaveUsed || 0), 0);
  const pendingLeave = (state.portalData?.leaveRequests || []).filter((item) => item.status === "pending").length;
  const pendingLoans = (state.portalData?.loanRequests || []).filter((item) => item.status === "pending").length;
  const pendingTimesheets = (state.portalData?.timesheets || []).filter((item) => item.status === "submitted").length;
  const openShifts = (state.portalData?.shifts || []).filter((item) => ["scheduled", "late", "clocked_in"].includes(item.attendanceStatus)).length;
  const payslipCount = (state.portalData?.payslips || []).length;
  return appShell(`
    <section class="workspace-shell employee-workspace-shell">
      <aside class="app-rail">
        <div class="app-rail-brand">
          <img class="brand-mark-image" src="/assets/nam-payroll-favicon.png" alt="NamPayroll" />
        </div>
        <div class="app-rail-group">
          ${employeeRailButton("overview", "◫", "Home")}
          ${employeeRailButton("payslips", "▣", "Payslips")}
          ${employeeRailButton("leave", "◌", "Leave")}
          ${employeeRailButton("time", "◷", "Time")}
          ${employeeRailButton("inbox", "✉", "Inbox")}
        </div>
      </aside>
      <div class="workspace-surface">
        <header class="workspace-topbar">
          <div class="mobile-topbar-brand">
            <button class="mobile-topbar-icon-button" data-action="toggle-mobile-nav" type="button" aria-label="Open menu" aria-expanded="${state.mobileNavOpen ? "true" : "false"}">☰</button>
            <div class="mobile-topbar-brand-lockup">
              <img class="brand-mark-image" src="/assets/nam-payroll-favicon.png" alt="NamPayroll" />
              <strong>NamPayroll</strong>
            </div>
            <span class="mobile-topbar-icon">◉</span>
          </div>
          <div class="workspace-topbar-search">
            <input class="workspace-search workspace-search-wide" id="employee-portal-search-global" placeholder="Search messages, payslips, leave, shifts" value="${state.employeePortalSearch}" />
          </div>
          <div class="workspace-topbar-actions">
            <span class="pill">${state.company?.name || "Company"}</span>
            <button class="ghost" data-action="logout">Log out</button>
          </div>
        </header>
        <div class="workspace-body">
          ${state.mobileNavOpen ? `<button class="mobile-nav-backdrop" data-action="close-mobile-nav" type="button" aria-label="Close menu"></button>` : ""}
          <aside class="sidebar-pane ${state.mobileNavOpen ? "mobile-open" : ""}">
            <div class="sidebar-pane-head">
              <p class="section-kicker">Employee</p>
              <h2>${employee?.fullName || "Portal"}</h2>
              <p class="muted">${employee?.employeeNumber || ""}</p>
            </div>
            <div class="sidebar-nav-list employee-portal-menu">
              ${employeePortalMainNavButton("overview", "Home")}
              ${employeePortalMainNavButton("payslips", "Payslips")}
              ${employeePortalMainNavButton("leave", "Leave")}
              ${employeePortalMainNavButton("time", "Time")}
              ${employeePortalMainNavButton("inbox", "Inbox")}
            </div>
            <div class="sidebar-nav-list">
              ${employeePortalSecondaryNavButton("loans", "Loan requests")}
              ${employeePortalSecondaryNavButton("account", "Profile and password")}
            </div>
          </aside>
          <main class="content-stage">
            <section class="workspace-hero-card">
              <div class="workspace-hero-copy">
                <p class="section-kicker">Self service</p>
                <h1 class="workspace-title">Pay, leave, time, and updates without the clutter</h1>
                <p class="muted">A simpler employee portal focused on the latest payslip, leave balance, next shift, time status, and inbox updates.</p>
              </div>
              <div class="portal-quick-actions">
                ${employeePortalQuickAction("payslips", "Latest payslip", payslipCount ? `${payslipCount} ready to view` : "No payslips yet")}
                ${employeePortalQuickAction("leave", "Leave balance", pendingLeave ? `${pendingLeave} pending` : `${number(annualRemaining, 0)} days available`)}
                ${employeePortalQuickAction("time", "Time", openShifts ? `${openShifts} active or upcoming` : "Attendance and timesheets")}
                ${employeePortalQuickAction("inbox", "Inbox", "Notifications and chat")}
                ${employeePortalQuickAction("account", "Profile", "Account details and password")}
              </div>
            </section>
          ${state.employeePortalView === "overview" ? employeeOverviewView() : ""}
          ${state.employeePortalView === "leave" ? employeeLeaveView() : ""}
          ${state.employeePortalView === "time" ? employeeTimeView() : ""}
          ${state.employeePortalView === "inbox" ? employeeInboxView() : ""}
          ${state.employeePortalView === "loans" ? employeeLoansView() : ""}
          ${state.employeePortalView === "payslips" ? employeePayslipsView() : ""}
          ${state.employeePortalView === "account" ? employeeAccountView() : ""}
          </main>
        </div>
      </div>
      <nav class="portal-bottom-nav">
        ${employeePortalBottomNavButton("overview", "Home")}
        ${employeePortalBottomNavButton("payslips", "Payslips")}
        ${employeePortalBottomNavButton("leave", "Leave")}
        ${employeePortalBottomNavButton("time", "Time")}
        ${employeePortalBottomNavButton("inbox", "Inbox")}
      </nav>
    </section>
  `);
}

function dashboardView() {
  const current = state.dashboard?.currentMonth || {};
  const attendance = state.dashboard?.attendance || {};
  const recent = (state.dashboard?.recentRuns || []).filter((run) =>
    matchesSearch(state.globalSearch, run.employeeName, run.employeeNumber, run.payrollMonth, run.createdBy),
  );
  const chartPoints = recent.slice(0, 5).reverse().map((run) => ({
    label: `${run.employeeName.split(" ")[0]} ${run.payrollMonth}`,
    value: run.result.metrics.netPay,
  }));
  const resetRequests = state.passwordResetRequests || [];
  const pendingTimesheets = (state.timesheets || []).filter((item) => item.status === "submitted").length;
  const nextRun = recent[0];
  const payrollSummary = nextRun
    ? `Next run: ${nextRun.payrollMonth} | ${money(nextRun.result.metrics.netPay || 0)}`
    : current.net
      ? `Current month net ${money(current.net || 0)}`
      : "No payroll runs yet";

  return `
    <section class="panel-grid">
      ${state.dashboard?.user && state.dashboard.bootstrapPasswordWarning ? `<div class="banner">Change the seeded admin password before production use.</div>` : ""}
      <section class="mobile-overview-stack">
        ${mobileSummaryCard("employees", "Employees", `${state.dashboard?.employees || 0} active`, "◉")}
        ${mobileSummaryCard("requests", "Requests", `${state.dashboard?.pendingLeaveRequests || 0} leave pending · ${pendingTimesheets} time waiting`, "◌")}
        ${mobileSummaryCard("requests", "Attendance", attendance.clockedIn ? `Today: ${attendance.clockedIn} clocked in` : "Today: no one clocked in", "◷")}
        ${mobileSummaryCard("requests", "Timesheets", pendingTimesheets ? `${pendingTimesheets} awaiting review` : "This week: all submitted", "☰")}
        ${mobileSummaryCard("payroll", "Payroll", payrollSummary, "▣")}
      </section>
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Home</p>
            <h2>What needs attention today</h2>
          </div>
          <div class="section-switcher">
            ${sectionToggle("overview", state.dashboardSection, "Overview", "set-dashboard-section")}
            ${sectionToggle("activity", state.dashboardSection, "Activity", "set-dashboard-section")}
            ${sectionToggle("security", state.dashboardSection, "Security", "set-dashboard-section")}
            ${sectionToggle("rules", state.dashboardSection, "Rules", "set-dashboard-section")}
          </div>
        </div>
        <div class="mini-search-wrap">
          <input class="workspace-search" id="global-search" placeholder="Search employees, payroll, leave, loans, timesheets, documents" value="${state.globalSearch}" />
        </div>
        ${
          state.dashboardSection === "overview"
            ? `<div class="stats compact-stats">
                <article class="stat"><span class="stat-label">Active employees</span><span class="stat-value">${state.dashboard?.employees || 0}</span></article>
                <article class="stat"><span class="stat-label">Pending leave requests</span><span class="stat-value">${state.dashboard?.pendingLeaveRequests || 0}</span></article>
                <article class="stat"><span class="stat-label">Clocked in now</span><span class="stat-value">${attendance.clockedIn || 0}</span></article>
                <article class="stat"><span class="stat-label">Current month gross</span><span class="stat-value">${money(current.gross || 0)}</span></article>
                <article class="stat"><span class="stat-label">Current month net</span><span class="stat-value">${money(current.net || 0)}</span></article>
                <article class="stat"><span class="stat-label">Missed shifts</span><span class="stat-value">${attendance.missed || 0}</span></article>
              </div>
              <div class="list compact-list">
                ${(state.dashboard?.pendingLeaveRequests || 0) > 0 ? `<article class="notice warn"><h3>Leave requests waiting</h3><p class="muted">${state.dashboard.pendingLeaveRequests} leave request${state.dashboard.pendingLeaveRequests === 1 ? "" : "s"} need review in Requests.</p></article>` : ""}
                ${pendingTimesheets > 0 ? `<article class="notice warn"><h3>Timesheets awaiting review</h3><p class="muted">${pendingTimesheets} submitted timesheet${pendingTimesheets === 1 ? "" : "s"} need approval before payroll closes.</p></article>` : ""}
                ${attendance.missed > 0 ? `<article class="notice warn"><h3>Attendance exceptions</h3><p class="muted">${attendance.missed} missed shift${attendance.missed === 1 ? "" : "s"} need follow-up in Requests.</p></article>` : ""}
                ${!(state.dashboard?.pendingLeaveRequests || 0) && !pendingTimesheets && !attendance.missed ? `<div class="empty">Nothing urgent right now. Payroll, requests, and attendance are clear.</div>` : ""}
              </div>`
            : ""
        }
        ${
          state.dashboardSection === "activity"
            ? `${chartPoints.length ? buildBarChart(chartPoints, "value", "label", money) : `<div class="empty">No payroll trend data yet.</div>`}
               <div class="list compact-list">
                 ${recent.length ? recent.map(runCard).join("") : `<div class="empty">No payroll runs yet. Create one from the Payroll Run tab.</div>`}
               </div>`
            : ""
        }
        ${
          state.dashboardSection === "security"
            ? `<div class="list compact-list">
                ${resetRequests.length
                  ? resetRequests.slice(0, 5).map((request) => `
                      <article class="notice">
                        <div class="record-head">
                          <div>
                            <h3>${request.employeeName}</h3>
                            <p class="muted">${request.username} · ${request.requestedAt.slice(0, 10)}</p>
                          </div>
                          ${request.status === "pending" ? `<button class="secondary table-action" data-action="complete-password-reset" data-id="${request.id}">Reset password</button>` : `<span class="tag">${request.status}</span>`}
                        </div>
                      </article>
                    `).join("")
                  : `<div class="empty">No password reset requests yet.</div>`}
              </div>`
            : ""
        }
        ${
          state.dashboardSection === "rules"
            ? `<div class="sources compact-list">${state.sources.map(sourceCard).join("")}</div>`
            : ""
        }
      </section>
    </section>
  `;
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

function getCalendarDays(monthValue) {
  const [yearString, monthString] = monthValue.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;
  const firstOfMonth = new Date(year, monthIndex, 1);
  const lastOfMonth = new Date(year, monthIndex + 1, 0);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = addDays(firstOfMonth, -startOffset);
  const days = [];

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    days.push({
      key: formatDateKey(date),
      date,
      isCurrentMonth: date.getMonth() === monthIndex,
      dayNumber: date.getDate(),
    });
  }

  return {
    label: firstOfMonth.toLocaleDateString("en-NA", { month: "long", year: "numeric" }),
    days,
  };
}

function requestTouchesDate(request, dateKey) {
  return request.startDate <= dateKey && request.endDate >= dateKey;
}

function employeeLeaveSummaryCard(employee) {
  const annualAllowance = employee.daysPerWeek * 4;
  const annualUsed = Number(employee.leaveBalances?.annualLeaveUsed || 0);
  const remaining = Math.max(annualAllowance - annualUsed, 0);
  const progress = annualAllowance > 0 ? Math.max(12, Math.round((remaining / annualAllowance) * 100)) : 0;

  return `
    <article class="leave-balance-card">
      <h3>${employee.fullName}</h3>
      <p class="muted">${employee.department || "No department"}</p>
      <div class="leave-progress-track">
        <span class="leave-progress-fill" style="width:${progress}%"></span>
      </div>
      <strong>${number(remaining, 0)} / ${number(annualAllowance, 0)} days remaining</strong>
    </article>
  `;
}

function leaveRequestTableRow(request) {
  return `
    <tr>
      <td>${request.employeeName}</td>
      <td>${request.leaveType}</td>
      <td>${request.startDate}</td>
      <td>${request.endDate}</td>
      <td>${request.daysRequested}</td>
      <td><span class="status-badge status-${request.status}">${request.status}</span></td>
      <td>${request.reason || "-"}</td>
      <td>
        <div class="employee-row-actions">
          ${
            request.status === "pending"
              ? `
                <button class="secondary table-action" data-action="approve-leave" data-id="${request.id}">Approve</button>
                <button class="danger-button table-action" data-action="decline-leave" data-id="${request.id}">Decline</button>
              `
              : `<span class="tag">${request.reviewedBy || "Reviewed"}</span>`
          }
        </div>
      </td>
    </tr>
  `;
}

function leaveRequestsView() {
  const employeeOptions = state.employees
    .map(
      (employee) =>
        `<option value="${employee.id}">${employee.employeeNumber} · ${employee.fullName}</option>`,
    )
    .join("");
  const filteredRequests = state.leaveRequests.filter((request) => {
    const matchesStatus = state.leaveStatusFilter === "all" || request.status === state.leaveStatusFilter;
    const matchesEmployee = state.leaveEmployeeFilter === "all" || request.employeeId === state.leaveEmployeeFilter;
    const matchesType = state.leaveTypeFilter === "all" || request.leaveType === state.leaveTypeFilter;
    const matchesGlobal = matchesSearch(
      state.globalSearch,
      request.employeeName,
      request.employeeNumber,
      request.leaveType,
      request.reason,
      request.status,
      request.startDate,
      request.endDate,
    );
    return matchesStatus && matchesEmployee && matchesType && matchesGlobal;
  });
  const calendar = getCalendarDays(state.leaveCalendarMonth);

  return `
    <section class="panel-grid leave-page">
      <section class="leave-header">
        <div>
          <h2>Leave Management</h2>
          <p class="muted">Track annual leave per Labour Act and manage employee requests in one place.</p>
        </div>
        <div class="leave-header-actions">
          <button class="${state.leaveViewMode === "list" ? "primary" : "secondary"}" data-action="set-leave-view" data-view="list">List</button>
          <button class="${state.leaveViewMode === "calendar" ? "primary" : "secondary"}" data-action="set-leave-view" data-view="calendar">Calendar</button>
          <button class="primary" data-action="toggle-leave-form">${state.showLeaveForm ? "Close Request" : "+ Request Leave"}</button>
        </div>
      </section>

      <section class="panel">
        <div class="record-head">
          <div>
            <h2>Leave Balances</h2>
          </div>
        </div>
        <div class="leave-balance-grid">
          ${state.employees.map(employeeLeaveSummaryCard).join("")}
        </div>
      </section>

      ${state.showLeaveForm ? `
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Leave requests</p>
            <h2>Request leave</h2>
            <p class="muted">Leave days are counted as working days, excluding weekends and Namibia public holidays.</p>
          </div>
        </div>
        ${state.leaveError ? `<div class="banner danger-banner">${state.leaveError}</div>` : ""}
        <form id="leave-request-form" class="grid-3">
          <label>Employee
            <select name="employeeId" required>
              <option value="">Select employee</option>
              ${employeeOptions}
            </select>
          </label>
          <label>Leave type
            <select name="leaveType">
              <option value="annual">Annual leave</option>
              <option value="sick">Sick leave</option>
              <option value="compassionate">Compassionate leave</option>
              <option value="maternity">Maternity leave</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Status filter
            <select id="leave-status-filter">
              <option value="all" ${state.leaveStatusFilter === "all" ? "selected" : ""}>All statuses</option>
              <option value="pending" ${state.leaveStatusFilter === "pending" ? "selected" : ""}>Pending</option>
              <option value="approved" ${state.leaveStatusFilter === "approved" ? "selected" : ""}>Approved</option>
              <option value="declined" ${state.leaveStatusFilter === "declined" ? "selected" : ""}>Declined</option>
            </select>
          </label>
          <label>Start date <input type="date" name="startDate" required /></label>
          <label>End date <input type="date" name="endDate" required /></label>
          <label class="span-2">Reason <textarea name="reason" placeholder="Why is leave being requested?"></textarea></label>
          <div class="actions">
            <button class="primary" type="submit">Submit leave request</button>
          </div>
        </form>
      </section>` : ""}

      <section class="panel">
        <div class="leave-toolbar">
          <input id="global-search" class="workspace-search" placeholder="Search leave records" value="${state.globalSearch}" />
          <select id="leave-employee-filter">
            <option value="all">All Employees</option>
            ${state.employees
              .map(
                (employee) =>
                  `<option value="${employee.id}" ${state.leaveEmployeeFilter === employee.id ? "selected" : ""}>${employee.fullName}</option>`,
              )
              .join("")}
          </select>
          <select id="leave-type-filter">
            <option value="all">All Types</option>
            <option value="annual" ${state.leaveTypeFilter === "annual" ? "selected" : ""}>Annual leave</option>
            <option value="sick" ${state.leaveTypeFilter === "sick" ? "selected" : ""}>Sick leave</option>
            <option value="compassionate" ${state.leaveTypeFilter === "compassionate" ? "selected" : ""}>Compassionate leave</option>
            <option value="maternity" ${state.leaveTypeFilter === "maternity" ? "selected" : ""}>Maternity leave</option>
            <option value="other" ${state.leaveTypeFilter === "other" ? "selected" : ""}>Other</option>
          </select>
          <select id="leave-status-filter">
            <option value="all" ${state.leaveStatusFilter === "all" ? "selected" : ""}>All Statuses</option>
            <option value="pending" ${state.leaveStatusFilter === "pending" ? "selected" : ""}>Pending</option>
            <option value="approved" ${state.leaveStatusFilter === "approved" ? "selected" : ""}>Approved</option>
            <option value="declined" ${state.leaveStatusFilter === "declined" ? "selected" : ""}>Declined</option>
          </select>
        </div>

        ${state.leaveViewMode === "list"
          ? `${
              filteredRequests.length
                ? `<div class="employee-table-wrap">
                    <table class="employee-table leave-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Type</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Working Days</th>
                          <th>Status</th>
                          <th>Notes</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${filteredRequests.map(leaveRequestTableRow).join("")}
                      </tbody>
                    </table>
                  </div>`
                : `<div class="empty">No leave records found.</div>`
            }`
          : `<div class="leave-calendar-panel">
              <div class="record-head">
                <div>
                  <p class="section-kicker">Calendar</p>
                  <h2>${calendar.label}</h2>
                </div>
                <div class="calendar-controls">
                  <button class="secondary table-action" data-action="shift-leave-month" data-direction="-1" type="button">Previous</button>
                  <input id="leave-calendar-month" type="month" value="${state.leaveCalendarMonth}" />
                  <button class="secondary table-action" data-action="shift-leave-month" data-direction="1" type="button">Next</button>
                </div>
              </div>
              <div class="calendar-legend">
                <span class="legend-item"><span class="legend-swatch chip-pending"></span>Pending</span>
                <span class="legend-item"><span class="legend-swatch chip-approved"></span>Approved</span>
                <span class="legend-item"><span class="legend-swatch chip-declined"></span>Declined</span>
              </div>
              <div class="calendar-weekdays">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun</span>
              </div>
              <div class="leave-calendar-grid">
                ${calendar.days
                  .map((day) => {
                    const entries = filteredRequests.filter((request) => requestTouchesDate(request, day.key));
                    return `
                      <article class="calendar-day ${day.isCurrentMonth ? "" : "calendar-day-muted"}">
                        <div class="calendar-day-frame ${day.key === formatDateKey(new Date()) ? "calendar-day-today" : ""}">
                        <div class="calendar-day-head">
                          <span>${day.dayNumber}</span>
                          ${entries.length ? `<span class="calendar-count">${entries.length}</span>` : ""}
                        </div>
                        <div class="calendar-events">
                          ${entries
                            .slice(0, 3)
                            .map(
                              (request) => `
                                <div class="calendar-chip chip-${request.status}">
                                  <strong>${request.employeeName}</strong>
                                  <span>${request.leaveType}</span>
                                </div>
                              `,
                            )
                            .join("")}
                          ${entries.length > 3 ? `<div class="calendar-more">+${entries.length - 3} more</div>` : ""}
                        </div>
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            </div>`
        }
      </section>
    </section>
  `;
}

function companyProfileSettingsView() {
  const previewCompany = {
    ...(state.company || {}),
    logoPath: state.removeLogo ? "" : state.company?.logoPath || "",
  };
  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Company profile</p>
            <h2>Register company details</h2>
          </div>
        </div>
        ${state.companyError ? `<div class="banner danger-banner">${state.companyError}</div>` : ""}
        ${state.companyNotice ? `<div class="banner success-banner">${state.companyNotice}</div>` : ""}
        <form id="company-form" class="grid-2">
          <label>Company name <input name="name" value="${state.company?.name || ""}" required /></label>
          <label>Email <input type="email" name="email" value="${state.company?.email || ""}" /></label>
          <label>Cellphone <input name="cellphone" value="${state.company?.cellphone || ""}" /></label>
          <label>Website <input name="website" placeholder="https://example.com" value="${state.company?.website || ""}" /></label>
          <label>Billing email <input type="email" name="billingEmail" value="${state.company?.billingEmail || ""}" placeholder="billing@company.com" /></label>
          <label>Tax reference <input name="taxReference" value="${state.company?.taxReference || ""}" /></label>
          <label>SSC registration <input name="sscRegistration" value="${state.company?.sscRegistration || ""}" /></label>
          <section class="span-2 settings-card">
            <div class="settings-card-head">
              <div>
                <p class="section-kicker">Billing</p>
                <h3>Workspace subscription</h3>
              </div>
              <span class="tag">Admin-only</span>
            </div>
            <div class="grid-2 settings-grid">
              <label>Plan
                <select name="billingPlan">
                  <option value="starter" ${state.company?.billingPlan === "starter" ? "selected" : ""}>Starter</option>
                  <option value="growth" ${state.company?.billingPlan === "growth" ? "selected" : ""}>Growth</option>
                  <option value="enterprise" ${state.company?.billingPlan === "enterprise" ? "selected" : ""}>Enterprise</option>
                </select>
              </label>
              <label>Status
                <select name="billingStatus">
                  <option value="trial" ${state.company?.billingStatus === "trial" ? "selected" : ""}>Trial</option>
                  <option value="active" ${state.company?.billingStatus === "active" ? "selected" : ""}>Active</option>
                  <option value="past_due" ${state.company?.billingStatus === "past_due" ? "selected" : ""}>Past due</option>
                  <option value="suspended" ${state.company?.billingStatus === "suspended" ? "selected" : ""}>Suspended</option>
                </select>
              </label>
              <label>Billing cycle
                <select name="billingCycle">
                  <option value="monthly" ${state.company?.billingCycle === "monthly" ? "selected" : ""}>Monthly</option>
                  <option value="annual" ${state.company?.billingCycle === "annual" ? "selected" : ""}>Annual</option>
                </select>
              </label>
              <label>Next billing date <input type="date" name="nextBillingDate" value="${state.company?.nextBillingDate || ""}" /></label>
            </div>
          </section>
          <label class="span-2">Physical address
            <textarea name="physicalAddress" placeholder="Street, suburb, town, region">${state.company?.physicalAddress || ""}</textarea>
          </label>
          <label class="span-2">Company logo
            <input type="file" id="company-logo" name="logoFile" accept="image/png,image/jpeg,image/jpg,image/webp" />
          </label>
          <div class="span-2 actions">
            <button class="primary" type="submit">Save company profile</button>
            ${
              state.company?.logoPath && !state.removeLogo
                ? `<button class="secondary" type="button" data-action="remove-logo">Remove logo</button>`
                : ""
            }
          </div>
        </form>
      </section>
      <section class="panel">
        <p class="section-kicker">Preview</p>
        <h2>Payslip company header</h2>
        ${companyPreviewCard(previewCompany)}
      </section>
    </section>
  `;
}

function notificationsSettingsView() {
  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Notifications</p>
            <h2>Admin alerts and employee delivery</h2>
            <p class="muted">Control who gets email and SMS updates, and which workflows trigger them.</p>
          </div>
        </div>
        ${state.companyError ? `<div class="banner danger-banner">${state.companyError}</div>` : ""}
        ${state.companyNotice ? `<div class="banner success-banner">${state.companyNotice}</div>` : ""}
        <form id="company-form" class="grid-2">
          <section class="span-2 settings-card">
            <div class="settings-card-head">
              <div>
                <p class="section-kicker">Admin alerts</p>
                <h3>Employee request notifications</h3>
              </div>
              <span class="tag">Email or SMS required</span>
            </div>
            <div class="grid-2 settings-grid">
              <label>Admin alert email <input type="email" name="adminNotificationEmail" value="${state.company?.adminNotificationEmail || ""}" placeholder="admin@company.com" /></label>
              <label>Admin alert SMS <input name="adminNotificationCellphone" value="${state.company?.adminNotificationCellphone || ""}" placeholder="+264811234567" /></label>
              <label class="settings-check"><input type="checkbox" name="notifyAdminOnLeaveRequest" ${state.company?.notifyAdminOnLeaveRequest !== false ? "checked" : ""} /> Notify on leave requests</label>
              <label class="settings-check"><input type="checkbox" name="notifyAdminOnLoanRequest" ${state.company?.notifyAdminOnLoanRequest !== false ? "checked" : ""} /> Notify on loan requests</label>
              <label class="span-2 settings-check"><input type="checkbox" name="notifyAdminOnTimesheet" ${state.company?.notifyAdminOnTimesheet !== false ? "checked" : ""} /> Notify on timesheet submissions</label>
            </div>
          </section>
          <section class="span-2 settings-card">
            <div class="settings-card-head">
              <div>
                <p class="section-kicker">Employee delivery</p>
                <h3>Email and SMS notifications</h3>
              </div>
              <span class="tag">Uses employee contact details</span>
            </div>
            <div class="grid-2 settings-grid">
              <label class="settings-check"><input type="checkbox" name="notifyEmployeeOnLeaveUpdate" ${state.company?.notifyEmployeeOnLeaveUpdate !== false ? "checked" : ""} /> Send leave status updates</label>
              <label class="settings-check"><input type="checkbox" name="notifyEmployeeOnLoanUpdate" ${state.company?.notifyEmployeeOnLoanUpdate !== false ? "checked" : ""} /> Send loan status updates</label>
              <label class="settings-check"><input type="checkbox" name="notifyEmployeeOnTimesheetUpdate" ${state.company?.notifyEmployeeOnTimesheetUpdate !== false ? "checked" : ""} /> Send timesheet review updates</label>
              <label class="settings-check"><input type="checkbox" name="notifyEmployeeOnPayslipReady" ${state.company?.notifyEmployeeOnPayslipReady !== false ? "checked" : ""} /> Send payslip-ready alerts</label>
              <label class="settings-check"><input type="checkbox" name="notifyEmployeeOnChatMessage" ${state.company?.notifyEmployeeOnChatMessage !== false ? "checked" : ""} /> Send chat message alerts</label>
            </div>
          </section>
          <div class="span-2 actions">
            <button class="primary" type="submit">Save notification settings</button>
          </div>
        </form>
      </section>
    </section>
  `;
}

function employeesView() {
  const departments = [...new Set(state.employees.map((employee) => employee.department).filter(Boolean))].sort();
  const filteredEmployees = state.employees.filter((employee) => {
    const query = state.employeeSearch.trim().toLowerCase();
    const matchesQuery =
      !query ||
      employee.fullName.toLowerCase().includes(query) ||
      employee.employeeNumber.toLowerCase().includes(query) ||
      String(employee.idNumber || "").toLowerCase().includes(query);
    const matchesDepartment =
      state.employeeDepartment === "all" || (employee.department || "") === state.employeeDepartment;
    const matchesStatus =
      state.employeeStatus === "all" || (employee.status || "active") === state.employeeStatus;
    const matchesGlobal = matchesSearch(
      state.globalSearch,
      employee.fullName,
      employee.employeeNumber,
      employee.idNumber,
      employee.department,
      employee.title,
      employee.profile?.personalEmail,
      employee.profile?.cellphone,
    );
    return matchesQuery && matchesDepartment && matchesStatus && matchesGlobal;
  });

  const activeEmployees = state.employees.filter((employee) => (employee.status || "active") === "active");
  const avgSalary =
    activeEmployees.length > 0
      ? activeEmployees.reduce((sum, employee) => sum + Number(employee.basicWage || 0), 0) / activeEmployees.length
      : 0;
  const monthlyExposure = activeEmployees.reduce(
    (sum, employee) => sum + Number(employee.basicWage || 0) + Number(employee.taxableAllowances || 0),
    0,
  );
  const selectedEmployee =
    filteredEmployees.find((employee) => employee.id === state.selectedEmployeeId) ||
    filteredEmployees[0] ||
    activeEmployees[0] ||
    state.employees[0] ||
    null;
  const selectedLeave = selectedEmployee
    ? Math.max(selectedEmployee.daysPerWeek * 4 - Number(selectedEmployee.leaveBalances?.annualLeaveUsed || 0), 0)
    : 0;
  const selectedTotal = Number(selectedEmployee?.basicWage || 0)
    + Number(selectedEmployee?.taxableAllowances || 0)
    + Number(selectedEmployee?.standardBonus || 0);

  return `
    <section class="panel-grid employee-page employee-mock-page">
      <section class="employee-header employee-header-modern">
        <div>
          <h2>Employees</h2>
          <p class="muted">A cleaner payroll directory with detail-first review.</p>
        </div>
        <div class="employee-header-actions">
          <select id="employee-department-filter" class="workspace-search compact-search">
            <option value="all">Filter All</option>
            ${departments
              .map(
                (department) =>
                  `<option value="${department}" ${state.employeeDepartment === department ? "selected" : ""}>${department}</option>`,
              )
              .join("")}
          </select>
          <button class="secondary icon-button" type="button" aria-label="Filter employees">⌕</button>
          <button class="primary employee-add-button" data-action="toggle-employee-form">
            ${state.showEmployeeForm || state.editingEmployeeId ? "Close Form" : "Add Employee"}
          </button>
        </div>
      </section>

      <section class="employee-summary-grid employee-summary-grid-modern">
        <article class="employee-summary-card accent-navy">
          <span class="summary-title">Total employees</span>
          <strong>${state.employees.length}</strong>
        </article>
        <article class="employee-summary-card accent-green">
          <span class="summary-title">Active</span>
          <strong>${activeEmployees.length}</strong>
        </article>
        <article class="employee-summary-card accent-gold">
          <span class="summary-title">Avg. basic salary</span>
          <strong>${money(avgSalary)}</strong>
        </article>
        <article class="employee-summary-card accent-blue">
          <span class="summary-title">Monthly payroll exposure</span>
          <strong>${money(monthlyExposure)}</strong>
        </article>
      </section>

      ${(state.showEmployeeForm || state.editingEmployeeId)
        ? `<section class="panel employee-form-panel">
            <div class="record-head">
              <div>
                <p class="section-kicker">Employee form</p>
                <h2>${state.editingEmployeeId ? "Edit employee" : "Add employee"}</h2>
                <p class="muted">A compact entry form that stays out of the way until you need it.</p>
              </div>
              <button class="secondary" data-action="reset-employee-form">Cancel</button>
            </div>
            <form id="employee-form" class="employee-compact-form">
              <input type="hidden" name="employeeId" value="${state.editingEmployeeId || ""}" />
              <div class="compact-section">
                <div class="compact-section-head">
                  <h3>Identity and contact</h3>
                  <span class="tag">Required first</span>
                </div>
                <div class="compact-grid compact-grid-4">
                  <label>Full name <input name="fullName" required /></label>
                  <label>Employee number <input name="employeeNumber" placeholder="EMP-002" /></label>
                  <label>ID or passport <input name="idNumber" /></label>
                  <label>Cellphone <input name="cellphone" placeholder="+264..." /></label>
                  <label class="span-2">Email address <input type="email" name="personalEmail" placeholder="employee@example.com" /></label>
                </div>
              </div>

              <div class="compact-section">
                <div class="compact-section-head">
                  <h3>Work setup</h3>
                </div>
                <div class="compact-grid compact-grid-4">
                  <label>Department <input name="department" /></label>
                  <label>Job title <input name="title" /></label>
                  <label>Category
                    <select name="workerCategory">
                      <option value="general">General employee</option>
                      <option value="domestic">Domestic worker</option>
                      <option value="agriculture">Agriculture worker</option>
                      <option value="security">Security worker</option>
                    </select>
                  </label>
                  <label>Start date <input type="date" name="startDate" required /></label>
                  <label>Days per week <input type="number" min="1" max="7" name="daysPerWeek" value="5" required /></label>
                  <label>Hours per day <input type="number" min="1" max="12" step="0.25" name="hoursPerDay" value="9" required /></label>
                </div>
              </div>

              <div class="compact-section">
                <div class="compact-section-head">
                  <h3>Pay and bank</h3>
                </div>
                <div class="compact-grid compact-grid-4">
                  <label>Basic wage (N$) <input type="number" min="0" step="0.01" name="basicWage" value="0" required /></label>
                  <label>Allowances (N$) <input type="number" min="0" step="0.01" name="taxableAllowances" value="0" /></label>
                  <label>Standard bonus (N$) <input type="number" min="0" step="0.01" name="standardBonus" value="0" /></label>
                  <label>Bank name <input name="bankName" /></label>
                  <label class="span-2">Account number <input name="accountNumber" /></label>
                </div>
              </div>

              <div class="compact-section">
                <div class="compact-section-head">
                  <h3>Leave opening balances</h3>
                </div>
                <div class="compact-grid compact-grid-4">
                  <label>Annual leave used <input type="number" min="0" step="0.5" name="annualLeaveUsed" value="0" /></label>
                  <label>Sick leave used <input type="number" min="0" step="0.5" name="sickLeaveUsed" value="0" /></label>
                </div>
              </div>

              <div class="actions compact-actions">
                <button class="primary" type="submit">${state.editingEmployeeId ? "Save changes" : "Create employee"}</button>
              </div>
            </form>
          </section>`
        : ""}

      <section class="employee-directory-shell">
        <section class="panel employee-directory-panel employee-directory-main">
          <div class="employee-toolbar employee-toolbar-modern">
            <input id="global-search" class="workspace-search" placeholder="Search across the workspace" value="${state.globalSearch}" />
            <input
              id="employee-search"
              class="employee-search"
              placeholder="Search by name, ID or payroll no."
              value="${state.employeeSearch}"
            />
            <select id="employee-status-filter">
              <option value="all" ${state.employeeStatus === "all" ? "selected" : ""}>All statuses</option>
              <option value="active" ${state.employeeStatus === "active" ? "selected" : ""}>Active</option>
            </select>
          </div>
          <div class="employee-list-head">
            <span>Name</span>
            <span>Company</span>
            <span>Status</span>
            <span>Salary</span>
            <span>Date</span>
            <span></span>
          </div>

          ${
            filteredEmployees.length
              ? `<div class="employee-directory-list">
                  ${filteredEmployees.map((employee) => `
                    <article class="employee-directory-row ${selectedEmployee?.id === employee.id ? "selected" : ""}">
                      <button class="employee-directory-primary" data-action="select-employee" data-id="${employee.id}" type="button">
                        <div class="employee-directory-name">
                          ${employeeAvatar(employee)}
                          <div>
                            <strong>${employee.fullName}</strong>
                            <span>${employee.employeeNumber}</span>
                          </div>
                        </div>
                        <span>${employee.department || "General"}</span>
                        <span><span class="status-badge">${employee.status || "Active"}</span></span>
                        <span>${money(employee.basicWage)}</span>
                        <span>${employee.startDate || "-"}</span>
                      </button>
                      <div class="employee-directory-actions">
                        <button class="secondary table-action" data-action="edit-employee" data-id="${employee.id}">Edit</button>
                        <button class="ghost table-action" data-action="start-payroll" data-id="${employee.id}">Payroll</button>
                        <button class="danger-button table-action" data-action="delete-employee" data-id="${employee.id}" data-name="${employee.fullName}">Delete</button>
                      </div>
                    </article>
                  `).join("")}
                </div>`
              : `<div class="empty">No employees match these filters.</div>`
          }
        </section>

        <aside class="panel employee-profile-panel">
          ${
            selectedEmployee
              ? `
                <div class="employee-profile-hero">
                  ${employeeAvatar(selectedEmployee, "employee-avatar-large")}
                  <h3>${selectedEmployee.fullName}</h3>
                  <p class="muted">${selectedEmployee.department || "General"}${selectedEmployee.title ? ` · ${selectedEmployee.title}` : ""}</p>
                </div>
                <div class="section-switcher">
                  ${sectionToggle("profile", state.peopleProfileTab, "Profile", "set-people-tab", "tab")}
                  ${sectionToggle("pay", state.peopleProfileTab, "Pay setup", "set-people-tab", "tab")}
                  ${sectionToggle("readiness", state.peopleProfileTab, "Payroll readiness", "set-people-tab", "tab")}
                </div>
                ${
                  state.peopleProfileTab === "profile"
                    ? `<section class="employee-profile-section">
                        <h4>Contact and identity</h4>
                        <div class="employee-profile-fact-list">
                          <div><span>Phone</span><strong>${selectedEmployee.profile?.cellphone || "Not saved"}</strong></div>
                          <div><span>Email</span><strong>${selectedEmployee.profile?.personalEmail || "Not saved"}</strong></div>
                          <div><span>ID</span><strong>${selectedEmployee.idNumber || "Not saved"}</strong></div>
                          <div><span>Department</span><strong>${selectedEmployee.department || "Not saved"}</strong></div>
                        </div>
                      </section>`
                    : ""
                }
                ${
                  state.peopleProfileTab === "pay"
                    ? `<section class="employee-profile-section">
                        <h4>Pay setup</h4>
                        <div class="employee-profile-fact-list">
                          <div><span>Basic wage</span><strong>${money(selectedEmployee.basicWage)}</strong></div>
                          <div><span>Allowances</span><strong>${money(selectedEmployee.taxableAllowances || 0)}</strong></div>
                          <div><span>Bonus</span><strong>${money(selectedEmployee.standardBonus || 0)}</strong></div>
                          <div><span>Total</span><strong>${money(selectedTotal)}</strong></div>
                          <div><span>Bank name</span><strong>${selectedEmployee.bankName || "Not saved"}</strong></div>
                          <div><span>Account number</span><strong>${selectedEmployee.accountNumber || "Not saved"}</strong></div>
                        </div>
                      </section>`
                    : ""
                }
                ${
                  state.peopleProfileTab === "readiness"
                    ? `<section class="employee-profile-section">
                        <h4>Payroll readiness</h4>
                        ${payrollReadiness(selectedEmployee).ready ? `<div class="notice good"><h3>Ready for payroll</h3><p class="muted">No blocking payroll issues detected for this employee.</p></div>` : `<div class="notice warn"><h3>Action required</h3><p class="muted">${payrollReadiness(selectedEmployee).issues.join(" ")}</p></div>`}
                        <div class="employee-profile-fact-list">
                          <div><span>Leave balance</span><strong>${number(selectedLeave, 0)} days</strong></div>
                          <div><span>Status</span><strong>${selectedEmployee.status || "Active"}</strong></div>
                          <div><span>Payroll month</span><strong>${state.reportMonth}</strong></div>
                        </div>
                      </section>`
                    : ""
                }
              `
              : `<div class="empty">Select an employee to see more detail.</div>`
          }
        </aside>
      </section>
    </section>
  `;
}

function payrollView() {
  const activeEmployees = state.employees.filter((employee) => (employee.status || "active") === "active");
  const scopedEmployee = state.employees.find((employee) => employee.id === state.selectedEmployeeId) || null;
  const previewEmployee = scopedEmployee || activeEmployees[0] || state.employees[0] || null;
  const runMetrics = state.activeRun?.result?.metrics || {};
  const totalGross = state.activeRun
    ? Number(runMetrics.taxableGross || 0)
    : activeEmployees.reduce((sum, employee) => sum + Number(employee.basicWage || 0) + Number(employee.taxableAllowances || 0), 0);
  const totalDeductions = state.activeRun
    ? Number(runMetrics.employeeSsc || 0) + Number(runMetrics.paye || 0) + Number(state.activeRun.input?.otherDeductions || 0)
    : Number((state.report?.summary || {}).paye || 0) + Number((state.report?.summary || {}).employeeSsc || 0);
  const totalNet = state.activeRun ? Number(runMetrics.netPay || 0) : Math.max(totalGross - totalDeductions, 0);
  const readiness = scopedEmployee
    ? payrollReadiness(scopedEmployee)
    : (() => {
        const issues = activeEmployees
          .flatMap((employee) => payrollReadiness(employee).issues.map((issue) => `${employee.fullName}: ${issue}`))
          .slice(0, 3);
        return {
          ready: issues.length === 0,
          issues: issues.length ? issues : ["All active employees have the minimum payroll data required."],
        };
      })();
  const employeeOptions = state.employees
    .filter((employee) => matchesSearch(state.globalSearch, employee.fullName, employee.employeeNumber, employee.department, employee.title))
    .map(
      (employee) =>
        `<option value="${employee.id}" ${scopedEmployee?.id === employee.id ? "selected" : ""}>${employee.employeeNumber} · ${employee.fullName}</option>`,
    )
    .join("");

  return `
    <section class="panel-grid payroll-mock-page">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Payroll</p>
            <h2>Approve and publish payroll</h2>
            <p class="muted">A guided workflow that keeps period selection, review, outputs, and publishing in the same place.</p>
          </div>
        </div>
        ${payrollStepper()}
        ${!readiness.ready && state.payrollStep !== "period" ? `<div class="banner">Action required: ${readiness.issues.join(" ")}</div>` : ""}
        <form id="payroll-form" class="payroll-modal-form">
          <input type="hidden" name="allowances" value="0" />
          <input type="hidden" name="bonus" value="0" />
          <input type="hidden" name="otherDeductions" value="0" />
          <input type="hidden" name="overtimeHours" value="0" />
          <input type="hidden" name="maxDailyOvertime" value="0" />
          <input type="hidden" name="maxWeeklyOvertime" value="0" />
          <input type="hidden" name="sundayHours" value="0" />
          <input type="hidden" name="publicHolidayHours" value="0" />
          <input type="hidden" name="nightHours" value="0" />
          <input type="hidden" name="annualLeaveUsed" value="0" />
          <input type="hidden" name="sickLeaveUsed" value="0" />
          <input type="hidden" name="ordinarilyWorksSunday" value="false" />
          <input type="hidden" name="publicHolidayOrdinaryDay" value="false" />
          ${
            state.payrollStep === "period"
              ? `
                <div class="payroll-step-shell">
                <div class="payroll-stage-head">
                  <div>
                    <p class="section-kicker">Step 1</p>
                    <h3>Select payroll period</h3>
                  </div>
                  <span class="tag">Choose scope and month</span>
                </div>
                <div class="grid-2">
                  <label>Payroll period
                    <input type="month" name="payrollMonth" value="${state.reportMonth}" required />
                  </label>
                  <label>Run scope
                    <select name="employeeId">
                      <option value="">All active employees</option>
                      ${employeeOptions}
                    </select>
                  </label>
                </div>
                <div class="stats compact-stats">
                  <article class="stat"><span class="stat-label">Payroll period</span><span class="stat-value">${state.reportMonth}</span></article>
                  <article class="stat"><span class="stat-label">Run scope</span><span class="stat-value">${scopedEmployee ? scopedEmployee.fullName : `${activeEmployees.length} employees`}</span></article>
                </div>
                </div>
              `
              : ""
          }
          ${
            state.payrollStep === "inputs"
              ? `
                <div class="payroll-step-shell">
                <div class="payroll-stage-head">
                  <div>
                    <p class="section-kicker">Step 2</p>
                    <h3>Review payroll inputs</h3>
                  </div>
                  <span class="tag">Readiness and source checks</span>
                </div>
                <div class="payroll-review-grid">
                  <article class="payroll-review-card">
                    <span class="payroll-review-icon">◉</span>
                    <div>
                      <span>People in run</span>
                      <strong>${scopedEmployee ? 1 : activeEmployees.length}</strong>
                      <small>${scopedEmployee ? scopedEmployee.fullName : `${activeEmployees.length} active employees selected`}</small>
                    </div>
                  </article>
                  <article class="payroll-review-card">
                    <span class="payroll-review-icon">!</span>
                    <div>
                      <span>Payroll readiness</span>
                      <strong>${readiness.ready ? "Ready" : "Action required"}</strong>
                      <small>${readiness.ready ? "No blocking payroll issues detected." : readiness.issues[0]}</small>
                    </div>
                  </article>
                  <article class="payroll-review-card">
                    <span class="payroll-review-icon">%</span>
                    <div>
                      <span>Compliance inputs</span>
                      <strong>${previewEmployee?.idNumber ? "ID captured" : "Missing statutory info"}</strong>
                      <small>PAYE and SSC checks depend on employee statutory data.</small>
                    </div>
                  </article>
                </div>
                ${
                  !readiness.ready
                    ? `<div class="notice warn"><h3>Missing payroll-critical information</h3><p class="muted">${readiness.issues.join(" ")}</p></div>`
                    : ""
                }
                </div>
              `
              : ""
          }
          ${
            state.payrollStep === "outputs"
              ? `
                <div class="payroll-step-shell">
                <div class="payroll-stage-head">
                  <div>
                    <p class="section-kicker">Step 3</p>
                    <h3>Review payroll outputs</h3>
                  </div>
                  <span class="tag">High-confidence payroll summary</span>
                </div>
                <div class="payroll-review-grid">
                  <article class="payroll-review-card">
                    <span class="payroll-review-icon">◌</span>
                    <div>
                      <span>Gross remuneration</span>
                      <strong>${money(totalGross)}</strong>
                      <small>Estimated taxable payroll for this run</small>
                    </div>
                  </article>
                  <article class="payroll-review-card">
                    <span class="payroll-review-icon">%</span>
                    <div>
                      <span>Total deductions</span>
                      <strong>${money(totalDeductions)}</strong>
                      <small>PAYE and employee SSC</small>
                    </div>
                  </article>
                  <article class="payroll-review-card">
                    <span class="payroll-review-icon">$</span>
                    <div>
                      <span>Estimated net pay</span>
                      <strong>${money(totalNet)}</strong>
                      <small>Strong NAD summary before approval</small>
                    </div>
                  </article>
                </div>
                </div>
              `
              : ""
          }
          ${
            state.payrollStep === "publish"
              ? `
                <div class="payroll-step-shell">
                <div class="payroll-stage-head">
                  <div>
                    <p class="section-kicker">Step 4</p>
                    <h3>Approve and publish</h3>
                  </div>
                  <span class="tag">Create payroll history and payslips</span>
                </div>
                <div class="notice good">
                  <h3>Approve and publish payroll</h3>
                  <p class="muted">When you confirm, this payroll run is created, saved to history, and can be published as a payslip.</p>
                </div>
                <div class="payroll-modal-actions">
                  <button class="secondary" type="button" data-action="bulk-payroll-run">Approve all selected employees</button>
                  <button class="primary" type="submit">Approve and publish</button>
                </div>
                </div>
              `
              : `<div class="payroll-modal-actions"><button class="primary" type="button" data-action="advance-payroll-step">Continue</button></div>`
          }
        </form>
      </section>
      <section class="panel printable payroll-result-panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Outputs</p>
            <h2>${state.activeRun ? `${state.activeRun.employeeName} · ${state.activeRun.payrollMonth}` : "Latest payroll result"}</h2>
          </div>
          ${
            state.activeRun
              ? `
                <div class="employee-row-actions">
                  <button class="secondary" data-action="download-run-pdf" data-id="${state.activeRun.id}">Download PDF</button>
                  ${state.activeRun.status === "cancelled" ? `<span class="status-badge status-declined">Cancelled</span>` : `<button class="danger-button" data-action="cancel-run" data-id="${state.activeRun.id}" data-name="${state.activeRun.employeeName}" data-month="${state.activeRun.payrollMonth}">Cancel run</button>`}
                  <button class="secondary" data-action="print">Print</button>
                </div>
              `
              : ""
          }
        </div>
        ${state.activeRun ? payslipView(state.activeRun) : `<div class="empty">Create or open a payroll run to view its payslip.</div>`}
      </section>
    </section>
  `;
}

function requestsHubView() {
  const { items, selected } = syncRequestsSelection();
  const pendingCount = items.filter((entry) => ["pending", "submitted", "scheduled", "late", "clocked_in"].includes(entry.status)).length;
  const completedCount = items.filter((entry) => ["approved", "completed"].includes(entry.status)).length;
  const blockedCount = items.filter((entry) => ["declined", "rejected", "missed", "cancelled"].includes(entry.status)).length;
  const requestLabels = {
    leave: "Leave",
    loans: "Loans",
    timesheets: "Timesheets",
    attendance: "Attendance",
  };

  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Requests</p>
            <h2>Unified employee request hub</h2>
            <p class="muted">Review leave, loans, timesheets, and attendance in one queue.</p>
          </div>
          <div class="section-switcher">
            ${sectionToggle("leave", state.requestsTab, "Leave", "set-requests-tab", "tab")}
            ${sectionToggle("loans", state.requestsTab, "Loans", "set-requests-tab", "tab")}
            ${sectionToggle("timesheets", state.requestsTab, "Timesheets", "set-requests-tab", "tab")}
            ${sectionToggle("attendance", state.requestsTab, "Attendance", "set-requests-tab", "tab")}
          </div>
        </div>
        ${state.reviewError ? `<div class="banner danger-banner">${state.reviewError}</div>` : ""}
        ${state.leaveError && state.requestsTab === "leave" ? `<div class="banner danger-banner">${state.leaveError}</div>` : ""}
        <div class="requests-summary-grid">
          ${requestSummaryCard(`${requestLabels[state.requestsTab]} queue`, items.length)}
          ${requestSummaryCard("Action required", pendingCount, pendingCount ? "warning" : "default")}
          ${requestSummaryCard("Completed", completedCount, "success")}
          ${requestSummaryCard("Exceptions", blockedCount, blockedCount ? "danger" : "default")}
        </div>
      </section>
      <section class="panel request-workspace-shell">
        <div class="request-queue-pane">
          <div class="compact-section-head">
            <div>
              <p class="section-kicker">Queue</p>
              <h3>${requestLabels[state.requestsTab]} to review</h3>
            </div>
            <span class="tag">${items.length} item${items.length === 1 ? "" : "s"}</span>
          </div>
          <div class="request-review-list">
            ${
              items.length
                ? items.map((entry) => requestReviewCard(entry)).join("")
                : `<div class="empty">No ${requestLabels[state.requestsTab].toLowerCase()} items match the current filters. Use search or wait for a new request.</div>`
            }
          </div>
        </div>
      </section>
      ${
        state.requestDrawerOpen
          ? `
            <button class="request-drawer-backdrop" data-action="close-request-drawer" type="button" aria-label="Close request review"></button>
            <aside class="request-drawer" aria-label="Request review drawer">
              <div class="request-drawer-head">
                <div>
                  <p class="section-kicker">Review drawer</p>
                  <h3>${selected ? "Selected request" : "No request selected"}</h3>
                </div>
                <div class="employee-row-actions">
                  ${selected ? `<span class="status-badge status-${selected.status}">${selected.status.replace("_", " ")}</span>` : ""}
                  <button class="secondary table-action" data-action="close-request-drawer" type="button">Close</button>
                </div>
              </div>
              ${requestReviewDetail(selected)}
            </aside>
          `
          : ""
      }
    </section>
  `;
}

function reportsView() {
  const summary = state.report?.summary;
  const rows = (state.report?.items || []).filter((item) =>
    item.status !== "cancelled" &&
    matchesSearch(state.globalSearch, item.employeeName, item.employeeNumber, item.payrollMonth, item.createdBy),
  );
  const analytics = state.report?.analytics || {};
  const compliance = state.report?.compliance || {};
  const headcount = analytics.headcount || {};
  const departmentCosts = (analytics.departmentPayrollCost || []).filter((item) =>
    matchesSearch(state.globalSearch, item.department, item.employeeCount),
  );
  const overtimeTrends = (analytics.overtimeTrends || []).filter((item) =>
    matchesSearch(state.globalSearch, item.month),
  );
  const leaveLiability = (analytics.leaveLiability || []).filter((item) =>
    matchesSearch(state.globalSearch, item.employeeName, item.employeeNumber, item.department),
  );
  const loanExposure = analytics.loanExposure || {};
  const financeTrend = (departmentCosts.length
    ? departmentCosts.slice(0, 5).map((item) => ({
        label: item.department,
        primary: Number(item.employerCost || 0),
        secondary: Math.max(Number(item.employerCost || 0) - Number(item.employeeCost || 0), 0),
      }))
    : rows.slice(0, 5).map((item) => ({
        label: item.employeeName.split(" ")[0],
        primary: Number(item.result?.metrics?.taxableGross || 0),
        secondary: Number(item.result?.metrics?.netPay || 0),
      })));
  const deductionSeries = [
    { label: "PAYE", value: Number(summary?.paye || 0), color: "#ff8a1f" },
    { label: "Employee SSC", value: Number(summary?.employeeSsc || 0), color: "#1396a3" },
    { label: "Loans", value: Number(loanExposure.totalOutstandingEstimate || 0), color: "#6d5df6" },
  ];
  const departmentChartRows =
    departmentCosts.length
      ? buildBarChart(departmentCosts.slice(0, 6), "employerCost", "department", money)
      : `<div class="empty">No department payroll cost data is available for this month.</div>`;
  const overtimeRows =
    overtimeTrends.length
      ? buildBarChart(
          overtimeTrends.map((item) => ({ month: item.month, overtimePay: item.overtimePay || 0 })),
          "overtimePay",
          "month",
          money,
        )
      : `<div class="empty">No overtime trend is available yet.</div>`;
  const topLeaveLiability = leaveLiability.slice(0, 6);
  return `
    <section class="panel-grid reports-mock-page">
      <section class="reports-header-bar">
        <div>
          <p class="section-kicker">Reports</p>
          <h2>Payroll reporting and exports</h2>
          <p class="muted">Separate reporting from compliance and keep cost, people, and exports easier to scan.</p>
        </div>
        <form id="report-form" class="reports-toolbar">
          <label class="reports-month-input">Month
            <input type="month" name="month" value="${state.reportMonth}" required />
          </label>
          <button class="primary" type="submit">Load</button>
          <button class="secondary" type="button" data-action="export-finance" data-type="payroll-journal" data-month="${state.reportMonth}">Export payroll journal</button>
        </form>
      </section>
      ${
        !summary
          ? `<section class="panel"><div class="empty">Load a month to see the redesigned reports dashboard.</div></section>`
          : `
            <section class="panel">
              <div class="section-switcher">
                ${sectionToggle("summary", state.reportSection, "Summary", "set-report-section", "section")}
                ${sectionToggle("people", state.reportSection, "People", "set-report-section", "section")}
                ${sectionToggle("finance", state.reportSection, "Finance", "set-report-section", "section")}
                ${sectionToggle("runs", state.reportSection, "Runs", "set-report-section", "section")}
              </div>
            </section>
            ${
              state.reportSection === "summary"
                ? `
                  <section class="reports-card-grid">
                    <article class="panel reports-analytics-card">
                      <div class="reports-card-head">
                        <div>
                          <h3>Payroll summary</h3>
                          <p class="muted">Employer cost, net pay, and gross trend</p>
                        </div>
                        <span class="pill">Employer cost ${money(summary.employerCost || 0)}</span>
                      </div>
                      ${buildLineComparisonChart(financeTrend, "primary", "secondary", "label")}
                    </article>
                    <article class="panel reports-analytics-card">
                      <div class="reports-card-head">
                        <div>
                          <h3>Monthly deduction mix</h3>
                          <p class="muted">PAYE, SSC, and outstanding loans</p>
                        </div>
                        <span class="pill">${summary.runCount} payroll runs</span>
                      </div>
                      ${buildDonutLegend(deductionSeries)}
                    </article>
                    <article class="panel reports-analytics-card">
                      <div class="reports-card-head">
                        <div>
                          <h3>Monthly totals</h3>
                          <p class="muted">Strong NAD figures for this payroll month</p>
                        </div>
                      </div>
                      <div class="stats compact-stats">
                        <article class="stat"><span class="stat-label">Gross remuneration</span><span class="stat-value">${money(summary.taxableGross || 0)}</span></article>
                        <article class="stat"><span class="stat-label">Net pay</span><span class="stat-value">${money(summary.netPay || 0)}</span></article>
                        <article class="stat"><span class="stat-label">PAYE withheld</span><span class="stat-value">${money(summary.paye || 0)}</span></article>
                        <article class="stat"><span class="stat-label">Employee SSC</span><span class="stat-value">${money(summary.employeeSsc || 0)}</span></article>
                      </div>
                    </article>
                  </section>
                `
                : ""
            }
            ${
              state.reportSection === "people"
                ? `
                  <section class="reports-card-grid">
                    <article class="panel reports-analytics-card">
                      <div class="reports-card-head">
                        <div>
                          <h3>Workforce snapshot</h3>
                          <p class="muted">Headcount and department payroll cost</p>
                        </div>
                        <span class="pill">${headcount.active || 0} active employees</span>
                      </div>
                      <div class="stats compact-stats">
                        <article class="stat"><span class="stat-label">Total employees</span><span class="stat-value">${headcount.total || state.employees.length}</span></article>
                        <article class="stat"><span class="stat-label">Active employees</span><span class="stat-value">${headcount.active || 0}</span></article>
                        <article class="stat"><span class="stat-label">Departments</span><span class="stat-value">${departmentCosts.length}</span></article>
                        <article class="stat"><span class="stat-label">Average salary</span><span class="stat-value">${money(headcount.averageBasicSalary || 0)}</span></article>
                      </div>
                      ${departmentChartRows}
                    </article>
                    <article class="panel reports-analytics-card">
                      <div class="reports-card-head">
                        <div>
                          <h3>Leave liability</h3>
                          <p class="muted">Employees with the highest leave exposure</p>
                        </div>
                        <span class="pill">${money(analytics.leaveLiabilityTotal || 0)}</span>
                      </div>
                      ${
                        topLeaveLiability.length
                          ? `<div class="employee-table-wrap">
                              <table class="employee-table report-summary-table">
                                <thead>
                                  <tr>
                                    <th>Employee</th>
                                    <th>Department</th>
                                    <th>Outstanding days</th>
                                    <th>Liability</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${topLeaveLiability.map((item) => `
                                    <tr>
                                      <td>${item.employeeName}</td>
                                      <td>${item.department || "-"}</td>
                                      <td>${number(item.outstandingAnnualLeaveDays || 0, 0)}</td>
                                      <td>${money(item.liabilityAmount || 0)}</td>
                                    </tr>
                                  `).join("")}
                                </tbody>
                              </table>
                            </div>`
                          : `<div class="empty">No leave liability data is available yet.</div>`
                      }
                    </article>
                  </section>
                `
                : ""
            }
            ${
              state.reportSection === "finance"
                ? `
                  <section class="reports-card-grid">
                    <article class="panel reports-analytics-card">
                      <div class="reports-card-head">
                        <div>
                          <h3>Exports</h3>
                          <p class="muted">Finance-ready outputs for this payroll month</p>
                        </div>
                      </div>
                      <div class="employee-row-actions">
                        <button class="secondary" type="button" data-action="export-finance" data-type="payroll-journal" data-month="${state.reportMonth}">Payroll journal</button>
                        <button class="secondary" type="button" data-action="export-finance" data-type="bank-file" data-month="${state.reportMonth}">Bank payment file</button>
                        <button class="secondary" type="button" data-action="export-finance" data-type="deduction-schedule" data-month="${state.reportMonth}">Deduction schedule</button>
                      </div>
                      <div class="notice"><p class="muted">Use Compliance for PAYE and SSC filing readiness. This screen stays focused on payroll cost and export outputs.</p></div>
                    </article>
                    <article class="panel reports-analytics-card">
                      <div class="reports-card-head">
                        <div>
                          <h3>Overtime trend</h3>
                          <p class="muted">Recent overtime pay trend by month</p>
                        </div>
                      </div>
                      ${overtimeRows}
                    </article>
                    <article class="panel reports-analytics-card">
                      <div class="reports-card-head">
                        <div>
                          <h3>Loan exposure</h3>
                          <p class="muted">Current approved employee loan position</p>
                        </div>
                      </div>
                      <div class="stats compact-stats">
                        <article class="stat"><span class="stat-label">Approved loans</span><span class="stat-value">${loanExposure.approvedCount || 0}</span></article>
                        <article class="stat"><span class="stat-label">Original principal</span><span class="stat-value">${money(loanExposure.totalPrincipal || 0)}</span></article>
                        <article class="stat"><span class="stat-label">Outstanding</span><span class="stat-value">${money(loanExposure.totalOutstandingEstimate || 0)}</span></article>
                        <article class="stat"><span class="stat-label">Monthly installments</span><span class="stat-value">${money(loanExposure.totalInstallmentEstimate || 0)}</span></article>
                      </div>
                    </article>
                  </section>
                `
                : ""
            }
            ${
              state.reportSection === "runs"
                ? `
                  <section class="panel reports-analytics-card">
                    <div class="reports-card-head">
                      <div>
                        <h3>Payroll history</h3>
                        <p class="muted">Published payroll runs for ${state.reportMonth}</p>
                      </div>
                      <span class="pill">${rows.length} run${rows.length === 1 ? "" : "s"}</span>
                    </div>
                    ${
                      rows.length
                        ? `<div class="employee-table-wrap">
                            <table class="employee-table report-summary-table">
                              <thead>
                                <tr>
                                  <th>Employee</th>
                                  <th>Month</th>
                                  <th>Gross</th>
                                  <th>Net</th>
                                  <th>Created by</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${rows.map((item) => `
                                  <tr>
                                    <td>${item.employeeName}</td>
                                    <td>${item.payrollMonth}</td>
                                    <td>${money(item.result?.metrics?.taxableGross || 0)}</td>
                                    <td>${money(item.result?.metrics?.netPay || 0)}</td>
                                    <td>${item.createdBy || "-"}</td>
                                    <td><button class="secondary table-action" data-action="open-run" data-id="${item.id}">Open</button></td>
                                  </tr>
                                `).join("")}
                              </tbody>
                            </table>
                          </div>`
                        : `<div class="empty">No payroll runs are available for this month yet.</div>`
                    }
                  </section>
                `
                : ""
            }
          `
      }
    </section>
  `;
}

function complianceView() {
  const compliance = state.report?.compliance || {};
  const emp201 = compliance.emp201 || {};
  const sscRemittance = compliance.sscRemittance || {};
  const leaveAccrualRules = compliance.leaveAccrualRules || [];
  const holidayCalendar = compliance.holidayCalendar || [];
  const missingStatutory = state.employees.filter((employee) =>
    !employee.idNumber || !employee.bankName || !employee.accountNumber || !employee.startDate,
  );

  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Compliance</p>
            <h2>PAYE, SSC, and filing readiness</h2>
            <p class="muted">Separate compliance from reporting so statutory issues are easier to spot and act on.</p>
          </div>
          <form id="report-form" class="reports-toolbar">
            <label class="reports-month-input">Month
              <input type="month" name="month" value="${state.reportMonth}" required />
            </label>
            <button class="primary" type="submit">Refresh</button>
          </form>
        </div>
        <div class="stats compact-stats">
          <article class="stat"><span class="stat-label">PAYE due</span><span class="stat-value">${money(emp201.payeDue || 0)}</span></article>
          <article class="stat"><span class="stat-label">Employee SSC</span><span class="stat-value">${money(sscRemittance.employeeContribution || 0)}</span></article>
          <article class="stat"><span class="stat-label">Employer SSC</span><span class="stat-value">${money(sscRemittance.employerContribution || 0)}</span></article>
          <article class="stat"><span class="stat-label">Action required</span><span class="stat-value">${missingStatutory.length}</span></article>
        </div>
      </section>
      <section class="reports-card-grid">
        <article class="panel reports-analytics-card">
          <div class="reports-card-head">
            <div>
              <h3>Filing readiness</h3>
              <p class="muted">Current month checklist</p>
            </div>
            <span class="pill">${sscRemittance.dueDateHint || "Due date not set"}</span>
          </div>
          <div class="compliance-status-list">
            <div class="compliance-status-row"><div class="compliance-status-title"><span class="compliance-status-dot ${emp201.payeDue ? "warning" : ""}"></span><strong>PAYE filing</strong></div><span class="status-badge ${emp201.payeDue ? "status-pending" : ""}">${emp201.payeDue ? "Pending" : "Ready"}</span></div>
            <div class="compliance-status-row"><div class="compliance-status-title"><span class="compliance-status-dot ${sscRemittance.employeeContribution ? "warning" : ""}"></span><strong>SSC remittance</strong></div><span class="status-badge ${sscRemittance.employeeContribution ? "status-pending" : ""}">${sscRemittance.employeeContribution ? "Pending" : "Ready"}</span></div>
            <div class="compliance-status-row"><div class="compliance-status-title"><span class="compliance-status-dot ${holidayCalendar.length ? "" : "warning"}"></span><strong>Holiday calendar</strong></div><span class="status-badge ${holidayCalendar.length ? "" : "status-pending"}">${holidayCalendar.length ? "Loaded" : "Pending"}</span></div>
            <div class="compliance-status-row"><div class="compliance-status-title"><span class="compliance-status-dot ${leaveAccrualRules.length ? "" : "warning"}"></span><strong>Leave accrual rules</strong></div><span class="status-badge ${leaveAccrualRules.length ? "" : "status-pending"}">${leaveAccrualRules.length ? "Ready" : "Pending"}</span></div>
          </div>
        </article>
        <article class="panel reports-analytics-card">
          <div class="reports-card-head">
            <div>
              <h3>Missing statutory data</h3>
              <p class="muted">Employees blocking clean payroll or filings</p>
            </div>
            <span class="pill">${missingStatutory.length} employees</span>
          </div>
          <div class="list compact-list">
            ${missingStatutory.length
              ? missingStatutory.slice(0, 8).map((employee) => `
                  <article class="notice warn">
                    <div class="record-head">
                      <div>
                        <h3>${employee.fullName}</h3>
                        <p class="muted">${employee.employeeNumber} · ${employee.department || "No department"}</p>
                      </div>
                      <button class="secondary table-action" data-action="edit-employee" data-id="${employee.id}">Review</button>
                    </div>
                    <p class="muted">${[
                      !employee.idNumber ? "Missing ID" : "",
                      !employee.bankName || !employee.accountNumber ? "Missing bank details" : "",
                      !employee.startDate ? "Missing start date" : "",
                    ].filter(Boolean).join(" · ")}</p>
                  </article>
                `).join("")
              : `<div class="empty">No missing statutory records right now.</div>`}
          </div>
        </article>
      </section>
    </section>
  `;
}

function dataView() {
  const storage = state.dataStatus?.storage || {};
  const counts = state.dataStatus?.counts || {};
  const backups = state.dataStatus?.backups || [];
  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Data</p>
            <h2>Storage and migration</h2>
          </div>
        </div>
        <div class="stats compact-stats">
          <article class="stat"><span class="stat-label">Engine</span><span class="stat-value">${storage.engine || "n/a"}</span></article>
          <article class="stat"><span class="stat-label">Employees</span><span class="stat-value">${counts.employees || 0}</span></article>
          <article class="stat"><span class="stat-label">Payroll runs</span><span class="stat-value">${counts.payrollRuns || 0}</span></article>
        </div>
        <div class="list compact-list">
          <article class="notice"><h3>SQLite</h3><p class="muted">${storage.sqlitePath || "Not available"}</p></article>
          <article class="notice"><h3>Legacy JSON</h3><p class="muted">${storage.legacyJsonPath || "Not available"}</p></article>
        </div>
      </section>
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Export</p>
            <h2>CSV and JSON</h2>
          </div>
        </div>
        <div class="actions">
          <button class="secondary" data-action="export-data" data-type="employees-csv">Employees CSV</button>
          <button class="secondary" data-action="export-data" data-type="payroll-runs-csv">Payroll CSV</button>
          <button class="secondary" data-action="export-data" data-type="full-json">Full JSON</button>
        </div>
      </section>
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Import</p>
            <h2>Employee CSV import</h2>
          </div>
        </div>
        <form id="employee-import-form">
          <label>CSV file <input type="file" name="csvFile" accept=".csv,text/csv" required /></label>
          <div class="actions">
            <button class="primary" type="submit">Import employees</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Backup</p>
            <h2>Snapshots and restore</h2>
          </div>
        </div>
        <div class="actions">
          <button class="primary" data-action="create-backup">Create backup</button>
        </div>
        <div class="list compact-list">
          ${backups.length
            ? backups.slice(0, 8).map((backup) => `
                <article class="notice">
                  <div class="record-head">
                    <div>
                      <h3>${backup.name}</h3>
                      <p class="muted">${backup.createdAt.slice(0, 19).replace("T", " ")} · ${backup.size} bytes</p>
                    </div>
                    <button class="secondary table-action" data-action="restore-backup" data-name="${backup.name}">Restore</button>
                  </div>
                </article>
              `).join("")
            : `<div class="empty">No backups yet.</div>`}
        </div>
        <form id="restore-json-form">
          <label>Restore from JSON file <input type="file" name="jsonFile" accept=".json,application/json" /></label>
          <div class="actions">
            <button class="secondary" type="submit">Restore uploaded JSON</button>
          </div>
        </form>
      </section>
    </section>
  `;
}

function settingsView() {
  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Settings</p>
            <h2>Company setup, rules, notifications, and backups</h2>
            <p class="muted">Group company controls into one place without changing the payroll engine underneath.</p>
          </div>
          <div class="section-switcher">
            ${sectionToggle("company", state.settingsSection, "Company", "set-settings-section", "section")}
            ${sectionToggle("notifications", state.settingsSection, "Notifications", "set-settings-section", "section")}
            ${sectionToggle("rules", state.settingsSection, "Payroll rules", "set-settings-section", "section")}
            ${sectionToggle("data", state.settingsSection, "Data and backups", "set-settings-section", "section")}
          </div>
        </div>
      </section>
      ${state.settingsSection === "company" ? companyProfileSettingsView() : ""}
      ${state.settingsSection === "notifications" ? notificationsSettingsView() : ""}
      ${state.settingsSection === "data" ? dataView() : ""}
      ${state.settingsSection === "rules"
        ? `<section class="panel">
            <p class="section-kicker">Payroll rules</p>
            <h2>Current payroll defaults</h2>
            <div class="stats compact-stats">
              <article class="stat"><span class="stat-label">Minimum wage checks</span><span class="stat-value">Enabled</span></article>
              <article class="stat"><span class="stat-label">PAYE logic</span><span class="stat-value">Namibia</span></article>
              <article class="stat"><span class="stat-label">SSC logic</span><span class="stat-value">Enabled</span></article>
              <article class="stat"><span class="stat-label">Overtime checks</span><span class="stat-value">Enabled</span></article>
            </div>
            <div class="notice"><p class="muted">Payroll calculations stay unchanged in this MVP redesign. This section is a clearer home for rules, thresholds, and future locked-period controls.</p></div>
          </section>`
        : ""}
    </section>
  `;
}

function documentsView() {
  const employeeOptions = state.employees
    .filter((employee) => matchesSearch(state.globalSearch, employee.fullName, employee.employeeNumber, employee.department, employee.title))
    .map((employee) => `<option value="${employee.id}">${employee.employeeNumber} · ${employee.fullName}</option>`)
    .join("");

  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Documents</p>
            <h2>Generate HR PDFs</h2>
            <p class="muted">Create offer letters, leave forms, disciplinary letters, and termination forms for employee records.</p>
          </div>
        </div>
        <div class="mini-search-wrap">
          <input class="workspace-search" id="global-search" placeholder="Search employees or documents" value="${state.globalSearch}" />
        </div>
        <form id="document-form" class="grid-3">
          <label>Employee
            <select name="employeeId" required>
              <option value="">Select employee</option>
              ${employeeOptions}
            </select>
          </label>
          <label>Document type
            <select name="documentType" required>
              <option value="offer-letter">Offer letter</option>
              <option value="leave-form">Leave form</option>
              <option value="disciplinary-letter">Disciplinary letter</option>
              <option value="termination-form">Termination form</option>
            </select>
          </label>
          <label>Issue date <input type="date" name="issueDate" value="${new Date().toISOString().slice(0, 10)}" required /></label>
          <label>Effective date <input type="date" name="effectiveDate" /></label>
          <label>Subject <input name="subject" placeholder="Document subject or reference" /></label>
          <label>Compensation / amount <input type="number" min="0" step="0.01" name="compensation" placeholder="For offer letters" /></label>
          <label>Leave type <input name="leaveType" placeholder="For leave forms" /></label>
          <label>Leave start <input type="date" name="startDate" /></label>
          <label>Leave end <input type="date" name="endDate" /></label>
          <label>Incident date <input type="date" name="incidentDate" /></label>
          <label>Reason <input name="reason" placeholder="Reason or summary" /></label>
          <label>Signatory <input name="signatory" value="HR Manager" /></label>
          <label class="span-2">Notes
            <textarea name="notes" placeholder="Add custom wording, conditions, notice details, or internal instructions"></textarea>
          </label>
          <div class="actions">
            <button class="primary" type="submit">Download PDF</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <p class="section-kicker">Included Templates</p>
        <h2>Available document types</h2>
        <div class="list">
          <article class="notice"><h3>Offer Letter</h3><p class="muted">Employment offer with start date, subject, and salary details.</p></article>
          <article class="notice"><h3>Leave Form</h3><p class="muted">Internal leave record with dates, type, and employee reason.</p></article>
          <article class="notice"><h3>Disciplinary Letter</h3><p class="muted">Conduct notice with incident date, subject, and action summary.</p></article>
          <article class="notice"><h3>Termination Form</h3><p class="muted">Employment separation notice with effective date and recorded reason.</p></article>
        </div>
      </section>
    </section>
  `;
}

function sourceCard(source) {
  return `
    <article class="source-card">
      <div class="source-head">
        <div>
          <h3>${source.title}</h3>
          <p class="muted">${source.detail}</p>
        </div>
        <a href="${source.url}" target="_blank" rel="noreferrer">Open</a>
      </div>
    </article>
  `;
}

function employeeRow(employee) {
  const leaveBalance = Math.max(employee.daysPerWeek * 4 - Number(employee.leaveBalances?.annualLeaveUsed || 0), 0);
  return `
    <tr>
      <td class="employee-number-cell">${employee.employeeNumber}</td>
      <td>
        <div class="employee-name-cell">
          <strong>${employee.fullName}</strong>
          <span>${employee.idNumber || "No ID saved"}</span>
        </div>
      </td>
      <td>
        <div class="employee-name-cell">
          <strong>${employee.profile?.cellphone || "No cellphone"}</strong>
          <span>${employee.profile?.personalEmail || "No email saved"}</span>
        </div>
      </td>
      <td>${employee.title || "Not set"}</td>
      <td>${employee.department || "Not set"}</td>
      <td>${money(employee.basicWage)}</td>
      <td><span class="leave-badge">${number(leaveBalance, 0)} Days</span></td>
      <td><span class="status-badge">Active</span></td>
      <td>
        <div class="employee-row-actions">
          <button class="secondary table-action" data-action="edit-employee" data-id="${employee.id}">Edit</button>
          <button class="ghost table-action" data-action="start-payroll" data-id="${employee.id}">Payroll</button>
          <button class="danger-button table-action" data-action="delete-employee" data-id="${employee.id}" data-name="${employee.fullName}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function runCard(run) {
  const isCancelled = run.status === "cancelled";
  return `
    <article class="run-card">
      <div class="run-head">
        <div>
          <h3>${run.employeeName}</h3>
          <p class="muted">${run.employeeNumber} · ${run.payrollMonth} · created ${new Date(run.createdAt).toLocaleString()}</p>
        </div>
        <div class="employee-row-actions">
          <button class="secondary" data-action="open-run" data-id="${run.id}">Open</button>
          <button class="secondary" data-action="download-run-pdf" data-id="${run.id}">PDF</button>
          ${isCancelled ? `<span class="status-badge status-declined">Cancelled</span>` : `<button class="danger-button" data-action="cancel-run" data-id="${run.id}" data-name="${run.employeeName}" data-month="${run.payrollMonth}">Cancel</button>`}
        </div>
      </div>
      <div class="facts">
        <div class="fact"><span class="label">Gross</span><span class="value">${money(run.result.metrics.taxableGross)}</span></div>
        <div class="fact"><span class="label">PAYE</span><span class="value">${money(run.result.metrics.paye)}</span></div>
        <div class="fact"><span class="label">Net</span><span class="value">${money(run.result.metrics.netPay)}</span></div>
        <div class="fact"><span class="label">Employer cost</span><span class="value">${money(run.result.metrics.totalEmployerCost)}</span></div>
      </div>
    </article>
  `;
}

function leaveRequestCard(request) {
  const statusClass = request.status === "approved" ? "good" : request.status === "declined" ? "warn" : "";
  return `
    <article class="notice ${statusClass}">
      <div class="record-head">
        <div>
          <h3>${request.employeeName}</h3>
          <p class="muted">${request.employeeNumber} · ${request.leaveType} · ${request.startDate} to ${request.endDate}</p>
        </div>
        <span class="tag">${request.daysRequested} working day${request.daysRequested === 1 ? "" : "s"}</span>
      </div>
      <p class="muted">${request.reason || "No reason provided."}</p>
      <p class="muted">Calendar span: ${request.calendarDaysRequested || request.daysRequested} day${(request.calendarDaysRequested || request.daysRequested) === 1 ? "" : "s"}</p>
      <div class="employee-row-actions">
        <span class="status-badge status-${request.status}">${request.status}</span>
        ${
          request.status === "pending"
            ? `
              <button class="secondary table-action" data-action="approve-leave" data-id="${request.id}">Approve</button>
              <button class="danger-button table-action" data-action="decline-leave" data-id="${request.id}">Decline</button>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function payslipView(run) {
  const metrics = run.result.metrics;
  const leave = run.result.leave;
  const company = run.companySnapshot || state.company || {};
  const totalDeductions = Number(metrics.employeeSsc || 0) + Number(metrics.paye || 0) + Number(run.input.otherDeductions || 0);
  return `
    <article class="payslip modern-payslip">
      <div class="record-grid modern-payslip-grid">
        ${run.status === "cancelled" ? `<div class="banner danger-banner">This payroll run was cancelled${run.cancelledAt ? ` on ${new Date(run.cancelledAt).toLocaleString()}` : ""}${run.cancelledBy ? ` by ${run.cancelledBy}` : ""}.${run.cancellationReason ? ` Reason: ${run.cancellationReason}` : ""}</div>` : ""}
        <div class="payslip-hero">
          <div class="payslip-company">
            <div class="payslip-company-main">
              ${company.logoPath ? `<img class="company-logo" src="${company.logoPath}" alt="${company.name || "Company"} logo" />` : `<div class="company-logo company-logo-fallback">${(company.name || "NP").slice(0, 2).toUpperCase()}</div>`}
              <div>
                <p class="section-kicker">Payslip</p>
                <h3>${company.name || "Company"}</h3>
                <p class="muted">${company.physicalAddress || "No physical address saved yet."}</p>
              </div>
            </div>
            <div class="payslip-company-meta">
              ${company.email ? `<span class="tag">${company.email}</span>` : ""}
              ${company.cellphone ? `<span class="tag">${company.cellphone}</span>` : ""}
              ${company.website ? `<span class="tag">${company.website}</span>` : ""}
            </div>
          </div>
          <div class="payslip-summary">
            <article class="payslip-summary-card">
              <span>Employee</span>
              <strong>${run.employeeName}</strong>
              <small>${run.employeeNumber}</small>
            </article>
            <article class="payslip-summary-card">
              <span>Payroll month</span>
              <strong>${run.payrollMonth}</strong>
              <small>Prepared by ${run.createdBy}</small>
            </article>
            <article class="payslip-summary-card payslip-summary-card-accent">
              <span>Net pay</span>
              <strong>${money(metrics.netPay)}</strong>
              <small>Take-home amount</small>
            </article>
          </div>
        </div>
        <div class="modern-payslip-columns">
          <section class="compact-section">
            <div class="compact-section-head">
              <h3>Earnings</h3>
            </div>
            <table class="table payslip-table">
              <tbody>
                <tr><td>Basic wage</td><td>${money(run.input.basicWage)}</td></tr>
                <tr><td>Allowances</td><td>${money(run.input.allowances)}</td></tr>
                <tr><td>Bonus</td><td>${money(run.input.bonus)}</td></tr>
                <tr><td>Overtime</td><td>${money(metrics.overtimePay)}</td></tr>
                <tr><td>Sunday pay</td><td>${money(metrics.sundayPay)}</td></tr>
                <tr><td>Public holiday pay</td><td>${money(metrics.publicHolidayPay)}</td></tr>
                <tr><td>Night premium</td><td>${money(metrics.nightPremium)}</td></tr>
                <tr><td>Gross remuneration</td><td>${money(metrics.taxableGross)}</td></tr>
              </tbody>
            </table>
          </section>
          <section class="compact-section">
            <div class="compact-section-head">
              <h3>Deductions and Leave</h3>
            </div>
            <table class="table payslip-table">
              <tbody>
                <tr><td>Employee SSC</td><td>(${money(metrics.employeeSsc)})</td></tr>
                <tr><td>PAYE</td><td>(${money(metrics.paye)})</td></tr>
                <tr><td>Other deductions</td><td>(${money(run.input.otherDeductions)})</td></tr>
                <tr><td>Total deductions</td><td>(${money(totalDeductions)})</td></tr>
                <tr><td>Annual leave remaining</td><td>${number(leave.annualRemaining, 1)} days</td></tr>
                <tr><td>Sick leave remaining</td><td>${number(leave.sickRemaining, 1)} days</td></tr>
                <tr><td>Hourly basic</td><td>${money(metrics.hourlyBasic)}</td></tr>
                <tr><td>Minimum hourly</td><td>${money(metrics.minimumHourly)}</td></tr>
              </tbody>
            </table>
          </section>
        </div>
        <div class="payslip-totals">
          <article class="payslip-total-card">
            <span>Gross</span>
            <strong>${money(metrics.taxableGross)}</strong>
          </article>
          <article class="payslip-total-card payslip-total-card-dark">
            <span>Deductions</span>
            <strong>${money(totalDeductions)}</strong>
          </article>
          <article class="payslip-total-card payslip-total-card-green">
            <span>Net Pay</span>
            <strong>${money(metrics.netPay)}</strong>
          </article>
        </div>
      </div>
    </article>
  `;
}

function companyPreviewCard(company) {
  const item = company || {};
  return `
    <article class="payslip">
      <div class="payslip-company">
        <div class="payslip-company-main">
          ${item.logoPath ? `<img class="company-logo" src="${item.logoPath}" alt="${item.name || "Company"} logo" />` : `<div class="company-logo company-logo-fallback">${(item.name || "NP").slice(0, 2).toUpperCase()}</div>`}
          <div>
            <h3>${item.name || "Company name"}</h3>
            <p class="muted">${item.physicalAddress || "Physical address will appear here."}</p>
          </div>
        </div>
        <div class="payslip-company-meta">
          ${item.email ? `<span class="tag">${item.email}</span>` : `<span class="tag">Email</span>`}
          ${item.cellphone ? `<span class="tag">${item.cellphone}</span>` : `<span class="tag">Cellphone</span>`}
          ${item.website ? `<span class="tag">${item.website}</span>` : `<span class="tag">Website</span>`}
        </div>
      </div>
    </article>
  `;
}

function adminLoanRequestRow(request) {
  return `
    <tr>
      <td>${request.employeeName}</td>
      <td>
        <strong>${money(request.amount)}</strong>
        <div class="mini-meta">${money(request.totalRepayable || request.amount)} total repayable</div>
      </td>
      <td>
        <strong>${request.repaymentMonths} mo</strong>
        <div class="mini-meta">${percent(request.interestRate || 0)} interest</div>
      </td>
      <td>
        <strong>${money(request.monthlyInstallment || 0)}</strong>
        <div class="mini-meta">${money(request.estimatedOutstandingBalance || 0)} outstanding</div>
      </td>
      <td>${request.requestedAt.slice(0, 10)}</td>
      <td><span class="status-badge status-${request.status}">${request.status}</span></td>
      <td>
        ${request.status === "approved" ? loanProgress(request) : `<span class="muted">Not started</span>`}
      </td>
      <td>${request.reason || "-"}</td>
      <td>
        <div class="employee-row-actions">
          ${
            request.status === "pending"
              ? `
                <button class="secondary table-action" data-action="approve-loan" data-id="${request.id}" data-interest="${request.interestRate || 0}">Approve</button>
                <button class="danger-button table-action" data-action="decline-loan" data-id="${request.id}">Decline</button>
              `
              : `<span class="tag">${request.reviewedBy || "Reviewed"}</span>`
          }
        </div>
      </td>
    </tr>
  `;
}

function loansView() {
  const requests = state.loanRequests.filter((request) =>
    matchesSearch(state.globalSearch, request.employeeName, request.employeeNumber, request.reason, request.status, request.amount, request.interestRate),
  );
  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Loans</p>
            <h2>Employee loan approvals</h2>
            <p class="muted">Review pending loan requests from the employee self-service portal.</p>
          </div>
        </div>
        ${state.reviewError ? `<div class="banner danger-banner">${state.reviewError}</div>` : ""}
        <div class="mini-search-wrap">
          <input class="workspace-search" id="global-search" placeholder="Search loan requests" value="${state.globalSearch}" />
        </div>
        ${
          requests.length
            ? `<div class="employee-table-wrap">
                <table class="employee-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Loan</th>
                      <th>Terms</th>
                      <th>Installment</th>
                      <th>Requested</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${requests.map(adminLoanRequestRow).join("")}
                  </tbody>
                </table>
              </div>`
            : `<div class="empty">No loan requests submitted yet.</div>`
        }
      </section>
    </section>
  `;
}

function adminTimesheetRow(entry) {
  return `
    <tr>
      <td>${entry.employeeName}</td>
      <td>${entry.weekStart}</td>
      <td>${entry.weekEnd}</td>
      <td>${number(entry.regularHours, 2)}</td>
      <td>${number(entry.overtimeHours, 2)}</td>
      <td>${number(entry.sundayHours, 2)}</td>
      <td>${number(entry.publicHolidayHours, 2)}</td>
      <td><span class="status-badge status-${entry.status}">${entry.status}</span></td>
      <td>${entry.notes || "-"}</td>
      <td>
        <div class="employee-row-actions">
          ${
            entry.status === "submitted"
              ? `
                <button class="secondary table-action" data-action="approve-timesheet" data-id="${entry.id}">Approve</button>
                <button class="danger-button table-action" data-action="reject-timesheet" data-id="${entry.id}">Reject</button>
              `
              : `<span class="tag">${entry.reviewedBy || "Reviewed"}</span>`
          }
        </div>
      </td>
    </tr>
  `;
}

function adminShiftRow(shift) {
  return `
    <tr>
      <td>${shift.employeeName}</td>
      <td>${shift.shiftDate}</td>
      <td>${shift.startTime}</td>
      <td>${shift.endTime}</td>
      <td>${shift.location || "-"}</td>
      <td>${shift.notes || "-"}</td>
      <td><span class="status-badge status-${shift.attendanceStatus}">${shift.attendanceStatus.replace("_", " ")}</span></td>
      <td>${shift.clockInAt ? new Date(shift.clockInAt).toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
      <td>${shift.clockOutAt ? new Date(shift.clockOutAt).toLocaleTimeString("en-NA", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
      <td>${shift.workedHours ? number(shift.workedHours, 2) : "-"}</td>
      <td>
        <div class="employee-row-actions">
          ${
            shift.status !== "cancelled"
              ? `<button class="danger-button table-action" data-action="cancel-shift" data-id="${shift.id}" data-name="${shift.employeeName}" data-date="${shift.shiftDate}">Cancel</button>`
              : `<span class="tag">Cancelled</span>`
          }
        </div>
      </td>
    </tr>
  `;
}

function shiftsView() {
  const entries = state.shifts.filter((shift) =>
    matchesSearch(
      state.globalSearch,
      shift.employeeName,
      shift.employeeNumber,
      shift.shiftDate,
      shift.startTime,
      shift.endTime,
      shift.location,
      shift.notes,
      shift.attendanceStatus,
    ),
  );
  const summary = {
    total: entries.length,
    active: entries.filter((item) => item.attendanceStatus === "clocked_in").length,
    upcoming: entries.filter((item) => ["scheduled", "late"].includes(item.attendanceStatus)).length,
    completed: entries.filter((item) => item.attendanceStatus === "completed").length,
  };
  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Shifts and Attendance</p>
            <h2>Create shifts and track attendance</h2>
            <p class="muted">Assign work schedules, add supervisor notes, and monitor who clocked in and out.</p>
          </div>
        </div>
        ${state.reviewError ? `<div class="banner danger-banner">${state.reviewError}</div>` : ""}
        <div class="stats compact-stats">
          <article class="stat"><span class="stat-label">Total shifts</span><span class="stat-value">${summary.total}</span></article>
          <article class="stat"><span class="stat-label">Clocked in</span><span class="stat-value">${summary.active}</span></article>
          <article class="stat"><span class="stat-label">Upcoming</span><span class="stat-value">${summary.upcoming}</span></article>
          <article class="stat"><span class="stat-label">Completed</span><span class="stat-value">${summary.completed}</span></article>
        </div>
        <form id="shift-form" class="grid-3">
          <label>Shift type
            <select name="shiftType">
              <option value="work">Working shift</option>
              <option value="off_day">Off day</option>
            </select>
          </label>
          <label>Employee
            <select name="employeeId" required>
              <option value="">Select employee</option>
              ${state.employees.map((employee) => `<option value="${employee.id}">${employee.fullName} · ${employee.employeeNumber}</option>`).join("")}
            </select>
          </label>
          <label>Shift date <input type="date" name="shiftDate" required /></label>
          <label>Location <input name="location" placeholder="Office, Branch, Site" /></label>
          <label>Start time <input type="time" name="startTime" /></label>
          <label>End time <input type="time" name="endTime" /></label>
          <label class="span-2">Instructions / notes <textarea name="notes" placeholder="Supervisor notes, handover details, customer instructions"></textarea></label>
          <div class="actions"><button class="primary" type="submit">Create shift</button></div>
        </form>
      </section>
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Attendance Log</p>
            <h2>All assigned shifts</h2>
          </div>
        </div>
        <div class="mini-search-wrap">
          <input class="workspace-search" id="global-search" placeholder="Search shifts" value="${state.globalSearch}" />
        </div>
        ${
          entries.length
            ? `<div class="employee-table-wrap">
                <table class="employee-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Location</th>
                      <th>Notes</th>
                      <th>Status</th>
                      <th>Clock In</th>
                      <th>Clock Out</th>
                      <th>Hours</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${entries.map(adminShiftRow).join("")}
                  </tbody>
                </table>
              </div>`
            : `<div class="empty">No shifts created yet.</div>`
        }
      </section>
    </section>
  `;
}

function timesheetsView() {
  const entries = state.timesheets.filter((entry) =>
    matchesSearch(state.globalSearch, entry.employeeName, entry.employeeNumber, entry.weekStart, entry.weekEnd, entry.status, entry.notes),
  );
  return `
    <section class="panel-grid">
      <section class="panel">
        <div class="record-head">
          <div>
            <p class="section-kicker">Timesheets</p>
            <h2>Weekly time approvals</h2>
            <p class="muted">Review employee-submitted hours before payroll processing.</p>
          </div>
        </div>
        ${state.reviewError ? `<div class="banner danger-banner">${state.reviewError}</div>` : ""}
        <div class="mini-search-wrap">
          <input class="workspace-search" id="global-search" placeholder="Search timesheets" value="${state.globalSearch}" />
        </div>
        ${
          entries.length
            ? `<div class="employee-table-wrap">
                <table class="employee-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Week Start</th>
                      <th>Week End</th>
                      <th>Regular</th>
                      <th>OT</th>
                      <th>Sunday</th>
                      <th>Holiday</th>
                      <th>Status</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${entries.map(adminTimesheetRow).join("")}
                  </tbody>
                </table>
              </div>`
            : `<div class="empty">No timesheets submitted yet.</div>`
        }
      </section>
    </section>
  `;
}

function renderApp() {
  const companyName = state.company?.name || "Namibia Payroll Desk";
  const activeEmployees = (state.employees || []).filter((item) => item.status !== "archived").length;
  const pendingLeave = (state.leaveRequests || []).filter((item) => item.status === "pending").length;
  const pendingLoans = (state.loanRequests || []).filter((item) => item.status === "pending").length;
  const pendingTimesheets = (state.timesheets || []).filter((item) => item.status === "submitted").length;
  const activeShifts = (state.shifts || []).filter((item) => item.attendanceStatus === "clocked_in").length;
  const attentionCount = pendingLeave + pendingLoans + pendingTimesheets;
  return appShell(`
    <section class="workspace-shell admin-workspace-shell">
      <aside class="app-rail">
        <div class="app-rail-brand">
          <img class="brand-mark-image" src="/assets/nam-payroll-favicon.png" alt="NamPayroll" />
        </div>
        <div class="app-rail-group">
          ${adminRailButton("dashboard", "⌂", "Home")}
          ${adminRailButton("payroll", "$", "Payroll")}
          ${adminRailButton("employees", "◉", "People")}
          ${adminRailButton("requests", "◌", "Requests")}
          ${adminRailButton("reports", "▤", "Reports")}
          ${adminRailButton("compliance", "!", "Compliance")}
          ${adminRailButton("documents", "▣", "Documents")}
          ${adminRailButton("settings", "⚙", "Settings")}
        </div>
      </aside>
      <div class="workspace-surface">
        <header class="workspace-topbar">
          <div class="mobile-topbar-brand">
            <button class="mobile-topbar-icon-button" data-action="toggle-mobile-nav" type="button" aria-label="Open menu" aria-expanded="${state.mobileNavOpen ? "true" : "false"}">☰</button>
            <div class="mobile-topbar-brand-lockup">
              <img class="brand-mark-image" src="/assets/nam-payroll-favicon.png" alt="NamPayroll" />
              <strong>NamPayroll</strong>
            </div>
            <span class="mobile-topbar-icon">◉</span>
          </div>
          <div class="workspace-topbar-search">
            <input class="workspace-search workspace-search-wide" id="global-search-topbar" placeholder="Search employees, payroll, requests, reports" value="${state.globalSearch}" />
          </div>
          <div class="workspace-topbar-actions">
            ${
              state.session?.role === "super_admin"
                ? `
                  <select id="super-admin-workspace-switch" class="workspace-search compact-search">
                    ${(state.superAdminWorkspaces || []).map((workspace) => `
                      <option value="${workspace.id}" ${workspace.id === state.company?.workspaceId ? "selected" : ""}>${workspace.name}</option>
                    `).join("")}
                  </select>
                `
                : ""
            }
            <span class="pill">${companyName}</span>
            <span class="pill">Billing: ${state.company?.billingStatus || "trial"}</span>
            <span class="topbar-avatar">${initials(state.session?.name || "Admin")}</span>
            <button class="ghost" data-action="logout">Log out</button>
          </div>
        </header>
        <div class="workspace-body">
          ${state.mobileNavOpen ? `<button class="mobile-nav-backdrop" data-action="close-mobile-nav" type="button" aria-label="Close menu"></button>` : ""}
          <aside class="sidebar-pane admin-mobile-pane ${state.mobileNavOpen ? "mobile-open" : ""}">
            <div class="sidebar-pane-head">
              <p class="section-kicker">Admin</p>
              <h2>${companyName}</h2>
              <p class="muted">${state.session.name} · ${state.session.role}</p>
            </div>
            <div class="sidebar-nav-list">
              ${adminNavItem("dashboard", "Home", "⌂")}
              ${adminNavItem("payroll", "Payroll", "$")}
              ${adminNavItem("employees", "People", "◉")}
              ${adminNavItem("requests", "Requests", "◌")}
              ${adminNavItem("reports", "Reports", "▤")}
              ${adminNavItem("compliance", "Compliance", "!")}
              ${adminNavItem("documents", "Documents", "▣")}
              ${adminNavItem("settings", "Settings", "⚙")}
            </div>
            <div class="sidebar-stat-stack">
              <article class="sidebar-stat-card"><span>Needs attention today</span><strong>${attentionCount}</strong></article>
              <article class="sidebar-stat-card"><span>Clocked in now</span><strong>${activeShifts}</strong></article>
            </div>
          </aside>
          <aside class="sidebar-pane workspace-sidebar-desktop">
            <div class="sidebar-pane-head">
              <p class="section-kicker">Today</p>
              <h2>What needs attention</h2>
              <p class="muted">Keep payroll first and bring exceptions forward.</p>
            </div>
            <div class="sidebar-nav-list">
              ${adminNavItem("dashboard", "Home", "⌂")}
              ${adminNavButton("payroll", "Payroll")}
              ${adminNavButton("employees", "People")}
              ${adminNavButton("requests", "Requests")}
              ${adminNavButton("reports", "Reports")}
              ${adminNavButton("compliance", "Compliance")}
              ${adminNavButton("documents", "Documents")}
              ${adminNavButton("settings", "Settings")}
            </div>
            <div class="sidebar-stat-stack">
              <article class="sidebar-stat-card"><span>Payroll period</span><strong>${state.reportMonth}</strong></article>
              <article class="sidebar-stat-card"><span>Action required</span><strong>${attentionCount}</strong></article>
              <article class="sidebar-stat-card"><span>Clocked in now</span><strong>${activeShifts}</strong></article>
            </div>
          </aside>
          <main class="content-stage">
            ${state.view === "dashboard" ? `
              <section class="workspace-hero-card workspace-hero-card-modern">
                <div class="workspace-hero-copy">
                  <p class="section-kicker">Home</p>
                  <h1 class="workspace-title">${companyName}</h1>
                  <p class="muted">A clearer payroll workspace focused on what needs attention today, what is ready to run, and what blocks compliance.</p>
                </div>
                <div class="portal-quick-actions admin-quick-actions admin-quick-actions-mobile">
                  ${adminQuickAction("payroll", "Payroll", "Approve and publish")}
                  ${adminQuickAction("requests", "Requests", attentionCount ? `${attentionCount} action required` : "All clear")}
                  ${adminQuickAction("employees", "People", `${activeEmployees} payroll records`)}
                  ${adminQuickAction("compliance", "Compliance", "PAYE, SSC, filing")}
                  ${adminQuickAction("reports", "Reports", "Costs and exports")}
                </div>
              </section>
            ` : ""}
          ${state.view === "dashboard" ? dashboardView() : ""}
          ${state.view === "employees" ? employeesView() : ""}
          ${state.view === "requests" ? requestsHubView() : ""}
          ${state.view === "payroll" ? payrollView() : ""}
          ${state.view === "documents" ? documentsView() : ""}
          ${state.view === "reports" ? reportsView() : ""}
          ${state.view === "compliance" ? complianceView() : ""}
          ${state.view === "settings" ? settingsView() : ""}
          </main>
        </div>
      </div>
      <nav class="portal-bottom-nav admin-bottom-nav">
        ${adminBottomNavButton("dashboard", "Home")}
        ${adminBottomNavButton("payroll", "Payroll")}
        ${adminBottomNavButton("requests", "Requests")}
        ${adminBottomNavButton("reports", "Reports")}
        ${adminBottomNavButton("settings", "Settings")}
      </nav>
    </section>
  `);
}

function bindLogin() {
  document.querySelectorAll("[data-action='set-login-view']").forEach((button) => {
    button.addEventListener("click", () => {
      state.loginView = button.dataset.loginView;
      render();
    });
  });

  const form = document.querySelector("#login-form");
  const error = document.querySelector("#login-error");
  if (form && error) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.classList.add("hidden");
      const data = new FormData(form);
      try {
        const response = await api("/api/login", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(data.entries())),
        });
        state.session = response.user;
        state.company = response.company;
        if (state.session.role === "employee") {
          await loadEmployeePortal();
          render();
          return;
        }
        await bootstrapApp();
      } catch (err) {
        error.textContent = err.message;
        error.classList.remove("hidden");
      }
    });
  }

  const registerForm = document.querySelector("#register-company-form");
  const registerError = document.querySelector("#register-error");
  if (registerForm && registerError) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      registerError.classList.add("hidden");
      try {
        const response = await api("/api/register-company", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(registerForm).entries())),
        });
        state.session = response.user;
        state.company = response.company;
        await bootstrapApp();
      } catch (err) {
        registerError.textContent = err.message;
        registerError.classList.remove("hidden");
      }
    });
  }
}

function createPayslipDocument(run) {
  const metrics = run.result.metrics;
  const company = run.companySnapshot || state.company || {};
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Payslip ${run.payrollMonth}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #172127; }
      h1, h2 { margin: 0 0 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      td { padding: 10px 6px; border-top: 1px solid #ddd; }
      td:last-child { text-align: right; font-weight: bold; }
    </style>
  </head>
  <body>
    <h1>${company.name || "Company"}</h1>
    <p>${company.physicalAddress || ""}</p>
    <p>${run.employeeName} · ${run.employeeNumber} · ${run.payrollMonth}</p>
    <table>
      <tbody>
        <tr><td>Basic wage</td><td>${money(run.input.basicWage)}</td></tr>
        <tr><td>Allowances</td><td>${money(run.input.allowances)}</td></tr>
        <tr><td>Bonus</td><td>${money(run.input.bonus)}</td></tr>
        <tr><td>Gross taxable remuneration</td><td>${money(metrics.taxableGross)}</td></tr>
        <tr><td>Employee SSC</td><td>(${money(metrics.employeeSsc)})</td></tr>
        <tr><td>PAYE</td><td>(${money(metrics.paye)})</td></tr>
        <tr><td>Net pay</td><td>${money(metrics.netPay)}</td></tr>
      </tbody>
    </table>
  </body>
</html>`;
}

function bindApp() {
  document.querySelectorAll("[data-action='toggle-mobile-nav']").forEach((button) => {
    button.addEventListener("click", () => {
      state.mobileNavOpen = !state.mobileNavOpen;
      render();
    });
  });

  document.querySelectorAll("[data-action='close-mobile-nav']").forEach((button) => {
    button.addEventListener("click", () => {
      state.mobileNavOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.view;
      state.mobileNavOpen = false;
      if (state.view === "reports") {
        await loadReport(state.reportMonth);
      }
      if (state.view === "compliance") {
        await loadReport(state.reportMonth);
      }
      if (state.view === "leave") {
        await loadLeaveRequests();
      }
      if (state.view === "shifts") {
        await loadShifts();
      }
      if (state.view === "loans") {
        await loadLoanRequests();
      }
      if (state.view === "timesheets") {
        await loadTimesheets();
      }
      if (state.view === "data") {
        await loadDataStatus();
      }
      if (state.view === "requests") {
        await loadLeaveRequests();
        await loadLoanRequests();
        await loadShifts();
        await loadTimesheets();
      }
      if (state.view === "settings" && state.settingsSection === "data") {
        await loadDataStatus();
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='set-requests-tab']").forEach((button) => {
    button.addEventListener("click", async () => {
      state.requestsTab = button.dataset.tab;
      state.requestDrawerOpen = false;
      if (state.requestsTab === "leave") await loadLeaveRequests();
      if (state.requestsTab === "loans") await loadLoanRequests();
      if (state.requestsTab === "attendance") await loadShifts();
      if (state.requestsTab === "timesheets") await loadTimesheets();
      syncRequestsSelection();
      render();
    });
  });

  document.querySelectorAll("[data-action='set-settings-section']").forEach((button) => {
    button.addEventListener("click", async () => {
      state.settingsSection = button.dataset.section;
      if (state.settingsSection === "data") {
        await loadDataStatus();
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='set-people-tab']").forEach((button) => {
    button.addEventListener("click", () => {
      state.peopleProfileTab = button.dataset.tab;
      render();
    });
  });

  document.querySelectorAll("[data-action='set-payroll-step']").forEach((button) => {
    button.addEventListener("click", () => {
      state.payrollStep = button.dataset.step;
      render();
    });
  });

  document.querySelectorAll("#payroll-form select[name='employeeId'], #payroll-form input[name='payrollMonth']").forEach((field) => {
    field.addEventListener("change", (event) => {
      if (event.target.name === "employeeId") {
        state.selectedEmployeeId = event.target.value;
      }
      if (event.target.name === "payrollMonth") {
        state.reportMonth = event.target.value;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='advance-payroll-step']").forEach((button) => {
    button.addEventListener("click", () => {
      const steps = ["period", "inputs", "outputs", "publish"];
      const index = steps.indexOf(state.payrollStep);
      state.payrollStep = steps[Math.min(index + 1, steps.length - 1)];
      render();
    });
  });

  document.querySelectorAll("[data-action='select-request-item']").forEach((button) => {
    button.addEventListener("click", () => {
      state.requestsSelectedId = button.dataset.id;
      state.requestDrawerOpen = true;
      render();
    });
  });

  document.querySelectorAll("[data-action='close-request-drawer']").forEach((button) => {
    button.addEventListener("click", () => {
      state.requestDrawerOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", logoutUser);
  });

  document.querySelectorAll("[data-action='remove-logo']").forEach((button) => {
    button.addEventListener("click", () => {
      state.removeLogo = true;
      render();
    });
  });

  document.querySelectorAll("[data-action='toggle-employee-form']").forEach((button) => {
    button.addEventListener("click", () => {
      state.showEmployeeForm = !state.showEmployeeForm;
      if (!state.showEmployeeForm) {
        state.editingEmployeeId = null;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='toggle-leave-form']").forEach((button) => {
    button.addEventListener("click", () => {
      state.showLeaveForm = !state.showLeaveForm;
      state.leaveError = "";
      render();
    });
  });

  document.querySelectorAll("[data-action='set-leave-view']").forEach((button) => {
    button.addEventListener("click", () => {
      state.leaveViewMode = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-action='shift-leave-month']").forEach((button) => {
    button.addEventListener("click", () => {
      const [yearString, monthString] = state.leaveCalendarMonth.split("-");
      const date = new Date(Number(yearString), Number(monthString) - 1 + Number(button.dataset.direction || 0), 1);
      state.leaveCalendarMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      render();
    });
  });

  document.querySelectorAll("[data-action='edit-employee']").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = "employees";
      state.editingEmployeeId = button.dataset.id;
      state.selectedEmployeeId = button.dataset.id;
      state.peopleProfileTab = "profile";
      state.showEmployeeForm = true;
      render();
      const employee = state.employees.find((item) => item.id === state.editingEmployeeId);
      if (!employee) return;
      const form = document.querySelector("#employee-form");
      Object.entries({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        fullName: employee.fullName,
        idNumber: employee.idNumber,
        cellphone: employee.profile?.cellphone,
        personalEmail: employee.profile?.personalEmail,
        department: employee.department,
        title: employee.title,
        workerCategory: employee.workerCategory,
        startDate: employee.startDate,
        daysPerWeek: employee.daysPerWeek,
        hoursPerDay: employee.hoursPerDay,
        basicWage: employee.basicWage,
        taxableAllowances: employee.taxableAllowances,
        standardBonus: employee.standardBonus,
        bankName: employee.bankName,
        accountNumber: employee.accountNumber,
        annualLeaveUsed: employee.leaveBalances.annualLeaveUsed,
        sickLeaveUsed: employee.leaveBalances.sickLeaveUsed,
      }).forEach(([key, value]) => {
        const field = form.elements.namedItem(key);
        if (field) field.value = value;
      });
    });
  });

  document.querySelectorAll("[data-action='reset-employee-form']").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingEmployeeId = null;
      state.showEmployeeForm = false;
      render();
    });
  });

  document.querySelectorAll("[data-action='start-payroll']").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedEmployeeId = button.dataset.id;
      state.view = "payroll";
      state.payrollStep = "period";
      render();
      const payrollSelect = document.querySelector("#payroll-form select[name='employeeId']");
      if (payrollSelect) {
        payrollSelect.value = button.dataset.id;
      }
    });
  });

  document.querySelectorAll("[data-action='select-employee']").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedEmployeeId = button.dataset.id;
      render();
    });
  });

  document.querySelectorAll("[data-action='delete-employee']").forEach((button) => {
    button.addEventListener("click", async () => {
      const employeeName = button.dataset.name || "this employee";
      const confirmed = window.confirm(`Archive ${employeeName}? Existing payroll history will be kept.`);
      if (!confirmed) return;

      await api(`/api/employees/${button.dataset.id}`, {
        method: "DELETE",
      });
      if (state.editingEmployeeId === button.dataset.id) {
        state.editingEmployeeId = null;
        state.showEmployeeForm = false;
      }
      await loadEmployees();
      await loadDashboard();
      render();
    });
  });

  const employeeSearch = document.querySelector("#employee-search");
  if (employeeSearch) {
    employeeSearch.addEventListener("input", (event) => {
      state.employeeSearch = event.target.value;
      render();
    });
  }

  document.querySelectorAll("#global-search, #global-search-topbar").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.globalSearch = event.target.value;
      render();
    });
  });

  document.querySelectorAll("[data-action='set-dashboard-section']").forEach((button) => {
    button.addEventListener("click", () => {
      state.dashboardSection = button.dataset.section;
      render();
    });
  });

  document.querySelectorAll("[data-action='set-report-section']").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportSection = button.dataset.section;
      render();
    });
  });

  const employeeDepartmentFilter = document.querySelector("#employee-department-filter");
  if (employeeDepartmentFilter) {
    employeeDepartmentFilter.addEventListener("change", (event) => {
      state.employeeDepartment = event.target.value;
      render();
    });
  }

  const employeeStatusFilter = document.querySelector("#employee-status-filter");
  if (employeeStatusFilter) {
    employeeStatusFilter.addEventListener("change", (event) => {
      state.employeeStatus = event.target.value;
      render();
    });
  }

  document.querySelectorAll("[data-action='open-run']").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await api(`/api/payroll-runs/${button.dataset.id}`);
      state.activeRun = response.item;
      state.view = "payroll";
      render();
    });
  });

  document.querySelectorAll("[data-action='cancel-run']").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm(`Cancel payroll run for ${button.dataset.name} (${button.dataset.month})?`);
      if (!confirmed) return;
      try {
        const response = await api(`/api/payroll-runs/${button.dataset.id}/cancel`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });
        state.activeRun = response.item;
        await loadRuns();
        await loadDashboard();
        await loadReport(state.reportMonth);
      } catch (error) {
        window.alert(error.message);
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='approve-leave']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/leave-requests/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "approved" }),
        });
        state.leaveError = "";
        await loadLeaveRequests();
        await loadEmployees();
        await loadDashboard();
      } catch (error) {
        state.leaveError = error.message;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='decline-leave']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/leave-requests/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "declined" }),
        });
        state.leaveError = "";
        await loadLeaveRequests();
        await loadEmployees();
        await loadDashboard();
      } catch (error) {
        state.leaveError = error.message;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='print']").forEach((button) => {
    button.addEventListener("click", () => window.print());
  });

  document.querySelectorAll("[data-action='download-run-pdf']").forEach((button) => {
    button.addEventListener("click", () => {
      triggerDownload(`/api/payroll-runs/${button.dataset.id}/pdf`);
    });
  });

  const superAdminWorkspaceSwitch = document.querySelector("#super-admin-workspace-switch");
  if (superAdminWorkspaceSwitch) {
    superAdminWorkspaceSwitch.addEventListener("change", async (event) => {
      await api(`/api/super-admin/workspaces/${event.target.value}/select`, { method: "POST" });
      await bootstrapApp();
    });
  }

  document.querySelectorAll("[data-action='export-finance']").forEach((button) => {
    button.addEventListener("click", () => {
      triggerDownload(`/api/finance/exports?month=${encodeURIComponent(button.dataset.month)}&type=${encodeURIComponent(button.dataset.type)}`);
    });
  });

  document.querySelectorAll("[data-action='export-data']").forEach((button) => {
    button.addEventListener("click", () => {
      triggerDownload(`/api/data/export?type=${encodeURIComponent(button.dataset.type)}`);
    });
  });

  document.querySelectorAll("[data-action='create-backup']").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("/api/data/backups", { method: "POST" });
      await loadDataStatus();
      render();
    });
  });

  document.querySelectorAll("[data-action='restore-backup']").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm(`Restore backup ${button.dataset.name}? This will replace the current database.`);
      if (!confirmed) return;
      await api("/api/data/restore", {
        method: "POST",
        body: JSON.stringify({ backupName: button.dataset.name }),
      });
      await bootstrapApp();
    });
  });

  document.querySelectorAll("[data-action='complete-password-reset']").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await api(`/api/password-reset-requests/${button.dataset.id}/reset`, {
        method: "POST",
      });
      window.alert(`Temporary password reset for ${response.username}: ${response.tempPassword}`);
      await loadPasswordResetRequests();
      await loadDashboard();
      render();
    });
  });

  document.querySelectorAll("[data-action='approve-loan']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const initialRate = Number(button.dataset.interest || 0);
        const rawRate = window.prompt("Enter annual interest rate (%) for this loan.", String(initialRate));
        if (rawRate === null) return;
        const interestRate = Number(rawRate);
        if (!Number.isFinite(interestRate) || interestRate < 0) {
          throw new Error("Interest rate must be zero or greater.");
        }
        await api(`/api/loan-requests/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "approved", interestRate }),
        });
        state.reviewError = "";
        await loadLoanRequests();
        await loadDashboard();
      } catch (error) {
        state.reviewError = error.message;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='decline-loan']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/loan-requests/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "declined" }),
        });
        state.reviewError = "";
        await loadLoanRequests();
      } catch (error) {
        state.reviewError = error.message;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='approve-timesheet']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/timesheets/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "approved" }),
        });
        state.reviewError = "";
        await loadTimesheets();
      } catch (error) {
        state.reviewError = error.message;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='reject-timesheet']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/timesheets/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "rejected" }),
        });
        state.reviewError = "";
        await loadTimesheets();
      } catch (error) {
        state.reviewError = error.message;
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='cancel-shift']").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm(`Cancel shift for ${button.dataset.name} on ${button.dataset.date}?`);
      if (!confirmed) return;
      try {
        await api(`/api/shifts/${button.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled" }),
        });
        state.reviewError = "";
        await loadShifts();
        await loadDashboard();
      } catch (error) {
        state.reviewError = error.message;
      }
      render();
    });
  });

  const employeeForm = document.querySelector("#employee-form");
  if (employeeForm) {
    employeeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(employeeForm).entries());
      const method = data.employeeId ? "PUT" : "POST";
      const path = data.employeeId ? `/api/employees/${data.employeeId}` : "/api/employees";
      await api(path, {
        method,
        body: JSON.stringify(data),
      });
      state.editingEmployeeId = null;
      state.showEmployeeForm = false;
      await loadEmployees();
      await loadDashboard();
      render();
    });
  }

  const companyForm = document.querySelector("#company-form");
  if (companyForm) {
    companyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.companyError = "";
      state.companyNotice = "";
      const payload = {
        ...(state.company || {}),
        removeLogo: state.removeLogo,
      };
      const data = Object.fromEntries(new FormData(companyForm).entries());
      const fileInput = document.querySelector("#company-logo");
      const file = fileInput?.files?.[0];
      Object.entries(data).forEach(([key, value]) => {
        payload[key] = value;
      });

      const checkboxValue = (name, currentValue = false) =>
        companyForm.elements.namedItem(name) ? companyForm.elements.namedItem(name).checked : currentValue;

      const notifyLeave = checkboxValue("notifyAdminOnLeaveRequest", state.company?.notifyAdminOnLeaveRequest !== false);
      const notifyLoan = checkboxValue("notifyAdminOnLoanRequest", state.company?.notifyAdminOnLoanRequest !== false);
      const notifyTimesheet = checkboxValue("notifyAdminOnTimesheet", state.company?.notifyAdminOnTimesheet !== false);
      const alertEmail = String(payload.adminNotificationEmail || "").trim();
      const alertSms = String(payload.adminNotificationCellphone || "").trim();
      if ((notifyLeave || notifyLoan || notifyTimesheet) && !alertEmail && !alertSms) {
        state.companyError = "Add an admin alert email or SMS number before enabling request notifications.";
        render();
        return;
      }

      if (file) {
        payload.logoDataUrl = await fileToDataUrl(file);
      }
      delete payload.logoFile;

      try {
        const response = await api("/api/company", {
          method: "PUT",
          body: JSON.stringify({
            ...payload,
            notifyAdminOnLeaveRequest: notifyLeave,
            notifyAdminOnLoanRequest: notifyLoan,
            notifyAdminOnTimesheet: notifyTimesheet,
            notifyEmployeeOnLeaveUpdate: checkboxValue("notifyEmployeeOnLeaveUpdate", state.company?.notifyEmployeeOnLeaveUpdate !== false),
            notifyEmployeeOnLoanUpdate: checkboxValue("notifyEmployeeOnLoanUpdate", state.company?.notifyEmployeeOnLoanUpdate !== false),
            notifyEmployeeOnTimesheetUpdate: checkboxValue("notifyEmployeeOnTimesheetUpdate", state.company?.notifyEmployeeOnTimesheetUpdate !== false),
            notifyEmployeeOnPayslipReady: checkboxValue("notifyEmployeeOnPayslipReady", state.company?.notifyEmployeeOnPayslipReady !== false),
            notifyEmployeeOnChatMessage: checkboxValue("notifyEmployeeOnChatMessage", state.company?.notifyEmployeeOnChatMessage !== false),
          }),
        });

        state.company = response.item;
        state.removeLogo = false;
        state.companyNotice =
          state.settingsSection === "notifications"
            ? "Notification settings saved."
            : "Company profile saved.";
        await loadDashboard();
        render();
      } catch (error) {
        state.companyError = error.message;
        render();
      }
    });
  }

  const payrollForm = document.querySelector("#payroll-form");
  if (payrollForm) {
    payrollForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(payrollForm).entries());
      data.ordinarilyWorksSunday = data.ordinarilyWorksSunday === "true";
      data.publicHolidayOrdinaryDay = data.publicHolidayOrdinaryDay === "true";
      const response = await api("/api/payroll-runs", {
        method: "POST",
        body: JSON.stringify(data),
      });
      state.activeRun = response.item;
      state.reportMonth = response.item.payrollMonth;
      await loadDashboard();
      await loadRuns();
      await loadReport(state.reportMonth);
      render();
    });
  }

  document.querySelectorAll("[data-action='bulk-payroll-run']").forEach((button) => {
    button.addEventListener("click", async () => {
      const form = document.querySelector("#payroll-form");
      if (!form) return;
      const data = Object.fromEntries(new FormData(form).entries());
      data.ordinarilyWorksSunday = data.ordinarilyWorksSunday === "true";
      data.publicHolidayOrdinaryDay = data.publicHolidayOrdinaryDay === "true";
      delete data.employeeId;
      const confirmed = window.confirm(`Create payroll runs for all active employees for ${data.payrollMonth}?`);
      if (!confirmed) return;
      const response = await api("/api/payroll-runs/bulk", {
        method: "POST",
        body: JSON.stringify(data),
      });
      state.reportMonth = response.month;
      await loadDashboard();
      await loadRuns();
      await loadReport(state.reportMonth);
      window.alert(`Created ${response.createdCount} payroll run(s). Skipped ${response.skippedCount}.`);
      render();
    });
  });

  const reportForm = document.querySelector("#report-form");
  if (reportForm) {
    reportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(reportForm).entries());
      state.reportMonth = data.month;
      await loadReport(state.reportMonth);
      render();
    });
  }

  const documentForm = document.querySelector("#document-form");
  if (documentForm) {
    documentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(documentForm).entries());
      const query = new URLSearchParams();
      Object.entries(data).forEach(([key, value]) => {
        if (String(value || "").trim()) {
          query.set(key, value);
        }
      });
      triggerDownload(`/api/documents/export?${query.toString()}`);
    });
  }

  const employeeImportForm = document.querySelector("#employee-import-form");
  if (employeeImportForm) {
    employeeImportForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = employeeImportForm.querySelector("input[name='csvFile']")?.files?.[0];
      if (!file) return;
      const csvText = await file.text();
      await api("/api/data/import/employees", {
        method: "POST",
        body: JSON.stringify({ csvText }),
      });
      await loadEmployees();
      await loadDashboard();
      await loadDataStatus();
      render();
    });
  }

  const restoreJsonForm = document.querySelector("#restore-json-form");
  if (restoreJsonForm) {
    restoreJsonForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = restoreJsonForm.querySelector("input[name='jsonFile']")?.files?.[0];
      if (!file) return;
      const jsonText = await file.text();
      const confirmed = window.confirm("Restore the uploaded JSON backup? This will replace the current database.");
      if (!confirmed) return;
      await api("/api/data/restore", {
        method: "POST",
        body: JSON.stringify({ jsonText }),
      });
      await bootstrapApp();
    });
  }

  const leaveStatusFilter = document.querySelector("#leave-status-filter");
  if (leaveStatusFilter) {
    leaveStatusFilter.addEventListener("change", (event) => {
      state.leaveStatusFilter = event.target.value;
      state.leaveError = "";
      render();
    });
  }

  const leaveEmployeeFilter = document.querySelector("#leave-employee-filter");
  if (leaveEmployeeFilter) {
    leaveEmployeeFilter.addEventListener("change", (event) => {
      state.leaveEmployeeFilter = event.target.value;
      render();
    });
  }

  const leaveTypeFilter = document.querySelector("#leave-type-filter");
  if (leaveTypeFilter) {
    leaveTypeFilter.addEventListener("change", (event) => {
      state.leaveTypeFilter = event.target.value;
      render();
    });
  }

  const leaveCalendarMonth = document.querySelector("#leave-calendar-month");
  if (leaveCalendarMonth) {
    leaveCalendarMonth.addEventListener("change", (event) => {
      state.leaveCalendarMonth = event.target.value;
      render();
    });
  }

  const leaveRequestForm = document.querySelector("#leave-request-form");
  if (leaveRequestForm) {
    leaveRequestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(leaveRequestForm).entries());
      try {
        await api("/api/leave-requests", {
          method: "POST",
          body: JSON.stringify(data),
        });
        state.leaveError = "";
        state.showLeaveForm = false;
        await loadLeaveRequests();
        await loadDashboard();
        leaveRequestForm.reset();
      } catch (error) {
        state.leaveError = error.message;
      }
      render();
    });
  }

  const shiftForm = document.querySelector("#shift-form");
  if (shiftForm) {
    shiftForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(shiftForm).entries());
        await api("/api/shifts", {
          method: "POST",
          body: JSON.stringify(data),
        });
        state.reviewError = "";
        shiftForm.reset();
        await loadShifts();
        await loadDashboard();
      } catch (error) {
        state.reviewError = error.message;
      }
      render();
    });
  }
}

function bindEmployeePortal() {
  document.querySelectorAll("[data-action='toggle-mobile-nav']").forEach((button) => {
    button.addEventListener("click", () => {
      state.mobileNavOpen = !state.mobileNavOpen;
      render();
    });
  });

  document.querySelectorAll("[data-action='close-mobile-nav']").forEach((button) => {
    button.addEventListener("click", () => {
      state.mobileNavOpen = false;
      render();
    });
  });

  document.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", logoutUser);
  });

  document.querySelectorAll("[data-employee-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.employeePortalView = button.dataset.employeeView;
      state.mobileNavOpen = false;
      state.employeePortalError = "";
      state.employeePortalNotice = "";
      render();
    });
  });

  document.querySelectorAll("#employee-portal-search, #employee-portal-search-global").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.employeePortalSearch = event.target.value;
      render();
    });
  });

  const portalTimesheetStatus = document.querySelector("#portal-timesheet-status");
  if (portalTimesheetStatus) {
    portalTimesheetStatus.addEventListener("change", (event) => {
      state.portalTimesheetStatus = event.target.value;
      render();
    });
  }

  const portalTimesheetMonth = document.querySelector("#portal-timesheet-month");
  if (portalTimesheetMonth) {
    portalTimesheetMonth.addEventListener("change", (event) => {
      state.portalTimesheetMonth = event.target.value;
      render();
    });
  }

  const portalShiftStatus = document.querySelector("#portal-shift-status");
  if (portalShiftStatus) {
    portalShiftStatus.addEventListener("change", (event) => {
      state.portalShiftStatus = event.target.value;
      render();
    });
  }

  const portalShiftMonth = document.querySelector("#portal-shift-month");
  if (portalShiftMonth) {
    portalShiftMonth.addEventListener("change", (event) => {
      state.portalShiftMonth = event.target.value;
      render();
    });
  }

  document.querySelectorAll("[data-action='shift-calendar-month']").forEach((button) => {
    button.addEventListener("click", () => {
      shiftMonthChange(button.dataset.direction);
      render();
    });
  });

  const employeeLeaveForm = document.querySelector("#employee-leave-form");
  if (employeeLeaveForm) {
    employeeLeaveForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(employeeLeaveForm).entries());
        await api("/api/leave-requests", {
          method: "POST",
          body: JSON.stringify(data),
        });
        state.employeePortalError = "";
        state.employeePortalNotice = "Leave request submitted.";
        await loadEmployeePortal();
      } catch (error) {
        state.employeePortalError = error.message;
        state.employeePortalNotice = "";
      }
      render();
    });
  }

  const employeeLoanForm = document.querySelector("#employee-loan-form");
  if (employeeLoanForm) {
    employeeLoanForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(employeeLoanForm).entries());
        await api("/api/loan-requests", {
          method: "POST",
          body: JSON.stringify(data),
        });
        state.employeePortalError = "";
        state.employeePortalNotice = "Loan request submitted.";
        await loadEmployeePortal();
      } catch (error) {
        state.employeePortalError = error.message;
        state.employeePortalNotice = "";
      }
      render();
    });
  }

  const employeeTimesheetForm = document.querySelector("#employee-timesheet-form");
  if (employeeTimesheetForm) {
    employeeTimesheetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(employeeTimesheetForm).entries());
        await api("/api/timesheets", {
          method: "POST",
          body: JSON.stringify(data),
        });
        state.employeePortalError = "";
        state.employeePortalNotice = "Timesheet submitted.";
        await loadEmployeePortal();
      } catch (error) {
        state.employeePortalError = error.message;
        state.employeePortalNotice = "";
      }
      render();
    });
  }

  document.querySelectorAll("[data-action='open-employee-payslip']").forEach((button) => {
    button.addEventListener("click", async () => {
      const response = await api(`/api/employee/payslips/${button.dataset.id}`);
      state.activeRun = response.item;
      render();
    });
  });

  document.querySelectorAll("[data-action='download-payslip']").forEach((button) => {
    button.addEventListener("click", async () => {
      triggerDownload(`/api/employee/payslips/${button.dataset.id}/pdf`);
    });
  });

  document.querySelectorAll("[data-action='clock-in-shift']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/shifts/${button.dataset.id}/clock-in`, { method: "POST", body: JSON.stringify({}) });
        state.employeePortalError = "";
        state.employeePortalNotice = "Clock-in recorded.";
        await loadEmployeePortal();
      } catch (error) {
        state.employeePortalError = error.message;
        state.employeePortalNotice = "";
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='clock-out-shift']").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/shifts/${button.dataset.id}/clock-out`, { method: "POST", body: JSON.stringify({}) });
        state.employeePortalError = "";
        state.employeePortalNotice = "Clock-out recorded.";
        await loadEmployeePortal();
      } catch (error) {
        state.employeePortalError = error.message;
        state.employeePortalNotice = "";
      }
      render();
    });
  });

  document.querySelectorAll("[data-action='open-chat-contact']").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeChatEmployeeId = button.dataset.id;
      render();
    });
  });

  document.querySelectorAll("[data-action='insert-chat-emoji']").forEach((button) => {
    button.addEventListener("click", () => {
      const field = document.querySelector("#employee-chat-form textarea[name='message']");
      if (!field) return;
      const start = field.selectionStart ?? field.value.length;
      const end = field.selectionEnd ?? field.value.length;
      const emoji = button.dataset.emoji || "";
      field.value = `${field.value.slice(0, start)}${emoji}${field.value.slice(end)}`;
      field.focus();
      const nextPosition = start + emoji.length;
      field.setSelectionRange(nextPosition, nextPosition);
    });
  });

  const employeeChatForm = document.querySelector("#employee-chat-form");
  if (employeeChatForm) {
    employeeChatForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const formData = new FormData(employeeChatForm);
        const data = Object.fromEntries(formData.entries());
        const file = formData.get("attachmentFile");
        if (file && typeof file === "object" && file.size) {
          data.attachmentDataUrl = await fileToDataUrl(file);
          data.attachmentName = file.name;
        }
        await api("/api/employee/chats", {
          method: "POST",
          body: JSON.stringify(data),
        });
        state.employeePortalError = "";
        state.employeePortalNotice = "Message sent.";
        await loadEmployeePortal();
      } catch (error) {
        state.employeePortalError = error.message;
        state.employeePortalNotice = "";
      }
      render();
    });
  }

  const employeePasswordForm = document.querySelector("#employee-password-form");
  if (employeePasswordForm) {
    employeePasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(employeePasswordForm).entries());
        await api("/api/employee/change-password", {
          method: "POST",
          body: JSON.stringify(data),
        });
        state.employeePortalError = "";
        state.employeePortalNotice = "Password updated successfully.";
        employeePasswordForm.reset();
      } catch (error) {
        state.employeePortalError = error.message;
        state.employeePortalNotice = "";
      }
      render();
    });
  }

  const employeeProfileForm = document.querySelector("#employee-profile-form");
  if (employeeProfileForm) {
    employeeProfileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = Object.fromEntries(new FormData(employeeProfileForm).entries());
        await api("/api/employee/profile", {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        state.employeePortalError = "";
        state.employeePortalNotice = "Profile updated successfully.";
        await loadEmployeePortal();
      } catch (error) {
        state.employeePortalError = error.message;
        state.employeePortalNotice = "";
      }
      render();
    });
  }

  document.querySelectorAll("[data-action='mark-notification-read']").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/employee/notifications/${button.dataset.id}`, { method: "PATCH" });
      await loadEmployeePortal();
      render();
    });
  });
}

async function loadDashboard() {
  state.dashboard = await api("/api/dashboard");
  state.company = state.dashboard.company;
}

async function loadEmployees() {
  const response = await api("/api/employees");
  state.employees = response.items;
  if (!response.items.some((item) => item.id === state.selectedEmployeeId)) {
    state.selectedEmployeeId = response.items[0]?.id || "";
  }
}

async function loadRuns() {
  const response = await api("/api/payroll-runs");
  state.runs = response.items;
  const preferredRun = response.items.find((item) => item.status !== "cancelled") || response.items[0] || null;
  if (!state.activeRun && preferredRun) {
    state.activeRun = preferredRun;
  }
  if (state.activeRun) {
    state.activeRun = response.items.find((item) => item.id === state.activeRun.id) || preferredRun;
  }
}

async function loadLeaveRequests() {
  const response = await api("/api/leave-requests");
  state.leaveRequests = response.items;
}

async function loadLoanRequests() {
  const response = await api("/api/loan-requests");
  state.loanRequests = response.items;
}

async function loadShifts() {
  const response = await api("/api/shifts");
  state.shifts = response.items;
}

async function loadTimesheets() {
  const response = await api("/api/timesheets");
  state.timesheets = response.items;
}

async function loadPasswordResetRequests() {
  const response = await api("/api/password-reset-requests");
  state.passwordResetRequests = response.items;
}

async function loadDataStatus() {
  state.dataStatus = await api("/api/data/status");
}

async function loadSuperAdminWorkspaces() {
  if (state.session?.role !== "super_admin") {
    state.superAdminWorkspaces = [];
    return;
  }
  const response = await api("/api/super-admin/workspaces");
  state.superAdminWorkspaces = response.items;
}

async function loadReport(month) {
  state.report = await api(`/api/reports/monthly?month=${encodeURIComponent(month)}`);
}

async function loadEmployeePortal() {
  const response = await api("/api/employee/me");
  state.portalData = response;
  state.company = response.company;
  if (!state.activeChatEmployeeId) {
    state.activeChatEmployeeId = response.chatContacts?.[0]?.id || "";
  } else if (!(response.chatContacts || []).some((item) => item.id === state.activeChatEmployeeId)) {
    state.activeChatEmployeeId = response.chatContacts?.[0]?.id || "";
  }
  state.activeRun = response.payslips?.[0] || null;
}

async function bootstrapApp() {
  const [sources, dashboard, employees, runs, leaveRequests, loanRequests, shifts, timesheets, passwordResetRequests, dataStatus] = await Promise.all([
    api("/api/sources"),
    api("/api/dashboard"),
    api("/api/employees"),
    api("/api/payroll-runs"),
    api("/api/leave-requests"),
    api("/api/loan-requests"),
    api("/api/shifts"),
    api("/api/timesheets"),
    api("/api/password-reset-requests"),
    api("/api/data/status"),
  ]);

  state.sources = sources.items;
  state.dashboard = dashboard;
  state.company = dashboard.company;
  state.employees = employees.items;
  state.runs = runs.items;
  state.leaveRequests = leaveRequests.items;
  state.loanRequests = loanRequests.items;
  state.shifts = shifts.items;
  state.timesheets = timesheets.items;
  state.passwordResetRequests = passwordResetRequests.items;
  state.dataStatus = dataStatus;
  state.activeRun = runs.items.find((item) => item.status !== "cancelled") || runs.items[0] || null;
  await loadSuperAdminWorkspaces();
  await loadReport(state.reportMonth);
  render();
}

async function init() {
  try {
    const session = await api("/api/session");
    const sources = await api("/api/sources");
    state.sources = sources.items;
    if (session.authenticated) {
      state.session = session.user;
      state.company = session.company;
      if (state.session.role === "employee") {
        await loadEmployeePortal();
        render();
        return;
      }
      await bootstrapApp();
      return;
    }
  } catch (error) {
    console.error(error);
  }
  render();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read the selected file."));
    reader.readAsDataURL(file);
  });
}

init();
