import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, Download, Eye, EyeOff, Heart, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { api, type SessionSnapshot } from './api'
import './auth.css'
import { telegramInitData } from './telegram'

type Mode = 'login' | 'register' | 'recover'

const content = {
  login: { eyebrow: 'ХОРОШО, ЧТО ВЫ ЗДЕСЬ', title: 'Снова вместе.', text: 'Войдите в ваше маленькое пространство для большой любви.', action: 'Войти' },
  register: { eyebrow: 'ВАША ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ', title: 'Давайте ближе.', text: 'Создайте аккаунт, пригласите любимого человека и сохраняйте ваше «мы».', action: 'Создать аккаунт' },
  recover: { eyebrow: 'ВЕРНЁМСЯ К ВАШЕЙ ИСТОРИИ', title: 'Не теряйте связь.', text: 'Введите email и код восстановления, который вы сохранили при регистрации.', action: 'Восстановить доступ' },
}

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: (snapshot: SessionSnapshot) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingSnapshot, setPendingSnapshot] = useState<SessionSnapshot | null>(null)
  const [savedCode, setSavedCode] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const codeField = useRef<HTMLTextAreaElement>(null)
  const copy = content[mode]

  function changeMode(next: Mode) {
    if (busy) return
    setMode(next)
    setPassword('')
    setRepeatPassword('')
    setRecoveryCode('')
    setShowPassword(false)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (mode !== 'login' && password !== repeatPassword) {
      setError('Пароли не совпадают. Проверьте их ещё раз.')
      return
    }
    if (mode === 'register' && !name.trim()) {
      setError('Расскажите, как вас зовут.')
      return
    }
    setBusy(true)
    try {
      const snapshot = await api<SessionSnapshot>(`/api/${mode}`, {
        email: email.trim(), password,
        ...(mode === 'register' ? { name: name.trim() } : {}),
        ...(mode === 'recover' ? { code: recoveryCode.trim() } : {}),
      })
      setPassword('')
      setRepeatPassword('')
      setRecoveryCode('')
      if (snapshot.recoveryCode) {
        setPendingSnapshot(snapshot)
        setSavedCode(false)
      } else onAuthenticated(snapshot)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    if (!pendingSnapshot?.recoveryCode) return
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(pendingSnapshot.recoveryCode)
      setCopyMessage('Код скопирован. Сохраните его в надёжном месте.')
    } catch {
      codeField.current?.focus()
      codeField.current?.select()
      setCopyMessage('Код выделен — скопируйте его с помощью меню устройства.')
    }
  }

  function downloadCode() {
    if (!pendingSnapshot?.recoveryCode) return
    const file = new Blob([
      `ближе — код восстановления\n\nАккаунт: ${pendingSnapshot.user.email}\nКод: ${pendingSnapshot.recoveryCode}\n\nХраните этот файл в надёжном месте. Не делитесь кодом: он позволяет изменить пароль и войти в ваш аккаунт.\n`,
    ], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'blizhe-recovery-code.txt'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setCopyMessage('Файл подготовлен. Убедитесь, что он сохранился на устройстве.')
  }

  return <main className="auth-page">
    <section className="auth-story" aria-label="Ближе — пространство для двоих">
      <img className="auth-landscape" src="/photos/sunset.jpg" alt="Тёплый закат над морем" />
      <div className="auth-story-shade" />
      <div className="auth-story-top"><a className="auth-brand" href="/" aria-label="Ближе, главная"><Heart fill="currentColor" strokeWidth={0} />ближе<span>.</span></a><span className="auth-story-badge"><Heart size={13} /> создано для двоих</span></div>
      <div className="auth-story-content">
        <span className="auth-story-kicker">МАЛЕНЬКИЕ МОМЕНТЫ. БОЛЬШОЕ ЧУВСТВО.</span>
        <h1>В целом мире.<br /><em>Только мы.</em></h1>
        <p>Место, где обычные дни<br />становятся вашей историей.</p>
        <div className="auth-story-note"><span className="auth-note-icon"><Heart size={23} /></span><div><strong>Любовь — в деталях</strong><span>Воспоминания, планы и всё, что вас сближает</span></div><Sparkles size={20} /></div>
      </div>
      <span className="auth-story-bottom">у каждой любви своя история · сохраните вашу</span>
    </section>

    <section className="auth-form-side" aria-label={pendingSnapshot ? 'Сохранение кода восстановления' : copy.title}>
      <div className="auth-form-wrap">
        {pendingSnapshot ? <div className="auth-recovery-result">
          <span className="auth-heading-icon"><ShieldCheck size={28} /></span>
          <span className="auth-eyebrow">ВАШ КЛЮЧ К ИСТОРИИ</span>
          <h2>{mode === 'recover' ? 'Вы снова с нами.' : 'Добро пожаловать.'}</h2>
          <p className="auth-description">Сохраните код восстановления. Он поможет войти в аккаунт, если вы забудете пароль.</p>
          <div className="auth-code-panel">
            <label htmlFor="auth-saved-code">Ваш секретный код</label>
            <textarea ref={codeField} id="auth-saved-code" value={pendingSnapshot.recoveryCode} readOnly spellCheck={false} rows={3} onFocus={event => event.target.select()} />
            <div className="auth-code-actions"><button type="button" onClick={() => void copyCode()}><Copy size={16} /> Скопировать</button><button type="button" onClick={downloadCode}><Download size={16} /> Скачать</button></div>
          </div>
          {copyMessage && <p className="auth-copy-status" role="status">{copyMessage}</p>}
          <p className="auth-code-warning"><LockKeyhole size={17} /><span>Код показывается только сейчас. Не передавайте его другим людям.{mode === 'recover' ? ' Предыдущий код больше не действует.' : ''}</span></p>
          <label className="auth-save-check"><input type="checkbox" checked={savedCode} onChange={event => setSavedCode(event.target.checked)} /><span>Я сохранил(а) код в надёжном месте</span></label>
          <button type="button" className="auth-submit" disabled={!savedCode} onClick={() => { const { recoveryCode: _code, ...session } = pendingSnapshot; onAuthenticated(session) }}>Начать нашу историю <ArrowRight size={19} /></button>
        </div> : <>
          {mode === 'recover' ? <button className="auth-back" type="button" onClick={() => changeMode('login')} disabled={busy}><ArrowLeft size={16} /> Назад ко входу</button> : <div className="auth-mode-switch" aria-label="Вход или регистрация"><button type="button" aria-pressed={mode === 'login'} className={mode === 'login' ? 'selected' : ''} disabled={busy} onClick={() => changeMode('login')}>Войти</button><button type="button" aria-pressed={mode === 'register'} className={mode === 'register' ? 'selected' : ''} disabled={busy} onClick={() => changeMode('register')}>Создать аккаунт</button></div>}
          <div className="auth-intro"><span className="auth-eyebrow">{copy.eyebrow}</span><h2>{copy.title}</h2><p className="auth-description">{copy.text}</p>{telegramInitData() && <p className="telegram-auth-note">После входа аккаунт автоматически свяжется с Telegram, и ваша общая история останется на месте.</p>}</div>
          <form className="auth-form" onSubmit={event => void submit(event)} aria-busy={busy}>
            {mode === 'register' && <div className="auth-field"><label htmlFor="auth-name">Как вас зовут?</label><div className="auth-input-wrap"><UserRound size={18} /><input id="auth-name" autoComplete="given-name" placeholder="Ваше имя" value={name} onChange={event => setName(event.target.value)} required maxLength={25} disabled={busy} /></div></div>}
            <div className="auth-field"><label htmlFor="auth-email">Email</label><div className="auth-input-wrap"><Mail size={18} /><input id="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={busy} /></div></div>
            {mode === 'recover' && <div className="auth-field"><label htmlFor="auth-code">Код восстановления</label><div className="auth-input-wrap"><KeyRound size={18} /><input id="auth-code" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Код, который вы сохранили" value={recoveryCode} onChange={event => setRecoveryCode(event.target.value)} required maxLength={128} disabled={busy} /></div></div>}
            <div className="auth-field"><div className="auth-label-row"><label htmlFor="auth-password">{mode === 'recover' ? 'Новый пароль' : 'Пароль'}</label>{mode === 'login' && <button type="button" className="auth-forgot" onClick={() => changeMode('recover')} disabled={busy}>Забыли пароль?</button>}</div><div className="auth-input-wrap"><LockKeyhole size={18} /><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Ваш пароль' : 'Не менее 10 символов'} value={password} onChange={event => setPassword(event.target.value)} required minLength={mode === 'login' ? 1 : 10} maxLength={128} aria-describedby={mode !== 'login' ? 'auth-password-hint' : undefined} disabled={busy} /><button type="button" className="auth-eye" aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={busy}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode !== 'login' && <small id="auth-password-hint">От 10 символов. Можно использовать длинную фразу.</small>}</div>
            {mode !== 'login' && <div className="auth-field"><label htmlFor="auth-repeat">Повторите пароль</label><div className="auth-input-wrap"><Check size={18} /><input id="auth-repeat" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Ещё раз, чтобы не ошибиться" value={repeatPassword} onChange={event => setRepeatPassword(event.target.value)} required minLength={10} maxLength={128} disabled={busy} /></div></div>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? <><LoaderCircle size={19} className="auth-spinner" /> Одну минуту…</> : <>{copy.action}<ArrowRight size={19} /></>}</button>
          </form>
          {mode === 'login' && <p className="auth-bottom-action">Ещё нет аккаунта? <button type="button" onClick={() => changeMode('register')} disabled={busy}>Начать свою историю</button></p>}
          {mode === 'register' && <p className="auth-bottom-action">Уже есть аккаунт? <button type="button" onClick={() => changeMode('login')} disabled={busy}>Войти</button></p>}
        </>}
        <div className="auth-form-footer"><Heart size={14} /><span>Для ваших воспоминаний. Для вас двоих.</span></div>
      </div>
    </section>
  </main>
}
