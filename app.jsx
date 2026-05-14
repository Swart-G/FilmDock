// App — main shell, theming, toasts, tweaks

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "direction": "noir",
  "accent": "amber",
  "density": "cozy",
  "glow": 60,
  "radius": 14,
  "font": "inter",
  "theme": "dark"
}/*EDITMODE-END*/;

const DIRECTIONS = {
  noir: {
    label: 'Noir',
    dark: {
      bg: '#0B0B0F', bg2: '#141318',
      surface: 'rgba(255,255,255,0.04)', surfaceHi: 'rgba(255,255,255,0.07)',
      text: '#F4F1EA', muted: 'rgba(244,241,234,0.58)', dim: 'rgba(244,241,234,0.4)',
      border: 'rgba(255,255,255,0.07)', borderHi: 'rgba(255,255,255,0.14)',
      grain: true,
      bgImg: `radial-gradient(1200px 700px at 88% -20%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 60%),
              radial-gradient(900px 600px at -10% 100%, color-mix(in oklab, var(--accent2) 14%, transparent), transparent 55%)`,
    },
    light: {
      bg: '#F5F2EC', bg2: '#EDE9DF',
      surface: 'rgba(255,255,255,0.65)', surfaceHi: 'rgba(255,255,255,0.88)',
      text: '#1C1917', muted: 'rgba(28,25,23,0.60)', dim: 'rgba(28,25,23,0.42)',
      border: 'rgba(0,0,0,0.08)', borderHi: 'rgba(0,0,0,0.16)',
      grain: true,
      bgImg: `radial-gradient(1200px 700px at 88% -20%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 60%),
              radial-gradient(900px 600px at -10% 100%, color-mix(in oklab, var(--accent2) 10%, transparent), transparent 55%)`,
    },
  },
  aurora: {
    label: 'Aurora',
    dark: {
      bg: '#070912', bg2: '#0E1226',
      surface: 'rgba(255,255,255,0.05)', surfaceHi: 'rgba(255,255,255,0.09)',
      text: '#EFF1FA', muted: 'rgba(239,241,250,0.6)', dim: 'rgba(239,241,250,0.4)',
      border: 'rgba(255,255,255,0.08)', borderHi: 'rgba(255,255,255,0.16)',
      grain: false,
      bgImg: `radial-gradient(1400px 900px at 80% -10%, color-mix(in oklab, var(--accent) 32%, transparent), transparent 55%),
              radial-gradient(1100px 800px at -5% 110%, color-mix(in oklab, var(--accent2) 28%, transparent), transparent 60%),
              radial-gradient(700px 500px at 50% 50%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 70%)`,
    },
    light: {
      bg: '#EEF1FA', bg2: '#E3E9F7',
      surface: 'rgba(255,255,255,0.65)', surfaceHi: 'rgba(255,255,255,0.88)',
      text: '#0D1227', muted: 'rgba(13,18,39,0.60)', dim: 'rgba(13,18,39,0.40)',
      border: 'rgba(0,0,0,0.08)', borderHi: 'rgba(0,0,0,0.15)',
      grain: false,
      bgImg: `radial-gradient(1400px 900px at 80% -10%, color-mix(in oklab, var(--accent) 20%, transparent), transparent 55%),
              radial-gradient(1100px 800px at -5% 110%, color-mix(in oklab, var(--accent2) 16%, transparent), transparent 60%)`,
    },
  },
};

const ACCENTS = {
  amber:    { hex: '#FFB347', hex2: '#FF6E6E', name: 'Янтарь'  },
  magenta:  { hex: '#E14ECC', hex2: '#7A5AE0', name: 'Пурпур'  },
  electric: { hex: '#5AC8FA', hex2: '#7A5AE0', name: 'Электрик'},
};

const FONTS = {
  inter:   { stack: 'Inter, system-ui, sans-serif', label: 'Inter' },
  plex:    { stack: '"IBM Plex Sans", "Inter", system-ui, sans-serif', label: 'Plex' },
  manrope: { stack: 'Manrope, system-ui, sans-serif', label: 'Manrope' },
};

