'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, Ban, Download, ExternalLink, Eye, Plus, Printer, Share2, X } from 'lucide-react';
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

            {/* Landscape Certificate Canvas */}
            <div className="relative w-full aspect-[1.414/1] bg-white text-slate-900 rounded-xl shadow-2xl overflow-hidden select-none p-4 sm:p-8 flex flex-col justify-between">
              {/* Top-left & Top-right gold concentric corner lines */}
              <svg className="absolute top-2 left-2 w-24 sm:w-40 h-24 sm:h-40 pointer-events-none" viewBox="0 0 160 160">
                {[0, 1, 2, 3, 4].map((i) => {
                  const o = 6 + i * 9;
                  const len = 148 - i * 22;
                  return (
                    <polyline
                      key={i}
                      points={`${o},${o + len} ${o},${o} ${o + len},${o}`}
                      fill="none"
                      stroke="#C69D47"
                      strokeWidth="2.5"
                    />
                  );
                })}
              </svg>
              <svg className="absolute top-2 right-2 w-24 sm:w-40 h-24 sm:h-40 pointer-events-none" viewBox="0 0 160 160">
                {[0, 1, 2, 3, 4].map((i) => {
                  const o = 6 + i * 9;
                  const len = 148 - i * 22;
                  return (
                    <polyline
                      key={i}
                      points={`${160 - o},${o + len} ${160 - o},${o} ${160 - o - len},${o}`}
                      fill="none"
                      stroke="#C69D47"
                      strokeWidth="2.5"
                    />
                  );
                })}
              </svg>

              {/* Bottom-left & Bottom-right Espresso + Gold Pattern Triangles */}
              <svg className="absolute bottom-0 left-0 w-[31%] h-[52%] pointer-events-none" viewBox="0 0 300 300" preserveAspectRatio="none">
                <defs>
                  <pattern id="islamicGoldL" width="28" height="28" patternUnits="userSpaceOnUse">
                    <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="#C69D47" strokeWidth="1" opacity="0.4" />
                    <circle cx="14" cy="14" r="3" fill="none" stroke="#C69D47" strokeWidth="1" opacity="0.4" />
                  </pattern>
                </defs>
                <polygon points="0,0 300,300 0,300" fill="#1D1109" />
                <polygon points="0,0 300,300 0,300" fill="url(#islamicGoldL)" />
                <line x1="0" y1="0" x2="300" y2="300" stroke="#C8A045" strokeWidth="14" />
              </svg>
              <svg className="absolute bottom-0 right-0 w-[31%] h-[52%] pointer-events-none" viewBox="0 0 300 300" preserveAspectRatio="none">
                <defs>
                  <pattern id="islamicGoldR" width="28" height="28" patternUnits="userSpaceOnUse">
                    <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke="#C69D47" strokeWidth="1" opacity="0.4" />
                    <circle cx="14" cy="14" r="3" fill="none" stroke="#C69D47" strokeWidth="1" opacity="0.4" />
                  </pattern>
                </defs>
                <polygon points="300,0 0,300 300,300" fill="#1D1109" />
                <polygon points="300,0 0,300 300,300" fill="url(#islamicGoldR)" />
                <line x1="300" y1="0" x2="0" y2="300" stroke="#C8A045" strokeWidth="14" />
              </svg>

              {/* Left & Right Laurel Leaves */}
              <svg className="hidden sm:block absolute left-[7%] top-[24%] w-16 h-[44%] pointer-events-none" viewBox="0 0 80 240">
                <path d="M55,230 Q18,130 48,15" fill="none" stroke="#C69D47" strokeWidth="2.5" />
                {Array.from({ length: 10 }).map((_, idx) => {
                  const y = 210 - idx * 20;
                  const x = 35 + Math.sin(idx * 0.4) * 8;
                  return (
                    <g key={idx}>
                      <ellipse cx={x - 10} cy={y} rx="12" ry="4.5" transform={`rotate(-35 ${x - 10} ${y})`} fill="#C69D47" />
                      <ellipse cx={x + 12} cy={y - 6} rx="11" ry="4" transform={`rotate(40 ${x + 12} ${y - 6})`} fill="#C69D47" />
                    </g>
                  );
                })}
              </svg>
              <svg className="hidden sm:block absolute right-[7%] top-[24%] w-16 h-[44%] pointer-events-none scale-x-[-1]" viewBox="0 0 80 240">
                <path d="M55,230 Q18,130 48,15" fill="none" stroke="#C69D47" strokeWidth="2.5" />
                {Array.from({ length: 10 }).map((_, idx) => {
                  const y = 210 - idx * 20;
                  const x = 35 + Math.sin(idx * 0.4) * 8;
                  return (
                    <g key={idx}>
                      <ellipse cx={x - 10} cy={y} rx="12" ry="4.5" transform={`rotate(-35 ${x - 10} ${y})`} fill="#C69D47" />
                      <ellipse cx={x + 12} cy={y - 6} rx="11" ry="4" transform={`rotate(40 ${x + 12} ${y - 6})`} fill="#C69D47" />
                    </g>
                  );
                })}
              </svg>

              {/* Header & Title */}
              <div className="relative z-10 text-center space-y-1 pt-2">
                <div className="text-[9px] sm:text-xs font-bold tracking-widest text-slate-600">
                  EDUMANAGER • IT EDUCATION PLATFORM
                </div>
                <div className="text-2xl sm:text-5xl font-serif font-bold tracking-[0.25em] text-[#9E7422] pt-2">
                  CERTIFICATE
                </div>
                <div className="text-[11px] sm:text-lg font-serif tracking-[0.25em] text-[#9E7422]">
                  OF COMPLETION
                </div>
                <div className="text-[10px] sm:text-sm font-bold tracking-widest text-[#8B6316]">
                  {previewCert.centerName.toUpperCase()}
                </div>
              </div>

              {/* Recipient & Course */}
              <div className="relative z-10 text-center space-y-1.5 sm:space-y-3 px-6 sm:px-20">
                <div className="text-[10px] sm:text-sm text-slate-700">This Certificate has been awarded to</div>
                <div className="text-xl sm:text-4xl font-extrabold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block px-6 sm:px-14">
                  {previewCert.studentFullName}
                </div>
                <div className="text-[10px] sm:text-sm font-bold text-slate-900 max-w-xl mx-auto">
                  «&ldquo;{previewCert.courseName}&rdquo; kursini {previewCert.resultScore} natija bilan muvaffaqiyatli yakunladi»
                </div>
                <div className="text-[10px] sm:text-xs font-bold text-slate-800">
                  {formatDateEn(previewCert.courseStartDate)} - {formatDateEn(previewCert.courseEndDate)}
                </div>
              </div>

              {/* Footer: Signature, Stamp + ID, QR */}
              <div className="relative z-10 flex flex-col items-center gap-1 pb-1">
                <div className="flex items-center justify-center gap-4 sm:gap-10">
                  <svg className="w-16 sm:w-24 h-10" viewBox="0 0 120 50">
                    <path
                      d="M10,35 C20,8 45,8 32,35 C22,48 16,38 42,26 C56,16 64,34 80,22 C90,14 96,36 112,18"
                      fill="none"
                      stroke="#0F172A"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full border-2 border-blue-700 flex items-center justify-center p-1">
                    <div className="w-full h-full rounded-full border border-blue-700 flex items-center justify-center text-center text-[6px] sm:text-[8px] font-extrabold text-blue-700 leading-tight px-1">
                      {previewCert.centerName.toUpperCase()}
                    </div>
                  </div>
                  <div className="p-1 bg-white border border-slate-300 rounded">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-900 text-white flex items-center justify-center text-[8px] font-mono text-center p-1">
                      QR CODE
                    </div>
                  </div>
                </div>
                <div className="text-[10px] sm:text-xs font-bold underline">ID: {previewCert.certificateNumber}</div>
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
