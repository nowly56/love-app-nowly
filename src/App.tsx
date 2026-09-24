import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, Bell, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Coffee, Heart, HeartHandshake, ImagePlus, Images, MapPin, MessageCircle, Plus, Search, Send, Settings2, ShieldCheck, Smile, Sparkles, Sun, Trash2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { dayCount, daysUntil, eventOccursOn, formatDate, imageFileToDataUrl, nextOccurrence, pluralDays, uniqueId } from './data';
import type { AppData, ImportantDate, Memory, Plan } from './data';
import type { SessionSnapshot } from './api';
import AccountSettings from './AccountSettings';
import { telegramWebApp } from './telegram';

type Page = 'home' | 'memories' | 'dates' | 'plans' | 'chat' | 'profiles';
type ModalState = null | { type: 'memory'; memory?: Memory } | { type: 'date'; date?: ImportantDate } | { type: 'plan'; title?: string; plan?: Plan } | { type: 'profile' } | { type: 'notifications' } | { type: 'detail'; memory: Memory } | { type: 'delete'; memory: Memory } | { type: 'delete-item'; kind: 'dates' | 'plans'; id: string; title: string };
const navigation: { id: Page; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Наше пространство', short: 'Главная', icon: Heart },
  { id: 'memories', label: 'Моменты', short: 'Моменты', icon: Images },
  { id: 'dates', label: 'Важные даты', short: 'Даты', icon: CalendarDays },
  { id: 'plans', label: 'Планы на двоих', short: 'Планы', icon: Sparkles },
  { id: 'chat', label: 'Наш чат', short: 'Чат', icon: MessageCircle },
];
const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dateLabel = (date: Date) => date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const countdown = (date: Date) => {
  const days = daysUntil(date);
  return days === 0 ? 'Сегодня' : days === 1 ? 'Завтра' : days < 0 ? 'Уже в нашей истории' : `Через ${days} ${pluralDays(days)}`;
};
const noun = (n: number, one: string, few: string, many: string) => n % 100 >= 11 && n % 100 <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many;

function Photo({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed || !src ? <span className={`photo-fallback ${className}`} role="img" aria-label={alt}><Heart /></span> : <img className={className} src={src} alt={alt} onError={() => setFailed(true)} loading="lazy" />;
}

function SectionHeading({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}</div>;
}

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const priorFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const elements = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, select, [tabindex="0"]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', listener); priorFocus?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="modal glass" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={close}><X size={20} /></button></div>{children}</div></div>;
}

