import { useState } from "react";
import type { FormEvent } from "react";
import { Film } from "lucide-react";

type AuthMode = "login" | "register";

const FEATURES = [
  { title: "Каталог", text: "Поиск фильмов и сериалов из единого API." },
  { title: "Доступ", text: "Пользователь видит только своё и явно публичное." },
  { title: "Торренты", text: "Собственный поиск и отправка в qBittorrent." },
  { title: "Просмотр", text: "Запуск плеера через сессию воспроизведения." },
];

export function AuthPage({ onAuthenticate }: { onAuthenticate: (mode: AuthMode, username: string, password: string) => Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onAuthenticate(mode, username, password);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <div className="auth-hero">
          <div className="app-brand">
            <span className="fd-sb-mark"><Film size={18} /></span>
            <span className="app-brand__title">FilmDock</span>
          </div>
          <h1 className="fd-h1 auth-hero__title">
            Личная медиатека<br /><span className="fd-h1-soft">с доступом по запросу</span>
          </h1>
          <p className="auth-hero__text">
            Вход в единый интерфейс для каталога, очереди загрузки, библиотеки и воспроизведения через Jellyfin.
          </p>
          <div className="auth-feature-grid">
            {FEATURES.map(f => (
              <div key={f.title} className="auth-feature-card">
                <strong>{f.title}</strong>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="auth-panel">
          <div className="fd-set-seg auth-segment" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "login"} className={`fd-set-seg-btn ${mode === "login" ? "is-on" : ""}`} onClick={() => setMode("login")}>Вход</button>
            <button type="button" role="tab" aria-selected={mode === "register"} className={`fd-set-seg-btn ${mode === "register" ? "is-on" : ""}`} onClick={() => setMode("register")}>Регистрация</button>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label className="auth-field">
              <span>Имя пользователя</span>
              <input
                className="fd-set-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                minLength={3} maxLength={64} required
              />
            </label>
            <label className="auth-field">
              <span>Пароль</span>
              <input
                className="fd-set-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8} required
              />
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button type="submit" className="fd-btn-primary auth-submit" disabled={loading}>
              {loading && <span className="fd-spinner" />}
              {mode === "login" ? "Войти" : "Создать аккаунт"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
