# Namibia Payroll Desk

A local full-stack payroll web app for Namibia-focused payroll teams.

## What is included

- Node server with local SQLite-backed persistence
- Cookie-based login session
- Employee record management
- Payroll run creation and storage
- Printable payslip view
- Monthly payroll report view
- Namibia payroll logic for PAYE, SSC, minimum wage checks, overtime, Sunday work, public holidays, night-work premium, and leave indicators

## Run locally

1. In this folder, run `npm start`
2. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)
3. Sign in with:

- Username: `admin`
- Password: `admin123!`

The database is created automatically at [`/Users/davismika/Documents/New project/data/payroll.sqlite`](/Users/davismika/Documents/New%20project/data/payroll.sqlite).

## Cloud deploy

This project is prepared for disk-backed cloud deployment.

- Container config: [`/Users/davismika/Documents/New project/Dockerfile`](/Users/davismika/Documents/New%20project/Dockerfile)
- Render blueprint: [`/Users/davismika/Documents/New project/render.yaml`](/Users/davismika/Documents/New%20project/render.yaml)
- Persistent app data path: `DATA_DIR`

Recommended hosted setup:

1. Push the project to GitHub.
2. Create a new Render web service from the repo.
3. Use the included `render.yaml`.
4. Mount the persistent disk at `/var/data`.

Important environment values:

- `HOST=0.0.0.0`
- `PORT=3000`
- `DATA_DIR=/var/data`

Optional notification provider values:

- `RESEND_API_KEY` for admin email alerts
- `AFRICASTALKING_USERNAME` for admin SMS alerts
- `AFRICASTALKING_API_KEY` for admin SMS alerts
- `AFRICASTALKING_FROM` for your approved sender ID or shortcode

## Main files

- UI entry: [`/Users/davismika/Documents/New project/public/index.html`](/Users/davismika/Documents/New%20project/public/index.html)
- Frontend app: [`/Users/davismika/Documents/New project/public/app.js`](/Users/davismika/Documents/New%20project/public/app.js)
- Styles: [`/Users/davismika/Documents/New project/public/styles.css`](/Users/davismika/Documents/New%20project/public/styles.css)
- Server: [`/Users/davismika/Documents/New project/server.js`](/Users/davismika/Documents/New%20project/server.js)
- Payroll engine: [`/Users/davismika/Documents/New project/lib/payroll.js`](/Users/davismika/Documents/New%20project/lib/payroll.js)

## Important assumptions

- Monthly basic wage is treated as ordinary-pay remuneration.
- Overtime, Sunday premiums, public-holiday premiums, bonuses, and taxable allowances are added separately.
- PAYE is annualised from the month’s taxable remuneration and divided back to a monthly withholding amount.
- SSC is calculated on basic wage only, using the deemed floor and ceiling in the regulations.
- Sunday or public-holiday entries on ordinary working days add only the extra premium, not a second ordinary day already covered by salary.

## Current limits

This is a strong local MVP, not a finished enterprise payroll platform. It does not yet cover:

- multi-user role administration beyond the seeded admin
- password change and recovery flows
- pension, fringe-benefit, and termination-pay treatment
- statutory return filing integrations
- audit approvals and locked payroll periods
- production auth hardening and secrets management

Before live payroll use at scale, pair it with a Namibian payroll practitioner and move storage, auth, backups, and deployment controls onto production-grade infrastructure.
