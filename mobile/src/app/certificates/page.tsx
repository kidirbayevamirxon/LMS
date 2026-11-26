'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, Ban, Download, ExternalLink, Plus, Share2, X } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest, buildAuthorizedUrl } from '@/lib/api';

interface CertRow {
  id: string;
  certificateNumber: string;
  studentFullName: string;
  courseName: string;
  centerName: string;
  issuedDate: string;
  resultScore: string;
  qrCodeData: string;
  status: string;
}

export default function CertificatesPage() {
  const { t, user } = useApp();
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [students, setStudents] = useState<Array<{ id: string; fullName: string }>>([]);
  const [courses, setCourses] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showGen, setShowGen] = useState(false);
  const [form, setForm] = useState({ studentId: '', courseId: '', resultScore: '95% (A+)' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const cRes = await apiRequest<{ data: CertRow[] }>('/certificates?limit=50');
      setCerts(cRes.data);
      if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') {
        const [stRes, crRes] = await Promise.all([
          apiRequest<{ data: Array<{ id: string; fullName: string }> }>('/students?limit=100'),
          apiRequest<{ data: Array<{ id: string; name: string }> }>('/courses?limit=50'),
        ]);
        setStudents(stRes.data);
        setCourses(crRes.data);
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

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/certificates/generate', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowGen(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik');
    }
  };

  const handleShare = async (cert: CertRow) => {
    const shareText = `${cert.studentFullName} — "${cert.courseName}" kursi sertifikati (${cert.certificateNumber})\nTekshirish: ${cert.qrCodeData}`;
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: `Sertifikat ${cert.certificateNumber}`,
        text: shareText,
        url: cert.qrCodeData,
        dialogTitle: 'Telegram / WhatsApp orqali ulashish',
      });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: cert.certificateNumber, text: shareText, url: cert.qrCodeData });
    } else {
      await navigator.clipboard.writeText(shareText);
      alert('Sertifikat havolasi nusxalandi!');
    }
  };

  const handleRevoke = async (id: string) => {
    const reason = prompt('Bekor qilish sababini kiriting:');
    if (!reason) return;
    await apiRequest(`/certificates/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'REVOKED', revokeReason: reason }),
    });
    await load();
  };

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Award className="w-6 h-6 text-amber-500" />
          {t.certificates.title}
        </h1>
        {canManage && (
          <button
            onClick={() => setShowGen(true)}
            className="px-4 py-2 rounded-2xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
          >
            <Plus className="w-4 h-4" />
            {t.certificates.generate}
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : certs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certs.map((c) => (
            <div key={c.id} className="m3-card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold text-amber-600">{c.certificateNumber}</div>
                  <h3 className="font-bold text-lg">{c.studentFullName}</h3>
                  <p className="text-xs opacity-75">{c.courseName} • {c.resultScore}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>

              <div className="text-xs opacity-70">Berilgan sana: {c.issuedDate.slice(0, 10)}</div>

              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href={buildAuthorizedUrl(`/certificates/${c.id}/pdf`)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t.certificates.downloadPdf}
                </a>
                <button
                  onClick={() => handleShare(c)}
                  className="px-3 py-2 rounded-xl m3-tonal-card text-xs font-semibold flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Ulashish
                </button>
                <Link
                  href={`/certificate/verify?number=${c.certificateNumber}`}
                  className="px-3 py-2 rounded-xl m3-tonal-card text-xs font-semibold flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t.certificates.verify}
                </Link>
                {canManage && c.status !== 'REVOKED' && (
                  <button
                    onClick={() => handleRevoke(c.id)}
                    className="px-3 py-2 rounded-xl bg-red-500/10 text-red-500 text-xs font-semibold flex items-center gap-1"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    {t.certificates.revoke}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showGen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleGenerate} className="m3-card w-full max-w-md p-6 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{t.certificates.generate}</h3>
              <button type="button" onClick={() => setShowGen(false)}><X className="w-5 h-5" /></button>
            </div>
            <select required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className="m3-input text-sm">
              <option value="">O‘quvchini tanlang</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
            <select required value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="m3-input text-sm">
              <option value="">Kursni tanlang</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input
              required
              value={form.resultScore}
              onChange={(e) => setForm({ ...form, resultScore: e.target.value })}
              className="m3-input text-sm"
              placeholder="Natija (masalan 95%)"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">
              Yaratish
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
