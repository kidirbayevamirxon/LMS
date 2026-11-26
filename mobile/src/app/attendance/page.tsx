'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, ScanFace } from 'lucide-react';
import { EmptyState, LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest } from '@/lib/api';
import {
  extractWebCanvasFaceDescriptor,
  isNativeAndroid,
  scanFacesNative,
} from '@/lib/face-plugin';

interface GroupOption {
  id: string;
  name: string;
  course: { name: string };
}

interface AttendanceRecord {
  id: string;
  attendanceDate: string;
  checkInTime?: string;
  status: string;
  method: string;
  recognitionConfidence?: string;
  student: { id: string; fullName: string; phone: string };
  group: { id: string; name: string };
}

export default function AttendancePage() {
  const { t, user } = useApp();
  const [mode, setMode] = useState<'face' | 'manual' | 'history'>('face');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [groupStudents, setGroupStudents] = useState<Array<{ student: { id: string; fullName: string; phone: string } }>>([]);
  const [manualStatuses, setManualStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [scanResultMsg, setScanResultMsg] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [gRes, aRes] = await Promise.all([
        apiRequest<{ data: GroupOption[] }>('/groups?limit=100'),
        apiRequest<{ data: AttendanceRecord[] }>('/attendance?limit=40'),
      ]);
      setGroups(gRes.data);
      setHistory(aRes.data);
      if (gRes.data.length > 0 && !selectedGroupId) {
        setSelectedGroupId(gRes.data[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [user]);

  useEffect(() => {
    if (!selectedGroupId || !user) return;
    apiRequest<{ data: { groupStudents: Array<{ status: string; student: { id: string; fullName: string; phone: string } }> } }>(
      `/groups/${selectedGroupId}`,
    )
      .then((res) => {
        const active = res.data.groupStudents.filter((gs) => gs.status === 'ACTIVE');
        setGroupStudents(active);
        const init: Record<string, string> = {};
        active.forEach((gs) => {
          init[gs.student.id] = 'PRESENT';
        });
        setManualStatuses(init);
      })
      .catch(() => {});
  }, [selectedGroupId, user]);

  const handleFaceScan = async () => {
    if (isNativeAndroid()) {
      try {
        setScanResultMsg('ML Kit + TFLite kamera ochilmoqda...');
        const nativeRes = await scanFacesNative();
        if (!nativeRes.faces || nativeRes.faces.length === 0) {
          setScanResultMsg('Yuz aniqlanmadi');
          return;
        }
        const recRes = await apiRequest<{
          data: {
            matches: Array<{
              matched: boolean;
              confidence: number;
              student?: { fullName: string };
              group?: { name: string };
              attendanceAction?: string;
            }>;
          };
        }>('/face/recognize', {
          method: 'POST',
          body: JSON.stringify({
            embeddings: nativeRes.faces.map((f) => f.embedding),
            groupId: selectedGroupId || undefined,
            livenessPassed: nativeRes.faces.every((f) => f.livenessPassed),
          }),
        });
        const summary = recRes.data.matches
          .map((m) =>
            m.matched
              ? `${m.student?.fullName} (${m.group?.name}) — ${Math.round(m.confidence * 100)}% [${m.attendanceAction}]`
              : `Tanilmadi (${Math.round(m.confidence * 100)}%)`,
          )
          .join(' | ');
        setScanResultMsg(summary);
        await load();
      } catch (err) {
        setScanResultMsg(err instanceof Error ? err.message : 'Face scan xatosi');
      }
      return;
    }

    // Browser camera mode
    if (!cameraActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        streamRef.current = stream;
        setCameraActive(true);
        setTimeout(() => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        }, 100);
      } catch {
        alert('Brauzer kamerasiga ruxsat berilmadi');
      }
      return;
    }

    if (videoRef.current) {
      try {
        const { embedding, livenessPassed } = extractWebCanvasFaceDescriptor(videoRef.current);
        const recRes = await apiRequest<{
          data: {
            matches: Array<{
              matched: boolean;
              confidence: number;
              student?: { fullName: string };
              group?: { name: string };
              attendanceAction?: string;
            }>;
          };
        }>('/face/recognize', {
          method: 'POST',
          body: JSON.stringify({
            embeddings: [embedding],
            groupId: selectedGroupId || undefined,
            livenessPassed,
          }),
        });
        const m = recRes.data.matches[0];
        setScanResultMsg(
          m?.matched
            ? `${m.student?.fullName} (${m.group?.name}) — ${Math.round(m.confidence * 100)}% [${m.attendanceAction}]`
            : `Tanilmadi (${Math.round((m?.confidence ?? 0) * 100)}%)`,
        );
        await load();
      } catch (err) {
        setScanResultMsg(err instanceof Error ? err.message : 'Xatolik');
      }
    }
  };

  const submitManualAttendance = async () => {
    if (!selectedGroupId || groupStudents.length === 0) return;
    const records = groupStudents.map((gs) => ({
      studentId: gs.student.id,
      groupId: selectedGroupId,
      status: manualStatuses[gs.student.id] || 'PRESENT',
    }));
    await apiRequest('/attendance', {
      method: 'POST',
      body: JSON.stringify({ records }),
    });
    alert('Davomat saqlandi');
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanFace className="w-6 h-6 text-teal-600" />
          {t.attendance.title}
        </h1>
        <select
          value={selectedGroupId}
          onChange={(e) => setSelectedGroupId(e.target.value)}
          className="m3-input max-w-xs text-sm"
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name} — {g.course.name}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        {[
          ['face', t.attendance.faceMode],
          ['manual', t.attendance.manualMode],
          ['history', t.attendance.historyMode],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k as typeof mode)}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold ${mode === k ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'face' && (
        <div className="m3-card p-6 space-y-4 text-center">
          {cameraActive && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-w-md mx-auto rounded-3xl bg-black aspect-video object-cover border-2 border-teal-500"
            />
          )}
          <div className="max-w-md mx-auto space-y-3">
            <p className="text-xs opacity-75">
              Android ilovada Google ML Kit yuzni aniqlaydi va TensorFlow Lite MobileFaceNet modeli yuz embeddingini tekshiradi.
            </p>
            <button
              onClick={handleFaceScan}
              className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow"
            >
              <Camera className="w-5 h-5" />
              {cameraActive ? 'Yuzni skanerlash va davomat belgilash' : t.attendance.startScan}
            </button>
            {scanResultMsg && (
              <div className="p-3 rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-300 text-xs font-semibold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {scanResultMsg}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'manual' && (
        <div className="m3-card p-5 space-y-4">
          {groupStudents.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="space-y-2">
                {groupStudents.map((gs) => (
                  <div key={gs.student.id} className="m3-tonal-card p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold text-sm">{gs.student.fullName}</div>
                      <div className="opacity-70">{gs.student.phone}</div>
                    </div>
                    <div className="flex gap-1.5">
                      {['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'].map((st) => (
                        <button
                          key={st}
                          onClick={() => setManualStatuses({ ...manualStatuses, [gs.student.id]: st })}
                          className={`px-2.5 py-1.5 rounded-xl font-semibold ${
                            manualStatuses[gs.student.id] === st ? 'bg-blue-600 text-white' : 'bg-white/50 dark:bg-slate-800'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={submitManualAttendance}
                className="w-full py-3 rounded-2xl bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                <ClipboardCheck className="w-4 h-4" />
                Davomatni saqlash
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'history' &&
        (loading ? (
          <LoadingState />
        ) : history.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="m3-card p-3.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-sm">{h.student.fullName}</div>
                  <div className="opacity-70">
                    {h.group.name} • {h.attendanceDate.slice(0, 10)} • {h.method}
                    {h.recognitionConfidence ? ` (${Math.round(Number(h.recognitionConfidence) * 100)}%)` : ''}
                  </div>
                </div>
                <StatusBadge status={h.status} />
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
