import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Camera, Check, Copy, Heart, KeyRound, Link2, LogOut, ShieldCheck, Sparkles, UserRound, Users } from 'lucide-react'
import { api, ApiError } from './api'
import type { SessionSnapshot } from './api'
import { dayCount, formatDate, imageFileToDataUrl, pluralDays } from './data'
import './account.css'

type Props = { session: SessionSnapshot; onSession: (session: SessionSnapshot) => void; onLogout: () => Promise<void> }
type Feedback = { kind: 'success' | 'error'; text: string } | null
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось сохранить. Попробуйте ещё раз.'
const today = () => new Date().toLocaleDateString('sv-SE')

function FeedbackMessage({ value }: { value: Feedback }) {
  return value ? <p className={`account-feedback ${value.kind}`} role={value.kind === 'error' ? 'alert' : 'status'}>{value.kind === 'success' && <Check size={16} />}{value.text}</p> : null
}
function Avatar({ image, name }: { image: string; name: string }) {
  return image ? <img className="account-avatar" src={image} alt={`Аватар: ${name}`} /> : <span className="account-avatar account-avatar-placeholder" aria-label={`Аватар: ${name}`}>{name.trim().slice(0, 1).toUpperCase() || <UserRound size={30} />}</span>
}

export default function AccountSettings({ session, onSession, onLogout }: Props) {
  const own = session.data.profiles.find(profile => profile.id === session.user.id)!
  const partner = session.data.profiles.find(profile => profile.id !== session.user.id)
  const [name, setName] = useState(own.name)
  const [birthday, setBirthday] = useState(own.birthday)
  const [bio, setBio] = useState(own.bio)
  const [avatar, setAvatar] = useState(own.avatar)
  const [startDate, setStartDate] = useState(session.data.startDate)
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null)
  const [relationshipFeedback, setRelationshipFeedback] = useState<Feedback>(null)
  const [inviteFeedback, setInviteFeedback] = useState<Feedback>(null)
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null)
  const [logoutFeedback, setLogoutFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState('')
  const [processingImage, setProcessingImage] = useState(false)
  const [invite, setInvite] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinAccepted, setJoinAccepted] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const inviteInput = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setName(own.name); setBirthday(own.birthday); setBio(own.bio); setAvatar(own.avatar) }, [own.id, own.name, own.birthday, own.bio, own.avatar])
  useEffect(() => { setStartDate(session.data.startDate) }, [session.data.startDate])
  const profileChanged = name !== own.name || birthday !== own.birthday || bio !== own.bio || avatar !== own.avatar
  const hasPersonalRecords = session.data.memories.length > 0 || session.data.plans.length > 0 || session.data.messages.length > 0 || session.data.dates.some(item => item.id !== 'date-anniversary' && !item.id.startsWith('birthday:'))

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy || processingImage) return
    setProcessingImage(true); setProfileFeedback(null)
    try { const image = await imageFileToDataUrl(file); if (alive.current) setAvatar(image) }
    catch (error) { if (alive.current) setProfileFeedback({ kind: 'error', text: message(error) }) }
    finally { if (alive.current) setProcessingImage(false) }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (busy || processingImage) return
    setBusy('profile'); setProfileFeedback(null)
    try {
      const result = await api<SessionSnapshot>('/api/profile', { name: name.trim(), birthday, bio: bio.trim(), avatar })
      onSession(result); setProfileFeedback({ kind: 'success', text: 'Профиль сохранён. Всё по-твоему.' })
    } catch (error) { setProfileFeedback({ kind: 'error', text: message(error) }) }
    finally { setBusy('') }
  }

  async function saveRelationship(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy('relationship'); setRelationshipFeedback(null)
    try {
      const fresh = await api<SessionSnapshot>('/api/session')
      const result = await api<SessionSnapshot>('/api/data', { revision: fresh.revision, data: { ...fresh.data, startDate } })
      onSession(result); setRelationshipFeedback({ kind: 'success', text: 'Дата сохранена. Счётчик и годовщина обновлены.' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try { onSession(await api<SessionSnapshot>('/api/session')) } catch { /* Keep the original conflict visible if reconnecting also fails. */ }
      }
      setRelationshipFeedback({ kind: 'error', text: message(error) })
    }
    finally { setBusy('') }
  }

  async function createInvite() {
    if (busy) return
    setBusy('invite'); setInviteFeedback(null)
    try { const result = await api<{ code: string }>('/api/invite', {}); setInvite(result.code) }
    catch (error) { setInviteFeedback({ kind: 'error', text: message(error) }) }
    finally { setBusy('') }
  }

  async function copyInvite() {
    try {
      if (!navigator.clipboard) throw new Error('manual')
      await navigator.clipboard.writeText(invite)
      setInviteFeedback({ kind: 'success', text: 'Код скопирован. Отправь его любимому человеку.' })
    } catch {
      inviteInput.current?.focus(); inviteInput.current?.select()
      setInviteFeedback({ kind: 'success', text: 'Выдели код и скопируй его через меню телефона.' })
    }
  }

  async function joinSpace(event: FormEvent) {
    event.preventDefault()
    if (busy || !joinAccepted || hasPersonalRecords) return
    setBusy('join'); setInviteFeedback(null)
    try {
      const result = await api<SessionSnapshot>('/api/join', { code: joinCode.replace(/\s/g, '').toUpperCase() })
      onSession(result); setJoinCode(''); setJoinAccepted(false); setInvite('')
      setInviteFeedback({ kind: 'success', text: 'Теперь у вас одно пространство на двоих 🤍' })
    } catch (error) { setInviteFeedback({ kind: 'error', text: message(error) }) }
    finally { setBusy('') }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setPasswordFeedback(null)
    if (newPassword !== repeatPassword) { setPasswordFeedback({ kind: 'error', text: 'Пароли не совпадают. Проверь повтор пароля.' }); return }
    if (currentPassword === newPassword) { setPasswordFeedback({ kind: 'error', text: 'Придумай новый пароль, отличный от текущего.' }); return }
    setBusy('password')
    try {
      await api<{ ok: boolean }>('/api/password', { currentPassword, password: newPassword })
      setCurrentPassword(''); setNewPassword(''); setRepeatPassword('')
      setPasswordFeedback({ kind: 'success', text: 'Пароль изменён. На других устройствах нужно войти заново.' })
    } catch (error) { setPasswordFeedback({ kind: 'error', text: message(error) }) }
    finally { setBusy('') }
  }

  async function logout() {
    if (busy) return
    setBusy('logout'); setLogoutFeedback(null)
    try { await onLogout() } catch (error) { setLogoutFeedback({ kind: 'error', text: message(error) }); setBusy('') }
  }

  return <div className="account-page">
    <header className="page-heading"><div><div className="eyebrow">С ЛЮБОВЬЮ К ДЕТАЛЯМ</div><h1>Ты. Я. Мы.<span className="heading-heart">♡</span></h1><p>Личное о тебе и важное о вас.</p></div><span className="private-badge"><ShieldCheck size={15} /> Ваше личное пространство</span></header>

    <section className="account-couple-strip glass" aria-label="Ваша пара">
      <div className="account-person"><Avatar image={own.avatar} name={own.name} /><div><strong>{own.name}</strong><span>Это ты</span></div></div>
      <span className="account-couple-heart"><Heart size={23} /></span>
      <div className={`account-person ${partner ? '' : 'account-partner-waiting'}`}>{partner ? <><Avatar image={partner.avatar} name={partner.name} /><div><strong>{partner.name}</strong><span>{partner.bio || 'Любимый человек рядом'}</span></div></> : <><span className="account-avatar account-avatar-placeholder"><Users size={27} /></span><div><strong>Место для любимого человека</strong><span>Пригласи его в вашу историю</span></div></>}</div>
      <span className="account-together"><Sparkles size={15} />{dayCount(session.data.startDate)} {pluralDays(dayCount(session.data.startDate))} вместе</span>
    </section>

    <div className="account-layout">
      <div className="account-column">
        <section className="account-card panel" aria-labelledby="profile-settings-title">
          <div className="account-card-heading"><span className="account-section-icon"><UserRound size={21} /></span><div><h2 id="profile-settings-title">Твой профиль</h2><p>Маленькая история о тебе.</p></div></div>
          <form onSubmit={saveProfile} className="account-form">
            <div className="account-avatar-editor"><Avatar image={avatar} name={name} /><div><button type="button" className="secondary-button" onClick={() => fileInput.current?.click()} disabled={!!busy || processingImage}><Camera size={16} />{processingImage ? 'Обрабатываем…' : avatar ? 'Изменить фото' : 'Добавить фото'}</button><p>JPG, PNG или WebP · до 15 МБ</p>{avatar && <button type="button" className="account-inline-button" disabled={!!busy || processingImage} onClick={() => { setAvatar(''); setProfileFeedback(null) }}>Убрать фотографию</button>}</div><input ref={fileInput} className="account-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} aria-label="Загрузить аватар" tabIndex={-1} /></div>
            <label className="account-field"><span>Как тебя называть</span><input value={name} maxLength={25} minLength={1} required autoComplete="given-name" onChange={event => { setName(event.target.value); setProfileFeedback(null) }} placeholder="Твоё имя" disabled={busy === 'profile'} /></label>
            <label className="account-field"><span>День рождения <small>по желанию</small></span><input type="date" value={birthday} max={today()} onChange={event => { setBirthday(event.target.value); setProfileFeedback(null) }} disabled={busy === 'profile'} /><small>Добавим в ваш календарь, чтобы этот день был особенным.</small></label>
            <label className="account-field"><span>Пара слов о тебе <small>{bio.length}/120</small></span><textarea value={bio} maxLength={120} rows={3} onChange={event => { setBio(event.target.value); setProfileFeedback(null) }} placeholder="Люблю долгие прогулки и наши разговоры…" disabled={busy === 'profile'} /></label>
            <FeedbackMessage value={profileFeedback} />
            <div className="account-form-footer"><span>{profileChanged ? 'Есть несохранённые изменения' : 'Только ты можешь изменить свой профиль'}</span><button type="submit" className="primary-button" disabled={!!busy || processingImage || !profileChanged || !name.trim()}>{busy === 'profile' ? 'Сохраняем…' : 'Сохранить профиль'}</button></div>
          </form>
        </section>

        <section className="account-card panel" aria-labelledby="relationship-settings-title">
          <div className="account-card-heading"><span className="account-section-icon peach"><Heart size={21} /></span><div><h2 id="relationship-settings-title">Начало вашей истории</h2><p>Тот самый день, когда всё началось.</p></div></div>
          <form className="account-form" onSubmit={saveRelationship}><label className="account-field"><span>Вы вместе с</span><input type="date" required max={today()} value={startDate} onChange={event => { setStartDate(event.target.value); setRelationshipFeedback(null) }} disabled={busy === 'relationship'} /></label><p className="account-help">Эта дата общая для вас двоих. По ней считаются дни вместе и напоминает о себе годовщина.</p><FeedbackMessage value={relationshipFeedback} /><button className="secondary-button" type="submit" disabled={!!busy || startDate === session.data.startDate}>{busy === 'relationship' ? 'Сохраняем…' : 'Сохранить дату'}</button></form>
        </section>
      </div>

      <div className="account-column">
        <section className="account-card account-invitation panel" aria-labelledby="invitation-title">
          <div className="account-card-heading"><span className="account-section-icon lavender"><Link2 size={21} /></span><div><h2 id="invitation-title">{partner ? 'Вы уже вместе' : 'Одно пространство на двоих'}</h2><p>{partner ? 'Ваша история живёт на обоих устройствах.' : 'Поделись самым тёплым местом.'}</p></div></div>
          {partner ? <div className="account-partner-details"><span className="account-linked"><Check size={16} /> Пара соединена</span><p>Общие воспоминания, планы, даты и переписка доступны вам обоим после входа в свой аккаунт.</p>{partner.birthday && <p className="account-partner-birthday">🎂 День рождения: {formatDate(partner.birthday, { day: 'numeric', month: 'long' })}</p>}</div> : <>
            <p className="account-help">Любимому человеку нужно создать свой аккаунт, открыть профиль и ввести твой код приглашения.</p>
            {invite && <div className="account-invite-code"><label htmlFor="invite-code">Твой код приглашения</label><div><input id="invite-code" ref={inviteInput} readOnly value={invite} onFocus={event => event.currentTarget.select()} /><button type="button" className="icon-button" title="Скопировать код приглашения" aria-label="Скопировать код приглашения" onClick={copyInvite}><Copy size={18} /></button></div><small>Действует 24 часа. Новый код заменит предыдущий.</small></div>}
            <button type="button" className="primary-button account-invite-button" onClick={createInvite} disabled={!!busy}><Link2 size={16} />{busy === 'invite' ? 'Создаём…' : invite ? 'Создать новый код' : 'Пригласить любимого человека'}</button>
            <details className="account-join-details"><summary>У тебя уже есть код приглашения?</summary><form className="account-form" onSubmit={joinSpace}><label className="account-field"><span>Код от любимого человека</span><input value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false} required maxLength={32} placeholder="Вставь код" disabled={!!busy} /></label><p className="account-help">Ты перейдёшь в пространство партнёра с его датой начала отношений. Твой профиль сохранится. Присоединиться можно только из пустого пространства. Если у вас уже есть история здесь, пригласи партнёра своим кодом.</p>{hasPersonalRecords ? <p className="account-feedback error">В этом пространстве уже есть история. Чтобы сохранить её, пригласи партнёра своим кодом.</p> : <label className="account-checkbox"><input type="checkbox" checked={joinAccepted} onChange={event => setJoinAccepted(event.target.checked)} required /><span>Хочу перейти в пространство любимого человека</span></label>}<button className="secondary-button" type="submit" disabled={!!busy || !joinAccepted || !joinCode.trim() || hasPersonalRecords}>{busy === 'join' ? 'Соединяем…' : 'Присоединиться к паре'}</button></form></details>
          </>}
          <FeedbackMessage value={inviteFeedback} />
        </section>

        <section className="account-card panel" aria-labelledby="security-settings-title">
          <div className="account-card-heading"><span className="account-section-icon"><KeyRound size={21} /></span><div><h2 id="security-settings-title">Аккаунт и безопасность</h2><p>Чтобы личное оставалось личным.</p></div></div>
          <div className="account-email"><span>Email для входа</span><strong>{session.user.email}</strong></div>
          <details className="account-password-details"><summary>Изменить пароль</summary><form className="account-form" onSubmit={changePassword}><label className="account-field"><span>Текущий пароль</span><input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" maxLength={128} required disabled={busy === 'password'} /></label><label className="account-field"><span>Новый пароль</span><input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required disabled={busy === 'password'} /><small>От 10 до 128 символов.</small></label><label className="account-field"><span>Повтори новый пароль</span><input type="password" value={repeatPassword} onChange={event => setRepeatPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required disabled={busy === 'password'} /></label><FeedbackMessage value={passwordFeedback} /><button className="secondary-button" type="submit" disabled={!!busy}>{busy === 'password' ? 'Сохраняем…' : 'Обновить пароль'}</button></form></details>
          <div className="account-logout"><p>Воспоминания останутся в аккаунте.<br />Ты сможешь вернуться в любой момент.</p><button type="button" className="account-logout-button" onClick={logout} disabled={!!busy}><LogOut size={17} />{busy === 'logout' ? 'Выходим…' : 'Выйти'}</button></div><FeedbackMessage value={logoutFeedback} />
        </section>
      </div>
    </div>
    <p className="account-bottom-note"><Heart size={13} /> Самое важное — быть собой. И быть вместе.</p>
  </div>
}
