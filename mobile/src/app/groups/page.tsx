'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Award, BookOpen, MapPin, Plus, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
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
    student: {
      id: string;
      fullName: string;
      phone: string;
      studentCourses: Array<{ courseId: string; resultScore?: string; resultGrade?: string }>;
    };
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

  const [transferModal, setTransferModal] = useState<{
    sourceGroupId: string;
    sourceGroupName: string;
    studentId: string;
    studentName: string;
  } | null>(null);
  const [targetGroupId, setTargetGroupId] = useState('');
  const [transferReason, setTransferReason] = useState('');

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
    studentIds: [] as string[],
  });
  const [groupStudentPick, setGroupStudentPick] = useState('');

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

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
      if (canManage) {
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

  const handleDeleteGroup = async (group: Group, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`"${group.name}" guruhini butunlay o‘chirmoqchimisiz?`)) return;
    try {
      await apiRequest(`/groups/${group.id}`, { method: 'DELETE' });
      if (selectedGroup?.id === group.id) setSelectedGroup(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Guruhni o‘chirishda xatolik');
    }
  };

  const handleDeleteCourse = async (course: Course) => {
    if (!confirm(`"${course.name}" kursini o‘chirmoqchimisiz?`)) return;
    try {
      await apiRequest(`/courses/${course.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kursni o‘chirishda xatolik';
      if (msg.includes('guruh mavjud')) {
        if (confirm(`${msg}\n\nKursni unga tegishli barcha guruhlar bilan birga o‘chirishni tasdiqlaysizmi?`)) {
          await apiRequest(`/courses/${course.id}?force=true`, { method: 'DELETE' });
          await load();
        }
      } else {
        alert(msg);
      }
    }
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

  const handleRemove = async (studentId: string, studentName: string) => {
    if (!selectedGroup || !confirm(`${studentName} ni guruhdan chiqarasizmi?`)) return;
    await apiRequest(`/groups/${selectedGroup.id}/students/${studentId}`, { method: 'DELETE' });
    await openGroupDetail(selectedGroup.id);
    await load();
  };

  const handleTransferStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModal || !targetGroupId) return;
    try {
      await apiRequest(`/groups/${transferModal.sourceGroupId}/students/${transferModal.studentId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          targetGroupId,
          reason: transferReason || undefined,
        }),
      });
      const sourceId = transferModal.sourceGroupId;
      setTransferModal(null);
      setTargetGroupId('');
      setTransferReason('');
      await openGroupDetail(sourceId);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'O‘tkazishda xatolik');
    }
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
      setGroupForm({
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
        studentIds: [],
      });
      setGroupStudentPick('');
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">{t.groups.title}</h1>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCourseModal(true)}
              className="px-3.5 py-2 rounded-2xl m3-tonal-card text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t.groups.addCourse}
            </button>
            <button
              onClick={() => {
                setShowGroupModal(true);
                load();
              }}
              className="px-4 py-2 rounded-2xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              {t.groups.addGroup}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setTab('groups')}
          className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap ${tab === 'groups' ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
        >
          {t.groups.groupsTab} ({groups.length})
        </button>
        <button
          onClick={() => setTab('courses')}
          className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap ${tab === 'courses' ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {groups.map((g) => {
              const enrolled = g._count?.groupStudents ?? 0;
              const pct = Math.min(100, Math.round((enrolled / Math.max(1, g.maxStudents)) * 100));
              return (
                <div
                  key={g.id}
                  onClick={() => openGroupDetail(g.id)}
                  className="m3-card p-5 cursor-pointer hover:border-blue-500 transition flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base truncate">{g.name}</h3>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold truncate">{g.course.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={g.status} />
                      {canManage && (
                        <button
                          onClick={(e) => handleDeleteGroup(g, e)}
                          className="p-1.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20"
                          title="Guruhni o‘chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs space-y-1.5 opacity-85">
                    <div>O‘qituvchi: <span className="font-semibold">{g.teacher.user.fullName}</span></div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(Array.isArray(g.lessonDays) ? g.lessonDays : []).map((day) => (
                        <span key={day} className="px-2 py-0.5 rounded-lg m3-tonal-card text-[10px] font-bold">
                          {day}
                        </span>
                      ))}
                      <span className="font-semibold">{g.startTime}–{g.endTime}</span>
                      {g.room && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] opacity-75">
                          <MapPin className="w-3 h-3" /> {g.room}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className="opacity-75">O‘quvchilar</span>
                      <span>{enrolled} / {g.maxStudents}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--md-surface-variant)' }}>
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {courses.map((c) => (
            <div key={c.id} className="m3-card p-5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-base flex items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusBadge status={c.status} />
                  {canManage && (
                    <button
                      onClick={() => handleDeleteCourse(c)}
                      className="p-1.5 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      title="Kursni o‘chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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

      {/* Group Detail Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-3 sm:p-4">
          <div className="m3-card w-full max-w-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="truncate">{selectedGroup.name} — {selectedGroup.course.name}</span>
                </h2>
                <p className="text-xs opacity-70 mt-0.5">
                  {selectedGroup.teacher.user.fullName} • {selectedGroup.startTime}–{selectedGroup.endTime}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canManage && (
                  <button
                    onClick={() => handleDeleteGroup(selectedGroup)}
                    className="px-3 py-1.5 rounded-xl bg-red-500/15 text-red-500 text-xs font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Guruhni o‘chirish
                  </button>
                )}
                <button onClick={() => setSelectedGroup(null)} className="p-1.5 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {canManage && (
              <div className="flex flex-col sm:flex-row gap-2">
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
                  className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  {t.groups.enrollStudent}
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              {selectedGroup.groupStudents.map((gs) => {
                const sc = gs.student.studentCourses.find((x) => x.courseId === selectedGroup.course.id);
                return (
                  <div key={gs.id} className="m3-tonal-card p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{gs.student.fullName}</div>
                      <div className="opacity-70">
                        {gs.student.phone} • {sc?.resultScore ? `Natija: ${sc.resultScore}% (${sc.resultGrade})` : 'Natija kiritilmagan'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
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
                        <Award className="w-3.5 h-3.5" /> Natija
                      </button>
                      {canManage && gs.status === 'ACTIVE' && (
                        <>
                          <button
                            onClick={() => {
                              setTransferModal({
                                sourceGroupId: selectedGroup.id,
                                sourceGroupName: selectedGroup.name,
                                studentId: gs.student.id,
                                studentName: gs.student.fullName,
                              });
                              setTargetGroupId('');
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-blue-600/15 text-blue-600 font-semibold flex items-center gap-1"
                            title="Boshqa guruhga o‘tkazish"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" /> O‘tkazish
                          </button>
                          <button
                            onClick={() => handleRemove(gs.student.id, gs.student.fullName)}
                            className="px-2.5 py-1.5 rounded-xl bg-red-500/15 text-red-500 font-semibold flex items-center gap-1"
                            title={t.groups.removeStudent}
                          >
                            <UserMinus className="w-3.5 h-3.5" /> Chiqarish
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Transfer Student Modal */}
      {transferModal && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <form onSubmit={handleTransferStudent} className="m3-card w-full max-w-md p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                Guruhni almashtirish
              </h3>
              <button type="button" onClick={() => setTransferModal(null)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs opacity-80">
              <b>{transferModal.studentName}</b> ni <b>{transferModal.sourceGroupName}</b> guruhidan qaysi guruhga o‘tkazasiz?
            </p>
            <select
              required
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value)}
              className="m3-input text-sm"
            >
              <option value="">Yangi guruhni tanlang...</option>
              {groups
                .filter((g) => g.id !== transferModal.sourceGroupId)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.course.name}) — {g._count?.groupStudents ?? 0}/{g.maxStudents}
                  </option>
                ))}
            </select>
            <input
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="Sabab (ixtiyoriy)"
              className="m3-input text-sm"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setTransferModal(null)} className="px-4 py-2 rounded-xl m3-tonal-card text-xs font-semibold">
                {t.common.cancel}
              </button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold">
                O‘tkazish
              </button>
            </div>
          </form>
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
          <form onSubmit={handleCreateGroup} className="m3-card w-full max-w-md p-6 space-y-3 max-h-[90vh] overflow-y-auto">
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
            <div className="space-y-2">
              <label className="text-xs font-semibold opacity-75">O‘quvchilar qo‘shish (ixtiyoriy)</label>
              <div className="flex gap-2">
                <select
                  value={groupStudentPick}
                  onChange={(e) => {
                    const sid = e.target.value;
                    setGroupStudentPick('');
                    if (sid && !groupForm.studentIds.includes(sid)) {
                      setGroupForm({ ...groupForm, studentIds: [...groupForm.studentIds, sid] });
                    }
                  }}
                  className="m3-input text-sm flex-1"
                >
                  <option value="">
                    {allStudents.length === 0 ? 'O‘quvchilar topilmadi' : 'O‘quvchi tanlang...'}
                  </option>
                  {allStudents
                    .filter((s) => !groupForm.studentIds.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName} ({s.phone})</option>
                    ))}
                </select>
              </div>
              {groupForm.studentIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {groupForm.studentIds.map((sid) => {
                    const st = allStudents.find((s) => s.id === sid);
                    return (
                      <span
                        key={sid}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-600 text-xs font-semibold"
                      >
                        {st?.fullName ?? sid}
                        <button
                          type="button"
                          onClick={() =>
                            setGroupForm({
                              ...groupForm,
                              studentIds: groupForm.studentIds.filter((id) => id !== sid),
                            })
                          }
                          className="hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">{t.common.save}</button>
          </form>
        </div>
      )}
    </div>
  );
}
