'use client';

import React, { useEffect, useState } from 'react';
import { Award, BookOpen, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest } from '@/lib/api';
import { formatMoney } from '@/lib/i18n';

interface Course {
  id: string;
  name: string;
  durationMonths: number;
  monthlyPrice: string;
  description?: string;
  hasCertificate: boolean;
  status: string;
  _count?: { groups: number; studentCourses: number };
}

interface Group {
  id: string;
  name: string;
  lessonDays: string[];
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  maxStudents: number;
  room?: string;
  status: string;
  course: Course;
  teacher: { id: string; user: { fullName: string } };
  _count?: { groupStudents: number };
}

interface GroupDetail extends Group {
  groupStudents: Array<{
    id: string;
    status: string;
    student: { id: string; fullName: string; phone: string; studentCourses: Array<{ courseId: string; resultScore?: string; resultGrade?: string }> };
  }>;
}

export default function GroupsPage() {
  const { t, user } = useApp();
  const [tab, setTab] = useState<'groups' | 'courses'>('groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Array<{ id: string; user: { fullName: string } }>>([]);
  const [allStudents, setAllStudents] = useState<Array<{ id: string; fullName: string; phone: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [resultModal, setResultModal] = useState<{ groupId: string; studentId: string; studentName: string } | null>(null);
  const [resultForm, setResultForm] = useState({ resultScore: '90', resultGrade: 'A', completed: true });

  const [courseForm, setCourseForm] = useState({
    name: '',
    durationMonths: '6',
    monthlyPrice: '500000',
    description: '',
    hasCertificate: true,
  });

  const [groupForm, setGroupForm] = useState({
    name: '',
    courseId: '',
    teacherId: '',
    lessonDays: ['MON', 'WED', 'FRI'],
    startTime: '09:00',
    endTime: '11:00',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
    maxStudents: '15',
    room: 'A-101',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [gRes, cRes] = await Promise.all([
        apiRequest<{ data: Group[] }>('/groups?limit=100'),
        apiRequest<{ data: Course[] }>('/courses?limit=100'),
      ]);
      setGroups(gRes.data);
      setCourses(cRes.data);
      if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') {
        const [tRes, sRes] = await Promise.all([
          apiRequest<{ data: Array<{ id: string; user: { fullName: string } }> }>('/users/teachers'),
          apiRequest<{ data: Array<{ id: string; fullName: string; phone: string }> }>('/students?limit=100'),
        ]);
        setTeachers(tRes.data);
        setAllStudents(sRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const openGroupDetail = async (groupId: string) => {
    const res = await apiRequest<{ data: GroupDetail }>(`/groups/${groupId}`);
    setSelectedGroup(res.data);
  };

  const handleEnroll = async () => {
    if (!selectedGroup || !enrollStudentId) return;
    try {
      await apiRequest(`/groups/${selectedGroup.id}/students`, {
        method: 'POST',
        body: JSON.stringify({ studentId: enrollStudentId }),
      });
      setEnrollStudentId('');
      await openGroupDetail(selectedGroup.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik');
    }
  };

  const handleRemove = async (studentId: string) => {
    if (!selectedGroup || !confirm('O‘quvchini guruhdan chiqarasizmi?')) return;
    await apiRequest(`/groups/${selectedGroup.id}/students/${studentId}`, { method: 'DELETE' });
    await openGroupDetail(selectedGroup.id);
    await load();
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/courses', {
        method: 'POST',
        body: JSON.stringify({
          name: courseForm.name,
          durationMonths: Number(courseForm.durationMonths),
          monthlyPrice: Number(courseForm.monthlyPrice),
          description: courseForm.description,
          hasCertificate: courseForm.hasCertificate,
        }),
      });
      setShowCourseModal(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik');
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/groups', {
        method: 'POST',
        body: JSON.stringify({
          ...groupForm,
          maxStudents: Number(groupForm.maxStudents),
        }),
      });
      setShowGroupModal(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik');
    }
  };

  const handleSaveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultModal) return;
    try {
      await apiRequest(`/groups/${resultModal.groupId}/students/${resultModal.studentId}/result`, {
        method: 'PATCH',
        body: JSON.stringify({
          resultScore: Number(resultForm.resultScore),
          resultGrade: resultForm.resultGrade,
          completed: resultForm.completed,
        }),
      });
      setResultModal(null);
      await openGroupDetail(resultModal.groupId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik');
    }
  };

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.groups.title}</h1>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCourseModal(true)}
              className="px-3.5 py-2 rounded-2xl m3-tonal-card text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t.groups.addCourse}
            </button>
            <button
              onClick={() => setShowGroupModal(true)}
              className="px-4 py-2 rounded-2xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              {t.groups.addGroup}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('groups')}
          className={`px-4 py-2 rounded-2xl text-xs font-semibold ${tab === 'groups' ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
        >
          {t.groups.groupsTab} ({groups.length})
        </button>
        <button
          onClick={() => setTab('courses')}
          className={`px-4 py-2 rounded-2xl text-xs font-semibold ${tab === 'courses' ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
        >
          {t.groups.coursesTab} ({courses.length})
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === 'groups' ? (
        groups.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map((g) => (
              <div
                key={g.id}
                onClick={() => openGroupDetail(g.id)}
                className="m3-card p-5 cursor-pointer hover:border-blue-500 transition space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-base">{g.name}</h3>
                    <p className="text-xs text-blue-600 font-semibold">{g.course.name}</p>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
                <div className="text-xs space-y-1 opacity-80">
                  <div>O‘qituvchi: <span className="font-semibold">{g.teacher.user.fullName}</span></div>
                  <div>Kunlar: {Array.isArray(g.lessonDays) ? g.lessonDays.join(', ') : ''} • {g.startTime}–{g.endTime}</div>
                  <div>O‘quvchilar: <span className="font-bold">{g._count?.groupStudents ?? 0} / {g.maxStudents}</span></div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map((c) => (
            <div key={c.id} className="m3-card p-5 space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  {c.name}
                </h3>
                <StatusBadge status={c.status} />
              </div>
              <p className="text-xs opacity-75">{c.description || '-'}</p>
              <div className="pt-2 border-t flex justify-between text-xs font-semibold" style={{ borderColor: 'var(--md-outline)' }}>
                <span>{c.durationMonths} oy</span>
                <span className="text-blue-600">{formatMoney(c.monthlyPrice)} / oy</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Group Detail Drawer/Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="m3-card w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  {selectedGroup.name} — {selectedGroup.course.name}
                </h2>
                <p className="text-xs opacity-70">{selectedGroup.teacher.user.fullName} • {selectedGroup.startTime}–{selectedGroup.endTime}</p>
              </div>
              <button onClick={() => setSelectedGroup(null)}><X className="w-5 h-5" /></button>
            </div>

            {canManage && (
              <div className="flex gap-2">
                <select
                  value={enrollStudentId}
                  onChange={(e) => setEnrollStudentId(e.target.value)}
                  className="m3-input text-xs flex-1"
                >
                  <option value="">O‘quvchi tanlang...</option>
                  {allStudents.map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName} ({s.phone})</option>
                  ))}
                </select>
                <button
                  onClick={handleEnroll}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <UserPlus className="w-4 h-4" />
                  {t.groups.enrollStudent}
                </button>
              </div>
            )}

            <div className="space-y-2">
              {selectedGroup.groupStudents.map((gs) => {
                const sc = gs.student.studentCourses.find((x) => x.courseId === selectedGroup.course.id);
                return (
                  <div key={gs.id} className="m3-tonal-card p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold">{gs.student.fullName}</div>
                      <div className="opacity-70">{gs.student.phone} • {sc?.resultScore ? `Natija: ${sc.resultScore}% (${sc.resultGrade})` : 'Natija kiritilmagan'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={gs.status} />
                      <button
                        onClick={() =>
                          setResultModal({
                            groupId: selectedGroup.id,
                            studentId: gs.student.id,
                            studentName: gs.student.fullName,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-teal-600/15 text-teal-600 font-semibold flex items-center gap-1"
                      >
                        <Award className="w-3.5 h-3.5" /> {t.groups.enterResult}
                      </button>
                      {canManage && gs.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRemove(gs.student.id)}
                          className="p-1.5 rounded-xl bg-red-500/15 text-red-500"
                          title={t.groups.removeStudent}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Teacher Result Modal */}
      {resultModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleSaveResult} className="m3-card w-full max-w-sm p-5 space-y-3">
            <h3 className="font-bold text-sm">{resultModal.studentName} — {t.groups.enterResult}</h3>
            <input
              type="number"
              min="0"
              max="100"
              value={resultForm.resultScore}
              onChange={(e) => setResultForm({ ...resultForm, resultScore: e.target.value })}
              className="m3-input text-sm"
              placeholder="Ball (0-100)"
            />
            <input
              value={resultForm.resultGrade}
              onChange={(e) => setResultForm({ ...resultForm, resultGrade: e.target.value })}
              className="m3-input text-sm"
              placeholder="Baho (masalan A+)"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={resultForm.completed}
                onChange={(e) => setResultForm({ ...resultForm, completed: e.target.checked })}
              />
              Kursni tamomladi (Sertifikat uchun tayyor)
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResultModal(null)} className="px-3 py-1.5 rounded-xl m3-tonal-card text-xs">
                {t.common.cancel}
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold">
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Course Modal */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateCourse} className="m3-card w-full max-w-md p-6 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{t.groups.addCourse}</h3>
              <button type="button" onClick={() => setShowCourseModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <input required placeholder="Kurs nomi" value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} className="m3-input text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input required type="number" placeholder="Davomiyligi (oy)" value={courseForm.durationMonths} onChange={(e) => setCourseForm({ ...courseForm, durationMonths: e.target.value })} className="m3-input text-sm" />
              <input required type="number" placeholder="Oylik narx (UZS)" value={courseForm.monthlyPrice} onChange={(e) => setCourseForm({ ...courseForm, monthlyPrice: e.target.value })} className="m3-input text-sm" />
            </div>
            <textarea placeholder="Kurs tavsifi" value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} className="m3-input text-sm" />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={courseForm.hasCertificate} onChange={(e) => setCourseForm({ ...courseForm, hasCertificate: e.target.checked })} />
              Sertifikat beriladi
            </label>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">{t.common.save}</button>
          </form>
        </div>
      )}

      {/* Create Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateGroup} className="m3-card w-full max-w-md p-6 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{t.groups.addGroup}</h3>
              <button type="button" onClick={() => setShowGroupModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <input required placeholder="Guruh nomi (masalan NodeJS-02)" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} className="m3-input text-sm" />
            <select required value={groupForm.courseId} onChange={(e) => setGroupForm({ ...groupForm, courseId: e.target.value })} className="m3-input text-sm">
              <option value="">Kurs tanlang</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select required value={groupForm.teacherId} onChange={(e) => setGroupForm({ ...groupForm, teacherId: e.target.value })} className="m3-input text-sm">
              <option value="">O‘qituvchi tanlang</option>
              {teachers.map((tc) => <option key={tc.id} value={tc.id}>{tc.user.fullName}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input type="time" value={groupForm.startTime} onChange={(e) => setGroupForm({ ...groupForm, startTime: e.target.value })} className="m3-input text-sm" />
              <input type="time" value={groupForm.endTime} onChange={(e) => setGroupForm({ ...groupForm, endTime: e.target.value })} className="m3-input text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={groupForm.startDate} onChange={(e) => setGroupForm({ ...groupForm, startDate: e.target.value })} className="m3-input text-sm" />
              <input type="date" value={groupForm.endDate} onChange={(e) => setGroupForm({ ...groupForm, endDate: e.target.value })} className="m3-input text-sm" />
            </div>
            <input type="number" placeholder="Maksimal o‘quvchilar" value={groupForm.maxStudents} onChange={(e) => setGroupForm({ ...groupForm, maxStudents: e.target.value })} className="m3-input text-sm" />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">{t.common.save}</button>
          </form>
        </div>
      )}
    </div>
  );
}
