import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, CalendarDays, Camera, Check, Heart, Images, MapPin, Plus, Settings2, Trash2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { dayCount, daysUntil, formatDate, imageFileToDataUrl, nextOccurrence, pluralDays, uniqueId } from './data';
import type { AppData, ImportantDate, Memory, Plan } from './data';
import type { SessionSnapshot } from './api';
import AccountSettings from './AccountSettings';
import { telegramWebApp } from './telegram';

type Page = 'home' | 'memories' | 'dates' | 'profiles';
type ModalState =
  | null
  | { type: 'memory'; memory?: Memory }
  | { type: 'date'; date?: ImportantDate }
  | { type: 'plan'; plan?: Plan }
  | { type: 'detail'; memory: Memory }
  | { type: 'delete-memory'; memory: Memory }
  | { type: 'delete-item'; kind: 'dates' | 'plans'; id: string; title: string };

type AppProps = {
  session: SessionSnapshot;
  onSession: (session: SessionSnapshot) => void;
  onSave: (change: (data: AppData) => AppData) => Promise<void>;
  connected: boolean;
  onReconnect: () => void;
};

const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Главная', icon: Heart },
  { id: 'memories', label: 'История', icon: Images },
  { id: 'dates', label: 'Свидания', icon: CalendarDays },
  { id: 'profiles', label: 'Настройки', icon: Settings2 },
];
const feelings = [
  { emoji: '🥰', label: 'Влюблено' },
  { emoji: '😊', label: 'Радостно' },
  { emoji: '🫂', label: 'Обними' },
  { emoji: '🥺', label: 'Скучаю' },
  { emoji: '😴', label: 'Устало' },
];
const previousFeelingLabels: Record<string, string> = {
  'В любви': 'Влюблено',
  'Счастливо': 'Радостно',
  'Хочу обнять': 'Обними',
  'Отдыхаю': 'Устало',
};
const milestoneSteps = [10, 30, 50, 100, 150, 200, 250, 300, 365, 500, 730, 1000, 1095, 1460, 1825];
const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const routePage = (): Page => {
  const hash = window.location.hash.slice(1);
  if (hash === 'plans') return 'dates';
  return navigation.some(item => item.id === hash) ? hash as Page : 'home';
};
const nextMilestone = (days: number) => {
  const target = milestoneSteps.find(step => step > days) ?? Math.ceil((days + 1) / 365) * 365;
  const previous = [...milestoneSteps].reverse().find(step => step <= days) ?? 0;
  return { target, remaining: target - days, progress: Math.round(((days - previous) / (target - previous)) * 100) };
};
const dateText = (date: string) => formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');

