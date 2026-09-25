import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, Heart, UserRound } from 'lucide-react';
import { api, ApiError } from './api';
import type { SessionSnapshot } from './api';
import './account.css';

type Props = { session: SessionSnapshot; onSession: (session: SessionSnapshot) => void };
type Feedback = { kind: 'success' | 'error'; text: string } | null;
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось сохранить. Попробуйте ещё раз.';
const today = () => new Date().toLocaleDateString('sv-SE');

function FeedbackMessage({ value }: { value: Feedback }) {
  return value ? <p className={`account-feedback ${value.kind}`} role={value.kind === 'error' ? 'alert' : 'status'}>{value.text}</p> : null;
}
function Avatar({ image, name }: { image: string; name: string }) {
  return image ? <img className="account-avatar" src={image} alt={`Аватар: ${name}`} /> : <span className="account-avatar account-avatar-placeholder" aria-label={`Аватар: ${name}`}>{name.trim().slice(0, 1).toUpperCase() || <UserRound size={28} />}</span>;
}

export default function AccountSettings({ session, onSession }: Props) {
  const own = session.data.profiles.find(profile => profile.id === session.user.id)!;
  const partner = session.data.profiles.find(profile => profile.id !== session.user.id);
  const [name, setName] = useState(own.name);
  const [birthday, setBirthday] = useState(own.birthday);
  const [bio, setBio] = useState(own.bio);
  const [startDate, setStartDate] = useState(session.data.startDate);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [relationshipFeedback, setRelationshipFeedback] = useState<Feedback>(null);
  const [inviteFeedback, setInviteFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState('');
  const [invite, setInvite] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinAccepted, setJoinAccepted] = useState(false);
  const inviteInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(own.name); setBirthday(own.birthday); setBio(own.bio); }, [own.id, own.name, own.birthday, own.bio]);
  useEffect(() => { setStartDate(session.data.startDate); }, [session.data.startDate]);
  const profileChanged = name !== own.name || birthday !== own.birthday || bio !== own.bio;
  const hasPersonalRecords = session.data.memories.length > 0 || session.data.plans.length > 0 || session.data.messages.length > 0 || session.data.dates.some(item => item.id !== 'date-anniversary' && !item.id.startsWith('birthday:'));

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('profile'); setProfileFeedback(null);
    try {
      const result = await api<SessionSnapshot>('/api/profile', { name: name.trim(), birthday, bio: bio.trim() });
      onSession(result); setProfileFeedback({ kind: 'success', text: 'Профиль сохранён' });
    } catch (error) { setProfileFeedback({ kind: 'error', text: message(error) }); }
    finally { setBusy(''); }
  }
  async function saveRelationship(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('relationship'); setRelationshipFeedback(null);
    try {
      const fresh = await api<SessionSnapshot>('/api/session');
      const result = await api<SessionSnapshot>('/api/data', { revision: fresh.revision, data: { ...fresh.data, startDate } });
      onSession(result); setRelationshipFeedback({ kind: 'success', text: 'Дата обновлена' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try { onSession(await api<SessionSnapshot>('/api/session')); } catch { /* Show the original conflict. */ }
      }
      setRelationshipFeedback({ kind: 'error', text: message(error) });
    } finally { setBusy(''); }
  }
  async function createInvite() {
    if (busy) return;
    setBusy('invite'); setInviteFeedback(null);
    try { const result = await api<{ code: string }>('/api/invite', {}); setInvite(result.code); }
    catch (error) { setInviteFeedback({ kind: 'error', text: message(error) }); }
    finally { setBusy(''); }
  }
  async function copyInvite() {
    try {
      if (!navigator.clipboard) throw new Error('manual');
      await navigator.clipboard.writeText(invite);
      setInviteFeedback({ kind: 'success', text: 'Код скопирован' });
    } catch {
      inviteInput.current?.focus(); inviteInput.current?.select();
      setInviteFeedback({ kind: 'success', text: 'Код выделен. Скопируйте его через меню телефона.' });
    }
  }
  async function joinSpace(event: FormEvent) {
    event.preventDefault();
    if (busy || !joinAccepted || hasPersonalRecords) return;
    setBusy('join'); setInviteFeedback(null);
    try {
      const result = await api<SessionSnapshot>('/api/join', { code: joinCode.replace(/\s/g, '').toUpperCase() });
      onSession(result); setJoinCode(''); setJoinAccepted(false); setInvite('');
      setInviteFeedback({ kind: 'success', text: 'Теперь у вас одно пространство на двоих 🤍' });
    } catch (error) { setInviteFeedback({ kind: 'error', text: message(error) }); }
    finally { setBusy(''); }
  }

  return <div className="account-page">
    <div className="section-intro"><span className="section-kicker">ТОЛЬКО ДЛЯ ВАС</span><h1>Настройки</h1><p>Самое важное о вашей истории.</p></div>
    <section className="settings-card couple-card" aria-labelledby="couple-title">
      <h2 id="couple-title">Ваше пространство</h2>
      <div className="couple-people"><div><Avatar image={own.avatar} name={own.name} /><span>{own.name}</span></div><Heart size={19} className="couple-heart" /><div><Avatar image={partner?.avatar || ''} name={partner?.name || 'Партнёр'} /><span>{partner?.name || 'Ждём партнёра'}</span></div></div>
      {partner ? <p className="settings-muted"><Check size={16} />Вы вместе в одном пространстве</p> : <>
        <p className="settings-muted">Пригласите партнёра, чтобы делиться вашей историей.</p>
        {invite ? <div className="invite-code"><span>Код приглашения</span><div><input ref={inviteInput} readOnly value={invite} onFocus={event => event.currentTarget.select()} aria-label="Код приглашения" /><button className="icon-button" onClick={copyInvite} aria-label="Скопировать код"><Copy size={19} /></button></div><small>Действует 24 часа</small></div> : null}
        <button className="secondary-button" onClick={createInvite} disabled={!!busy}>{busy === 'invite' ? 'Создаём…' : invite ? 'Новый код' : 'Пригласить партнёра'}</button>
        <details className="join-details"><summary>У меня есть код партнёра</summary><form onSubmit={joinSpace} className="account-form"><label className="account-field">Код приглашения<input value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" required maxLength={32} placeholder="Введите код" disabled={!!busy} /></label>{hasPersonalRecords ? <p className="account-feedback error">В вашем пространстве уже есть записи. Чтобы их сохранить, пригласите партнёра своим кодом.</p> : <label className="account-checkbox"><input type="checkbox" checked={joinAccepted} onChange={event => setJoinAccepted(event.target.checked)} required />Перейти в пространство партнёра</label>}<button className="secondary-button" type="submit" disabled={!!busy || !joinAccepted || !joinCode.trim() || hasPersonalRecords}>{busy === 'join' ? 'Соединяем…' : 'Присоединиться'}</button></form></details>
      </>}
      <FeedbackMessage value={inviteFeedback} />
    </section>

    <section className="settings-card" aria-labelledby="start-title"><h2 id="start-title">Начало истории</h2><p className="settings-muted">От этой даты считаются ваши дни вместе.</p><form className="account-form" onSubmit={saveRelationship}><label className="account-field">Вы вместе с<input type="date" required max={today()} value={startDate} onChange={event => { setStartDate(event.target.value); setRelationshipFeedback(null); }} disabled={busy === 'relationship'} /></label><FeedbackMessage value={relationshipFeedback} /><button className="secondary-button" type="submit" disabled={!!busy || startDate === session.data.startDate}>{busy === 'relationship' ? 'Сохраняем…' : 'Сохранить дату'}</button></form></section>

    <section className="settings-card" aria-labelledby="profile-title"><h2 id="profile-title">Мой профиль</h2><form className="account-form" onSubmit={saveProfile}><div className="profile-identity"><Avatar image={own.avatar} name={own.name} /><span>Фото берётся из Telegram и обновляется при входе.</span></div><label className="account-field">Имя<input value={name} maxLength={25} minLength={1} required autoComplete="given-name" onChange={event => { setName(event.target.value); setProfileFeedback(null); }} disabled={busy === 'profile'} /></label><details className="profile-extra"><summary>О себе и день рождения</summary><div className="account-form"><label className="account-field">День рождения<input type="date" value={birthday} max={today()} onChange={event => { setBirthday(event.target.value); setProfileFeedback(null); }} disabled={busy === 'profile'} /></label><label className="account-field">О себе<textarea value={bio} maxLength={120} rows={2} onChange={event => { setBio(event.target.value); setProfileFeedback(null); }} disabled={busy === 'profile'} /></label></div></details><FeedbackMessage value={profileFeedback} /><button className="secondary-button" type="submit" disabled={!!busy || !profileChanged || !name.trim()}>{busy === 'profile' ? 'Сохраняем…' : 'Сохранить профиль'}</button></form></section>
  </div>;
}
