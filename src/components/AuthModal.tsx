import React, { useState } from 'react';
import type { AuthUser, SystemSettings } from '../types/auth';
import { loginUser, registerUser } from '../utils/apiClient';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (user: AuthUser, settings?: SystemSettings) => void | Promise<void>;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 250,
  backgroundColor: 'rgba(2, 6, 23, 0.82)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '410px',
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '22px',
  color: '#f8fafc',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.75)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError(null);
    setInfoMessage(null);
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError('Паролите не съвпадат.');
      return;
    }

    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await loginUser({ email, password })
          : await registerUser({ name, email, password });

      if (res.requiresApproval) {
        setInfoMessage(
          'Регистрацията е успешна! Профилът ви очаква одобрение от администратор.'
        );
        return;
      }

      if (!res.user) {
        throw new Error('Неуспешно зареждане на профила.');
      }

      await onAuthenticated(res.user, res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Възникна грешка.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '17px' }}>
            {mode === 'login' ? 'Вход в акаунт' : 'Нова регистрация'}
          </h2>
          <button
            type="button"
            className="btn"
            style={{ padding: '4px 8px', fontSize: '12px' }}
            onClick={onClose}
          >
            ✕
          </button>
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
            onClick={() => switchMode('login')}
          >
            Вход
          </button>
          <button
            type="button"
            className={`btn ${mode === 'register' ? 'btn-active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Регистрация
          </button>
        </div>

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

        {infoMessage && (
          <div
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '8px',
              padding: '8px 10px',
              fontSize: '12px',
              color: '#a7f3d0',
            }}
          >
            {infoMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {mode === 'register' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', color: '#94a3b8' }}>Име / Фирма</label>
              <input
                type="text"
                required
                className="input-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Име и фамилия"
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', color: '#94a3b8' }}>Имейл адрес</label>
            <input
              type="email"
              required
              className="input-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', color: '#94a3b8' }}>Парола</label>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', color: '#94a3b8' }}>Потвърди паролата</label>
              <input
                type="password"
                required
                minLength={6}
                className="input-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повтори паролата"
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-active"
            disabled={loading}
            style={{ marginTop: '4px', padding: '9px', fontWeight: 700 }}
          >
            {loading
              ? 'Изчакайте...'
              : mode === 'login'
                ? 'Влез в акаунта'
                : 'Регистрирай се'}
          </button>
        </form>
      </div>
    </div>
  );
};