export type TelegramWebApp = {
  initData: string;
  version: string;
  themeParams?: Record<string, string | undefined>;
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (callback: () => void) => void; offClick: (callback: () => void) => void };
};

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export const telegramWebApp = () => window.Telegram?.WebApp;
export const telegramInitData = () => telegramWebApp()?.initData || '';

const themeVariables: Record<string, string> = { bg_color: '--tg-theme-bg-color', text_color: '--tg-theme-text-color', hint_color: '--tg-theme-hint-color', button_color: '--tg-theme-button-color', secondary_bg_color: '--tg-theme-secondary-bg-color' };

function applyTelegramTheme() {
  const webApp = telegramWebApp();
  if (!webApp) return;
  const root = document.documentElement;
  root.classList.add('telegram-mini-app');
  const setTheme = () => {
    for (const [key, variable] of Object.entries(themeVariables)) {
      const value = webApp.themeParams?.[key];
      if (value && /^#[0-9a-f]{6}$/i.test(value)) root.style.setProperty(variable, value);
    }
    const color = webApp.themeParams?.bg_color;
    try { if (color && /^#[0-9a-f]{6}$/i.test(color)) webApp.setHeaderColor?.(color); } catch { /* Header tint is not available in older clients. */ }
  };
  setTheme();
  webApp.onEvent?.('themeChanged', setTheme);
  const setInsets = () => {
    for (const [prefix, inset] of [['safe', webApp.safeAreaInset], ['content-safe', webApp.contentSafeAreaInset]] as const) {
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        const value = inset?.[side];
        if (typeof value === 'number') root.style.setProperty(`--tg-${prefix}-${side}-inset`, `${Math.max(0, value)}px`);
      }
    }
  };
  setInsets();
  webApp.onEvent?.('safeAreaChanged', setInsets);
  webApp.onEvent?.('contentSafeAreaChanged', setInsets);
  try { webApp.ready(); webApp.expand(); } catch { /* Older Telegram clients may omit optional viewport methods. */ }
}

if (typeof window !== 'undefined') {
  if (telegramWebApp()) applyTelegramTheme();
  else window.addEventListener('DOMContentLoaded', applyTelegramTheme, { once: true });
}
