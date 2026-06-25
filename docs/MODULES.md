# Functional Modules

## Module 1 — Student Fee Management

### Student management
- Student master database with profile creation/maintenance.
- Parent/guardian details per student.
- Course/batch allocation.
- Admission records (admission no, date, status).
- **Bulk import** of students (and fee plans) from an Excel template with
  dropdowns for batch/gender/status and per-row validation.

### Fee structure
- Per-student fee plan with total, discount and net.
- Installment-wise planning with due dates.
- Outstanding tracking and payment-status monitoring (pending / partial / paid /
  overdue, derived from allocations).

### Payment collection
- Record payments with date, amount and mode (Cash, UPI, Bank Transfer, Cheque,
  Other) plus a reference (UPI txn / cheque no).
- Record the **account** the payment was received in.
- Allocate a payment across one or more installments (supports partials).
- Complete payment history per student.

### Due monitoring
- Dashboard of upcoming dues and overdue alerts.
- Pending-collection reports and in-app due reminders.

### Receipts
- Auto-generated on payment entry with a unique receipt number.
- Printable + PDF export (Electron `printToPDF` over an HTML template carrying
  the institute logo/details).
- Reprint of any previous receipt.

### Reports & analytics
- Student-wise collection, outstanding, collection summary, date-wise and
  payment-mode-wise reports.

## Module 2 — Expense Management

### Expense recording
- Day-to-day expenses with date, category, amount, payee/vendor and remarks.

### Payment tracking
- Amount paid, recipient, payment mode and the **account** paid from.

### Reports & dashboard
- Date-wise, category-wise, vendor-wise, account-wise and monthly summaries.
- Expense dashboard: totals and monthly tracking.

## Cross-cutting

- **Accounts** (cash / bank / UPI) are shared by both modules to track money in
  and out and produce account-wise summaries.
- **Settings** holds the institute profile, receipt format, currency (₹) and
  preferences used across modules.

## Status

✅ All modules implemented in v1.0.0. This document tracks scope; release detail
lives in [CHANGELOG.md](../CHANGELOG.md).
