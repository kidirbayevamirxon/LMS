'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Layers,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { AttendanceMiniChart, BarChartCard, PaymentBreakdownCard } from '@/components/Charts';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest } from '@/lib/api';
import { formatMoney } from '@/lib/i18n';

interface DashboardResponse {
  mode: 'ADMIN' | 'STUDENT';
  stats?: {
    totalStudents: number;
    activeStudents: number;
    totalGroups: number;
    totalCourses: number;
    todayAttendance: number;
    todayAbsent: number;
    monthlyRevenue: number;
    totalDebt: number;
    certificatesIssued: number;
  };
  charts?: {
    monthlyRevenue: Array<{ label: string; revenue: number }>;
    paymentStats: Array<{ status: string; count: number; paidAmount: number; remainingDebt: number }>;
    attendanceStats: Array<{ date: string; present: number; late: number; absent: number }>;
    studentsByGroup: Array<{ id: string; name: string; courseName: string; studentsCount: number; maxStudents: number }>;
  };
  recentPayments?: Array<{
    id: string;
    receiptNumber: string;
    amount: string;
    paymentMethod: string;
    paymentDate: string;
    status: string;
    student: { fullName: string };
  }>;
  student?: {
    fullName: string;
    phone: string;
    status: string;
    groupStudents: Array<{ group: { name: string; startTime: string; endTime: string; course: { name: string } } }>;
    paymentMonths: Array<{ id: string; billingYear: number; billingMonth: number; expectedAmount: string; paidAmount: string; remainingDebt: string; status: string }>;
    attendances: Array<{ id: string; attendanceDate: string; status: string; method: string }>;
    certificates: Array<{ id: string; certificateNumber: string; courseName: string; issuedDate: string; status: string }>;
  };
}

export default function DashboardPage() {
  const { t, user } = useApp();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ data: DashboardResponse }>('/dashboard');
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <EmptyState />;

  if (data.mode === 'STUDENT' && data.student) {
    const st = data.student;
    return (
      <div className="space-y-5">
        <div className="m3-card p-6 bg-gradient-to-r from-blue-700 to-teal-700 text-white border-none">
          <div className="text-xs uppercase tracking-wider opacity-80">O‘quvchi kabineti</div>
          <h1 className="text-2xl font-bold mt-1">{st.fullName}</h1>
          <p className="text-sm opacity-90">{st.phone}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="m3-card p-5 space-y-3">
            <h2 className="font-bold text-sm">Mening guruhlarim</h2>
            {st.groupStudents.map((gs, i) => (
              <div key={i} className="m3-tonal-card p-3 flex justify-between items-center text-sm">
                <div>
                  <div className="font-semibold">{gs.group.name}</div>
                  <div className="text-xs opacity-70">{gs.group.course.name}</div>
                </div>
                <span className="text-xs font-bold text-blue-600">{gs.group.startTime}–{gs.group.endTime}</span>
              </div>
            ))}
          </div>

          <div className="m3-card p-5 space-y-3">
            <h2 className="font-bold text-sm">Oylik to‘lov jadvali</h2>
            {st.paymentMonths.map((pm) => (
              <div key={pm.id} className="m3-tonal-card p-3 flex justify-between items-center text-xs">
                <div>
                  <div className="font-bold">{pm.billingYear}-{String(pm.billingMonth).padStart(2, '0')}</div>
                  <div className="opacity-70">To‘langan: {formatMoney(pm.paidAmount)}</div>
                </div>
                <div className="text-right space-y-1">
                  <StatusBadge status={pm.status} />
                  {Number(pm.remainingDebt) > 0 && (
                    <div className="text-red-500 font-semibold">Qarz: {formatMoney(pm.remainingDebt)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const s = data.stats!;
  const statCards = [
    { label: t.dashboard.totalStudents, value: s.totalStudents, icon: Users, color: 'text-blue-600 bg-blue-500/10' },
    { label: t.dashboard.activeStudents, value: s.activeStudents, icon: UserCheck, color: 'text-emerald-600 bg-emerald-500/10' },
    { label: t.dashboard.totalGroups, value: s.totalGroups, icon: Layers, color: 'text-indigo-600 bg-indigo-500/10' },
    { label: t.dashboard.totalCourses, value: s.totalCourses, icon: BookOpen, color: 'text-cyan-600 bg-cyan-500/10' },
    { label: t.dashboard.todayAttendance, value: s.todayAttendance, icon: CheckCircle2, color: 'text-teal-600 bg-teal-500/10' },
    { label: t.dashboard.todayAbsent, value: s.todayAbsent, icon: XCircle, color: 'text-rose-600 bg-rose-500/10' },
    { label: t.dashboard.monthlyRevenue, value: formatMoney(s.monthlyRevenue), icon: CreditCard, color: 'text-emerald-600 bg-emerald-500/10' },
    { label: t.dashboard.totalDebt, value: formatMoney(s.totalDebt), icon: AlertTriangle, color: 'text-amber-600 bg-amber-500/10' },
    { label: t.dashboard.certificatesIssued, value: s.certificatesIssued, icon: Award, color: 'text-purple-600 bg-purple-500/10' },
  ];

  return (
    <div className="space-y-5">
      <div className="m3-card p-5 sm:p-6 bg-gradient-to-r from-blue-800 via-blue-700 to-teal-700 text-white border-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="w-7 h-7" />
              {t.nav.dashboard}
            </h1>
            <p className="text-xs text-blue-100 mt-1">{t.appSubtitle}</p>
          </div>
          <div className="text-right text-xs bg-white/15 px-3.5 py-2 rounded-2xl backdrop-blur-sm">
            <div className="opacity-80">{t.dashboard.monthlyRevenue}</div>
            <div className="font-bold text-sm sm:text-base">{formatMoney(s.monthlyRevenue)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="m3-card p-3.5 sm:p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] sm:text-xs opacity-75 font-medium leading-tight">{card.label}</span>
                <div className={`p-2 rounded-xl shrink-0 ${card.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-base sm:text-lg font-bold tracking-tight truncate">{card.value}</div>
            </div>
          );
        })}
      </div>

      {data.charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BarChartCard
            title={t.dashboard.monthlyRevenueChart}
            items={data.charts.monthlyRevenue.map((m) => ({ label: m.label, value: m.revenue }))}
            formatValue={(v) => formatMoney(v)}
          />
          <AttendanceMiniChart
            title={t.dashboard.attendanceChart}
            data={data.charts.attendanceStats}
          />
          <PaymentBreakdownCard
            title={t.dashboard.paymentStatsChart}
            items={data.charts.paymentStats}
          />
          <BarChartCard
            title={t.dashboard.groupsChart}
            items={data.charts.studentsByGroup.map((g) => ({
              label: `${g.name} (${g.courseName})`,
              value: g.studentsCount,
              secondary: `max ${g.maxStudents}`,
            }))}
          />
        </div>
      )}

      {data.recentPayments && data.recentPayments.length > 0 && (
        <div className="m3-card p-5">
          <h3 className="font-bold text-sm mb-3">So‘nggi to‘lovlar</h3>
          <div className="space-y-2">
            {data.recentPayments.map((p) => (
              <div key={p.id} className="m3-tonal-card p-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold">{p.student.fullName}</div>
                  <div className="opacity-70">{p.receiptNumber} • {p.paymentMethod}</div>
                </div>
                <div className="text-right space-y-1">
                  <div className="font-bold text-emerald-600">{formatMoney(p.amount)}</div>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
