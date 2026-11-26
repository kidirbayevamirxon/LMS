'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Award,
  Bell,
  BookOpen,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScanFace,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isReady, t, darkMode, toggleDarkMode, lang, setLang, logout } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // Public routes (login & certificate verification) render without shell
  if (pathname?.startsWith('/login') || pathname?.startsWith('/certificate/verify')) {
    return <>{children}</>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="w-16 h-16 rounded-3xl bg-blue-600 text-white flex items-center justify-center font-bold text-2xl shadow-lg">
          EM
        </div>
        <h1 className="text-xl font-bold">{t.appName}</h1>
        <p className="text-sm opacity-75">{t.appSubtitle}</p>
        <Link
          href="/login"
          className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-semibold shadow hover:bg-blue-700"
        >
          {t.auth.loginBtn}
        </Link>
      </div>
    );
  }

  const role = user.role;
  const roleLabel =
    role === 'SUPER_ADMIN' || role === 'ADMIN'
      ? 'Admin'
      : role === 'TEACHER'
        ? 'O‘qituvchi'
        : role === 'STUDENT'
          ? 'O‘quvchi'
          : user.roleDisplayName || role;

  const navItems = [
    { href: '/', label: t.nav.dashboard, icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'TEACHER', 'STUDENT'] },
    { href: '/students', label: t.nav.students, icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'TEACHER'] },
    { href: '/groups', label: t.nav.groups, icon: BookOpen, roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
    { href: '/payments', label: t.nav.payments, icon: CreditCard, roles: ['SUPER_ADMIN', 'ADMIN', 'CASHIER'] },
    { href: '/attendance', label: t.nav.attendance, icon: ScanFace, roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
    { href: '/certificates', label: t.nav.certificates, icon: Award, roles: ['SUPER_ADMIN', 'ADMIN', 'STUDENT'] },
    { href: '/settings', label: t.nav.settings, icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'TEACHER', 'STUDENT'] },
  ].filter((item) => item.roles.includes(role));

  const bottomItems = navItems.slice(0, 5);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '';
    return pathname?.startsWith(href);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Desktop Navigation Rail / Drawer */}
      <aside
        className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0 border-r no-print"
        style={{ backgroundColor: 'var(--md-surface-container)', borderColor: 'var(--md-outline)' }}
      >
        <div className="p-5 flex items-center gap-3 border-b" style={{ borderColor: 'var(--md-outline)' }}>
          <div className="w-11 h-11 rounded-2xl bg-blue-700 text-white flex items-center justify-center font-bold text-lg shadow">
            EM
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">{t.appName}</div>
            <div className="text-xs opacity-70">{roleLabel}</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600/15 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'hover:bg-slate-500/10 opacity-85'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--md-outline)' }}>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={toggleDarkMode}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium m3-tonal-card"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {darkMode ? 'Light' : 'Dark'}
            </button>
            <button
              onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
              className="flex-1 py-2 rounded-xl text-xs font-semibold m3-tonal-card uppercase"
            >
              {lang === 'uz' ? 'O‘zbek' : 'Русский'}
            </button>
          </div>
          <div className="flex items-center justify-between px-2">
            <div className="truncate">
              <div className="text-sm font-semibold truncate">{user.fullName}</div>
              <div className="text-xs opacity-70">{user.phone}</div>
            </div>
            <button
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              className="p-2 rounded-xl text-red-500 hover:bg-red-500/10"
              title={t.auth.logout}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top App Bar */}
      <header
        className="lg:hidden sticky top-0 z-30 px-4 py-3 flex items-center justify-between border-b backdrop-blur-md no-print"
        style={{ backgroundColor: 'var(--md-surface-container)', borderColor: 'var(--md-outline)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-xl m3-tonal-card"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <div className="font-bold text-base leading-tight">{t.appName}</div>
            <div className="text-[11px] opacity-70">{user.fullName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold m3-tonal-card uppercase"
          >
            {lang}
          </button>
          <button onClick={toggleDarkMode} className="p-2 rounded-xl m3-tonal-card">
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link href="/settings" className="p-2 rounded-xl m3-tonal-card">
            <Bell className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Mobile Slide-out Navigation Drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex no-print">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div
            className="relative w-72 max-w-[85vw] h-full flex flex-col p-4 z-10 shadow-2xl"
            style={{ backgroundColor: 'var(--md-surface-container)' }}
          >
            <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: 'var(--md-outline)' }}>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center font-bold">
                  EM
                </div>
                <div>
                  <div className="font-bold">{t.appName}</div>
                  <div className="text-xs opacity-70">{user.role}</div>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium ${
                      active ? 'bg-blue-600/15 text-blue-600 font-semibold' : 'opacity-85'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <button
              onClick={async () => {
                setDrawerOpen(false);
                await logout();
                router.push('/login');
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-red-500 bg-red-500/10"
            >
              <LogOut className="w-5 h-5" />
              {t.auth.logout}
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:pl-72 pb-28 lg:pb-10 min-w-0">
        <div className="max-w-7xl mx-auto px-3.5 py-4 sm:p-5 md:p-6">{children}</div>
      </main>

      {/* Material 3 Mobile Bottom Navigation Bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t px-1 pt-1.5 pb-safe flex items-center justify-around backdrop-blur-md no-print"
        style={{ backgroundColor: 'var(--md-surface-container)', borderColor: 'var(--md-outline)' }}
      >
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 py-1 px-2 min-w-[60px]"
            >
              <div
                className={`px-4 py-1 rounded-full transition-colors ${
                  active ? 'bg-blue-600/20 text-blue-600 dark:text-blue-300' : 'opacity-70'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-[10px] truncate max-w-[68px] ${active ? 'font-bold text-blue-600 dark:text-blue-300' : 'opacity-70'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
