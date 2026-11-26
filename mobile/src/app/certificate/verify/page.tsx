'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ShieldAlert, Search } from 'lucide-react';
import { LoadingState } from '@/components/UiStates';
import { apiRequest } from '@/lib/api';

interface VerifyResult {
  valid: boolean;
  status: string;
  message?: string;
  certificate?: {
    certificateNumber: string;
    studentFullName: string;
    courseName: string;
    centerName: string;
    courseStartDate: string;
    courseEndDate: string;
    issuedDate: string;
    resultScore: string;
    status: string;
  };
}

function VerifyContent() {
  const params = useSearchParams();
  const [certNumber, setCertNumber] = useState(params.get('number') || '');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);

  const verify = async (num: string) => {
    if (!num) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ data: VerifyResult }>(`/certificates/verify/${encodeURIComponent(num)}`, {
        skipAuth: true,
      });
      setResult(res.data);
    } catch {
      setResult({ valid: false, status: 'ERROR', message: 'Tekshirishda xatolik' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let initial = params.get('number') || '';
    if (!initial && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last !== 'verify') initial = last;
    }
    if (initial) {
      setCertNumber(initial);
      verify(initial);
    }
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-white">
      <div className="w-full max-w-lg rounded-3xl bg-white/10 border border-white/15 p-6 md:p-8 space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">EduManager Sertifikat Tekshiruvi</h1>
          <p className="text-xs text-slate-300">QR kod yoki sertifikat raqami orqali haqiqiylikni tekshiring</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify(certNumber);
          }}
          className="flex gap-2"
        >
          <input
            value={certNumber}
            onChange={(e) => setCertNumber(e.target.value)}
            placeholder="CERT-2026-000001"
            className="flex-1 rounded-xl bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white"
          />
          <button type="submit" className="px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-semibold flex items-center gap-1.5">
            <Search className="w-4 h-4" /> Tekshirish
          </button>
        </form>

        {loading && <LoadingState />}

        {result && !loading && (
          <div className={`p-5 rounded-2xl border ${result.valid ? 'bg-emerald-500/15 border-emerald-400/40' : 'bg-red-500/15 border-red-400/40'}`}>
            <div className="flex items-center gap-3 mb-3">
              {result.valid ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-8 h-8 text-red-400" />
              )}
              <div>
                <div className="font-bold text-base">
                  {result.valid ? 'Sertifikat haqiqiy (ISSUED)' : `Yaroqsiz (${result.status})`}
                </div>
                {result.message && <div className="text-xs opacity-80">{result.message}</div>}
              </div>
            </div>

            {result.certificate && (
              <div className="space-y-1.5 text-xs border-t border-white/15 pt-3">
                <div><b>Raqam:</b> {result.certificate.certificateNumber}</div>
                <div><b>O‘quvchi:</b> {result.certificate.studentFullName}</div>
                <div><b>Kurs:</b> {result.certificate.courseName}</div>
                <div><b>Markaz:</b> {result.certificate.centerName}</div>
                <div><b>Natija:</b> {result.certificate.resultScore}</div>
                <div><b>Berilgan sana:</b> {result.certificate.issuedDate.slice(0, 10)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyCertificatePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <VerifyContent />
    </Suspense>
  );
}
