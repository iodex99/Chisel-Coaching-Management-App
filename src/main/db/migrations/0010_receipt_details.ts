import type { Migration } from './runner'

/** Receipt details: the student's batch (+ academic year), course and school,
 *  captured on each payment so a reprinted receipt shows what was true when the
 *  fee was paid — not the student's later batch after promotion.
 *
 *  Additive only: new nullable columns, no existing value is changed. Payments
 *  recorded before this update are filled once from the student's current
 *  batch / school (the best record available). */
export const m0010_receipt_details: Migration = {
  version: 10,
  name: 'receipt_details',
  sql: `
    ALTER TABLE payments ADD COLUMN batch_name TEXT;
    ALTER TABLE payments ADD COLUMN academic_year TEXT;
    ALTER TABLE payments ADD COLUMN course_name TEXT;
    ALTER TABLE payments ADD COLUMN school_name TEXT;

    UPDATE payments SET
      batch_name = (SELECT b.name FROM students s JOIN batches b ON b.id = s.batch_id WHERE s.id = payments.student_id),
      academic_year = (SELECT b.academic_year FROM students s JOIN batches b ON b.id = s.batch_id WHERE s.id = payments.student_id),
      course_name = (SELECT b.course_name FROM students s JOIN batches b ON b.id = s.batch_id WHERE s.id = payments.student_id),
      school_name = (SELECT sc.name FROM students s JOIN schools sc ON sc.id = s.school_id WHERE s.id = payments.student_id);
  `
}
