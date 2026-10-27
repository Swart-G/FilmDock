// Settings screen — appearance controls + account + jellyfin + security

// Inline segmented control for settings page
function SetSeg({ value, options, onChange }) {
  return (
    <div className="fd-set-seg">
      {options.map(o => (
        <button
          key={o.value}
          className={`fd-set-seg-btn ${value === o.value ? 'is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Accent color circles
function AccentPicker({ value, onChange }) {
  const opts = [
    { id: 'amber',    hex: '#FFB347', label: 'Янтарь'   },
    { id: 'magenta',  hex: '#E14ECC', label: 'Пурпур'   },
    { id: 'electric', hex: '#5AC8FA', label: 'Электрик' },
  ];
  return (
    <div className="fd-accent-picker">
      {opts.map(o => (
        <button
          key={o.id}
          className={`fd-accent-swatch ${value === o.id ? 'is-on' : ''}`}
          style={{ '--sw': o.hex }}
          onClick={() => onChange(o.id)}
          title={o.label}
        >
          {value === o.id && <Icon name="check" size={14} />}
        </button>
      ))}
    </div>
  );
}

// Range slider for settings
function SetSlider({ value, min, max, step = 1, unit = '', onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="fd-set-slider-wrap">
      <input
        type="range"
        className="fd-set-slider"
        min={min} max={max} step={step}
        value={value}
        style={{ '--pct': pct + '%' }}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="fd-set-slider-val fd-mono">{value}{unit}</span>
    </div>
  );
}

// Jellyfin status badge
function JellyfinStatus({ status }) {
  const map = {
    ok:       { label: 'Подключено',  cls: 'ok',       dot: '#4ADE80' },
    degraded: { label: 'Деградирован', cls: 'degraded', dot: '#FBBF24' },
    error:    { label: 'Ошибка',       cls: 'error',    dot: '#F87171' },
  };
  const s = map[status] || map.error;
  return (
    <span className={`fd-jf-status fd-jf-${s.cls}`}>
      <span className="fd-jf-dot" style={{ background: s.dot, boxShadow: `0 0 8px ${s.dot}` }} />
      {s.label}
    </span>
  );
}

function SettingsScreen({ t, setTweak }) {
  // Jellyfin state
  const [jfUrl,    setJfUrl]    = React.useState('http://192.168.1.100:8096');
  const [jfKey,    setJfKey]    = React.useState('');
  const [jfStatus, setJfStatus] = React.useState('ok');
  const [testing,  setTesting]  = React.useState(false);

  const testConnection = () => {
    setTesting(true);
    setJfStatus('degraded');
    setTimeout(() => { setJfStatus('ok'); setTesting(false); }, 1500);
  };

  // Password form
  const [pw, setPw] = React.useState({ cur: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = React.useState(null);

  const savePw = e => {
    e.preventDefault();
    if (!pw.cur) { setPwMsg({ ok: false, text: 'Введите текущий пароль' }); return; }
    if (pw.next.length < 8) { setPwMsg({ ok: false, text: 'Минимум 8 символов' }); return; }
    if (pw.next !== pw.confirm) { setPwMsg({ ok: false, text: 'Пароли не совпадают' }); return; }
    setPwMsg({ ok: true, text: 'Пароль успешно изменён' });
    setPw({ cur: '', next: '', confirm: '' });
    setTimeout(() => setPwMsg(null), 3500);
  };

  return (
    <div className="fd-screen fd-screen-settings">
      <div className="fd-eyebrow">
        <span className="fd-eyebrow-dot" />
        Настройки
      </div>
      <h1 className="fd-h1">
        Персонализация<br />
        <span className="fd-h1-soft">и конфигурация FilmDock</span>
      </h1>

      <div className="fd-settings">

        {/* ── ВНЕШНИЙ ВИД ── */}
        <section className="fd-set-section">
          <h2 className="fd-set-section-h">Внешний вид</h2>

          <div className="fd-set-card">
            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Тема</span>
                <span className="fd-set-desc">Светлая или тёмная подложка интерфейса</span>
              </div>
              <div className="fd-theme-seg">
                <button
                  className={`fd-theme-btn ${t.theme !== 'light' ? 'is-on' : ''}`}
                  onClick={() => setTweak('theme', 'dark')}
                >
                  <Icon name="moon" size={15} />
                  Тёмная
                </button>
                <button
                  className={`fd-theme-btn ${t.theme === 'light' ? 'is-on' : ''}`}
                  onClick={() => setTweak('theme', 'light')}
                >
                  <Icon name="sun" size={15} />
                  Светлая
                </button>
              </div>
            </div>
            <div className="fd-set-divider" />

            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Стиль интерфейса</span>
                <span className="fd-set-desc">Выберите визуальное направление</span>
              </div>
              <SetSeg
                value={t.direction}
                options={[
                  { value: 'noir',   label: 'Noir' },
                  { value: 'aurora', label: 'Aurora' },
                ]}
                onChange={v => setTweak('direction', v)}
              />
            </div>
            <div className="fd-set-divider" />

            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Акцентный цвет</span>
                <span className="fd-set-desc">Янтарь · Пурпур · Электрик</span>
              </div>
              <AccentPicker value={t.accent} onChange={v => setTweak('accent', v)} />
            </div>
            <div className="fd-set-divider" />

            <div className="fd-set-row">
              <div className="fd-set-row-l">
                <span className="fd-set-label">Плотность сетки</span>
                <span className="fd-set-desc">Размер карточек библиотеки</span>
              </div>
              <SetSeg
                value={t.density}
                options={[
                  { value: 'compact', label: 'Compact'},
                  { value: 'cozy',    label: 'Cozy'   },
                  { value: 'loose',   label: 'Loose'  },
                ]}
                onChange={v => setTweak('density', v)}
              />
            </div>
            <div className="fd-set-divider" />

            <div className="fd-set-row fd-set-row-v">
              <div className="fd-set-row-lh">
                <span className="fd-set-label">Интенсивность свечения</span>
              </div>
              <SetSlider
                value={t.glow} min={0} max={100} step={5} unit="%"
                onChange={v => setTweak('glow', v)}
              />
            </div>
            <div className="fd-set-divider" />

            <div className="fd-set-row fd-set-row-v">
              <div className="fd-set-row-lh">
                <span className="fd-set-label">Радиус скругления</span>
              </div>
              <SetSlider
                value={t.radius} min={4} max={28} step={2} unit="px"
                onChange={v => setTweak('radius', v)}
              />
            </div>
          </div>
        </section>

        {/* ── УЧЁТНАЯ ЗАПИСЬ ── */}
        <section className="fd-set-section">
          <h2 className="fd-set-section-h">Учётная запись</h2>
          <div className="fd-set-card">
            <div className="fd-set-profile">
              <div className="fd-set-avatar">А</div>
              <div className="fd-set-profile-info">
                <span className="fd-set-label">Алекс</span>
                <span className="fd-set-desc">alex@filmdock</span>
              </div>
              <button className="fd-set-btn-ghost">Редактировать</button>
            </div>
          </div>
        </section>

        {/* ── JELLYFIN ── */}
        <section className="fd-set-section">
          <h2 className="fd-set-section-h">
            Jellyfin
            <JellyfinStatus status={jfStatus} />
          </h2>
          <div className="fd-set-card">
            <div className="fd-set-row fd-set-row-v">
              <span className="fd-set-label">Адрес сервера</span>
              <input
                type="text"
                className="fd-set-input"
                value={jfUrl}
                placeholder="http://192.168.1.100:8096"
                onChange={e => setJfUrl(e.target.value)}
              />
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row fd-set-row-v">
              <span className="fd-set-label">API-ключ</span>
              <input
                type="password"
                className="fd-set-input"
                value={jfKey}
                placeholder="Вставьте ключ из панели Jellyfin"
                onChange={e => setJfKey(e.target.value)}
              />
            </div>
            <div className="fd-set-divider" />
            <div className="fd-set-row">
              <span className="fd-set-desc">
                {testing ? 'Проверяем соединение…' : 'Последняя проверка: только что'}
              </span>
              <div className="fd-set-row-actions">
                <button className="fd-set-btn-ghost" onClick={testConnection} disabled={testing}>
                  {testing ? <><span className="fd-spinner" style={{width:12,height:12}} /> Проверка…</> : 'Проверить'}
                </button>
                <button className="fd-set-btn-primary">Сохранить</button>
              </div>
            </div>
          </div>
        </section>

        {/* ── БЕЗОПАСНОСТЬ ── */}
        <section className="fd-set-section">
          <h2 className="fd-set-section-h">Безопасность</h2>
          <div className="fd-set-card">
            <form onSubmit={savePw}>
              <div className="fd-pw-fields">
                <div className="fd-set-field">
                  <label className="fd-set-label">Текущий пароль</label>
                  <input
                    type="password"
                    className="fd-set-input"
                    value={pw.cur}
                    placeholder="••••••••"
                    onChange={e => setPw(p => ({ ...p, cur: e.target.value }))}
                  />
                </div>
                <div className="fd-pw-row">
                  <div className="fd-set-field">
                    <label className="fd-set-label">Новый пароль</label>
                    <input
                      type="password"
                      className="fd-set-input"
                      value={pw.next}
                      placeholder="Минимум 8 символов"
                      onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
                    />
                  </div>
                  <div className="fd-set-field">
                    <label className="fd-set-label">Подтверждение</label>
                    <input
                      type="password"
                      className="fd-set-input"
                      value={pw.confirm}
                      placeholder="Повторите пароль"
                      onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {pwMsg && (
                <div className={`fd-pw-msg ${pwMsg.ok ? 'fd-ok' : 'fd-warn'}`}>
                  <Icon name={pwMsg.ok ? 'check' : 'x'} size={14} />
                  {pwMsg.text}
                </div>
              )}

              <div className="fd-set-row" style={{ marginTop: 16 }}>
                <span className="fd-set-desc">Смена пароля завершит все активные сессии</span>
                <button type="submit" className="fd-set-btn-primary">Изменить пароль</button>
              </div>
            </form>
          </div>
        </section>

      </div>
    </div>
  );
}

Object.assign(window, { SettingsScreen });
