'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Phone, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', phone: '+998901000001' },
  { label: 'Admin', phone: '+998901000002' },
  { label: 'Kassir', phone: '+998901000003' },
  { label: 'O‘qituvchi', phone: '+998901000004' },
  { label: 'O‘quvchi', phone: '+998901000006' },
];

export default function LoginPage() {
  const { login, t, lang, setLang } = useApp();
  const router = useRouter();
  const [phone, setPhone] = useState('+998901000001');
  const [password, setPassword] = useState('EduManager2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(phone, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirishda xatolik');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-950 via-slate-900 to-teal-950 text-white">
      <div className="w-full max-w-md rounded-3xl bg-white/10 backdrop-blur-xl border border-white/15 p-6 md:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-xl shadow-lg">
              EM
            </div>
            <div>
              <h1 className="text-xl font-bold">{t.appName}</h1>
              <p className="text-xs text-blue-200">{t.appSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
            className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold uppercase"
          >
            {lang}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-blue-100 mb-1.5">{t.auth.phone}</label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-blue-300" />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-2xl bg-white/10 border border-white/20 pl-10 pr-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-blue-400"
                placeholder="+998901000001"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-blue-100 mb-1.5">{t.auth.password}</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-blue-300" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl bg-white/10 border border-white/20 pl-10 pr-4 py-3 text-sm text-white placeholder-white/40 outline-none focus:border-blue-400"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-red-500/20 border border-red-400/40 text-xs text-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 font-semibold text-sm shadow-lg transition disabled:opacity-60"
          >
            {loading ? t.common.loading : t.auth.loginBtn}
          </button>
        </form>

        <div className="pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-[11px] text-blue-200 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            {t.auth.demoAccounts} (EduManager2026!)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.phone}
                type="button"
                onClick={() => {
                  setPhone(acc.phone);
                  setPassword('EduManager2026!');
                }}
                className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-medium"
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
