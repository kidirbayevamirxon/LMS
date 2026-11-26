'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRightLeft, Camera, CheckCircle2, ScanFace, Trash2, UserMinus, X } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest } from '@/lib/api';
import {
  enrollFacesNative,
  extractWebCanvasFaceDescriptor,
  isNativeAndroid,
} from '@/lib/face-plugin';
import { formatMoney } from '@/lib/i18n';

interface StudentDetail {
  id: string;
  fullName: string;
  phone: string;
  birthDate?: string | null;
  gender: string;
  address?: string | null;
  parentPhone?: string | null;
  enrolledAt: string;
  monthlyFee: number;
  status: string;
  groupStudents: Array<{ id: string; status: string; joinedAt: string; group: { id: string; name: string; course: { name: string } } }>;
  paymentMonths: Array<{ id: string; billingYear: number; billingMonth: number; expectedAmount: string; paidAmount: string; remainingDebt: string; status: string; course: { name: string } }>;
  payments: Array<{ id: string; receiptNumber: string; amount: string; paymentMethod: string; paymentDate: string; status: string }>;
  attendances: Array<{ id: string; attendanceDate: string; checkInTime?: string; status: string; method: string; recognitionConfidence?: string; group: { name: string } }>;
  certificates: Array<{ id: string; certificateNumber: string; courseName: string; issuedDate: string; status: string }>;
  debtsSummary: { totalDebt: number; unpaidMonthsCount: number };
  faceIdStatus: { registered: boolean; angleCount?: number; modelVersion?: string; livenessVerified?: boolean; updatedAt?: string };
}

