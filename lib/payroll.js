const MONTHS_PER_YEAR = 12;
const WEEKS_PER_MONTH = 52 / 12;

const SOURCE_LIST = [
  {
    title: "Income Tax Act, 1981",
    detail:
      "Schedule 4 rates used for annualised PAYE: 0% to N$50,000; 18% to N$100,000; 25% to N$300,000; 28% to N$500,000; 30% to N$800,000; 32% to N$1,500,000; 37% above that.",
    url: "https://namiblii.org/akn/na/act/1981/24/eng%402023-01-01/source.pdf",
  },
  {
    title: "Social Security Act Regulations",
    detail:
      "Employee and employer contributions are each 0.9% of basic wage, with the deemed monthly basic wage floor at N$500 and ceiling at N$11,000 from 1 March 2025.",
    url: "https://www.lac.org.na/laws/annoREG/Social%20Security%20Act%2034%20of%201994-Regulations%201995-198.pdf",
  },
  {
    title: "Labour Act, 2007",
    detail:
      "Used for ordinary hours, overtime, Sunday work, public holidays, night work, annual leave, sick leave, compassionate leave, and maternity leave logic.",
    url: "https://namiblii.org/akn/na/act/2007/11/eng%402023-03-15",
  },
  {
    title: "National Minimum Wage Order",
    detail:
      "Used for the phased hourly minimum wages effective from 1 January 2025, including domestic, agriculture, and security worker carve-outs.",
    url: "https://namiblii.org/akn/na/act/gn/2024/218",
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fullMonthsBetween(start, end) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return 0;
  const years = end.getFullYear() - start.getFullYear();
  const months = end.getMonth() - start.getMonth();
  const total = years * 12 + months;
  return end.getDate() >= start.getDate() ? total : total - 1;
}

function getPayrollDate(monthValue) {
  if (!monthValue) return new Date();
  return new Date(`${monthValue}-01T00:00:00`);
}

function computeHourlyBasic(basicWage, daysPerWeek, hoursPerDay) {
  const weeklyHours = daysPerWeek * hoursPerDay;
  return weeklyHours > 0 ? basicWage / (weeklyHours * WEEKS_PER_MONTH) : 0;
}

function annualTax(annualIncome) {
  if (annualIncome <= 50000) return 0;
  if (annualIncome <= 100000) return (annualIncome - 50000) * 0.18;
  if (annualIncome <= 300000) return 9000 + (annualIncome - 100000) * 0.25;
  if (annualIncome <= 500000) return 59000 + (annualIncome - 300000) * 0.28;
  if (annualIncome <= 800000) return 115000 + (annualIncome - 500000) * 0.3;
  if (annualIncome <= 1500000) return 205000 + (annualIncome - 800000) * 0.32;
  return 429000 + (annualIncome - 1500000) * 0.37;
}

function getMinimumWage(category, payrollDate) {
  const year = payrollDate.getFullYear();

  if (category === "domestic") {
    if (year >= 2027) return 18;
    if (year >= 2026) return 15;
    return 12;
  }

  if (category === "agriculture") {
    if (year >= 2027) return 18;
    if (year >= 2026) return 14;
    return 10;
  }

  if (category === "security") {
    if (year >= 2027) return 18;
    if (year >= 2026) return 16;
    return 13.5;
  }

  return 18;
}

function getSickLeaveEntitlement(daysPerWeek, monthsOfService) {
  const fullCycleEntitlement = daysPerWeek >= 6 ? 36 : daysPerWeek >= 5 ? 30 : daysPerWeek * 6;
  if (monthsOfService < 12) {
    const approxDaysWorked = monthsOfService * 22;
    return Math.floor(approxDaysWorked / 26);
  }
  return fullCycleEntitlement;
}

function buildLeaveMetrics(data) {
  const payrollDate = getPayrollDate(data.payrollMonth);
  const startDate = new Date(`${data.startDate}T00:00:00`);
  const monthsOfService = Math.max(0, fullMonthsBetween(startDate, payrollDate) + 1);
  const annualEntitlement = data.daysPerWeek * 4;
  const annualAccrued = clamp((annualEntitlement / 12) * Math.min(monthsOfService, 12), 0, annualEntitlement);
  const annualRemaining = annualAccrued - data.annualLeaveUsed;
  const sickEntitlement = getSickLeaveEntitlement(data.daysPerWeek, monthsOfService);
  const sickRemaining = sickEntitlement - data.sickLeaveUsed;

  return {
    monthsOfService,
    annualEntitlement,
    annualAccrued,
    annualRemaining,
    sickEntitlement,
    sickRemaining,
    compassionateLeave: 5,
    maternityWeeks: 12,
  };
}

function calculatePayroll(data) {
  const payrollDate = getPayrollDate(data.payrollMonth);
  const hourlyBasic = computeHourlyBasic(data.basicWage, data.daysPerWeek, data.hoursPerDay);
  const ordinaryWeeklyHours = data.daysPerWeek * data.hoursPerDay;
  const overtimeRate = hourlyBasic * 1.5;
  const overtimePay = overtimeRate * data.overtimeHours;
  const sundayPay = data.ordinarilyWorksSunday
    ? hourlyBasic * data.sundayHours
    : hourlyBasic * 2 * data.sundayHours;
  const publicHolidayPay = data.publicHolidayOrdinaryDay
    ? hourlyBasic * data.publicHolidayHours
    : hourlyBasic * 2 * data.publicHolidayHours;
  const nightPremium = hourlyBasic * 0.06 * data.nightHours;

  const taxableGross =
    data.basicWage +
    data.allowances +
    data.bonus +
    overtimePay +
    sundayPay +
    publicHolidayPay +
    nightPremium;

  const annualisedTaxable = taxableGross * MONTHS_PER_YEAR;
  const paye = annualTax(annualisedTaxable) / MONTHS_PER_YEAR;

  const sscAssessableBasic =
    payrollDate >= new Date("2025-03-01T00:00:00")
      ? clamp(data.basicWage, 500, 11000)
      : clamp(data.basicWage, 300, 9000);

  const employeeSsc = sscAssessableBasic * 0.009;
  const employerSsc = sscAssessableBasic * 0.009;
  const netPay = taxableGross - paye - employeeSsc - data.otherDeductions;
  const totalEmployerCost = taxableGross + employerSsc;

  const minimumHourly = getMinimumWage(data.workerCategory, payrollDate);
  const compliantMinimumWage = hourlyBasic >= minimumHourly;
  const weeklyOrdinaryLimit = data.workerCategory === "security" ? 60 : 45;
  const dailyOrdinaryLimit =
    data.workerCategory === "security"
      ? data.daysPerWeek > 5
        ? 10
        : 12
      : data.daysPerWeek > 5
        ? 8
        : 9;

  const leave = buildLeaveMetrics(data);

  const compliance = [
    {
      key: "minimum-wage",
      pass: compliantMinimumWage,
      title: compliantMinimumWage ? "Minimum wage passes" : "Minimum wage risk",
      body: compliantMinimumWage
        ? `Ordinary hourly wage is N$${hourlyBasic.toFixed(2)} against a statutory floor of N$${minimumHourly.toFixed(2)}.`
        : `Ordinary hourly wage is N$${hourlyBasic.toFixed(2)}, below the current minimum of N$${minimumHourly.toFixed(2)}. Review the basic wage because premiums and allowances do not cure minimum wage non-compliance.`,
    },
    {
      key: "ordinary-hours",
      pass: ordinaryWeeklyHours <= weeklyOrdinaryLimit,
      title: ordinaryWeeklyHours <= weeklyOrdinaryLimit ? "Ordinary hours pass" : "Ordinary hours risk",
      body:
        ordinaryWeeklyHours <= weeklyOrdinaryLimit
          ? `Ordinary hours are ${ordinaryWeeklyHours.toFixed(2)} per week, within the section 16 limit of ${weeklyOrdinaryLimit} hours.`
          : `Ordinary hours are ${ordinaryWeeklyHours.toFixed(2)} per week, above the section 16 limit of ${weeklyOrdinaryLimit} hours.`,
    },
    {
      key: "daily-hours",
      pass: data.hoursPerDay <= dailyOrdinaryLimit,
      title: data.hoursPerDay <= dailyOrdinaryLimit ? "Daily hours pass" : "Daily hours risk",
      body:
        data.hoursPerDay <= dailyOrdinaryLimit
          ? `Ordinary daily hours are ${data.hoursPerDay.toFixed(2)}, within the daily cap of ${dailyOrdinaryLimit}.`
          : `Ordinary daily hours are ${data.hoursPerDay.toFixed(2)}, above the daily cap of ${dailyOrdinaryLimit}.`,
    },
    {
      key: "daily-overtime",
      pass: data.maxDailyOvertime <= 3,
      title: data.maxDailyOvertime <= 3 ? "Daily overtime pass" : "Daily overtime risk",
      body:
        data.maxDailyOvertime <= 3
          ? `Maximum daily overtime entered is ${data.maxDailyOvertime.toFixed(2)} hours, within the Labour Act limit of three hours per day.`
          : `Maximum daily overtime entered is ${data.maxDailyOvertime.toFixed(2)} hours, above the Labour Act limit of three hours per day unless a written approval increases the cap.`,
    },
    {
      key: "weekly-overtime",
      pass: data.maxWeeklyOvertime <= 10,
      title: data.maxWeeklyOvertime <= 10 ? "Weekly overtime pass" : "Weekly overtime risk",
      body:
        data.maxWeeklyOvertime <= 10
          ? `Maximum weekly overtime entered is ${data.maxWeeklyOvertime.toFixed(2)} hours, within the Labour Act limit of 10 hours per week.`
          : `Maximum weekly overtime entered is ${data.maxWeeklyOvertime.toFixed(2)} hours, above the Labour Act limit of 10 hours per week unless increased by written approval.`,
    },
    {
      key: "ssc",
      pass: true,
      title: "Statutory remittance reminder",
      body: `Employee SSC is N$${employeeSsc.toFixed(2)} and employer SSC is N$${employerSsc.toFixed(2)} on an assessable basic wage of N$${sscAssessableBasic.toFixed(2)}. SSC payment is due within 20 days after month-end.`,
    },
  ];

  return {
    inputs: { ...data },
    computedAt: new Date().toISOString(),
    metrics: {
      hourlyBasic,
      overtimeRate,
      overtimePay,
      sundayPay,
      publicHolidayPay,
      nightPremium,
      taxableGross,
      annualisedTaxable,
      paye,
      employeeSsc,
      employerSsc,
      netPay,
      totalEmployerCost,
      minimumHourly,
      sscAssessableBasic,
    },
    leave,
    compliance,
    sources: SOURCE_LIST,
  };
}

function normalizePayrollInput(raw) {
  return {
    payrollMonth: String(raw.payrollMonth || ""),
    employeeName: String(raw.employeeName || "").trim(),
    workerCategory: String(raw.workerCategory || "general"),
    startDate: String(raw.startDate || ""),
    daysPerWeek: Number(raw.daysPerWeek || 0),
    hoursPerDay: Number(raw.hoursPerDay || 0),
    basicWage: Number(raw.basicWage || 0),
    allowances: Number(raw.allowances || 0),
    bonus: Number(raw.bonus || 0),
    otherDeductions: Number(raw.otherDeductions || 0),
    overtimeHours: Number(raw.overtimeHours || 0),
    maxDailyOvertime: Number(raw.maxDailyOvertime || 0),
    maxWeeklyOvertime: Number(raw.maxWeeklyOvertime || 0),
    sundayHours: Number(raw.sundayHours || 0),
    ordinarilyWorksSunday: Boolean(raw.ordinarilyWorksSunday),
    publicHolidayHours: Number(raw.publicHolidayHours || 0),
    publicHolidayOrdinaryDay: Boolean(raw.publicHolidayOrdinaryDay),
    nightHours: Number(raw.nightHours || 0),
    annualLeaveUsed: Number(raw.annualLeaveUsed || 0),
    sickLeaveUsed: Number(raw.sickLeaveUsed || 0),
  };
}

module.exports = {
  SOURCE_LIST,
  calculatePayroll,
  normalizePayrollInput,
};
