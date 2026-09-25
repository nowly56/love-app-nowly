import { ArrowRight, Heart, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import './auth.css'

export default function AuthScreen({ onRetry }: { onRetry: () => void }) {
  return <main className="auth-page">
    <section className="auth-story" aria-label="Since Us — пространство для двоих">
      <img className="auth-landscape" src="/photos/sunset.jpg" alt="Тёплый закат над морем" />
      <div className="auth-story-shade" />
      <div className="auth-story-top"><a className="auth-brand" href="/" aria-label="Since Us, главная"><Heart fill="currentColor" strokeWidth={0} />Since Us</a><span className="auth-story-badge"><Heart size={13} /> создано для двоих</span></div>
      <div className="auth-story-content">
        <span className="auth-story-kicker">МАЛЕНЬКИЕ МОМЕНТЫ. БОЛЬШОЕ ЧУВСТВО.</span>
        <h1>В целом мире.<br /><em>Только мы.</em></h1>
        <p>Место, где обычные дни<br />становятся вашей историей.</p>
        <div className="auth-story-note"><span className="auth-note-icon"><Heart size={23} /></span><div><strong>Любовь — в деталях</strong><span>Воспоминания, планы и всё, что вас сближает</span></div><Sparkles size={20} /></div>
      </div>
      <span className="auth-story-bottom">у каждой любви своя история · сохраните вашу</span>
    </section>
    <section className="auth-form-side" aria-label="Вход через Telegram">
      <div className="auth-form-wrap telegram-entry">
        <span className="auth-heading-icon"><ShieldCheck size={28} /></span>
        <span className="auth-eyebrow">ВАША ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</span>
        <h2>Откройте Since Us в Telegram</h2>
        <p className="auth-description">Вернитесь в чат с ботом и нажмите кнопку открытия приложения. Telegram подтвердит вашу личность, и вы сразу попадёте в своё пространство.</p>
        <button type="button" className="auth-submit" onClick={onRetry}>Попробовать снова <RefreshCw size={18} /></button>
        <p className="telegram-auth-note"><ArrowRight size={17} /> Почта, пароль и отдельная регистрация не нужны.</p>
        <div className="auth-form-footer"><Heart size={14} /><span>Для ваших воспоминаний. Для вас двоих.</span></div>
      </div>
    </section>
  </main>
}
