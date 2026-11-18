# eDrafter — Payment Receipt & Order Management Portal

A full-stack legal documentation order management, INR payment collection, GST breakdown calculator, and A4 PDF payment receipt portal built with React, TypeScript, Tailwind CSS, Express.js, Drizzle ORM, Cloud SQL (PostgreSQL), and Firebase Authentication.

## Core Modules

- **Authentication & RBAC**: Staff Email/Password login (scrypt hashing + HMAC tokens), Forgot/Reset Password flow, Firebase Google Sign-In, Login Activity History, and 4 configurable roles (`Super Admin`, `Administrator`, `Accounts Manager`, `Staff Member`).
- **Executive Dashboard**: 10 real-time KPIs, date presets (Today, Yesterday, Last 7 Days, This Month, Previous Month, All Time, Custom Range), 5 visual charts, and recent orders/transactions tables.
- **Customer Management**: Automatic customer IDs (`CUST-2026-XXXX`), duplicate mobile/email prevention, Indian Mobile/GSTIN/PAN validation, and Customer Profile ledgers.
- **Order Management**: Service templates, decimal-safe INR financial engine (Service Fee, Govt Fee, Stamp Duty, Notary, Courier, Other, Discount, CGST/SGST/IGST), status progression, and order timeline.
- **Payment Collection & Verification**: Full, Advance, Part, and Final Instalment tracking across 10 modes (UPI, NEFT, RTGS, IMPS, Bank Transfer, Cards, Gateway, Cash, Cheque). Unverified payments remain `Pending` until explicitly verified by authorized staff. Includes refund processing.
- **A4 Portrait Receipt Generator**: Automatic sequential receipt numbers (`EDR/PR/2026-27/00001`), Indian Rupees in words, itemized breakdown, embedded eDrafter logo, QR code for online verification, PDF download (`jsPDF`), Print A4, Email/WhatsApp share, and immutable revision/superseding workflow.
- **Public Receipt Verification**: `/verify-receipt/:token` route showing privacy-masked customer details and authenticity status without requiring authentication.
- **Document Management**: Secure multipart uploads (`PDF`, `JPG`, `JPEG`, `PNG`, `DOCX` up to 10MB), Draft/Final versioning, approval workflow, and authenticated downloads.
- **Reports & Exports**: 11 operational/financial reports with PDF, Excel (`.xls`), and CSV export.
- **Settings & Audit Logs**: Company/GSTIN/Prefix/Terms configuration, payment mode toggles, JSON backup export, and immutable audit trail.

## Database Schema & Migrations

Schema is defined in `src/db/schema.ts` using Drizzle ORM (`postgresql` dialect):
`roles`, `permissions`, `users`, `login_history`, `customers`, `services`, `orders`, `payments`, `receipts`, `receipt_items`, `refunds`, `documents`, `payment_methods`, `company_settings`, `audit_logs`.

## Demo Credentials

- **Super Admin**: `admin@edrafter.in` / `Admin@123`
- **Administrator**: `manager@edrafter.in` / `Manager@123`
- **Accounts Manager**: `accounts@edrafter.in` / `Accounts@123`
- **Staff Member**: `staff@edrafter.in` / `Staff@123`

## Local Verification & Commands

```bash
npm run lint       # TypeScript check
npm run build      # Vite production build
npm run dev        # Express + Vite middleware on port 3000
npx tsx --test src/utils/finance.test.ts   # Financial & validation unit tests
```
