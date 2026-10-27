import { useState } from "react";
import type { FormEvent } from "react";
import { Film } from "lucide-react";

type AuthMode = "login" | "register";

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
    <div className="fd-auth">
      <div className="fd-auth-card">
        <div className="fd-brand">
          <span className="fd-sb-mark"><Film size={16} /></span>
          <span>FilmDock</span>
        </div>
        <div className="fd-seg fd-seg--text fd-seg--wide" role="tablist" aria-label="Режим">
          <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-on" : ""} onClick={() => setMode("login")}>Вход</button>
          <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "is-on" : ""} onClick={() => setMode("register")}>Регистрация</button>
        </div>
        <form className="fd-auth-form" onSubmit={submit}>
          <label className="fd-field">
            <span>Имя пользователя</span>
            <input className="fd-input" value={username} onChange={e => setUsername(e.target.value)}
              autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={64} required />
          </label>
          <label className="fd-field">
            <span>Пароль</span>
            <input className="fd-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
          </label>
          {error && <p className="fd-error" role="alert">{error}</p>}
          <button type="submit" className="fd-btn-primary fd-auth-submit" disabled={loading}>
            {loading && <span className="fd-spinner" />}
            {mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>
      </div>
    </div>
  );
}
