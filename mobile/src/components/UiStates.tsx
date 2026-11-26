'use client';

import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useApp();
  return (
    <div className="m3-card p-10 flex flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <p className="text-sm opacity-75">{label || t.common.loading}</p>
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useApp();
  return (
    <div className="m3-card p-10 flex flex-col items-center justify-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl m3-tonal-card flex items-center justify-center">
        <Inbox className="w-6 h-6 opacity-60" />
      </div>
      <p className="text-sm opacity-75">{message || t.common.empty}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useApp();
  return (
    <div className="m3-card p-8 flex flex-col items-center justify-center gap-3 text-center border-red-500/40">
      <AlertCircle className="w-8 h-8 text-red-500" />
      <p className="text-sm text-red-500 font-medium">{message || t.common.error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
        >
          {t.common.retry}
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    PAID: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    PRESENT: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    ISSUED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    PARTIALLY_PAID: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    LATE: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    DRAFT: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
    GRADUATED: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    COMPLETED: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    OVERDUE: 'bg-red-500/15 text-red-600 dark:text-red-400',
    ABSENT: 'bg-red-500/15 text-red-600 dark:text-red-400',
    REVOKED: 'bg-red-500/15 text-red-600 dark:text-red-400',
    CANCELLED: 'bg-red-500/15 text-red-600 dark:text-red-400',
    REFUNDED: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
    UNPAID: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    INACTIVE: 'bg-slate-500/15 text-slate-500',
    EXCUSED: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${colors[status] || 'bg-slate-500/15'}`}>
      {status}
    </span>
  );
}
