import { getDb } from '../db/database'
import { financialYear } from './fy'
import { createAccount } from './account'
import { createBatch } from './batch'
import { createStudent } from './student'
import { saveFeePlan } from './fee'
import { recordPayment, cancelPayment } from './payment'
import { listCategories, createCategory, createVendor, createExpense } from './expense'
import { createBackup } from './backup'
import type { Batch, FeePlanView, PaymentMode } from '@shared/types'

// All amounts are integer paise. The set below intentionally exercises every
// screen: multiple courses/batches with base fees, students across batches and
// statuses with guardians, fee plans (full / partial / overdue / no-plan),
// payments in every mode (incl. a cancelled and an advance one), and expenses
// across categories / vendors / accounts including one near an account's
// per-vendor FY limit.

const R = (rupees: number): number => Math.round(rupees * 100)

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = (): string => iso(new Date())
const dayOffset = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}
const monthDay = (monthsBack: number, day = 8): string => {
  const n = new Date()
  return iso(new Date(n.getFullYear(), n.getMonth() - monthsBack, Math.min(day, 28)))
}
function addMonthsClamp(dateISO: string, months: number): string {
  const [y, mo, da] = dateISO.split('-').map(Number)
  const t = new Date(y, mo - 1 + months, 1)
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  return iso(new Date(t.getFullYear(), t.getMonth(), Math.min(da, last)))
}

function ensureCategory(name: string): number {
  const existing = listCategories().find((c) => c.name.toLowerCase() === name.toLowerCase())
  return existing ? existing.id : createCategory(name).id
}

export interface SeedResult {
  added: boolean
  message: string
}

