import { useId, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Check, UserRound } from "lucide-react";

import { ACCENTS } from "../../lib/theme";
import type { SetTweak, TweakAccent, TweakDirection, Tweaks } from "../../lib/theme";
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
  ok:            { className: "fd-jf-ok",       label: "Подключено" },
  degraded:      { className: "fd-jf-degraded", label: "Работает с ограничениями" },
  misconfigured: { className: "fd-jf-error",    label: "Не настроено" },
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

  const avatarLetter = auth.user.username[0]?.toUpperCase() ?? "?";
  const jf = JF_STATUS[effectiveStatus] ?? JF_STATUS.misconfigured;
  const glowPct = t.glow;
  const radiusPct = ((t.radius - 4) / (28 - 4)) * 100;

  return (
    <>
      <div className="fd-eyebrow"><span className="fd-eyebrow-dot" />Настройки</div>
      <h1 className="fd-h1">Персонализация<br /><span className="fd-h1-soft">и конфигурация FilmDock</span></h1>

      <div className="fd-settings">
        <section className="fd-set-section">
          <h2 className="fd-set-section-h">Внешний вид</h2>
          <div className="fd-set-card">
            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Тема</span>
                <span className="fd-set-desc">Светлая или тёмная подложка</span>
              </div>
              <div className="fd-set-seg" role="group" aria-label="Тема">
                <button type="button" aria-pressed={t.theme !== "light"} className={`fd-set-seg-btn ${t.theme !== "light" ? "is-on" : ""}`} onClick={() => setTweak("theme", "dark")}>Тёмная</button>
                <button type="button" aria-pressed={t.theme === "light"} className={`fd-set-seg-btn ${t.theme === "light" ? "is-on" : ""}`} onClick={() => setTweak("theme", "light")}>Светлая</button>
              </div>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Стиль интерфейса</span>
                <span className="fd-set-desc">Визуальное направление</span>
              </div>
              <div className="fd-set-seg" role="group" aria-label="Стиль интерфейса">
                {(["noir", "aurora"] as TweakDirection[]).map(d => (
                  <button key={d} type="button" aria-pressed={t.direction === d} className={`fd-set-seg-btn ${t.direction === d ? "is-on" : ""}`} onClick={() => setTweak("direction", d)}>{d === "noir" ? "Noir" : "Aurora"}</button>
                ))}
              </div>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Акцентный цвет</span>
                <span className="fd-set-desc">{ACCENTS[t.accent]?.name}</span>
              </div>
              <div className="fd-accent-picker" role="group" aria-label="Акцентный цвет">
                {(Object.entries(ACCENTS) as [TweakAccent, (typeof ACCENTS)[TweakAccent]][]).map(([id, ac]) => (
                  <button
                    key={id} type="button"
                    className={`fd-accent-swatch ${t.accent === id ? "is-on" : ""}`}
                    style={{ "--sw": ac.hex } as CSSProperties}
                    onClick={() => setTweak("accent", id)}
                    title={ac.name} aria-label={ac.name} aria-pressed={t.accent === id}
                  >
                    {t.accent === id && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row fd-set-row-v">
              <div className="fd-set-row-lh">
                <label className="fd-set-label" htmlFor={`${fieldId}-glow`}>Свечение</label>
                <span className="fd-set-slider-val">{t.glow}%</span>
              </div>
              <input id={`${fieldId}-glow`} type="range" className="fd-set-slider" min={0} max={100} step={5} value={t.glow}
                style={{ "--pct": `${glowPct}%` } as CSSProperties}
                onChange={e => setTweak("glow", Number(e.target.value))} />
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row fd-set-row-v">
              <div className="fd-set-row-lh">
                <label className="fd-set-label" htmlFor={`${fieldId}-radius`}>Радиус скругления</label>
                <span className="fd-set-slider-val">{t.radius}px</span>
              </div>
              <input id={`${fieldId}-radius`} type="range" className="fd-set-slider" min={4} max={28} step={2} value={t.radius}
                style={{ "--pct": `${radiusPct}%` } as CSSProperties}
                onChange={e => setTweak("radius", Number(e.target.value))} />
            </div>
          </div>
        </section>

        <section className="fd-set-section">
          <h2 className="fd-set-section-h">Учётная запись</h2>
          <div className="fd-set-card">
            <div className="fd-set-profile">
              <div className="fd-set-avatar">{avatarLetter}</div>
              <div className="fd-set-profile-info">
                <span className="fd-set-label">{auth.user.username}</span>
                <span className="fd-set-desc">{roleLabel(auth.user.role)}</span>
              </div>
              <button type="button" className="fd-set-btn-ghost" onClick={onLogout}>Выйти</button>
            </div>
          </div>
        </section>

        <section className="fd-set-section">
          <h2 className="fd-set-section-h">
            Jellyfin
            <span className={`fd-jf-status ${jf.className}`}>
              <span className="fd-jf-dot" />
              {jf.label}
            </span>
          </h2>
          <div className="fd-set-card">
            <div className="fd-set-row">
              <span className="fd-set-desc">
                {jellyfinStatus?.message ?? auth.jellyfinMessage ?? "Статус интеграции неизвестен."}
              </span>
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row">
              <span className="fd-set-desc">Доступ к просмотру контролируется FilmDock: пользователь видит своё и контент, который владелец пометил как публичный.</span>
            </div>
          </div>
        </section>

        {auth.user.role === "admin" && (
          <section className="fd-set-section">
            <h2 className="fd-set-section-h"><UserRound size={16} />Пользователи</h2>
            <div className="fd-set-card">
              <div className="fd-admin-users">
                {adminUsers.map(user => (
                  <div key={user.id} className="fd-admin-user-row">
                    <div>
                      <div className="fd-set-label">{user.username}</div>
                      <div className="fd-set-desc">{roleLabel(user.role)}</div>
                    </div>
                    <span className="tiny-pill">{new Date(user.created_at).toLocaleDateString("ru-RU")}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={submitUser}>
                <div className="fd-admin-form">
                  <div className="fd-admin-form-field">
                    <label htmlFor={`${fieldId}-user`}>Имя пользователя</label>
                    <input id={`${fieldId}-user`} className="fd-set-input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" minLength={3} maxLength={64} required />
                  </div>
                  <div className="fd-admin-form-field">
                    <label htmlFor={`${fieldId}-pass`}>Пароль</label>
                    <input id={`${fieldId}-pass`} className="fd-set-input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                  </div>
                  <div className="fd-admin-form-field">
                    <label htmlFor={`${fieldId}-role`}>Роль</label>
                    <select id={`${fieldId}-role`} className="fd-set-input" value={role} onChange={e => setRole(e.target.value)}>
                      <option value="user">Пользователь</option>
                      <option value="admin">Администратор</option>
                    </select>
                  </div>
                  <button type="submit" className="fd-set-btn-primary" disabled={saving}>
                    {saving && <span className="fd-spinner" />}
                    Создать
                  </button>
                </div>
                {formError && <div className="auth-error fd-admin-error" role="alert">{formError}</div>}
              </form>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
