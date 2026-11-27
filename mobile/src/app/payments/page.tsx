'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, Plus, Printer, RotateCcw, X, XCircle } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest, buildAuthorizedUrl } from '@/lib/api';
import { formatMoney } from '@/lib/i18n';

interface PaymentRow {
  id: string;
  receiptNumber: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  paymentType: string;
  status: string;
  student: { id: string; fullName: string; phone: string };
  paymentMonth: { billingYear: number; billingMonth: number; course: { name: string }; group: { name: string } };
}

interface PaymentSummary {
  todayRevenue: number;
  monthlyRevenue: number;
  totalRevenue: number;
  totalDebt: number;
  unpaidStudentsCount: number;
  partiallyPaidStudentsCount: number;
}

interface DebtorRow {
  student: { id: string; fullName: string; phone: string };
  totalDebt: number;
  monthsCount: number;
  overdueMonthsCount: number;
  months: Array<{ id: string; billingYear: number; billingMonth: number; remainingDebt: string; status: string; course: { name: string } }>;
}

export default function PaymentsPage() {
  const { t, user } = useApp();
  const [tab, setTab] = useState<'transactions' | 'debts' | 'report'>('transactions');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [debtors, setDebtors] = useState<DebtorRow[]>([]);
  const [students, setStudents] = useState<Array<{ id: string; fullName: string; phone: string; monthlyFee: number }>>([]);
  const [report, setReport] = useState<{
    year: number;
    month: number;
    expectedTotal: number;
    collectedTotal: number;
    debtTotal: number;
    counts: { total: number; paid: number; partiallyPaid: number; unpaid: number; overdue: number };
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({
    studentId: '',
    amount: '500000',
    paymentMethod: 'CASH',
    billingYear: String(new Date().getUTCFullYear()),
    billingMonth: String(new Date().getUTCMonth() + 1),
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [pRes, dRes, rRes, sRes] = await Promise.all([
        apiRequest<{ data: PaymentRow[]; summary: PaymentSummary }>('/payments?limit=30'),
        apiRequest<{ data: { debtors: DebtorRow[] } }>('/payments/debts'),
        apiRequest<{ data: NonNullable<typeof report> }>('/payments/monthly-report'),
        apiRequest<{ data: Array<{ id: string; fullName: string; phone: string; monthlyFee: number }> }>('/students?limit=100'),
      ]);
      setPayments(pRes.data);
      setSummary(pRes.summary);
      setDebtors(dRes.data.debtors);
      setReport(rRes.data);
      setStudents(sRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/payments', {
        method: 'POST',
        body: JSON.stringify({
          studentId: payForm.studentId,
          amount: Number(payForm.amount),
          paymentMethod: payForm.paymentMethod,
          ...(payForm.billingMonth
            ? { billingYear: Number(payForm.billingYear), billingMonth: Number(payForm.billingMonth) }
            : {}),
          notes: payForm.notes || null,
        }),
      });
      setShowPayModal(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'To‘lov xatosi');
    }
  };

  const handleCancelOrRefund = async (id: string, kind: 'cancel' | 'refund') => {
    const reason = prompt(kind === 'cancel' ? 'Bekor qilish sababini kiriting:' : 'Qaytarish sababini kiriting:');
    if (!reason) return;
    try {
      await apiRequest(`/payments/${id}/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-blue-600" />
          {t.payments.title}
        </h1>
        <button
          onClick={() => setShowPayModal(true)}
          className="px-4 py-2.5 rounded-2xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
        >
          <Plus className="w-4 h-4" />
          {t.payments.acceptPayment}
        </button>
      </div>

      {/* Payment Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="m3-card p-3.5">
            <div className="text-[11px] opacity-70">{t.payments.todayRevenue}</div>
            <div className="font-bold text-sm mt-1 text-emerald-600">{formatMoney(summary.todayRevenue)}</div>
          </div>
          <div className="m3-card p-3.5">
            <div className="text-[11px] opacity-70">{t.payments.monthlyRevenue}</div>
            <div className="font-bold text-sm mt-1 text-blue-600">{formatMoney(summary.monthlyRevenue)}</div>
          </div>
          <div className="m3-card p-3.5">
            <div className="text-[11px] opacity-70">{t.payments.totalRevenue}</div>
            <div className="font-bold text-sm mt-1">{formatMoney(summary.totalRevenue)}</div>
          </div>
          <div className="m3-card p-3.5">
            <div className="text-[11px] opacity-70">{t.payments.totalDebt}</div>
            <div className="font-bold text-sm mt-1 text-red-500">{formatMoney(summary.totalDebt)}</div>
          </div>
          <div className="m3-card p-3.5">
            <div className="text-[11px] opacity-70">{t.payments.unpaidCount}</div>
            <div className="font-bold text-base mt-1 text-orange-500">{summary.unpaidStudentsCount} ta</div>
          </div>
          <div className="m3-card p-3.5">
            <div className="text-[11px] opacity-70">{t.payments.partialCount}</div>
            <div className="font-bold text-base mt-1 text-amber-500">{summary.partiallyPaidStudentsCount} ta</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          ['transactions', t.payments.transactionsTab],
          ['debts', `${t.payments.debtsTab} (${debtors.length})`],
          ['report', t.payments.reportTab],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as typeof tab)}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap ${tab === k ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === 'transactions' ? (
        payments.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2.5">
            {payments.map((p) => (
              <div key={p.id} className="m3-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-sm">{p.student.fullName}</div>
                  <div className="opacity-75">
                    {p.receiptNumber} • {p.paymentMonth.course.name} ({p.paymentMonth.billingYear}-{String(p.paymentMonth.billingMonth).padStart(2, '0')})
                  </div>
                  <div className="opacity-65">
                    {p.paymentMethod} • {p.paymentType} • {p.paymentDate.slice(0, 10)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <div className="font-bold text-sm text-emerald-600">{formatMoney(p.amount)}</div>
                    <StatusBadge status={p.status} />
                  </div>
                  <a
                    href={buildAuthorizedUrl(`/payments/${p.id}/receipt/pdf`)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl m3-tonal-card"
                    title={t.payments.printReceipt}
                  >
                    <Printer className="w-4 h-4" />
                  </a>
                  {p.status !== 'CANCELLED' && p.status !== 'REFUNDED' && (
                    <>
                      <button
                        onClick={() => handleCancelOrRefund(p.id, 'cancel')}
                        className="p-2 rounded-xl bg-red-500/10 text-red-500"
                        title={t.payments.cancelPayment}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCancelOrRefund(p.id, 'refund')}
                        className="p-2 rounded-xl bg-purple-500/10 text-purple-500"
                        title={t.payments.refundPayment}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'debts' ? (
        debtors.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {debtors.map((d) => (
              <div key={d.student.id} className="m3-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">{d.student.fullName}</div>
                    <div className="text-xs opacity-70">{d.student.phone} • {d.monthsCount} oylik qarzdorlik</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-500">{formatMoney(d.totalDebt)}</div>
                    <button
                      onClick={() => {
                        const firstMonth = d.months[0];
                        setPayForm({
                          ...payForm,
                          studentId: d.student.id,
                          amount: String(d.totalDebt),
                          billingYear: firstMonth ? String(firstMonth.billingYear) : payForm.billingYear,
                          billingMonth: firstMonth ? String(firstMonth.billingMonth) : payForm.billingMonth,
                        });
                        setShowPayModal(true);
                      }}
                      className="text-[11px] text-blue-600 font-semibold underline mt-0.5"
                    >
                      To‘lov kiritish
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {d.months.map((m) => (
                    <span key={m.id} className="px-2.5 py-1 rounded-xl m3-tonal-card text-[11px]">
                      {m.billingYear}-{String(m.billingMonth).padStart(2, '0')}: {formatMoney(m.remainingDebt)} ({m.status})
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        report && (
          <div className="m3-card p-5 space-y-4">
            <h3 className="font-bold">Oylik hisobot: {report.year}-{String(report.month).padStart(2, '0')}</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="m3-tonal-card p-3">
                <div className="text-xs opacity-70">Rejalashtirilgan</div>
                <div className="font-bold text-sm mt-1">{formatMoney(report.expectedTotal)}</div>
              </div>
              <div className="m3-tonal-card p-3">
                <div className="text-xs opacity-70">Yig‘ilgan</div>
                <div className="font-bold text-sm mt-1 text-emerald-600">{formatMoney(report.collectedTotal)}</div>
              </div>
              <div className="m3-tonal-card p-3">
                <div className="text-xs opacity-70">Qolgan qarz</div>
                <div className="font-bold text-sm mt-1 text-red-500">{formatMoney(report.debtTotal)}</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs text-center">
              <div className="p-2 rounded-xl bg-emerald-500/10">To‘lagan: <b>{report.counts.paid}</b></div>
              <div className="p-2 rounded-xl bg-amber-500/10">Qisman: <b>{report.counts.partiallyPaid}</b></div>
              <div className="p-2 rounded-xl bg-orange-500/10">To‘lamagan: <b>{report.counts.unpaid}</b></div>
              <div className="p-2 rounded-xl bg-red-500/10">Muddati o‘tgan: <b>{report.counts.overdue}</b></div>
            </div>
          </div>
        )
      )}

      {/* Accept Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handlePay} className="m3-card w-full max-w-md p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{t.payments.acceptPayment}</h3>
              <button type="button" onClick={() => setShowPayModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <select
              required
              value={payForm.studentId}
              onChange={(e) => {
                const st = students.find((x) => x.id === e.target.value);
                setPayForm({
                  ...payForm,
                  studentId: e.target.value,
                  amount: st && st.monthlyFee > 0 ? String(st.monthlyFee) : payForm.amount,
                });
              }}
              className="m3-input text-sm"
            >
              <option value="">O‘quvchini tanlang</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName} ({s.phone})</option>
              ))}
            </select>
            <input
              required
              type="number"
              min="1000"
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              className="m3-input text-sm"
              placeholder="To‘lov summasi (UZS)"
            />
            <select
              value={payForm.paymentMethod}
              onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
              className="m3-input text-sm"
            >
              <option value="CASH">Naqd pul</option>
              <option value="CARD">Plastik karta</option>
              <option value="BANK_TRANSFER">Bank o‘tkazmasi</option>
              <option value="CLICK">Click</option>
              <option value="PAYME">Payme</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={payForm.billingYear}
                onChange={(e) => setPayForm({ ...payForm, billingYear: e.target.value })}
                className="m3-input text-sm"
                placeholder="Yil (2026)"
              />
              <select
                required
                value={payForm.billingMonth}
                onChange={(e) => setPayForm({ ...payForm, billingMonth: e.target.value })}
                className="m3-input text-sm"
              >
                {[
                  [1, 'Yanvar'],
                  [2, 'Fevral'],
                  [3, 'Mart'],
                  [4, 'Aprel'],
                  [5, 'May'],
                  [6, 'Iyun'],
                  [7, 'Iyul'],
                  [8, 'Avgust'],
                  [9, 'Sentyabr'],
                  [10, 'Oktyabr'],
                  [11, 'Noyabr'],
                  [12, 'Dekabr'],
                ].map(([m, name]) => (
                  <option key={m} value={m}>{name}</option>
                ))}
              </select>
            </div>
            <input
              value={payForm.notes}
              onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
              className="m3-input text-sm"
              placeholder="Izoh (ixtiyoriy)"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">
              Tasdiqlash
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
