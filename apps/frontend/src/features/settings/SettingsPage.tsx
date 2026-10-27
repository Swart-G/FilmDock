import { useId, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Check } from "lucide-react";

import { ACCENTS } from "../../lib/theme";
import type { SetTweak, TweakAccent, Tweaks } from "../../lib/theme";
import type { AdminUser, JellyfinIntegrationStatus, StoredAuth } from "../../lib/types";

type SettingsPageProps = {
  auth: StoredAuth;
  jellyfinStatus: JellyfinIntegrationStatus | null;
  adminUsers: AdminUser[];
  t: Tweaks;
  setTweak: SetTweak;
  onLogout: () => void;
  onCreateUser: (username: string, password: string, role: string) => Promise<void>;
};

const JF_STATUS = {
  ok:            { tone: "ok",   label: "Подключено" },
  degraded:      { tone: "warn", label: "Работает с ограничениями" },
  misconfigured: { tone: "err",  label: "Не настроено" },
} as const;

function roleLabel(role: string) {
  return role === "admin" ? "Администратор" : role === "user" ? "Пользователь" : role;
}

export function SettingsPage({ auth, jellyfinStatus, adminUsers, t, setTweak, onLogout, onCreateUser }: SettingsPageProps) {
  const effectiveStatus = jellyfinStatus?.status ?? auth.jellyfinStatus;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fieldId = useId();

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await onCreateUser(username, password, role);
      setUsername(""); setPassword(""); setRole("user");
    } catch (reason: unknown) {
      setFormError(reason instanceof Error ? reason.message : "Не удалось создать пользователя.");
    } finally { setSaving(false); }
  }

  const jf = JF_STATUS[effectiveStatus] ?? JF_STATUS.misconfigured;

  return (
    <div className="fd-page fd-page--narrow">
      <header className="fd-page-h"><h1>Настройки</h1></header>

      <section className="fd-section">
        <h2 className="fd-section-title">Внешний вид</h2>
        <div className="fd-panel">
          <div className="fd-row">
            <span className="fd-row-label">Тема</span>
            <div className="fd-seg fd-seg--text" role="group" aria-label="Тема">
              <button type="button" className={t.theme === "dark" ? "is-on" : ""} aria-pressed={t.theme === "dark"} onClick={() => setTweak("theme", "dark")}>Тёмная</button>
              <button type="button" className={t.theme === "light" ? "is-on" : ""} aria-pressed={t.theme === "light"} onClick={() => setTweak("theme", "light")}>Светлая</button>
            </div>
          </div>
          <div className="fd-row">
            <span className="fd-row-label">Акцентный цвет</span>
            <div className="fd-swatches" role="group" aria-label="Акцентный цвет">
              {(Object.entries(ACCENTS) as [TweakAccent, (typeof ACCENTS)[TweakAccent]][]).map(([id, ac]) => (
                <button
                  key={id} type="button"
                  className={`fd-swatch ${t.accent === id ? "is-on" : ""}`}
                  style={{ "--sw": ac.fill, "--sw-ink": ac.ink } as CSSProperties}
                  onClick={() => setTweak("accent", id)}
                  title={ac.name} aria-label={ac.name} aria-pressed={t.accent === id}
                >
                  {t.accent === id && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="fd-section">
        <h2 className="fd-section-title">Учётная запись</h2>
        <div className="fd-panel">
          <div className="fd-row">
            <div className="fd-row-text">
              <span className="fd-row-label">{auth.user.username}</span>
              <span className="fd-row-desc">{roleLabel(auth.user.role)}</span>
            </div>
            <button type="button" className="fd-btn-ghost" onClick={onLogout}>Выйти</button>
          </div>
        </div>
      </section>

      <section className="fd-section">
        <h2 className="fd-section-title">Jellyfin</h2>
        <div className="fd-panel">
          <div className="fd-row">
            <div className="fd-row-text">
              <span className={`fd-status is-${jf.tone}`}>{jf.label}</span>
              <span className="fd-row-desc">{jellyfinStatus?.message ?? auth.jellyfinMessage ?? "Статус интеграции неизвестен."}</span>
            </div>
          </div>
          <div className="fd-row">
            <span className="fd-row-desc">Доступ к просмотру контролирует FilmDock: пользователь видит своё и то, что владелец открыл для всех.</span>
          </div>
        </div>
      </section>

      {auth.user.role === "admin" && (
        <section className="fd-section">
          <h2 className="fd-section-title">Пользователи</h2>
          <div className="fd-panel">
            {adminUsers.map(user => (
              <div key={user.id} className="fd-row">
                <div className="fd-row-text">
                  <span className="fd-row-label">{user.username}</span>
                  <span className="fd-row-desc">{roleLabel(user.role)}</span>
                </div>
                <span className="fd-row-desc">{new Date(user.created_at).toLocaleDateString("ru-RU")}</span>
              </div>
            ))}
            <form className="fd-row fd-row--form" onSubmit={submitUser}>
              <div className="fd-admin-form">
                <div className="fd-field">
                  <label htmlFor={`${fieldId}-user`}>Имя пользователя</label>
                  <input id={`${fieldId}-user`} className="fd-input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" minLength={3} maxLength={64} required />
                </div>
                <div className="fd-field">
                  <label htmlFor={`${fieldId}-pass`}>Пароль</label>
                  <input id={`${fieldId}-pass`} className="fd-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                </div>
                <div className="fd-field">
                  <label htmlFor={`${fieldId}-role`}>Роль</label>
                  <select id={`${fieldId}-role`} className="fd-select" value={role} onChange={e => setRole(e.target.value)}>
                    <option value="user">Пользователь</option>
                    <option value="admin">Администратор</option>
                  </select>
                </div>
                <button type="submit" className="fd-btn-primary" disabled={saving}>
                  {saving && <span className="fd-spinner" />}
                  Создать
                </button>
              </div>
              {formError && <p className="fd-error" role="alert">{formError}</p>}
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