type AppProps = {
  session: SessionSnapshot;
  onSession: (session: SessionSnapshot) => void;
  onSave: (change: (data: AppData) => AppData) => Promise<void>;
  onLogout: () => Promise<void>;
  connected: boolean;
  onReconnect: () => void;
};
function routePage(): Page {
  const page = window.location.hash.slice(1);
  return ['home', 'memories', 'dates', 'plans', 'chat', 'profiles'].includes(page) ? page as Page : 'home';
}
export default function App({ session, onSession, onSave, onLogout, connected, onReconnect }: AppProps) {
  const data = session.data;
  const me = data.profiles.find(person => person.id === session.user.id) || data.profiles[0];
  const [page, setPage] = useState<Page>(routePage);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [planTab, setPlanTab] = useState('upcoming');
  const [chatText, setChatText] = useState('');
  const [emojisOpen, setEmojisOpen] = useState(false);
  const senderId = session.user.id;
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [upload, setUpload] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState('');
  const [currentDay, setCurrentDay] = useState(todayString);
  const completedCount = data.plans.filter(item => item.done).length;
  const messagesEnd = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const days = dayCount(data.startDate);
  const upcoming = useMemo(() => data.dates.map(item => ({ ...item, next: nextOccurrence(item.date, item.annual) })).filter(item => daysUntil(item.next) >= 0).sort((a, b) => a.next.getTime() - b.next.getTime()), [data.dates, currentDay]);
  const activePlans = data.plans.filter(item => !item.done);
  const together = data.profiles.length === 1 ? me.name + ' · ваша история' : data.profiles.map(person => person.name).join(' и ');

  useEffect(() => {
    const listener = () => { setPage(routePage()); setSelectedDay(''); setModal(null); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => { document.title = (page === 'profiles' ? 'Профиль' : navigation.find(item => item.id === page)?.label || 'Главная') + ' · ближе'; }, [page]);

  useEffect(() => {
    const backButton = telegramWebApp()?.BackButton;
    if (!backButton) return;
    const goBack = () => { if (modal) setModal(null); else go('home'); };
    if (page !== 'home' || modal) backButton.show(); else backButton.hide();
    backButton.onClick(goBack);
    return () => backButton.offClick(goBack);
  }, [page, modal]);

  useEffect(() => { const timer = setInterval(() => setCurrentDay(todayString()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (page === 'chat') messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [page, data.messages.length]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3800);
  }
  async function update(change: (previous: AppData) => AppData) {
    if (saving) return false;
    setSaving(true); setFormError('');
    try { await onSave(change); return true; }
    catch (error) { const message = error instanceof Error ? error.message : 'Не удалось сохранить изменения'; setFormError(message); notify(message); return false; }
    finally { setSaving(false); }
  }
  function go(next: Page) { window.location.hash = next; setPage(next); setSelectedDay(''); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function open(next: ModalState) { if (saving) return; if (next?.type === 'profile') { setModal(null); go('profiles'); return; } setFormError(''); setUpload(next?.type === 'memory' ? next.memory?.image || '' : ''); setModal(next); }
  function toggleFavorite(memory: Memory) { update(previous => ({ ...previous, memories: previous.memories.map(item => item.id === memory.id ? { ...item, favorite: !item.favorite } : item) })); }
  async function togglePlan(plan: Plan) {
    if (await update(previous => ({ ...previous, plans: previous.plans.map(item => item.id === plan.id ? { ...item, done: !item.done } : item) }))) notify(plan.done ? 'План снова в вашем списке' : 'Ещё один прекрасный момент вместе ♡');
  }
  async function choosePhoto(file?: File) {
    if (!file) return;
    setSaving(true); setFormError('');
    try { setUpload(await imageFileToDataUrl(file)); } catch (error) { setFormError(error instanceof Error ? error.message : 'Не удалось открыть фотографию'); } finally { setSaving(false); }
  }
  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const value = (name: string) => String(values.get(name) || '').trim();
    let success = false;
    if (modal?.type === 'memory') {
      if (!value('title')) { setFormError('Добавьте название момента'); return; }
      if (!upload) { setFormError('Выберите фотографию для вашего момента'); return; }
      const memory: Memory = { id: modal.memory?.id || uniqueId(), title: value('title'), date: value('date'), image: upload, note: value('note'), location: value('location'), favorite: modal.memory?.favorite || false };
      success = await update(previous => ({ ...previous, memories: modal.memory ? previous.memories.map(item => item.id === memory.id ? memory : item) : [memory, ...previous.memories] }));
    } else if (modal?.type === 'date') {
      if (!value('title')) { setFormError('Добавьте название события'); return; }
      const date: ImportantDate = { id: modal.date?.id || uniqueId(), title: value('title'), date: value('date'), emoji: value('emoji'), annual: values.get('annual') === 'on' };
      success = await update(previous => ({ ...previous, dates: modal.date ? previous.dates.map(item => item.id === date.id ? date : item) : [...previous.dates, date] }));
    } else if (modal?.type === 'plan') {
      if (!value('title')) { setFormError('Напишите, что хотите сделать вместе'); return; }
      const plan: Plan = { id: modal.plan?.id || uniqueId(), title: value('title'), date: value('date'), category: value('category'), done: modal.plan?.done || false };
      success = await update(previous => ({ ...previous, plans: modal.plan ? previous.plans.map(item => item.id === plan.id ? plan : item) : [...previous.plans, plan] }));
    }
    if (success) { setModal(null); notify('Сохранено в вашей истории ♡'); }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!chatText.trim()) return;
    if (await update(previous => ({ ...previous, messages: [...previous.messages, { id: uniqueId(), text: chatText.trim(), senderId, createdAt: new Date().toISOString() }] }))) { setChatText(''); setEmojisOpen(false); }
  }
  function editDate(item: ImportantDate) {
    if (item.id === 'date-anniversary' || item.id.startsWith('birthday:')) open({ type: 'profile' });
    else open({ type: 'date', date: item });
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `blizhe-${todayString()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Ваша история выгружена в файл');
  }

  const pageTitles: Record<Page, { eyebrow: string; title: string; subtitle: string }> = {
    home: { eyebrow: 'ВАШЕ МЕСТО СИЛЫ', title: 'Быть ближе. Каждый день.', subtitle: 'Маленькие моменты, из которых складывается любовь.' },
    memories: { eyebrow: 'МАЛЕНЬКИЕ МОМЕНТЫ. БОЛЬШАЯ ЛЮБОВЬ.', title: 'Это всё — наше', subtitle: 'Сохраняйте то, к чему хочется возвращаться.' },
    dates: { eyebrow: 'У КАЖДОЙ ИСТОРИИ СВОИ ДАТЫ', title: 'Помнить о главном', subtitle: 'Особенные дни, которые принадлежат только вам.' },
    plans: { eyebrow: 'САМОЕ ИНТЕРЕСНОЕ ЕЩЁ ВПЕРЕДИ', title: 'Давай вместе', subtitle: 'Большие мечты и маленькие планы на двоих.' },
    chat: { eyebrow: 'СЛОВА, КОТОРЫЕ СОГРЕВАЮТ', title: 'Между нами', subtitle: 'Для «скучаю», «люблю» и всего на свете.' },
    profiles: { eyebrow: 'ДВА ЧЕЛОВЕКА. ОДНА ИСТОРИЯ.', title: 'Ты, я и наше счастье', subtitle: 'Всё начинается с вас.' },
  };

  const calendarCells = (() => {
    const offset = (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7;
    const total = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + total) / 7) * 7 }, (_, i) => { const day = i - offset + 1; return day > 0 && day <= total ? day : null; });
  })();

  return <div className="app-shell">
    <aside className="sidebar glass">
      <button className="brand" onClick={() => go('home')} aria-label="Ближе — на главную"><span className="brand-symbol"><Heart fill="currentColor" strokeWidth={0} /></span><span>ближе<span className="brand-dot">.</span></span></button>
      <p className="brand-caption">ваше пространство для двоих</p>
      <div className="sidebar-divider" />
      <span className="nav-heading">НАША ИСТОРИЯ</span>
      <nav aria-label="Основная навигация">{navigation.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => go(id)} title={label} aria-label={label} aria-current={page === id ? 'page' : undefined}><Icon size={20} strokeWidth={1.7} /><span>{label}</span>{id === 'chat' && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><div className="little-hearts"><Heart size={28} strokeWidth={1.1} /><Heart size={18} strokeWidth={1.3} /></div><p>Любовь складывается<br />из маленьких моментов.</p><span>Берегите ваши ♡</span></div><button className={`couple-button ${page === 'profiles' ? 'selected' : ''}`} onClick={() => go('profiles')}><div className="avatar-stack">{data.profiles.map(person => <Photo key={person.id} src={person.avatar} alt={person.name} />)}</div><span><strong>{together}</strong><small>Наши профили</small></span><ChevronRight size={16} /></button></div>
    </aside>

    <div className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Наше пространство</span><span>/</span><strong>{page === 'home' ? 'Главная' : page === 'profiles' ? 'Профили' : navigation.find(item => item.id === page)?.label}</strong></div><button className="mobile-brand" onClick={() => go('home')}><Heart fill="currentColor" size={24} />ближе.</button><div className="topbar-right"><span className="today"><Sun size={17} />{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })}</span><button className="icon-button notification-button" aria-label="Ближайшие события" onClick={() => open({ type: 'notifications' })}><Bell size={19} />{upcoming.some(item => daysUntil(item.next) <= 7) && <span />}</button><button className="header-avatar" aria-label="Открыть наши профили" onClick={() => go('profiles')}><Photo src={me.avatar} alt={me.name} /></button></div></header>

      <main className={`page-content page-${page}`} key={page}>
        {!connected && <div className="connection-notice" role="status"><span>Нет связи. Отображаются последние загруженные данные.</span><button onClick={onReconnect}>Подключиться снова</button></div>}
        {page !== 'profiles' && <div className="page-heading"><div><div className="eyebrow">{page === 'home' ? <>ПРИВЕТ, {me.name.toLocaleUpperCase('ru')} <span className="greeting-sparkle">✦</span></> : pageTitles[page].eyebrow}</div><h1>{pageTitles[page].title}{page === 'home' && <span className="heading-heart">♡</span>}</h1><p>{pageTitles[page].subtitle}</p></div>{page === 'home' && <span className="private-badge"><Heart size={13} />Ваша история. Ваш ритм.</span>}{page === 'memories' && <button className="primary-button" onClick={() => open({ type: 'memory' })}><Plus size={17} />Добавить момент</button>}{page === 'dates' && <button className="primary-button" onClick={() => open({ type: 'date' })}><Plus size={17} />Добавить дату</button>}{page === 'plans' && <button className="primary-button" onClick={() => open({ type: 'plan' })}><Plus size={17} />Новый план</button>}</div>}

        {page === 'home' && <>
          {data.profiles.length === 1 && <section className="welcome-card"><HeartHandshake size={28} /><div><h2>Ваша история начинается здесь</h2><p>Добавьте аватарку, укажите день, когда вы встретились, и пригласите любимого человека.</p></div><button className="secondary-button" onClick={() => go('profiles')}>Настроить профиль<ArrowRight size={15} /></button></section>}
          <div className="dashboard-grid"><div className="dashboard-main"><section className="love-hero"><img className="hero-landscape" src="/photos/sunset.jpg" alt="Тёплый закат над морем" fetchPriority="high" /><div className="hero-shade" /><div className="hero-topline"><button className="hero-couple glass" onClick={() => go('profiles')}><div className="avatar-stack">{data.profiles.map(person => <Photo key={person.id} src={person.avatar} alt={person.name} />)}</div><span>{together}</span><Heart size={13} fill="currentColor" /></button><button className="hero-edit glass" aria-label="Изменить дату отношений" onClick={() => open({ type: 'profile' })}><Settings2 size={18} /></button></div><div className="hero-poem"><span>НАША ЛЮБИМАЯ ИСТОРИЯ</span><h2>В целом мире.<br /><em>Только мы.</em></h2><p>И каждый новый день — ещё одна глава.</p></div><div className="hero-dayglass glass"><div className="day-counter"><strong>{days}</strong><div><span>{pluralDays(days)} вместе</span><small>и столько всего впереди</small></div></div><div className="hero-date"><span className="hero-date-heart"><Heart size={21} strokeWidth={1.2} /></span><span>Наше начало<small>{formatDate(data.startDate, { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '')}</small></span></div></div></section>
          <div className="stats-grid"><div className="stat-card"><span className="stat-icon pink"><Camera size={21} strokeWidth={1.6} /></span><div><strong>{data.memories.length}<span>{noun(data.memories.length, 'момент', 'момента', 'моментов')}</span></strong><small>сохранено с любовью</small></div></div><div className="stat-card"><span className="stat-icon lavender"><Sparkles size={21} strokeWidth={1.6} /></span><div><strong>{completedCount}<span>{noun(completedCount, 'план', 'плана', 'планов')}</span></strong><small>воплотили вместе</small></div><span className="stat-decoration">✧</span></div><div className="stat-card"><span className="stat-icon peach"><CalendarDays size={21} strokeWidth={1.6} /></span><div><strong>{data.dates.length}<span>{noun(data.dates.length, 'особая дата', 'особые даты', 'особых дат')}</span></strong><small>в вашей истории</small></div><span className="stat-decoration">✧</span></div></div>
          </div><aside className="upcoming-card panel"><SectionHeading title="Поводы для счастья"><button className="subtle-icon" aria-label="Все важные даты" onClick={() => go('dates')}><ArrowUpRightIcon /></button></SectionHeading><div className="upcoming-list">{upcoming.slice(0, 3).map(item => <DateItem onEdit={editDate} key={item.id} item={item} />)}{!upcoming.length && <p className="muted">Добавьте первую особенную дату.</p>}</div><button className="dashed-button" onClick={() => open({ type: 'date' })}><Plus size={15} />Добавить важную дату</button><div className="date-card-footer"><Heart size={12} /><span>У счастья есть свои даты</span></div></aside></div>

          <section className="moments-section"><SectionHeading title="Сохранить. И улыбнуться." subtitle="Ваши маленькие «помнишь, как…»"><button className="text-button" onClick={() => go('memories')}>Все моменты<ArrowRight size={16} /></button></SectionHeading><div className="moments-preview">{data.memories.slice(0, 3).map((memory, index) => <MemoryCard onOpen={open} onFavorite={toggleFavorite} key={memory.id} memory={memory} index={index} />)}<button className="add-memory-card" onClick={() => open({ type: 'memory' })}><span className="add-memory-icon"><Plus size={25} strokeWidth={1.4} /></span><strong>Ещё один счастливый<br />момент</strong><span>Сохраните его здесь</span><span className="tiny-heart">♡</span></button></div></section>

          <div className="bottom-grid"><section className="plans-card panel"><SectionHeading title="Давай сделаем это вместе"><button className="text-button" onClick={() => go('plans')}>Все планы<ArrowRight size={15} /></button></SectionHeading>{activePlans.slice(0, 2).map(plan => <PlanItem onToggle={togglePlan} onEdit={plan => open({ type: 'plan', plan })} key={plan.id} plan={plan} />)}{!activePlans.length && <p className="muted">Самое время придумать что-нибудь вместе.</p>}<button className="inline-add" onClick={() => open({ type: 'plan' })}><Plus size={16} />Запланировать что-то хорошее</button></section><section className="mood-card"><div className="mood-title"><span className="mood-flower">✿</span><div><h2>Как твоё сердечко?</h2><p>Поделись своим настроением</p></div></div><div className="mood-options">{[{ emoji: '🥰', text: 'В любви' }, { emoji: '😊', text: 'Счастливо' }, { emoji: '🫂', text: 'Хочу обнять' }, { emoji: '🥺', text: 'Скучаю' }, { emoji: '😴', text: 'Отдыхаю' }].map(mood => <button key={mood.text} className={data.mood === mood.text ? 'selected' : ''} aria-label={mood.text} aria-pressed={data.mood === mood.text} onClick={async () => { if (await update(previous => ({ ...previous, mood: mood.text }))) notify(`Сегодня твоё сердечко: ${mood.text.toLowerCase()}`); }}><span>{mood.emoji}</span><small>{mood.text}</small></button>)}</div></section></div><div className="page-footer"><Heart size={12} />Создавайте вашу историю. Каждый день.</div>
        </>}

        {page === 'memories' && <><div className="toolbar"><div className="segmented"><button className={!favoriteOnly ? 'active' : ''} onClick={() => setFavoriteOnly(false)}>Все моменты <span>{data.memories.length}</span></button><button className={favoriteOnly ? 'active' : ''} onClick={() => setFavoriteOnly(true)}><Heart size={14} />Избранное</button></div><label className="search-box"><Search size={17} /><input placeholder="Найти тот самый момент" aria-label="Поиск моментов" value={search} onChange={e => setSearch(e.target.value)} /></label></div><div className="memories-grid">{data.memories.filter(memory => (!favoriteOnly || memory.favorite) && `${memory.title} ${memory.location} ${memory.note}`.toLowerCase().includes(search.toLowerCase())).map((memory, index) => <MemoryCard onOpen={open} onFavorite={toggleFavorite} key={memory.id} memory={memory} index={index} />)}</div>{!data.memories.some(memory => (!favoriteOnly || memory.favorite) && `${memory.title} ${memory.location} ${memory.note}`.toLowerCase().includes(search.toLowerCase())) && <Empty icon={Images} title={search ? 'Пока ничего не нашлось' : 'Здесь будут ваши любимые моменты'} text={search ? 'Попробуйте другое название или место.' : 'Нажмите на сердечко у фотографии или добавьте новый момент.'} />}</>}

        {page === 'dates' && <div className="dates-layout"><section className="panel calendar-panel"><div className="calendar-heading"><h2>{calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '')}</h2><div><button className="icon-button" aria-label="Предыдущий месяц" onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)); setSelectedDay(''); }}><ChevronLeft size={18} /></button><button className="icon-button" aria-label="Следующий месяц" onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)); setSelectedDay(''); }}><ChevronRight size={18} /></button></div></div><div className="calendar-grid">{['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(day => <span key={day} className="weekday">{day}</span>)}{calendarCells.map((day, index) => { const iso = day ? `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''; const hasEvent = data.dates.some(item => eventOccursOn(item.date, item.annual, iso)); return day ? <button key={index} className={`calendar-day ${iso === todayString() ? 'is-today' : ''} ${selectedDay === iso ? 'selected' : ''} ${hasEvent ? 'has-event' : ''}`} onClick={() => setSelectedDay(selectedDay === iso ? '' : iso)} aria-label={`${day} ${calendarMonth.toLocaleDateString('ru-RU', { month: 'long' })}${hasEvent ? ', есть событие' : ''}`}>{day}{hasEvent && <i />}</button> : <span key={index} />; })}</div><div className="calendar-legend"><span />Ваши особенные дни<button onClick={() => { setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelectedDay(''); }}>Сегодня</button></div>{selectedDay && <div className="selected-date-details"><h3>{formatDate(selectedDay)}</h3>{data.dates.filter(item => eventOccursOn(item.date, item.annual, selectedDay)).map(item => <p key={item.id}>{item.emoji} {item.title}</p>)}{!data.dates.some(item => eventOccursOn(item.date, item.annual, selectedDay)) && <p>В этот день пока нет событий. Можно придумать своё ♡</p>}</div>}</section><section className="panel all-dates"><SectionHeading title="Есть повод быть ближе" subtitle="Ваши ближайшие события" />{upcoming.map(item => <DateItem onEdit={editDate} key={item.id} item={item} />)}{!upcoming.length && <Empty icon={CalendarDays} title="Впереди столько поводов" text="Добавьте вашу первую важную дату." />}{data.dates.filter(item => !item.annual && daysUntil(nextOccurrence(item.date, false)) < 0).map(item => <DateItem onEdit={editDate} key={item.id} item={{ ...item, next: nextOccurrence(item.date, false) }} />)}</section></div>}

        {page === 'plans' && <div className="plans-layout"><div><div className="segmented plan-tabs"><button className={planTab === 'upcoming' ? 'active' : ''} onClick={() => setPlanTab('upcoming')}>Впереди <span>{activePlans.length}</span></button><button className={planTab === 'done' ? 'active' : ''} onClick={() => setPlanTab('done')}>Уже сделали <span>{data.plans.filter(item => item.done).length}</span></button></div><section className="panel full-plan-list">{data.plans.filter(plan => planTab === 'done' ? plan.done : !plan.done).map(plan => <PlanItem onToggle={togglePlan} onEdit={plan => open({ type: 'plan', plan })} key={plan.id} plan={plan} />)}{!data.plans.some(plan => planTab === 'done' ? plan.done : !plan.done) && <Empty icon={Sparkles} title={planTab === 'done' ? 'Ваши приключения ещё впереди' : 'Чего хочется вам двоим?'} text={planTab === 'done' ? 'Отмечайте выполненные планы — они появятся здесь.' : 'Добавьте что-то маленькое или начните с большой мечты.'} action={<button className="primary-button" onClick={() => open({ type: 'plan' })}><Plus size={16} />Добавить план</button>} />}</section></div><aside className="date-idea"><span className="idea-eyebrow"><Sparkles size={14} />ИДЕЯ ДЛЯ ВАС</span><div className="idea-illustration"><Coffee size={70} strokeWidth={1} /><Heart size={33} strokeWidth={1.3} /></div><h2>Вечер без спешки.<br />И без телефонов.</h2><p>Приготовьте любимый ужин, зажгите свечи и просто побудьте друг с другом.</p><button className="primary-button" onClick={() => open({ type: 'plan', title: 'Свидание без телефонов' })}><Plus size={16} />Давай так и сделаем</button><span className="idea-footnote">Лучшие планы — простые</span></aside></div>}

        {page === 'chat' && <section className="chat-panel panel"><div className="chat-header"><div className="avatar-stack">{data.profiles.map(person => <Photo key={person.id} src={person.avatar} alt={person.name} />)}</div><div><h2>{together}</h2><p>Ваш уютный уголок</p></div><Heart size={20} className="chat-header-heart" /></div><div className="chat-local-note"><ShieldCheck size={14} />Ваш общий чат · обновляется автоматически</div><div className="messages"><span className="chat-day-label">Самые тёплые слова — простые</span>{!data.messages.length && <div className="chat-empty"><MessageCircle size={32} strokeWidth={1.3} /><p>{data.profiles.length < 2 ? 'Пригласите партнёра в профиле, чтобы переписываться здесь. Первое сообщение уже можно оставить.' : 'Напишите первое сообщение. Маленькое «люблю» — хорошее начало.'}</p></div>}{data.messages.map(message => { const person = data.profiles.find(profile => profile.id === message.senderId); const mine = message.senderId === senderId; return <div key={message.id} className={`message-row ${mine ? 'mine' : ''}`}>{!mine && <Photo src={person?.avatar || ''} alt={person?.name || ''} className="message-avatar" />}<div className="message-bubble">{!mine && <strong>{person?.name}</strong>}<p>{message.text}</p><span>{new Date(message.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{mine && <Check size={12} aria-label="Сохранено" />}</span></div></div>; })}<div ref={messagesEnd} /></div><div className="chat-compose-area"><div className="sender-label">Пишете вы: <strong>{me.name}</strong><span>{connected ? 'На связи' : 'Нет соединения'}</span></div>{emojisOpen && <div className="emoji-picker">{['❤️', '🥰', '😘', '🫂', '✨', '🌷', '💌', '🤍'].map(emoji => <button key={emoji} onClick={() => setChatText(text => text + emoji)} aria-label={`Добавить ${emoji}`}>{emoji}</button>)}</div>}<form className="chat-composer" onSubmit={sendMessage}><button type="button" className="icon-button" aria-label="Добавить эмодзи" onClick={() => setEmojisOpen(value => !value)}><Smile size={22} /></button><input value={chatText} onChange={e => setChatText(e.target.value)} maxLength={4000} placeholder="Напиши что-нибудь тёплое…" aria-label="Сообщение" /><button className="send-button" disabled={!chatText.trim() || saving} aria-label="Отправить сообщение"><Send size={19} /></button></form></div></section>}

        {page === 'profiles' && <><AccountSettings session={session} onSession={onSession} onLogout={onLogout} /><section className="profile-export panel"><p>Сохраните вашу историю отдельным файлом.</p><button className="text-button" onClick={exportData}><ArrowDownToLine size={16} />Скачать резервную копию</button></section></>}
      </main>
    </div>

    <nav className="mobile-nav glass" aria-label="Мобильная навигация">{navigation.map(({ id, short, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}><Icon size={21} strokeWidth={page === id ? 2.1 : 1.7} fill={page === id && id === 'home' ? 'currentColor' : 'none'} /><span>{short}</span></button>)}</nav>
    {toast && <div className="toast glass" role="status"><span><Check size={15} /></span>{toast}</div>}

    {modal && <Modal key={modal.type} title={modal.type === 'memory' ? modal.memory ? 'Редактировать момент' : 'Ещё один счастливый момент' : modal.type === 'date' ? 'Особенный день' : modal.type === 'plan' ? 'Придумаем что-то вместе' : modal.type === 'profile' ? 'Ваша история начинается здесь' : modal.type === 'notifications' ? 'Поводы улыбнуться' : modal.type === 'delete' ? 'Удалить этот момент?' : modal.type === 'delete-item' ? 'Удалить запись?' : modal.memory.title} close={() => { if (!saving) setModal(null); }}>
      {['memory', 'date', 'plan'].includes(modal.type) && <form className="edit-form" onSubmit={saveForm}>
        {modal.type === 'memory' && <><label className={`upload-zone ${upload ? 'has-photo' : ''}`}>{upload ? <Photo src={upload} alt="Выбранная фотография" /> : <><ImagePlus size={30} strokeWidth={1.4} /><strong>Добавьте вашу фотографию</strong><span>JPEG, PNG или WebP · до 15 МБ</span></>}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Загрузить фотографию" onChange={e => choosePhoto(e.target.files?.[0])} disabled={saving} />{upload && <span className="change-photo">Выбрать другую фотографию</span>}</label><label>Как назовём этот момент?<input name="title" placeholder="Например, наше маленькое путешествие" required maxLength={80} defaultValue={modal.memory?.title} /></label><div className="form-row"><label>Когда это было?<input type="date" name="date" required defaultValue={modal.memory?.date || todayString()} max={todayString()} /></label><label>Где?<input name="location" placeholder="Место, которое стало нашим" maxLength={80} defaultValue={modal.memory?.location} /></label></div><label>Что хочется запомнить?<textarea name="note" placeholder="Запах моря, твой смех и этот закат…" rows={3} maxLength={1500} defaultValue={modal.memory?.note} /></label></>}
        {modal.type === 'date' && <><p className="form-intro">Некоторые дни хочется праздновать снова и снова.</p><label>Название события<input name="title" placeholder="Наш первый поцелуй" required maxLength={80} defaultValue={modal.date?.title} /></label><div className="form-row"><label>Дата<input type="date" name="date" required defaultValue={modal.date?.date || selectedDay || todayString()} /></label><label>Маленький символ<select name="emoji" defaultValue={modal.date?.emoji || '💗'}><option>💗</option><option>🤍</option><option>🌿</option><option>🎂</option><option>💍</option><option>✈️</option><option>🌷</option><option>🥂</option><option>✨</option></select></label></div><label className="checkbox-label"><input type="checkbox" name="annual" defaultChecked={modal.date?.annual ?? true} />Повторять каждый год</label></>}
        {modal.type === 'plan' && <><p className="form-intro">Не обязательно что-то грандиозное. Главное — вместе.</p><label>Что будем делать?<input name="title" placeholder="Встретить рассвет у моря" required maxLength={100} defaultValue={modal.plan?.title || modal.title} /></label><div className="form-row"><label>Когда? <span className="optional">необязательно</span><input type="date" name="date" defaultValue={modal.plan?.date || ''} /></label><label>Какое настроение?<select name="category" defaultValue={modal.plan?.category || 'Свидание'}><option>Свидание</option><option>Приключение</option><option>Дома</option><option>Путешествие</option><option>Путешествия</option><option>Прогулка</option><option>Маленькая мечта</option></select></label></div></>}

        {((modal.type === 'date' && modal.date) || (modal.type === 'plan' && modal.plan)) && <button type="button" className="text-button delete-entry" onClick={() => { if (modal.type === 'date' && modal.date) open({ type: 'delete-item', kind: 'dates', id: modal.date.id, title: modal.date.title }); if (modal.type === 'plan' && modal.plan) open({ type: 'delete-item', kind: 'plans', id: modal.plan.id, title: modal.plan.title }); }}><Trash2 size={14} />Удалить запись</button>}{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)} disabled={saving}>Отмена</button><button className="primary-button" disabled={saving}><Heart size={16} />{saving ? 'Сохраняем…' : 'Сохранить'}</button></div>
      </form>}
      {modal.type === 'notifications' && <><p className="form-intro">Немного предвкушения вашего следующего счастливого дня.</p>{upcoming.length ? upcoming.slice(0, 5).map(item => <DateItem onEdit={editDate} key={item.id} item={item} />) : <Empty icon={CalendarDays} title="Всё хорошее впереди" text="Добавьте особенные даты, и они появятся здесь." />}<button className="primary-button full-width" onClick={() => { setModal(null); go('dates'); }}>Открыть все даты<ArrowRight size={16} /></button></>}
      {modal.type === 'detail' && <div className="memory-detail"><Photo src={modal.memory.image} alt={modal.memory.title} /><div className="detail-meta"><span><CalendarDays size={14} />{formatDate(modal.memory.date)}</span>{modal.memory.location && <span><MapPin size={14} />{modal.memory.location}</span>}</div><p>{modal.memory.note || 'Один из тех моментов, которые делают нашу историю особенной.'}</p><div className="detail-actions"><button className="secondary-button" onClick={() => open({ type: 'memory', memory: modal.memory })}>Редактировать</button><button className="icon-button delete-button" aria-label="Удалить момент" onClick={() => open({ type: 'delete', memory: modal.memory })}><Trash2 size={18} /></button></div></div>}
      {modal.type === 'delete' && <><p className="form-intro">«{modal.memory.title}» будет удалён из этого приложения. Исходная фотография на вашем устройстве останется.</p><div className="form-actions"><button className="secondary-button" onClick={() => open({ type: 'detail', memory: modal.memory })}>Оставить</button><button className="danger-button" disabled={saving} onClick={async () => { if (await update(previous => ({ ...previous, memories: previous.memories.filter(item => item.id !== modal.memory.id) }))) { setModal(null); notify('Момент удалён'); } }}>Удалить момент</button></div></>}
      {modal.type === 'delete-item' && <><p className="form-intro">Удалить «{modal.title}» из вашей истории?</p><div className="form-actions"><button className="secondary-button" onClick={() => setModal(null)}>Оставить</button><button className="danger-button" disabled={saving} onClick={async () => { if (await update(previous => ({ ...previous, [modal.kind]: previous[modal.kind].filter(item => item.id !== modal.id) }))) { setModal(null); notify('Запись удалена'); } }}>Удалить запись</button></div></>}
    </Modal>}
  </div>;
}

function ArrowUpRightIcon() { return <ArrowRight size={18} style={{ transform: 'rotate(-45deg)' }} />; }

  function MemoryCard({ memory, index = 0, onOpen, onFavorite }: { memory: Memory; index?: number; onOpen: (modal: ModalState) => void; onFavorite: (memory: Memory) => void }) {
    return <article className="memory-card" style={{ animationDelay: `${index * 65}ms` }}><button className="memory-open" onClick={() => onOpen({ type: 'detail', memory })} aria-label={`Открыть момент: ${memory.title}`}><Photo src={memory.image} alt={memory.title} /><div className="memory-image-shade" /><span className="memory-date">{formatDate(memory.date, { day: 'numeric', month: 'short' })}</span><div className="memory-caption"><h3>{memory.title}</h3><span><MapPin size={12} />{memory.location || 'В нашей истории'}</span></div></button><button className={`favorite-button ${memory.favorite ? 'is-favorite' : ''}`} onClick={() => onFavorite(memory)} aria-label={memory.favorite ? `Убрать ${memory.title} из избранного` : `Добавить ${memory.title} в избранное`}><Heart size={16} fill={memory.favorite ? 'currentColor' : 'none'} /></button></article>;
  }
  function DateItem({ item, onEdit }: { item: ImportantDate & { next: Date }; onEdit: (item: ImportantDate) => void }) {
    return <div className="date-item"><span className="date-emoji">{item.emoji}</span><div className="date-item-text"><h3>{item.title}</h3><p>{dateLabel(item.next)}</p></div><span className={`countdown ${daysUntil(item.next) < 8 ? 'soon' : ''}`}>{countdown(item.next)}</span><button className="date-edit" aria-label={`Редактировать дату: ${item.title}`} onClick={() => onEdit(item)}><Settings2 size={13} /></button></div>;
  }
  function PlanItem({ plan, onToggle, onEdit }: { plan: Plan; onToggle: (plan: Plan) => void; onEdit: (plan: Plan) => void }) {
    return <div className={`plan-item ${plan.done ? 'done' : ''}`}><button className="plan-check" aria-label={plan.done ? `Вернуть план: ${plan.title}` : `Завершить план: ${plan.title}`} onClick={() => onToggle(plan)}>{plan.done && <Check size={14} />}</button><div><h3>{plan.title}</h3><p>{plan.date ? formatDate(plan.date, { day: 'numeric', month: 'long' }) : 'Когда захочется'}<span>·</span>{plan.category}</p></div><button className="plan-edit" aria-label={`Редактировать план: ${plan.title}`} onClick={() => onEdit(plan)}><Settings2 size={15} /></button></div>;
  }
  function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><Icon size={32} strokeWidth={1.4} /><h3>{title}</h3><p>{text}</p>{action}</div>; }
