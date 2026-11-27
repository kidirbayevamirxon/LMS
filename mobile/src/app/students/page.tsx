'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  FileSpreadsheet,
  Plus,
  ScanFace,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest, buildAuthorizedUrl } from '@/lib/api';
import { formatMoney } from '@/lib/i18n';

interface StudentRow {
  id: string;
  fullName: string;
  phone: string;
  parentPhone?: string;
  status: string;
  monthlyFee: number;
  totalDebt: number;
  unpaidMonthsCount: number;
  hasFaceId: boolean;
  groupStudents: Array<{ group: { id: string; name: string; course: { name: string } } }>;
}

interface GroupOption {
  id: string;
  name: string;
  course: { name: string; monthlyPrice: string };
}

export default function StudentsPage() {
  const { t, user } = useApp();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState('');
  const [debtorsOnly, setDebtorsOnly] = useState(false);
  const [sort, setSort] = useState('created_desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '+998',
    parentPhone: '+998',
    gender: 'MALE',
    address: '',
    birthDate: '',
    monthlyFee: '500000',
    groupId: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '15',
        sort,
      });
      if (search.trim()) qs.set('search', search.trim());
      if (groupId) qs.set('groupId', groupId);
      if (status) qs.set('status', status);
      if (debtorsOnly) qs.set('debtorsOnly', 'true');

      const [stRes, grRes] = await Promise.all([
        apiRequest<{ data: StudentRow[]; meta: { totalPages: number } }>(`/students?${qs.toString()}`),
        apiRequest<{ data: GroupOption[] }>('/groups?limit=100'),
      ]);
      setStudents(stRes.data);
      setTotalPages(stRes.meta.totalPages);
      setGroups(grRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user, page, groupId, status, debtorsOnly, sort]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/students', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          parentPhone: form.parentPhone || null,
          gender: form.gender,
          address: form.address || null,
          birthDate: form.birthDate || null,
          monthlyFee: Number(form.monthlyFee || 0),
          groupIds: form.groupId ? [form.groupId] : [],
        }),
      });
      setShowCreate(false);
      setForm({
        fullName: '',
        phone: '+998',
        parentPhone: '+998',
        gender: 'MALE',
        address: '',
        birthDate: '',
        monthlyFee: '500000',
        groupId: '',
      });
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : t.common.error);
    } finally {
      setSaving(false);
    }
  };

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.students.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={buildAuthorizedUrl('/students/export/excel')}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-2xl text-xs font-semibold m3-tonal-card flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            {t.students.exportExcel}
          </a>
          <a
            href={buildAuthorizedUrl('/students/export/pdf')}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-2xl text-xs font-semibold m3-tonal-card flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-red-500" />
            {t.students.exportPdf}
          </a>
          {canManage && (
            <button
              onClick={() => {
                setShowCreate(true);
                apiRequest<{ data: GroupOption[] }>('/groups?limit=100')
                  .then((res) => setGroups(res.data))
                  .catch(() => {});
              }}
              className="px-4 py-2 rounded-2xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              {t.students.addStudent}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="m3-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 absolute left-3.5 top-3 opacity-50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                loadData();
              }
            }}
            placeholder={t.students.searchPlaceholder}
            className="m3-input pl-10 text-sm"
          />
        </div>
        <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setPage(1); }} className="m3-input text-sm">
          <option value="">{t.students.allGroups}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="m3-input text-sm">
          <option value="">{t.students.allStatuses}</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
          <option value="GRADUATED">GRADUATED</option>
        </select>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={debtorsOnly}
              onChange={(e) => { setDebtorsOnly(e.target.checked); setPage(1); }}
              className="rounded"
            />
            {t.students.debtorsOnly}
          </label>
          <button
            onClick={() => setSort(sort === 'name_asc' ? 'created_desc' : 'name_asc')}
            className="px-2.5 py-1.5 rounded-xl m3-tonal-card text-[11px] font-semibold"
          >
            {sort === 'name_asc' ? 'A–Z' : 'Yangi'}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : students.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {students.map((st) => (
            <Link
              key={st.id}
              href={`/students/profile?id=${st.id}`}
              className="m3-card p-4 hover:border-blue-500 transition flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-base">{st.fullName}</h3>
                  <p className="text-xs opacity-70">{st.phone}</p>
                </div>
                <StatusBadge status={st.status} />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {st.groupStudents.map((gs) => (
                  <span key={gs.group.id} className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-300">
                    {gs.group.name}
                  </span>
                ))}
                {st.hasFaceId && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-500/15 text-teal-600 flex items-center gap-1">
                    <ScanFace className="w-3 h-3" /> Face ID
                  </span>
                )}
              </div>

              <div className="pt-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--md-outline)' }}>
                <span className="opacity-75">Oylik: {formatMoney(st.monthlyFee)}</span>
                {st.totalDebt > 0 ? (
                  <span className="font-bold text-red-500">
                    Qarz: {formatMoney(st.totalDebt)} ({st.unpaidMonthsCount} oy)
                  </span>
                ) : (
                  <span className="font-semibold text-emerald-600">Qarzdorlik yo‘q</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 rounded-xl m3-tonal-card text-xs font-semibold disabled:opacity-40"
          >
            Oldingi
          </button>
          <span className="text-xs font-semibold">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 rounded-xl m3-tonal-card text-xs font-semibold disabled:opacity-40"
          >
            Keyingi
          </button>
        </div>
      )}

      {/* Create Student Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="m3-card w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                {t.students.addStudent}
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                required
                placeholder="F.I.SH"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="m3-input text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Telefon (+998...)"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="m3-input text-sm"
                />
                <input
                  placeholder="Ota-ona telefoni"
                  value={form.parentPhone}
                  onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
                  className="m3-input text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  className="m3-input text-sm"
                >
                  <option value="MALE">Erkak</option>
                  <option value="FEMALE">Ayol</option>
                </select>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  className="m3-input text-sm"
                />
              </div>
              <input
                placeholder="Manzil"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="m3-input text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.groupId}
                  onChange={(e) => {
                    const g = groups.find((x) => x.id === e.target.value);
                    setForm({
                      ...form,
                      groupId: e.target.value,
                      monthlyFee: g ? String(Number(g.course.monthlyPrice)) : form.monthlyFee,
                    });
                  }}
                  className="m3-input text-sm"
                >
                  <option value="">
                    {groups.length === 0 ? 'Guruhlar topilmadi' : 'Guruh tanlang (ixtiyoriy)'}
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}{g.course?.name ? ` — ${g.course.name}` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Oylik to‘lov (so‘m)"
                  value={form.monthlyFee}
                  onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
                  className="m3-input text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl m3-tonal-card text-sm">
                  {t.common.cancel}
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold">
                  {saving ? t.common.loading : t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