function Toast({ toast }) {
  return (
    <div className={`fd-toast fd-toast-${toast.kind}`} key={toast.id}>
      <div className="fd-toast-icon">
        <Icon name={toast.kind === 'success' ? 'check' : 'sparkle'} size={14} />
      </div>
      <div className="fd-toast-body">
        <strong>{toast.title}</strong>
        <span>{toast.body}</span>
      </div>
    </div>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="fd-toasts">
      {toasts.map((t) => <Toast key={t.id} toast={t} />)}
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = React.useState('search');
  const [toasts, setToasts] = React.useState([]);

  const pushToast = React.useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((cur) => [...cur, { ...toast, id }]);
    setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.id !== id));
    }, 3600);
  }, []);

  const dir = DIRECTIONS[t.direction] || DIRECTIONS.noir;
  const acc = ACCENTS[t.accent] || ACCENTS.amber;
  const font = FONTS[t.font] || FONTS.inter;
  const theme = t.theme || 'dark';
  const themeVars = dir[theme] || dir.dark;

  const cssVars = {
    '--bg':         themeVars.bg,
    '--bg-2':       themeVars.bg2,
    '--surface':    themeVars.surface,
    '--surface-hi': themeVars.surfaceHi,
    '--text':       themeVars.text,
    '--muted':      themeVars.muted,
    '--dim':        themeVars.dim,
    '--border':     themeVars.border,
    '--border-hi':  themeVars.borderHi,
    '--accent':     acc.hex,
    '--accent2':    acc.hex2,
    '--radius':     t.radius + 'px',
    '--radius-sm':  Math.max(6, t.radius - 6) + 'px',
    '--radius-lg':  (t.radius + 8) + 'px',
    '--glow':       (t.glow / 100).toString(),
    '--font':       font.stack,
    '--bg-img':     themeVars.bgImg,
  };

  return (
    <div className={`fd-root fd-dir-${t.direction} fd-acc-${t.accent} fd-theme-${theme}`} style={cssVars}>
      <div className="fd-ambient" aria-hidden="true" />
      {themeVars.grain && <div className="fd-grain" aria-hidden="true" />}

      <Sidebar route={route} onNavigate={setRoute} accent={acc} />

      <main className="fd-main">
        {route === 'search' && <SearchScreen pushToast={pushToast} />}
        {route === 'library' && <LibraryScreen density={t.density} pushToast={pushToast} />}
        {route === 'settings' && <SettingsScreen t={t} setTweak={setTweak} />}
        {route === 'profile' && (
          <div className="fd-screen fd-stub">
            <div className="fd-eyebrow"><span className="fd-eyebrow-dot" />Профиль</div>
            <h1 className="fd-h1">Алекс<br/><span className="fd-h1-soft">alex@filmdock</span></h1>
            <p className="fd-stub-p">Профиль не входит в скоуп текущей итерации.</p>
          </div>
        )}
      </main>

      <ToastStack toasts={toasts} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Тема">
          <TweakRadio
            label="Светлость"
            value={t.theme}
            options={[
              { value: 'dark',  label: 'Тёмная'  },
              { value: 'light', label: 'Светлая' },
            ]}
            onChange={(v) => setTweak('theme', v)}
          />
        </TweakSection>

        <TweakSection label="Направление">
          <TweakRadio
            label="Стиль"
            value={t.direction}
            options={[
              { value: 'noir',   label: 'Noir' },
              { value: 'aurora', label: 'Aurora' },
            ]}
            onChange={(v) => setTweak('direction', v)}
          />
        </TweakSection>

        <TweakSection label="Палитра">
          <TweakColor
            label="Акцент"
            value={t.accent === 'amber' ? '#FFB347' : t.accent === 'magenta' ? '#E14ECC' : '#5AC8FA'}
            options={['#FFB347', '#E14ECC', '#5AC8FA']}
            onChange={(hex) => {
              const k = hex === '#FFB347' ? 'amber' : hex === '#E14ECC' ? 'magenta' : 'electric';
              setTweak('accent', k);
            }}
          />
          <TweakSlider
            label="Свечение"
            value={t.glow}
            min={0} max={100} step={5} unit="%"
            onChange={(v) => setTweak('glow', v)}
          />
        </TweakSection>

        <TweakSection label="Типографика">
          <TweakRadio
            label="Шрифт"
            value={t.font}
            options={[
              { value: 'inter',   label: 'Inter' },
              { value: 'plex',    label: 'Plex' },
              { value: 'manrope', label: 'Manrope' },
            ]}
            onChange={(v) => setTweak('font', v)}
          />
        </TweakSection>

        <TweakSection label="Сетка">
          <TweakRadio
            label="Плотность"
            value={t.density}
            options={[
              { value: 'compact', label: 'compact' },
              { value: 'cozy',    label: 'cozy' },
              { value: 'loose',   label: 'loose' },
            ]}
            onChange={(v) => setTweak('density', v)}
          />
          <TweakSlider
            label="Радиус"
            value={t.radius}
            min={4} max={28} step={2} unit="px"
            onChange={(v) => setTweak('radius', v)}
          />
        </TweakSection>

        <TweakSection label="Демо">
          <TweakButton
            label="Показать тоаст"
            onClick={() => pushToast({
              title: 'Образец уведомления',
              body: 'Загрузка добавлена в очередь',
              kind: 'success',
            })}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
