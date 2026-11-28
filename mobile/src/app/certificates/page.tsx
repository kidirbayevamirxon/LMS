'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, Ban, Download, ExternalLink, Eye, Plus, Printer, Share2, X } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import QRCode from 'qrcode';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest, buildAuthorizedUrl } from '@/lib/api';

interface CertRow {
  id: string;
  certificateNumber: string;
  studentFullName: string;
  courseName: string;
  centerName: string;
  courseStartDate: string;
  courseEndDate: string;
  issuedDate: string;
  resultScore: string;
  qrCodeData: string;
  status: string;
}

function formatDateEn(iso: string): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default function CertificatesPage() {
  const { t, user } = useApp();
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [students, setStudents] = useState<Array<{ id: string; fullName: string }>>([]);
  const [courses, setCourses] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showGen, setShowGen] = useState(false);
  const [previewCert, setPreviewCert] = useState<CertRow | null>(null);
  const [previewQrUrl, setPreviewQrUrl] = useState('');
  const [form, setForm] = useState({ studentId: '', courseId: '', resultScore: '95% (A+)' });

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const cRes = await apiRequest<{ data: CertRow[] }>('/certificates?limit=50');
      setCerts(cRes.data);
      if (canManage) {
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

  useEffect(() => {
    if (!previewCert) {
      setPreviewQrUrl('');
      return;
    }
    QRCode.toDataURL(previewCert.qrCodeData, { width: 220, margin: 1 })
      .then(setPreviewQrUrl)
      .catch(() => setPreviewQrUrl(''));
  }, [previewCert]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-amber-600">{c.certificateNumber}</div>
                  <h3 className="font-bold text-lg truncate">{c.studentFullName}</h3>
                  <p className="text-xs opacity-75">{c.courseName} • {c.resultScore}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>

              <div className="text-xs opacity-70">Berilgan sana: {c.issuedDate.slice(0, 10)}</div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => setPreviewCert(c)}
                  className="px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ko‘rish
                </button>
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

      {/* Visual Certificate Preview Modal matching Reference Template */}
      {previewCert && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-4xl space-y-3 my-auto">
            <div className="flex items-center justify-between text-white no-print">
              <span className="text-xs sm:text-sm font-semibold">{previewCert.certificateNumber}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl bg-white/15 text-xs font-semibold flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" /> Chop etish
                </button>
                <a
                  href={buildAuthorizedUrl(`/certificates/${previewCert.id}/pdf`)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-xs font-semibold flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </a>
                <button onClick={() => setPreviewCert(null)} className="p-1.5 rounded-xl bg-white/15">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Landscape Certificate Canvas using exact uploaded PDF template */}
            <div className="relative w-full aspect-[1.414/1] bg-white text-slate-900 rounded-xl shadow-2xl overflow-hidden select-none">
              <img
                src="/certificate-template-bg.png"
                alt="Certificate template"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />

              {/* Student Name centered above the black line */}
              <div
                className="absolute left-[14%] right-[14%] text-center font-normal text-slate-900 leading-tight truncate"
                style={{ top: '40.5%', fontSize: 'clamp(12px, 3.6vw, 34px)' }}
              >
                {previewCert.studentFullName}
              </div>

              {/* Course & Result centered below the black line */}
              <div
                className="absolute left-[17%] right-[17%] text-center font-bold text-slate-900 leading-snug"
                style={{ top: '50.5%', fontSize: 'clamp(7px, 1.45vw, 14px)' }}
              >
                «&ldquo;{previewCert.courseName}&rdquo; kursini {previewCert.resultScore} natija bilan muvaffaqiyatli yakunladi»
              </div>

              {/* Date Range */}
              <div
                className="absolute left-[18%] right-[18%] text-center font-bold text-slate-900"
                style={{ top: '61.5%', fontSize: 'clamp(7px, 1.45vw, 14px)' }}
              >
                {formatDateEn(previewCert.courseStartDate)} - {formatDateEn(previewCert.courseEndDate)}
              </div>

              {previewCert.status === 'REVOKED' && (
                <div
                  className="absolute left-[20%] right-[20%] text-center font-extrabold text-red-600"
                  style={{ top: '67%', fontSize: 'clamp(9px, 2vw, 20px)' }}
                >
                  BEKOR QILINGAN / REVOKED
                </div>
              )}

              {/* QR Code to the right of the stamp */}
              {previewQrUrl && (
                <img
                  src={previewQrUrl}
                  alt="QR"
                  className="absolute bg-white"
                  style={{ left: '59.8%', bottom: '18.1%', width: '8.8%', aspectRatio: '1 / 1' }}
                />
              )}

              {/* Certificate ID centered below director name */}
              <div
                className="absolute left-[20%] right-[20%] text-center font-bold text-slate-900 underline"
                style={{ bottom: '7.6%', fontSize: 'clamp(7px, 1.35vw, 13px)' }}
              >
                ID:{previewCert.certificateNumber}
              </div>
            </div>
          </div>
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
