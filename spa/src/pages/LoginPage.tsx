import React, { useMemo, useState } from 'react';
import { USERS } from '../auth/users';
import { setCurrentUser } from '../auth/storage';

export default function LoginPage() {
  const userNames = useMemo(() => Object.keys(USERS).sort(), []);
  const [selectedUser, setSelectedUser] = useState<string>(userNames[0] ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!selectedUser) return setError('اختر المستخدم');
    const u = USERS[selectedUser];
    if (!u) return setError('مستخدم غير موجود');
    if (pin !== u.pin) return setError('PIN غير صحيح');

    setCurrentUser({ name: selectedUser, role: u.role });
    window.location.hash = '#/'; // go dashboard
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-neutral-200 p-6">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg">O</span>
          </div>
          <h1 className="mt-3 text-2xl font-bold text-neutral-900">ORANGE DASHBOARD</h1>
          <p className="text-sm text-neutral-500">تسجيل الدخول</p>
        </div>

        <label className="label">اسم المستخدم</label>
        <select className="input" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
          {userNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <div className="mt-4">
          <label className="label">PIN</label>
          <input
            className="input"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="****"
          />
        </div>

        {error && <div className="mt-3 text-sm font-semibold text-red-600">{error}</div>}

        <button className="btn-primary w-full mt-5" onClick={submit}>
          دخول
        </button>
      </div>
    </div>
  );
}

