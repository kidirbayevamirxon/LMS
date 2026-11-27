'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  GraduationCap,
  Layers,
  MapPin,
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
  paymentDueDay?: number;
  notifications?: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    isRead: boolean;
    createdAt: string;
  }>;
  student?: {
    fullName: string;
    phone: string;
    status: string;
    groupStudents: Array<{
      group: {
        name: string;
        lessonDays: string[];
        startTime: string;
        endTime: string;
        room?: string | null;
        course: { name: string };
        teacher?: { user: { fullName: string; phone: string } };
      };
    }>;
    paymentMonths: Array<{
      id: string;
      billingYear: number;
      billingMonth: number;
      expectedAmount: string;
      paidAmount: string;
      remainingDebt: string;
      dueDate: string;
      status: string;
      course?: { name: string };
    }>;
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
    const dueDay = data.paymentDueDay ?? 10;
    const unpaidMonths = st.paymentMonths.filter(
      (pm) => Number(pm.remainingDebt) > 0 && pm.status !== 'CANCELLED' && pm.status !== 'REFUNDED',
    );
    const totalDebt = unpaidMonths.reduce((sum, pm) => sum + Number(pm.remainingDebt), 0);
    const hasOverdue = unpaidMonths.some((pm) => pm.status === 'OVERDUE');
    const nextUnpaid = unpaidMonths[unpaidMonths.length - 1];
    const notifs = data.notifications ?? [];

    return (
      <div className="space-y-4">
        <div className="m3-card p-6 bg-gradient-to-r from-blue-700 to-teal-700 text-white border-none">
          <div className="text-xs uppercase tracking-wider opacity-80">O‘quvchi kabineti</div>
          <h1 className="text-2xl font-bold mt-1">{st.fullName}</h1>
          <p className="text-sm opacity-90">{st.phone}</p>
        </div>

        {/* Viznos / To'lov eslatmasi banneri */}
        <div
          className={`m3-card p-4 flex flex-wrap items-center justify-between gap-3 ${
            hasOverdue
              ? 'border-red-500/50 bg-red-500/10'
              : totalDebt > 0
                ? 'border-amber-500/50 bg-amber-500/10'
                : 'border-emerald-500/40 bg-emerald-500/10'
          }`}
        >
          <div className="flex items-start gap-3">
            <CalendarClock
              className={`w-6 h-6 shrink-0 mt-0.5 ${
                hasOverdue ? 'text-red-500' : totalDebt > 0 ? 'text-amber-500' : 'text-emerald-600'
              }`}
            />
            <div>
              <div className="font-bold text-sm">
                {hasOverdue
                  ? 'To‘lov muddati o‘tgan!'
                  : totalDebt > 0
                    ? 'Viznos (oylik to‘lov) kutilmoqda'
                    : 'Barcha oylik to‘lovlar to‘langan'}
              </div>
              <div className="text-xs opacity-80 mt-0.5">
                Oylik to‘lov muddati: har oyning <b>{dueDay}-sanasi</b>
                {nextUnpaid && (
                  <> • Eng yaqin muddat: <b>{nextUnpaid.dueDate.slice(0, 10)}</b></>
                )}
              </div>
            </div>
          </div>
          {totalDebt > 0 && (
            <div className="text-right">
              <div className="text-[11px] opacity-75">Jami to‘lanishi kerak</div>
              <div className={`text-base font-bold ${hasOverdue ? 'text-red-500' : 'text-amber-600'}`}>
                {formatMoney(totalDebt)}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="m3-card p-5 space-y-3">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Mening guruhlarim va dars vaqti
            </h2>
            {st.groupStudents.length === 0 ? (
              <p className="text-xs opacity-70">Hozircha faol guruhga biriktirilmagansiz</p>
            ) : (
              st.groupStudents.map((gs, i) => (
                <div key={i} className="m3-tonal-card p-3.5 space-y-2 text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-bold">{gs.group.name}</div>
                      <div className="text-xs opacity-75">{gs.group.course.name}</div>
                      {gs.group.teacher && (
                        <div className="text-[11px] opacity-70 mt-0.5">
                          Ustoz: {gs.group.teacher.user.fullName}
                        </div>
                      )}
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0">
                      {gs.group.startTime}–{gs.group.endTime}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {(Array.isArray(gs.group.lessonDays) ? gs.group.lessonDays : []).map((d) => (
                      <span key={d} className="px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-600 text-[10px] font-bold">
                        {d}
                      </span>
                    ))}
                    {gs.group.room && (
                      <span className="inline-flex items-center gap-1 text-[11px] opacity-75 ml-auto">
                        <MapPin className="w-3 h-3" /> Xona: {gs.group.room}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="m3-card p-5 space-y-3">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Viznos / Oylik to‘lov jadvali
            </h2>
            {st.paymentMonths.length === 0 ? (
              <p className="text-xs opacity-70">To‘lov jadvali mavjud emas</p>
            ) : (
              st.paymentMonths.map((pm) => (
                <div key={pm.id} className="m3-tonal-card p-3 flex justify-between items-center text-xs">
                  <div>
                    <div className="font-bold">
                      {pm.billingYear}-{String(pm.billingMonth).padStart(2, '0')}
                      {pm.course?.name ? ` • ${pm.course.name}` : ''}
                    </div>
                    <div className="opacity-70">
                      Muddat: {pm.dueDate.slice(0, 10)} • Reja: {formatMoney(pm.expectedAmount)}
                    </div>
                    <div className="opacity-70">To‘langan: {formatMoney(pm.paidAmount)}</div>
                  </div>
                  <div className="text-right space-y-1">
                    <StatusBadge status={pm.status} />
                    {Number(pm.remainingDebt) > 0 && (
                      <div className="text-red-500 font-semibold">Qarz: {formatMoney(pm.remainingDebt)}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bildirishnomalar */}
        {notifs.length > 0 && (
          <div className="m3-card p-5 space-y-2.5">
            <h2 className="font-bold text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              Bildirishnomalar ({notifs.length})
            </h2>
            {notifs.map((n) => (
              <div key={n.id} className="m3-tonal-card p-3 flex flex-wrap justify-between items-start gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{n.title}</div>
                  <p className="opacity-80 mt-0.5">{n.body}</p>
                  <div className="text-[10px] opacity-55 mt-1">{n.createdAt.slice(0, 16).replace('T', ' ')}</div>
                </div>
                <StatusBadge status={n.type} />
              </div>
            ))}
          </div>
        )}
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