function Photo({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed || !src
    ? <span className={`photo-fallback ${className}`} role="img" aria-label={alt}><Heart size={20} /></span>
    : <img className={className} src={src} alt={alt} onError={() => setFailed(true)} loading="lazy" />;
}

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const focusable = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, select');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}>
      <div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={close}><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

export default function App({ session, onSession, onSave, connected, onReconnect }: AppProps) {
  const data = session.data;
  const me = data.profiles.find(person => person.id === session.user.id) || data.profiles[0];
  const partner = data.profiles.find(person => person.id !== session.user.id);
  const [page, setPage] = useState<Page>(routePage);
  const [modal, setModal] = useState<ModalState>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [upload, setUpload] = useState('');
  const [toast, setToast] = useState('');
  const [currentDay, setCurrentDay] = useState(todayString);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const days = dayCount(data.startDate);
  const milestone = nextMilestone(days);
  const moodLabel = previousFeelingLabels[data.mood] || data.mood;
  const dates = useMemo(() => data.dates
    .map(item => ({ ...item, next: nextOccurrence(item.date, item.annual) }))
    .sort((a, b) => {
      const aPast = daysUntil(a.next) < 0;
      const bPast = daysUntil(b.next) < 0;
      return Number(aPast) - Number(bPast) || a.next.getTime() - b.next.getTime();
    }), [data.dates, currentDay]);
  const plans = useMemo(() => [...data.plans].sort((a, b) => Number(a.done) - Number(b.done) || (a.date || '9999').localeCompare(b.date || '9999')), [data.plans]);

  useEffect(() => {
    const onHash = () => { setPage(routePage()); setModal(null); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { document.title = `${navigation.find(item => item.id === page)?.label || 'Главная'} · Since Us`; }, [page]);
  useEffect(() => {
    const backButton = telegramWebApp()?.BackButton;
    if (!backButton) return;
    const goBack = () => { if (modal) setModal(null); else go('home'); };
    if (page !== 'home' || modal) backButton.show(); else backButton.hide();
    backButton.onClick(goBack);
    return () => backButton.offClick(goBack);
  }, [page, modal]);
  useEffect(() => { const timer = setInterval(() => setCurrentDay(todayString()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function go(next: Page) {
    window.location.hash = next;
    setPage(next);
    setModal(null);
    window.scrollTo(0, 0);
  }
  function open(next: ModalState) {
    if (saving) return;
    setFormError('');
    setUpload(next?.type === 'memory' ? next.memory?.image || '' : '');
    setModal(next);
  }
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }
  async function update(change: (previous: AppData) => AppData) {
    if (saving) return false;
    setSaving(true);
    setFormError('');
    try { await onSave(change); return true; }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить изменения';
      setFormError(message);
      notify(message);
      return false;
    } finally { setSaving(false); }
  }
  async function choosePhoto(file?: File) {
    if (!file) return;
    setSaving(true);
    setFormError('');
    try { setUpload(await imageFileToDataUrl(file)); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Не удалось открыть фотографию'); }
    finally { setSaving(false); }
  }
  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const value = (name: string) => String(values.get(name) || '').trim();
    let success = false;
    if (modal?.type === 'memory') {
      if (!upload) { setFormError('Добавьте фотографию'); return; }
      const memory: Memory = {
        id: modal.memory?.id || uniqueId(), title: value('title'), date: value('date'),
        image: upload, note: value('note'), location: value('location'), favorite: modal.memory?.favorite || false,
      };
      success = await update(previous => ({ ...previous, memories: modal.memory
        ? previous.memories.map(item => item.id === memory.id ? memory : item)
        : [memory, ...previous.memories] }));
    } else if (modal?.type === 'date') {
      const date: ImportantDate = {
        id: modal.date?.id || uniqueId(), title: value('title'), date: value('date'),
        emoji: modal.date?.emoji || '♡', annual: values.get('annual') === 'on',
      };
      success = await update(previous => ({ ...previous, dates: modal.date
        ? previous.dates.map(item => item.id === date.id ? date : item)
        : [...previous.dates, date] }));
    } else if (modal?.type === 'plan') {
      const plan: Plan = {
        id: modal.plan?.id || uniqueId(), title: value('title'),
        date: value('date'), category: modal.plan?.category || 'Свидание', done: modal.plan?.done || false,
      };
      success = await update(previous => ({ ...previous, plans: modal.plan
        ? previous.plans.map(item => item.id === plan.id ? plan : item)
        : [...previous.plans, plan] }));
    }
    if (success) { setModal(null); notify('Сохранено'); }
  }
  async function togglePlan(plan: Plan) {
    if (await update(previous => ({ ...previous, plans: previous.plans.map(item => item.id === plan.id ? { ...item, done: !item.done } : item) }))) notify(plan.done ? 'Вернули в планы' : 'Готово 🤍');
  }
  function editDate(date: ImportantDate) {
    if (date.id === 'date-anniversary' || date.id.startsWith('birthday:')) go('profiles');
    else open({ type: 'date', date });
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `since-us-${todayString()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="app-shell">
    <div className="app-frame">
      <header className="app-header">
        <button className="wordmark" onClick={() => go('home')} aria-label="Since Us — на главную"><span>SINCE US</span><strong>Наше место</strong></button>
        <button className="header-person" onClick={() => go('profiles')} aria-label="Открыть настройки">
          <Photo src={me.avatar} alt={me.name} />
        </button>
      </header>

      {!connected && <div className="connection-notice" role="status">Нет связи. Показаны последние данные. <button onClick={onReconnect}>Повторить</button></div>}

      <main className={`page-content page-${page}`}>
        {page === 'home' && <>
          <div className="home-topline">
            {partner ? <span className="partner-status"><span className="status-dot connected" />{me.name} и {partner.name}</span>
              : <span className="partner-status"><span className="status-dot" />Ждём партнёра</span>}
            {!partner && <button className="invite-link" onClick={() => go('profiles')}>Пригласить <ArrowRight size={15} /></button>}
          </div>
          <section className={`days-hero ${days >= 1000 ? 'is-long' : ''}`} aria-label={`${days} ${pluralDays(days)} вместе`}>
            <strong>{days}</strong>
            <span>ДНЕЙ ЛЮБВИ</span>
            <button onClick={() => go('profiles')} aria-label="Изменить дату начала отношений">Вместе с {dateText(data.startDate)}</button>
          </section>
          <section className="milestone-card" aria-labelledby="milestone-title">
            <div className="milestone-head"><span id="milestone-title">СЛЕДУЮЩИЙ ЮБИЛЕЙ</span><Heart size={18} strokeWidth={1.5} /></div>
            <strong>{milestone.target} {pluralDays(milestone.target)}</strong>
            <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={milestone.progress} aria-label="Путь до следующего юбилея"><span style={{ width: `${milestone.progress}%` }} /></div>
            <div className="milestone-foot"><span>{milestone.remaining} {pluralDays(milestone.remaining)} осталось</span><b>{milestone.progress}%</b></div>
          </section>
          <section className="heart-card" aria-labelledby="heart-title">
            <div className="heart-heading"><div><span className="section-kicker">ТИХИЙ СИГНАЛ</span><h2 id="heart-title">Как твоё сердечко?</h2></div><Heart size={20} strokeWidth={1.5} /></div>
            <p>{partner ? (data.mood && data.moodBy === partner.id ? `${partner.name}: ${moodLabel}` : data.mood && data.moodBy === me.id ? `Твой сигнал: ${moodLabel}. ${partner.name} его увидит.` : data.mood ? `Сейчас в вашей истории: ${moodLabel}` : `Выбери чувство — ${partner.name} его увидит.`) : 'Выбери чувство для вашей истории.'}</p>
            <div className="feeling-options">{feelings.map(feeling => <button key={feeling.label} className={moodLabel === feeling.label && data.moodBy === me.id ? 'selected' : ''} aria-pressed={moodLabel === feeling.label && data.moodBy === me.id} onClick={async () => { if (await update(previous => ({ ...previous, mood: feeling.label, moodBy: me.id }))) notify('Сердечко обновлено'); }} disabled={saving}><span>{feeling.emoji}</span><small>{feeling.label}</small></button>)}</div>
          </section>
        </>}

        {page === 'memories' && <>
          <div className="section-intro"><span className="section-kicker">ТО, ЧТО ОСТАЁТСЯ С НАМИ</span><h1>История</h1><p>Ваши моменты в фотографиях.</p></div>
          <button className="add-button" onClick={() => open({ type: 'memory' })}><Camera size={19} />Добавить момент <Plus size={17} /></button>
          {data.memories.length ? <div className="memory-grid">{[...data.memories].sort((a, b) => b.date.localeCompare(a.date)).map(memory => <button className="memory-tile" key={memory.id} onClick={() => open({ type: 'detail', memory })} aria-label={`Открыть момент: ${memory.title}`}><Photo src={memory.image} alt={memory.title} /><span><strong>{memory.title}</strong><small>{formatDate(memory.date)}</small></span></button>)}</div>
            : <div className="empty-state"><Images size={29} /><h2>Здесь начнётся ваша история</h2><p>Сохраните первую фотографию вместе.</p></div>}
        </>}

        {page === 'dates' && <>
          <div className="section-intro"><span className="section-kicker">ВРЕМЯ ДРУГ ДЛЯ ДРУГА</span><h1>Свидания</h1><p>Важные дни и планы на двоих.</p></div>
          <section className="list-section">
            <div className="list-heading"><h2>Наши даты</h2><button className="circle-add" onClick={() => open({ type: 'date' })} aria-label="Добавить дату"><Plus size={20} /></button></div>
            {dates.length ? <div className="simple-list">{dates.map(item => <button className="simple-row" key={item.id} onClick={() => editDate(item)}><span className="row-symbol"><Heart size={18} strokeWidth={1.5} /></span><span className="row-copy"><strong>{item.title}</strong><small>{item.next.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}{item.annual ? ' · каждый год' : ''}</small></span><span className="row-meta">{daysUntil(item.next) === 0 ? 'Сегодня' : daysUntil(item.next) > 0 ? `через ${daysUntil(item.next)} дн.` : 'прошло'}</span></button>)}</div>
              : <div className="empty-inline">Добавьте первый важный день.</div>}
          </section>
          <section className="list-section">
            <div className="list-heading"><h2>Наши планы</h2><button className="circle-add" onClick={() => open({ type: 'plan' })} aria-label="Добавить план"><Plus size={20} /></button></div>
            {plans.length ? <div className="simple-list">{plans.map(plan => <div className={`simple-row plan-row ${plan.done ? 'is-done' : ''}`} key={plan.id}><button className="plan-check" onClick={() => togglePlan(plan)} aria-label={plan.done ? `Вернуть план: ${plan.title}` : `Отметить выполненным: ${plan.title}`} aria-pressed={plan.done}>{plan.done && <Check size={14} />}</button><button className="row-copy plan-edit" onClick={() => open({ type: 'plan', plan })}><strong>{plan.title}</strong><small>{plan.date ? formatDate(plan.date) : 'Когда захочется'}</small></button><button className="row-more" onClick={() => open({ type: 'plan', plan })} aria-label={`Изменить план: ${plan.title}`}><ArrowRight size={17} /></button></div>)}</div>
              : <div className="empty-inline">Придумайте, что сделать вместе.</div>}
          </section>
        </>}

        {page === 'profiles' && <><AccountSettings session={session} onSession={onSession} /><button className="export-link" onClick={exportData}><ArrowDownToLine size={16} />Скачать историю</button></>}
      </main>
    </div>

    <nav className="bottom-nav" aria-label="Основная навигация">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}><Icon size={21} strokeWidth={1.7} fill={page === id && id === 'home' ? 'currentColor' : 'none'} /><span>{label}</span></button>)}</nav>
    {toast && <div className="toast" role="status">{toast}</div>}

    {modal && <Modal key={modal.type} title={modal.type === 'memory' ? modal.memory ? 'Изменить момент' : 'Новый момент' : modal.type === 'date' ? modal.date ? 'Изменить дату' : 'Новая дата' : modal.type === 'plan' ? modal.plan ? 'Изменить план' : 'Новый план' : modal.type === 'detail' ? modal.memory.title : 'Удалить запись?'} close={() => { if (!saving) setModal(null); }}>
      {(modal.type === 'memory' || modal.type === 'date' || modal.type === 'plan') && <form className="edit-form" onSubmit={saveForm}>
        {modal.type === 'memory' && <>
          <label className={`upload-zone ${upload ? 'has-photo' : ''}`}>{upload ? <Photo src={upload} alt="Выбранная фотография" /> : <><Camera size={28} /><span>Добавить фотографию</span></>}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Загрузить фотографию" onChange={event => choosePhoto(event.target.files?.[0])} disabled={saving} /></label>
          <label>Название<input name="title" required maxLength={80} defaultValue={modal.memory?.title} placeholder="Наш маленький момент" /></label>
          <label>Дата<input type="date" name="date" required max={todayString()} defaultValue={modal.memory?.date || todayString()} /></label>
          <label>Место <small>необязательно</small><input name="location" maxLength={80} defaultValue={modal.memory?.location} placeholder="Где это было" /></label>
          <label>Что хочется запомнить <small>необязательно</small><textarea name="note" rows={3} maxLength={1500} defaultValue={modal.memory?.note} placeholder="Пара слов об этом дне" /></label>
        </>}
        {modal.type === 'date' && <>
          <label>Что за день?<input name="title" required maxLength={80} defaultValue={modal.date?.title} placeholder="Наш первый поцелуй" /></label>
          <label>Когда?<input type="date" name="date" required defaultValue={modal.date?.date || todayString()} /></label>
          <label className="checkbox-label"><input type="checkbox" name="annual" defaultChecked={modal.date?.annual ?? true} />Повторять каждый год</label>
        </>}
        {modal.type === 'plan' && <>
          <label>Что сделаем вместе?<input name="title" required maxLength={100} defaultValue={modal.plan?.title} placeholder="Прогулка у воды" /></label>
          <label>Когда? <small>необязательно</small><input type="date" name="date" defaultValue={modal.plan?.date || ''} /></label>
        </>}
        {((modal.type === 'date' && modal.date) || (modal.type === 'plan' && modal.plan)) && <button type="button" className="delete-link" onClick={() => { if (modal.type === 'date' && modal.date) open({ type: 'delete-item', kind: 'dates', id: modal.date.id, title: modal.date.title }); if (modal.type === 'plan' && modal.plan) open({ type: 'delete-item', kind: 'plans', id: modal.plan.id, title: modal.plan.title }); }}><Trash2 size={15} />Удалить</button>}
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
      </form>}
      {modal.type === 'detail' && <div className="memory-detail"><Photo src={modal.memory.image} alt={modal.memory.title} /><span>{dateText(modal.memory.date)}{modal.memory.location && <> · <MapPin size={13} /> {modal.memory.location}</>}</span>{modal.memory.note && <p>{modal.memory.note}</p>}<div className="detail-actions"><button className="secondary-button" onClick={() => open({ type: 'memory', memory: modal.memory })}>Изменить</button><button className="delete-link" onClick={() => open({ type: 'delete-memory', memory: modal.memory })} aria-label="Удалить момент"><Trash2 size={17} /></button></div></div>}
      {modal.type === 'delete-memory' && <div className="confirm-delete"><p>Удалить «{modal.memory.title}» из истории?</p><div><button className="secondary-button" onClick={() => open({ type: 'detail', memory: modal.memory })}>Оставить</button><button className="danger-button" disabled={saving} onClick={async () => { if (await update(previous => ({ ...previous, memories: previous.memories.filter(item => item.id !== modal.memory.id) }))) { setModal(null); notify('Момент удалён'); } }}>Удалить</button></div></div>}
      {modal.type === 'delete-item' && <div className="confirm-delete"><p>Удалить «{modal.title}»?</p><div><button className="secondary-button" onClick={() => setModal(null)}>Оставить</button><button className="danger-button" disabled={saving} onClick={async () => { if (await update(previous => ({ ...previous, [modal.kind]: previous[modal.kind].filter(item => item.id !== modal.id) }))) { setModal(null); notify('Запись удалена'); } }}>Удалить</button></div></div>}
    </Modal>}
  </div>;
}