function StudentProfileContent() {
  const params = useSearchParams();
  const studentId = params.get('id') || '';
  const { t, user } = useApp();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'info' | 'payments' | 'attendance' | 'certs' | 'face'>('info');

  // Web Face ID modal state
  const [webCamOpen, setWebCamOpen] = useState(false);
  const [capturedAngles, setCapturedAngles] = useState<number[][]>([]);
  const [faceStatusMsg, setFaceStatusMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [allGroups, setAllGroups] = useState<Array<{ id: string; name: string; course: { name: string } }>>([]);
  const [transferGroupFrom, setTransferGroupFrom] = useState<{ id: string; name: string } | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const load = async () => {
    if (!studentId) {
      setError('O‘quvchi ID ko‘rsatilmagan');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [res, gRes] = await Promise.all([
        apiRequest<{ data: StudentDetail }>(`/students/${studentId}`),
        apiRequest<{ data: Array<{ id: string; name: string; course: { name: string } }> }>('/groups?limit=100'),
      ]);
      setStudent(res.data);
      setAllGroups(gRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && studentId) load();
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [user, studentId]);

  const handleRegisterFace = async () => {
    if (!student) return;
    if (isNativeAndroid()) {
      try {
        setFaceStatusMsg('Kamera va ML Kit tayyorlanmoqda...');
        const nativeRes = await enrollFacesNative(student.fullName, 3);
        await apiRequest('/face/register', {
          method: 'POST',
          body: JSON.stringify({
            studentId: student.id,
            embeddings: nativeRes.embeddings,
            modelVersion: nativeRes.modelVersion || 'mobilefacenet-v1',
            livenessVerified: nativeRes.livenessVerified,
          }),
        });
        setFaceStatusMsg('Face ID muvaffaqiyatli saqlandi!');
        await load();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Face ID ro‘yxatga olishda xatolik');
      }
      return;
    }

    // Browser camera mode
    setCapturedAngles([]);
    setFaceStatusMsg('Old, chap va o‘ng burchaklardan 3 ta kadr oling');
    setWebCamOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 100);
    } catch {
      alert('Kameraga ruxsat berilmadi');
      setWebCamOpen(false);
    }
  };

  const captureWebAngle = () => {
    if (!videoRef.current) return;
    const { embedding, livenessPassed } = extractWebCanvasFaceDescriptor(videoRef.current);
    if (!livenessPassed) {
      setFaceStatusMsg('Yuz aniq ko‘rinmadi, yorug‘likni tekshiring');
      return;
    }
    const next = [...capturedAngles, embedding];
    setCapturedAngles(next);
    setFaceStatusMsg(`${next.length} / 3 burchak olindi`);
  };

  const submitWebFace = async () => {
    if (!student || capturedAngles.length === 0) return;
    try {
      await apiRequest('/face/register', {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id,
          embeddings: capturedAngles,
          modelVersion: 'web-canvas-192d',
          livenessVerified: true,
        }),
      });
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      setWebCamOpen(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Saqlashda xatolik');
    }
  };

  const handleDeleteFace = async () => {
    if (!student || !confirm('Face ID ma’lumotlarini o‘chirmoqchimisiz?')) return;
    await apiRequest(`/face/${student.id}`, { method: 'DELETE' });
    await load();
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!student) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/students" className="p-2 rounded-xl m3-tonal-card">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{student.fullName}</h1>
          <p className="text-xs opacity-70">{student.phone} • Oylik: {formatMoney(student.monthlyFee)}</p>
        </div>
        <StatusBadge status={student.status} />
      </div>

      {/* Debt summary banner */}
      <div className="m3-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs opacity-70">Jami qarzdorlik</div>
          <div className={`text-lg font-bold ${student.debtsSummary.totalDebt > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {formatMoney(student.debtsSummary.totalDebt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${student.faceIdStatus.registered ? 'bg-teal-500/15 text-teal-600' : 'bg-slate-500/15'}`}>
            Face ID: {student.faceIdStatus.registered ? t.students.faceRegistered : t.students.faceNotRegistered}
          </span>
        </div>
      </div>

      {/* Profile Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          ['info', t.students.personalInfo],
          ['payments', t.students.paymentHistory],
          ['attendance', t.students.attendanceHistory],
          ['certs', t.students.certificates],
          ['face', t.students.faceId],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap ${
              tab === key ? 'bg-blue-600 text-white' : 'm3-tonal-card'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="m3-card p-5 space-y-2 text-sm">
            <h3 className="font-bold mb-2">{t.students.personalInfo}</h3>
            <div className="flex justify-between"><span className="opacity-70">Telefon:</span><span>{student.phone}</span></div>
            <div className="flex justify-between"><span className="opacity-70">Ota-ona:</span><span>{student.parentPhone || '-'}</span></div>
            <div className="flex justify-between"><span className="opacity-70">Jinsi:</span><span>{student.gender}</span></div>
            <div className="flex justify-between"><span className="opacity-70">Manzil:</span><span>{student.address || '-'}</span></div>
            <div className="flex justify-between"><span className="opacity-70">Ro‘yxatdan o‘tgan:</span><span>{student.enrolledAt.slice(0, 10)}</span></div>
          </div>
          <div className="m3-card p-5 space-y-2">
            <h3 className="font-bold text-sm mb-2">{t.students.groupHistory}</h3>
            {student.groupStudents.map((gs) => (
              <div key={gs.id} className="m3-tonal-card p-3 flex flex-wrap justify-between items-center gap-2 text-xs">
                <div>
                  <div className="font-bold">{gs.group.name}</div>
                  <div className="opacity-70">{gs.group.course.name}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={gs.status} />
                  {canManage && gs.status === 'ACTIVE' && (
                    <>
                      <button
                        onClick={() => {
                          setTransferGroupFrom({ id: gs.group.id, name: gs.group.name });
                          setTransferTargetId('');
                        }}
                        className="px-2 py-1 rounded-xl bg-blue-600/15 text-blue-600 font-semibold flex items-center gap-1"
                        title="Boshqa guruhga o‘tkazish"
                      >
                        <ArrowRightLeft className="w-3 h-3" /> O‘tkazish
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`${student.fullName} ni ${gs.group.name} guruhidan chiqarasizmi?`)) return;
                          await apiRequest(`/groups/${gs.group.id}/students/${student.id}`, { method: 'DELETE' });
                          await load();
                        }}
                        className="px-2 py-1 rounded-xl bg-red-500/15 text-red-500 font-semibold flex items-center gap-1"
                        title="Guruhdan chiqarish"
                      >
                        <UserMinus className="w-3 h-3" /> Chiqarish
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="m3-card p-5 space-y-3">
          <h3 className="font-bold text-sm">Oylik to‘lov jadvali</h3>
          {student.paymentMonths.map((pm) => (
            <div key={pm.id} className="m3-tonal-card p-3 flex justify-between items-center text-xs">
              <div>
                <div className="font-bold">{pm.billingYear}-{String(pm.billingMonth).padStart(2, '0')} • {pm.course.name}</div>
                <div className="opacity-70">
                  Reja: {formatMoney(pm.expectedAmount)} | To‘langan: {formatMoney(pm.paidAmount)}
                </div>
              </div>
              <div className="text-right space-y-1">
                <StatusBadge status={pm.status} />
                {Number(pm.remainingDebt) > 0 && (
                  <div className="text-red-500 font-bold">Qarz: {formatMoney(pm.remainingDebt)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="m3-card p-5 space-y-2">
          {student.attendances.length === 0 ? (
            <EmptyState />
          ) : (
            student.attendances.map((att) => (
              <div key={att.id} className="m3-tonal-card p-3 flex justify-between items-center text-xs">
                <div>
                  <div className="font-bold">{att.attendanceDate.slice(0, 10)} • {att.group.name}</div>
                  <div className="opacity-70">{att.method} {att.recognitionConfidence ? `(${Math.round(Number(att.recognitionConfidence) * 100)}%)` : ''}</div>
                </div>
                <StatusBadge status={att.status} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'certs' && (
        <div className="m3-card p-5 space-y-2">
          {student.certificates.length === 0 ? (
            <EmptyState />
          ) : (
            student.certificates.map((c) => (
              <div key={c.id} className="m3-tonal-card p-3 flex justify-between items-center text-xs">
                <div>
                  <div className="font-bold">{c.courseName}</div>
                  <div className="opacity-70">{c.certificateNumber} • {c.issuedDate.slice(0, 10)}</div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'face' && (
        <div className="m3-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/15 text-teal-600 flex items-center justify-center">
              <ScanFace className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-bold">{t.students.faceId}</h3>
              <p className="text-xs opacity-75">
                {student.faceIdStatus.registered
                  ? `Faol (${student.faceIdStatus.angleCount} burchak, ${student.faceIdStatus.modelVersion})`
                  : t.students.faceNotRegistered}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleRegisterFace}
              className="px-5 py-2.5 rounded-2xl bg-blue-600 text-white text-sm font-semibold flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              {t.students.registerFaceId}
            </button>
            {student.faceIdStatus.registered && (
              <button
                onClick={handleDeleteFace}
                className="px-4 py-2.5 rounded-2xl bg-red-500/15 text-red-600 text-sm font-semibold flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {t.students.deleteFaceId}
              </button>
            )}
          </div>
          {faceStatusMsg && (
            <div className="text-xs font-semibold text-teal-600 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> {faceStatusMsg}
            </div>
          )}
        </div>
      )}

      {/* Transfer Group Modal */}
      {transferGroupFrom && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!transferTargetId) return;
              try {
                await apiRequest(`/groups/${transferGroupFrom.id}/students/${student.id}/transfer`, {
                  method: 'POST',
                  body: JSON.stringify({ targetGroupId: transferTargetId }),
                });
                setTransferGroupFrom(null);
                await load();
              } catch (err) {
                alert(err instanceof Error ? err.message : 'O‘tkazishda xatolik');
              }
            }}
            className="m3-card w-full max-w-sm p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Boshqa guruhga o‘tkazish</h3>
              <button type="button" onClick={() => setTransferGroupFrom(null)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs opacity-75">
              Joriy guruh: <b>{transferGroupFrom.name}</b>
            </p>
            <select
              required
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(e.target.value)}
              className="m3-input text-sm"
            >
              <option value="">Yangi guruhni tanlang...</option>
              {allGroups
                .filter((g) => g.id !== transferGroupFrom.id)
                .map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.course.name})</option>
                ))}
            </select>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold">
              O‘tkazish
            </button>
          </form>
        </div>
      )}

      {/* Web Camera Registration Modal */}
      {webCamOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="m3-card w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{t.students.registerFaceId}</h3>
              <button
                onClick={() => {
                  streamRef.current?.getTracks().forEach((tr) => tr.stop());
                  setWebCamOpen(false);
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-2xl bg-black aspect-video object-cover" />
            <p className="text-xs text-center font-medium">{faceStatusMsg}</p>
            <div className="flex gap-2">
              <button
                onClick={captureWebAngle}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-xs font-semibold"
              >
                Kadr olish ({capturedAngles.length}/3)
              </button>
              <button
                disabled={capturedAngles.length === 0}
                onClick={submitWebFace}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-40"
              >
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentProfilePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <StudentProfileContent />
    </Suspense>
  );
}