export async function seedDemoData(): Promise<SeedResult> {
  const already =
    getDb().get<{ c: number }>("SELECT COUNT(*) AS c FROM batches WHERE name LIKE '%(Sample)%'")?.c ?? 0
  if (already > 0) {
    return {
      added: false,
      message: 'Sample data is already loaded. To reload it, restore the "pre-demo" backup from Data & Backup first.'
    }
  }

  // Safety: snapshot the current (likely empty) state so it can be restored.
  await createBackup('pre-demo')

  const fy = financialYear(today())

  // --- Accounts ---
  const cash = createAccount({ name: 'Cash Drawer (Sample)', type: 'cash', openingBalance: R(15000), isActive: true }).id
  const bank = createAccount({
    name: 'HDFC Current A/c (Sample)',
    type: 'bank',
    openingBalance: R(250000),
    isActive: true,
    vendorFyLimits: [{ fy, limit: R(200000) }] // ₹2,00,000 per-vendor cap this FY
  }).id
  const upi = createAccount({ name: 'UPI · PhonePe (Sample)', type: 'upi', openingBalance: 0, isActive: true }).id

  // --- Batches / courses (with base fees) ---
  const neet = createBatch({ name: 'NEET 2026 (Sample)', courseName: 'NEET', academicYear: '2026-27', defaultFee: R(120000), status: 'active' })
  const jee = createBatch({ name: 'JEE 2026 (Sample)', courseName: 'JEE Mains + Advanced', academicYear: '2026-27', defaultFee: R(150000), status: 'active' })
  const foundation = createBatch({ name: 'Foundation IX (Sample)', courseName: 'Foundation', academicYear: '2026-27', defaultFee: R(60000), status: 'active' })
  const crash = createBatch({ name: 'NEET Crash (Sample)', courseName: 'NEET Crash Course', academicYear: '2026-27', defaultFee: R(40000), status: 'active' })
  createBatch({ name: 'Foundation X 2024 (Sample)', courseName: 'Foundation', academicYear: '2024-25', defaultFee: R(55000), status: 'inactive' })

  let admN = 1
  const adm = (): string => `S2026-${String(admN++).padStart(3, '0')}`

  type Gender = 'male' | 'female' | 'other'
  function mkStudent(
    first: string,
    last: string,
    gender: Gender,
    batch: Batch,
    phone: string,
    status: 'active' | 'inactive' | 'dropped' | 'completed',
    guardians: { name: string; relation: string; phone: string }[],
    admMonthsBack: number
  ): number {
    return createStudent({
      admissionNo: adm(),
      firstName: first,
      lastName: last,
      gender,
      phone,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      batchId: batch.id,
      admissionDate: monthDay(admMonthsBack, 3),
      status,
      guardians
    }).id
  }

  function mkPlan(studentId: number, baseFee: number, discount: number, count: number, firstDue: string): FeePlanView {
    const net = baseFee - discount
    const per = Math.floor(net / count)
    const installments = Array.from({ length: count }, (_, i) => ({
      label: `Installment ${i + 1}`,
      dueAmount: i === count - 1 ? net - per * (count - 1) : per,
      dueDate: addMonthsClamp(firstDue, i)
    }))
    return saveFeePlan(studentId, { name: 'Course fee', totalAmount: baseFee, discount, installments })
  }

  function payFull(studentId: number, plan: FeePlanView, mode: PaymentMode, accountId: number, date: string, ref?: string): void {
    const allocations = plan.installments.map((i) => ({ installmentId: i.id, amount: i.outstanding })).filter((a) => a.amount > 0)
    const amount = allocations.reduce((s, a) => s + a.amount, 0)
    if (amount > 0) recordPayment({ studentId, amount, paymentDate: date, mode, accountId, referenceNo: ref, allocations })
  }

  function payOne(studentId: number, plan: FeePlanView, idx: number, fraction: number, mode: PaymentMode, accountId: number, date: string, ref?: string): void {
    const inst = plan.installments[idx]
    if (!inst) return
    const amount = Math.round(inst.outstanding * fraction)
    if (amount > 0) recordPayment({ studentId, amount, paymentDate: date, mode, accountId, referenceNo: ref, allocations: [{ installmentId: inst.id, amount }] })
  }

  // --- Students + their fee plans + payments ---

  // Fully paid (NEET, ₹5k discount, 3 installments, paid over two months/modes)
  const s1 = mkStudent('Aarav', 'Sharma', 'male', neet, '9810000001', 'active', [{ name: 'Rakesh Sharma', relation: 'Father', phone: '9810000011' }], 3)
  const p1 = mkPlan(s1, neet.defaultFee, R(5000), 3, monthDay(2, 5))
  payOne(s1, p1, 0, 1, 'upi', upi, monthDay(2, 6), 'UPI/AX1133')
  payOne(s1, p1, 1, 1, 'bank_transfer', bank, monthDay(1, 7), 'NEFT/8841')
  payOne(s1, p1, 2, 1, 'cash', cash, dayOffset(-2))

  // Partial — first installment paid by cash
  const s2 = mkStudent('Diya', 'Verma', 'female', neet, '9810000002', 'active', [{ name: 'Sunita Verma', relation: 'Mother', phone: '9810000012' }], 2)
  const p2 = mkPlan(s2, neet.defaultFee, 0, 3, monthDay(1, 5))
  payOne(s2, p2, 0, 1, 'cash', cash, monthDay(1, 6))

  // Overdue — first installment due last month, nothing paid
  const s3 = mkStudent('Kabir', 'Khan', 'male', jee, '9810000003', 'active', [{ name: 'Imran Khan', relation: 'Father', phone: '9810000013' }], 1)
  mkPlan(s3, jee.defaultFee, 0, 3, dayOffset(-20))

  // Fully paid by cheque (JEE)
  const s4 = mkStudent('Ananya', 'Reddy', 'female', jee, '9810000004', 'active', [{ name: 'Suresh Reddy', relation: 'Father', phone: '9810000014' }], 4)
  const p4 = mkPlan(s4, jee.defaultFee, R(10000), 2, monthDay(2, 10))
  payFull(s4, p4, 'cheque', bank, monthDay(1, 12), 'CHQ/550021')

  // Half of first installment (UPI), Foundation
  const s5 = mkStudent('Vivaan', 'Gupta', 'male', foundation, '9810000005', 'active', [{ name: 'Neha Gupta', relation: 'Mother', phone: '9810000015' }], 2)
  const p5 = mkPlan(s5, foundation.defaultFee, 0, 2, dayOffset(-10))
  payOne(s5, p5, 0, 0.5, 'upi', upi, dayOffset(-1), 'UPI/RT9920')

  // Fully paid cash, small discount, Foundation
  const s6 = mkStudent('Ishaan', 'Nair', 'male', foundation, '9810000006', 'active', [{ name: 'Latha Nair', relation: 'Mother', phone: '9810000016' }], 5)
  const p6 = mkPlan(s6, foundation.defaultFee, R(2000), 2, monthDay(3, 8))
  payFull(s6, p6, 'cash', cash, monthDay(2, 9))

  // Single-installment crash course, paid in full (UPI)
  const s7 = mkStudent('Sara', 'Iyer', 'female', crash, '9810000007', 'active', [{ name: 'Mohan Iyer', relation: 'Father', phone: '9810000017' }], 1)
  const p7 = mkPlan(s7, crash.defaultFee, 0, 1, dayOffset(-5))
  payFull(s7, p7, 'upi', upi, dayOffset(-3), 'UPI/CR1200')

  // Partial + an advance (unallocated) payment on top
  const s8 = mkStudent('Aditya', 'Rao', 'male', neet, '9810000008', 'active', [{ name: 'Geeta Rao', relation: 'Mother', phone: '9810000018' }], 2)
  const p8 = mkPlan(s8, neet.defaultFee, 0, 3, dayOffset(-15))
  payOne(s8, p8, 0, 1, 'bank_transfer', bank, dayOffset(-12), 'NEFT/9001')
  recordPayment({ studentId: s8, amount: R(5000), paymentDate: today(), mode: 'cash', accountId: cash, remarks: 'Advance towards next installment' })

  // Overdue (two installments, both past)
  const s9 = mkStudent('Myra', 'Joshi', 'female', jee, '9810000009', 'active', [{ name: 'Anil Joshi', relation: 'Father', phone: '9810000019' }], 3)
  mkPlan(s9, jee.defaultFee, R(15000), 2, dayOffset(-40))

  // No fee plan yet (to demo creating one)
  mkStudent('Reyansh', 'Mehta', 'male', foundation, '9810000010', 'active', [{ name: 'Pooja Mehta', relation: 'Mother', phone: '9810000020' }], 1)
  mkStudent('Anvi', 'Shah', 'female', crash, '9810000021', 'active', [{ name: 'Dilip Shah', relation: 'Father', phone: '9810000022' }], 0)

  // Fully paid via "other" mode, plus a CANCELLED payment to show cancellation
  const s12 = mkStudent('Arjun', 'Pillai', 'male', neet, '9810000023', 'active', [{ name: 'Remya Pillai', relation: 'Mother', phone: '9810000024' }], 4)
  const p12 = mkPlan(s12, neet.defaultFee, 0, 2, monthDay(2, 6))
  payFull(s12, p12, 'other', bank, monthDay(1, 10), 'DD/77120')
  const toCancel = recordPayment({ studentId: s12, amount: R(2000), paymentDate: dayOffset(-4), mode: 'cash', accountId: cash, remarks: 'Duplicate entry' })
  cancelPayment(toCancel.id, 'Entered twice by mistake')

  // Inactive student with a partial payment
  const s13 = mkStudent('Kiara', 'Das', 'female', jee, '9810000025', 'inactive', [{ name: 'Bikash Das', relation: 'Father', phone: '9810000026' }], 8)
  const p13 = mkPlan(s13, jee.defaultFee, 0, 3, monthDay(4, 5))
  payOne(s13, p13, 0, 1, 'cheque', bank, monthDay(3, 6), 'CHQ/4410')

  // Completed student, fully paid
  const s14 = mkStudent('Vihaan', 'Bose', 'male', neet, '9810000027', 'completed', [{ name: 'Rina Bose', relation: 'Mother', phone: '9810000028' }], 11)
  const p14 = mkPlan(s14, neet.defaultFee, R(8000), 4, monthDay(10, 5))
  payFull(s14, p14, 'upi', upi, monthDay(9, 6), 'UPI/OLD771')

  // --- Expenses (categories / vendors / accounts / modes / dates) ---
  const cRent = ensureCategory('Rent')
  const cSalary = ensureCategory('Salaries')
  const cElec = ensureCategory('Electricity')
  const cNet = ensureCategory('Internet')
  const cMkt = ensureCategory('Marketing')
  const cStat = ensureCategory('Stationery')
  const cMaint = ensureCategory('Maintenance')

  const vLandlord = createVendor({ name: 'Sunrise Properties (Sample)', contact: '9900000001' }).id
  const vPower = createVendor({ name: 'State Electricity Board (Sample)' }).id
  const vNet = createVendor({ name: 'JioFiber (Sample)' }).id
  const vPrint = createVendor({ name: 'PrintHub (Sample)' }).id
  const vClean = createVendor({ name: 'CleanCo Services (Sample)' }).id
  const vAds = createVendor({ name: 'Meta Ads (Sample)' }).id

  const exp = (date: string, categoryId: number, amount: number, mode: PaymentMode, accountId: number, vendorId?: number, remarks?: string): void => {
    createExpense({ expenseDate: date, categoryId, amount, mode, accountId, vendorId, remarks })
  }

  // Rent to the landlord from the bank — large but under the ₹2,00,000 FY cap
  exp(monthDay(2, 2), cRent, R(150000), 'bank_transfer', bank, vLandlord, 'Quarterly rent')
  exp(monthDay(0, 2), cRent, R(50000), 'bank_transfer', bank, vLandlord, 'Monthly rent') // 150k+50k = cap; further rent this FY would be blocked
  exp(monthDay(1, 28), cSalary, R(85000), 'bank_transfer', bank, undefined, 'Staff salaries')
  exp(monthDay(0, 28), cSalary, R(85000), 'bank_transfer', bank, undefined, 'Staff salaries')
  exp(monthDay(1, 12), cElec, R(7400), 'upi', upi, vPower)
  exp(monthDay(0, 12), cElec, R(8100), 'upi', upi, vPower)
  exp(monthDay(0, 5), cNet, R(1499), 'upi', upi, vNet, 'Broadband')
  exp(dayOffset(-6), cMkt, R(12000), 'upi', upi, vAds, 'Admissions campaign')
  exp(dayOffset(-3), cStat, R(3200), 'cash', cash, vPrint, 'Test booklets')
  exp(dayOffset(-1), cMaint, R(2500), 'cash', cash, vClean, 'AC servicing')
  exp(monthDay(2, 20), cStat, R(4500), 'cash', cash, vPrint, 'Whiteboard markers & paper')

  const counts = getDb().get<{ s: number; p: number; e: number }>(
    'SELECT (SELECT COUNT(*) FROM students) AS s, (SELECT COUNT(*) FROM payments WHERE is_cancelled = 0) AS p, (SELECT COUNT(*) FROM expenses) AS e'
  )
  return {
    added: true,
    message: `Loaded sample data — ${counts?.s ?? 0} students, 5 batches, ${counts?.p ?? 0} payments and ${counts?.e ?? 0} expenses. A "pre-demo" backup was saved so you can restore your earlier state afterwards.`
  }
}
