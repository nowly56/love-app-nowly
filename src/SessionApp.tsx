import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, RefreshCw, WifiOff } from 'lucide-react';
import App from './App';
import AuthScreen from './AuthScreen';
import { api, ApiError } from './api';
import type { SessionSnapshot } from './api';
import type { AppData } from './data';
import { telegramInitData } from './telegram';
import './session.css';

export default function SessionApp() {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(true);
  const sessionRef = useRef<SessionSnapshot | null>(null);
  const saving = useRef(false);
  const epoch = useRef(0);

  const accept = useCallback((next: SessionSnapshot) => {
    const current = sessionRef.current;
    if (current && current.user.id === next.user.id && current.spaceId === next.spaceId && next.revision < current.revision) return;
    if (current && (current.user.id !== next.user.id || current.spaceId !== next.spaceId)) epoch.current++;
    // Recovery codes are displayed once by AuthScreen and never retained with application state.
    const clean = { user: next.user, data: next.data, revision: next.revision, spaceId: next.spaceId };
    sessionRef.current = clean;
    setSession(clean);
    setConnected(true);
    setError('');
  }, []);

  const clear = useCallback(() => {
    epoch.current++;
    sessionRef.current = null;
    setSession(null);
    setError('');
    window.location.hash = '';
  }, []);

  const refresh = useCallback(async (initial = false) => {
    const generation = epoch.current;
    try {
      const initData = initial ? telegramInitData() : '';
      if (initData) {
        try {
          const telegramSession = await api<SessionSnapshot>('/api/telegram/auth', { initData });
          if (generation === epoch.current) accept(telegramSession);
          return;
        } catch (telegramError) {
          if (!(telegramError instanceof ApiError) || ![401, 503].includes(telegramError.status)) throw telegramError;
          // A first-time Telegram visitor signs in or registers below; expired initData may still have a valid cookie.
        }
      }
      const next = await api<SessionSnapshot>('/api/session');
      if (generation === epoch.current) accept(next);
    } catch (err) {
      if (generation !== epoch.current) return;
      if (err instanceof ApiError && err.status === 401) clear();
      else {
        setConnected(false);
        if (initial) setError(err instanceof Error ? err.message : 'Не удалось открыть приложение');
      }
    } finally { if (initial) setLoading(false); }
  }, [accept, clear]);

  useEffect(() => { void refresh(true); }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const poll = () => { if (!document.hidden && !saving.current) void refresh(); };
    const timer = setInterval(poll, 6000);
    window.addEventListener('online', poll);
    document.addEventListener('visibilitychange', poll);
    return () => { clearInterval(timer); window.removeEventListener('online', poll); document.removeEventListener('visibilitychange', poll); };
  }, [!!session, refresh]);

  async function save(change: (data: AppData) => AppData) {
    if (saving.current) throw new Error('Предыдущее изменение ещё сохраняется. Повторите через секунду.');
    const current = sessionRef.current;
    if (!current) throw new Error('Сначала войдите в аккаунт');
    saving.current = true;
    try {
      const next = await api<SessionSnapshot>('/api/data', { revision: current.revision, data: change(current.data) });
      accept(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clear();
      else if (err instanceof ApiError && err.status === 409) await refresh();
      else if (err instanceof ApiError && err.status === 0) setConnected(false);
      throw err;
    } finally { saving.current = false; }
  }

  async function logout() {
    await api('/api/logout', {});
    clear();
  }

  if (loading) return <div className="session-screen" role="status"><Heart className="session-heart" size={40} fill="currentColor" /><h1>ближе.</h1><p>Открываем ваше пространство…</p></div>;
  if (error && !session) return <div className="session-screen"><WifiOff size={36} /><h1>Давайте снова попробуем</h1><p role="alert">{error}</p><button className="primary-button" onClick={() => { setLoading(true); void refresh(true); }}><RefreshCw size={17} />Повторить</button></div>;
  if (!session) return <AuthScreen onAuthenticated={next => {
    const initData = telegramInitData();
    if (initData) void api<SessionSnapshot>('/api/telegram/auth', { initData }).then(linked => { epoch.current++; accept(linked); }).catch(() => { epoch.current++; accept(next); });
    else { epoch.current++; accept(next); }
  }} />;
  return <App key={`${session.user.id}:${session.spaceId}`} session={session} onSession={accept} onSave={save} onLogout={logout} connected={connected} onReconnect={() => { void refresh(); }} />;
}
