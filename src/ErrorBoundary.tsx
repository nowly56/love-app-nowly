import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Heart } from 'lucide-react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Application view failed', error, info.componentStack); }
  render() {
    if (this.state.failed) return <main className="session-screen"><Heart size={38} /><h1>Не получилось открыть страницу</h1><p>Сохранённые данные остались на сервере. Обновите приложение, чтобы вернуться к вашей истории.</p><button className="primary-button" onClick={() => window.location.reload()}>Обновить приложение</button></main>;
    return this.props.children;
  }
}
