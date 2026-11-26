'use client';

import React from 'react';
import { formatMoney } from '@/lib/i18n';

export function BarChartCard({
  title,
  items,
  formatValue,
}: {
  title: string;
  items: Array<{ label: string; value: number; secondary?: string }>;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="m3-card p-5">
      <h3 className="font-bold text-sm mb-4">{title}</h3>
      <div className="space-y-3">
        {items.map((item) => {
          const pct = Math.max(4, Math.round((item.value / max) * 100));
          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium truncate max-w-[55%]">{item.label}</span>
                <span className="font-semibold opacity-85">
                  {formatValue ? formatValue(item.value) : item.value}
                  {item.secondary ? ` (${item.secondary})` : ''}
                </span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--md-surface-variant)' }}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-teal-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AttendanceMiniChart({
  title,
  data,
}: {
  title: string;
  data: Array<{ date: string; present: number; late: number; absent: number }>;
}) {
  const maxDay = Math.max(1, ...data.map((d) => d.present + d.late + d.absent));
  return (
    <div className="m3-card p-5">
      <h3 className="font-bold text-sm mb-4">{title}</h3>
      <div className="flex items-end justify-between gap-2 h-36 pt-2">
        {data.map((d) => {
          const total = d.present + d.late + d.absent;
          const heightPct = total > 0 ? Math.max(12, Math.round((total / maxDay) * 100)) : 8;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
              <span className="text-[10px] font-semibold opacity-75">{total}</span>
              <div
                className="w-full max-w-[32px] rounded-xl overflow-hidden flex flex-col-reverse bg-slate-500/15"
                style={{ height: `${heightPct}%` }}
              >
                {d.present > 0 && (
                  <div className="bg-emerald-500" style={{ flex: d.present }} title={`Present: ${d.present}`} />
                )}
                {d.late > 0 && (
                  <div className="bg-amber-500" style={{ flex: d.late }} title={`Late: ${d.late}`} />
                )}
                {d.absent > 0 && (
                  <div className="bg-red-500" style={{ flex: d.absent }} title={`Absent: ${d.absent}`} />
                )}
              </div>
              <span className="text-[10px] opacity-65">{d.date}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 text-[11px] opacity-80">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Keldi</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Kechikdi</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Kelmadi</span>
      </div>
    </div>
  );
}

export function PaymentBreakdownCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ status: string; count: number; paidAmount: number; remainingDebt: number }>;
}) {
  const totalCount = Math.max(1, items.reduce((a, b) => a + b.count, 0));
  return (
    <div className="m3-card p-5">
      <h3 className="font-bold text-sm mb-4">{title}</h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.status} className="m3-tonal-card p-3 flex items-center justify-between text-xs">
            <div>
              <div className="font-bold">{item.status}</div>
              <div className="opacity-70">{item.count} ta oy ({Math.round((item.count / totalCount) * 100)}%)</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                +{formatMoney(item.paidAmount)}
              </div>
              {item.remainingDebt > 0 && (
                <div className="text-red-500 font-semibold">Qarz: {formatMoney(item.remainingDebt)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
