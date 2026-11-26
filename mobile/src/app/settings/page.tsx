'use client';

import React, { useEffect, useState } from 'react';
import { Bell, Globe, Moon, Plus, Settings as SettingsIcon, Shield, Sun, Trash2, X } from 'lucide-react';
import { LoadingState, StatusBadge } from '@/components/UiStates';
import { useApp } from '@/context/AppContext';
import { apiRequest } from '@/lib/api';

interface CenterSettings {
  centerName: string;
  centerPhone: string;
  centerAddress: string;
  directorName: string;
  paymentDueDay: number;
  lateGraceMinutes: number;
  faceRecognitionThreshold: number;
  livenessRequired: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

interface StaffUser {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  role: { name: string; displayName: string };
}

export default function SettingsPage() {
  const { t, user, darkMode, toggleDarkMode, lang, setLang } = useApp();
  const [tab, setTab] = useState<'general' | 'notifications' | 'users'>('general');
  const [center, setCenter] = useState<CenterSettings | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({
    fullName: '',
    phone: '+998',
    password: '',
    role: 'ADMIN',
    specialization: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, nRes] = await Promise.all([
        apiRequest<{ data: CenterSettings }>('/settings'),
        apiRequest<{ data: NotificationItem[] }>('/notifications?limit=30'),
      ]);
      setCenter(sRes.data);
      setNotifications(nRes.data);
      if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') {
        const uRes = await apiRequest<{ data: StaffUser[] }>('/users?limit=50');
        setUsers(uRes.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const handleSaveCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!center) return;
    try {
      await apiRequest('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          centerName: center.centerName,
          centerPhone: center.centerPhone,
          centerAddress: center.centerAddress,
          directorName: center.directorName,
          paymentDueDay: Number(center.paymentDueDay),
          lateGraceMinutes: Number(center.lateGraceMinutes),
          faceRecognitionThreshold: Number(center.faceRecognitionThreshold),
          livenessRequired: center.livenessRequired,
        }),
      });
      alert('Sozlamalar saqlandi');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/users', {
        method: 'POST',
        body: JSON.stringify(userForm),
      });
      setShowUserModal(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Xatolik');
    }
  };

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const handleDeleteUser = async (u: StaffUser) => {
    if (!confirm(`"${u.fullName}" foydalanuvchini o'chirmoqchimisiz?`)) return;
    try {
      await apiRequest(`/users/${u.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "O'chirishda xatolik");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-blue-600" />
        {t.settings.title}
      </h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setTab('general')}
          className={`px-4 py-2 rounded-2xl text-xs font-semibold whitespace-nowrap ${tab === 'general' ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
        >
          {t.settings.centerSettings}
        </button>
        <button
          onClick={() => setTab('notifications')}
          className={`px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${tab === 'notifications' ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
        >
          <Bell className="w-3.5 h-3.5" />
          {t.settings.notifications} ({notifications.filter((n) => !n.isRead).length})
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('users')}
            className={`px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${tab === 'users' ? 'bg-blue-600 text-white' : 'm3-tonal-card'}`}
          >
            <Shield className="w-3.5 h-3.5" />
            {t.settings.usersRoles}
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : tab === 'general' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="m3-card p-5 space-y-4">
            <h3 className="font-bold text-sm">Ilova ko‘rinishi va til</h3>
            <div className="flex items-center justify-between m3-tonal-card p-3.5">
              <span className="text-sm font-medium flex items-center gap-2">
                {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                {t.settings.theme}
              </span>
              <button onClick={toggleDarkMode} className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold">
                {darkMode ? 'Dark Mode' : 'Light Mode'}
              </button>
            </div>
            <div className="flex items-center justify-between m3-tonal-card p-3.5">
              <span className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-4 h-4" />
                {t.settings.language}
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setLang('uz')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold ${lang === 'uz' ? 'bg-blue-600 text-white' : 'bg-white/60 dark:bg-slate-800'}`}
                >
                  O‘zbek
                </button>
                <button
                  onClick={() => setLang('ru')}
                  className={`px-3 py-1 rounded-xl text-xs font-bold ${lang === 'ru' ? 'bg-blue-600 text-white' : 'bg-white/60 dark:bg-slate-800'}`}
                >
                  Русский
                </button>
              </div>
            </div>
          </div>

          {center && (
            <form onSubmit={handleSaveCenter} className="m3-card p-5 space-y-3">
              <h3 className="font-bold text-sm">{t.settings.centerSettings}</h3>
              <input
                disabled={!isAdmin}
                value={center.centerName}
                onChange={(e) => setCenter({ ...center, centerName: e.target.value })}
                className="m3-input text-sm"
                placeholder="Markaz nomi"
              />
              <input
                disabled={!isAdmin}
                value={center.centerPhone || ''}
                onChange={(e) => setCenter({ ...center, centerPhone: e.target.value })}
                className="m3-input text-sm"
                placeholder="Telefon"
              />
              <input
                disabled={!isAdmin}
                value={center.directorName || ''}
                onChange={(e) => setCenter({ ...center, directorName: e.target.value })}
                className="m3-input text-sm"
                placeholder="Direktor F.I.SH"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] opacity-70">To‘lov kuni</label>
                  <input
                    type="number"
                    disabled={!isAdmin}
                    value={center.paymentDueDay}
                    onChange={(e) => setCenter({ ...center, paymentDueDay: Number(e.target.value) })}
                    className="m3-input text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] opacity-70">Kechikish (daq)</label>
                  <input
                    type="number"
                    disabled={!isAdmin}
                    value={center.lateGraceMinutes}
                    onChange={(e) => setCenter({ ...center, lateGraceMinutes: Number(e.target.value) })}
                    className="m3-input text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] opacity-70">Face threshold</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.5"
                    max="0.98"
                    disabled={!isAdmin}
                    value={center.faceRecognitionThreshold}
                    onChange={(e) => setCenter({ ...center, faceRecognitionThreshold: Number(e.target.value) })}
                    className="m3-input text-xs"
                  />
                </div>
              </div>
              {isAdmin && (
                <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">
                  {t.settings.save}
                </button>
              )}
            </form>
          )}
        </div>
      ) : tab === 'notifications' ? (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="m3-card p-4 flex flex-wrap justify-between items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm">{n.title}</div>
                <p className="text-xs opacity-75 mt-0.5">{n.body}</p>
                <div className="text-[11px] opacity-55 mt-1">{n.createdAt.slice(0, 16).replace('T', ' ')}</div>
              </div>
              <StatusBadge status={n.type} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {isAdmin && (
            <button
              onClick={() => setShowUserModal(true)}
              className="px-4 py-2 rounded-2xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Yangi foydalanuvchi yaratish
            </button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {users
              .filter((u) => ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT'].includes(u.role.name))
              .map((u) => (
                <div key={u.id} className="m3-card p-4 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{u.fullName}</div>
                    <div className="opacity-70">{u.phone}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-600 font-semibold">
                      {u.role.name === 'SUPER_ADMIN' || u.role.name === 'ADMIN' ? 'Admin' : u.role.displayName}
                    </span>
                    <StatusBadge status={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    {isAdmin && u.role.name !== 'SUPER_ADMIN' && u.id !== user?.id && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="p-1.5 rounded-xl bg-red-500/15 text-red-600 hover:bg-red-500/25 transition-colors"
                        title="O'chirish"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateUser} className="m3-card w-full max-w-md p-6 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Yangi foydalanuvchi</h3>
              <button type="button" onClick={() => setShowUserModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <input required placeholder="F.I.SH" value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="m3-input text-sm" />
            <input required placeholder="Telefon (+998...)" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} className="m3-input text-sm" />
            <input required type="password" placeholder="Parol" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="m3-input text-sm" />
            <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} className="m3-input text-sm">
              <option value="ADMIN">Admin</option>
              <option value="TEACHER">O‘qituvchi</option>
              <option value="STUDENT">O‘quvchi</option>
            </select>
            {userForm.role === 'TEACHER' && (
              <input placeholder="Mutaxassisligi" value={userForm.specialization} onChange={(e) => setUserForm({ ...userForm, specialization: e.target.value })} className="m3-input text-sm" />
            )}
            <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold">Yaratish</button>
          </form>
        </div>
      )}
    </div>
  );
}
