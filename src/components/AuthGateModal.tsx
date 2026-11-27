import React, { useState } from 'react';
import type { AuthUser, SystemSettings } from '../types/auth';
import { loginUser, logoutUser, registerUser } from '../utils/apiClient';

interface AuthGateModalProps {
  pendingUser: AuthUser | null;
  settings: SystemSettings | null;
  onAuthenticated: (user: AuthUser, settings: SystemSettings) => void;
  onPendingApproval: (user: AuthUser, settings: SystemSettings) => void;
  onRefreshStatus: () => void | Promise<void>;
  onLoggedOut: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  backgroundColor: 'rgba(2, 6, 23, 0.9)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '420px',
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '24px',
  color: '#f8fafc',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75)',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
};

const fieldWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11.5px',
  color: '#94a3b8',
  fontWeight: 500,
};

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  pendingUser,
  settings,
  onAuthenticated,
  onPendingApproval,
  onRefreshStatus,
  onLoggedOut,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError(null);
    setConfirmPassword('');
  };

  if (pendingUser) {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(245, 158, 11, 0.18)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
            >
              ⏳
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                Очаква одобрение
              </h2>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {pendingUser.email}
              </div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#cbd5e1' }}>
            Здравей, <strong>{pendingUser.name}</strong>! Регистрацията ти е записана
            успешно. В момента достъпът до платформата се активира след одобрение от
            администратор.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              className="btn btn-active"
              disabled={loading}
              style={{ flex: 1, padding: '9px 12px', fontSize: '12px' }}
              onClick={async () => {
                setLoading(true);
                try {
                  await onRefreshStatus();
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? 'Проверка...' : '🔄 Провери дали е одобрен'}
            </button>

            <button
              type="button"
              className="btn"
              style={{ padding: '9px 12px', fontSize: '12px' }}
              onClick={async () => {
                await logoutUser();
                onLoggedOut();
              }}
            >
              Изход
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError('Паролите не съвпадат. Провери и опитай отново.');
      return;
    }

    setLoading(true);

    try {
      const res =
        mode === 'login'
          ? await loginUser({ email, password })
          : await registerUser({ name, email, password });

      if (!res.user) {
        throw new Error('Сървърът не върна потребителски профил.');
      }

      if (res.requiresApproval) {
        onPendingApproval(res.user, res.settings);
      } else {
        onAuthenticated(res.user, res.settings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Възникна грешка.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '6px' }}>🏠</div>
          <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 700 }}>
            3D Интериорно Студио
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
            Вход или регистрация за достъп до проектите и каталога
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            backgroundColor: '#020617',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid #1e293b',
          }}
        >
          <button
            type="button"
            className={`btn ${mode === 'login' ? 'btn-active' : ''}`}
            style={{ fontSize: '12px', padding: '7px' }}
            onClick={() => switchMode('login')}
          >
            Вход в профил
          </button>
          <button
            type="button"
            className={`btn ${mode === 'register' ? 'btn-active' : ''}`}
            style={{ fontSize: '12px', padding: '7px' }}
            onClick={() => switchMode('register')}
          >
            Нова регистрация
          </button>
        </div>

        {mode === 'register' && settings?.requireAdminApproval && (
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '11.5px',
              color: '#fde68a',
            }}
          >
            Новите регистрации в момента се активират след одобрение от администратор.
          </div>
        )}

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(244, 63, 94, 0.14)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '12px',
              color: '#fecdd3',
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          {mode === 'register' && (
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Име и фамилия / Фирма</label>
              <input
                type="text"
                required
                className="input-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="напр. Димитър Калайджиев"
              />
            </div>
          )}

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Имейл адрес</label>
            <input
              type="email"
              required
              className="input-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div style={fieldWrapStyle}>
            <label style={labelStyle}>Парола</label>
            <input
              type="password"
              required
              minLength={6}
              className="input-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символа"
            />
          </div>

          {mode === 'register' && (
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Потвърди паролата</label>
              <input
                type="password"
                required
                minLength={6}
                className="input-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Въведи паролата отново"
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-active"
            disabled={loading}
            style={{
              marginTop: '4px',
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            {loading
              ? 'Моля, изчакайте...'
              : mode === 'login'
                ? 'Влез в студиото'
                : 'Създай акаунт'}
          </button>
        </form>
      </div>
    </div>
  );
};