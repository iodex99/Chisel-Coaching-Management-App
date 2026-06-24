import type { Migration } from './runner'

export const m0004_fees: Migration = {
  version: 4,
  name: 'fees',
  sql: /* sql */ `
    -- One fee plan per student (gross total, discount, derived net).
    CREATE TABLE fee_plans (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      total_amount INTEGER NOT NULL DEFAULT 0,   -- gross (paise)
      discount     INTEGER NOT NULL DEFAULT 0,   -- paise
      net_amount   INTEGER NOT NULL DEFAULT 0,   -- total - discount (paise)
      notes        TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX idx_fee_plans_student ON fee_plans (student_id);

    -- Installment schedule for a fee plan.
    CREATE TABLE fee_installments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fee_plan_id INTEGER NOT NULL REFERENCES fee_plans(id) ON DELETE CASCADE,
      seq_no      INTEGER NOT NULL,
      label       TEXT,
      due_amount  INTEGER NOT NULL DEFAULT 0,    -- paise
      due_date    TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX idx_installments_plan ON fee_installments (fee_plan_id);
    CREATE INDEX idx_installments_due ON fee_installments (due_date);

    -- Fee payments received (receipt logic + UI land in the payments phase).
    CREATE TABLE payments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no    TEXT NOT NULL UNIQUE,
      student_id    INTEGER NOT NULL REFERENCES students(id),
      payment_date  TEXT NOT NULL,
      amount        INTEGER NOT NULL,            -- paise
      mode          TEXT NOT NULL,               -- cash | upi | bank_transfer | cheque | other
      account_id    INTEGER REFERENCES accounts(id),
      reference_no  TEXT,
      remarks       TEXT,
      is_cancelled  INTEGER NOT NULL DEFAULT 0,
      cancel_reason TEXT,
      created_by    INTEGER,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX idx_payments_student ON payments (student_id);
    CREATE INDEX idx_payments_date ON payments (payment_date);

    -- Allocation of a payment across one or more installments.
    CREATE TABLE payment_allocations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id     INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      installment_id INTEGER REFERENCES fee_installments(id),
      amount         INTEGER NOT NULL             -- paise
    );
    CREATE INDEX idx_alloc_payment ON payment_allocations (payment_id);
    CREATE INDEX idx_alloc_installment ON payment_allocations (installment_id);
  `
}
