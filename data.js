// Mock data for FilmDock prototype
// All strings in Russian per spec

// Deterministic hash → hue for gradient placeholders
function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

window.hashHue = hashHue;

// Search results — torrents for "Дюна 2"
window.SEARCH_RESULTS = [
  { id: 't1', title: 'Дюна: Часть вторая', year: 2024, resolution: '4K HDR', release: 'REMUX', size: '78.4 GB', seeders: 1247, leechers: 23, tracker: 'rutracker', audio: 'RU/EN', new: true },
  { id: 't2', title: 'Дюна: Часть вторая', year: 2024, resolution: '4K', release: 'WEB-DL', size: '24.1 GB', seeders: 892, leechers: 14, tracker: 'rutracker', audio: 'RU/EN/UA' },
  { id: 't3', title: 'Дюна: Часть вторая', year: 2024, resolution: '1080p', release: 'BDRip', size: '12.3 GB', seeders: 2104, leechers: 67, tracker: 'kinozal', audio: 'RU Дубляж' },
  { id: 't4', title: 'Дюна: Часть вторая (IMAX)', year: 2024, resolution: '2160p HDR', release: 'WEB-DL', size: '54.0 GB', seeders: 412, leechers: 8, tracker: 'rutracker', audio: 'EN' },
  { id: 't5', title: 'Дюна: Часть вторая', year: 2024, resolution: '1080p', release: 'WEB-DL', size: '8.7 GB', seeders: 1531, leechers: 41, tracker: 'nnm-club', audio: 'RU Многоголосый' },
  { id: 't6', title: 'Дюна: Часть вторая (Dolby Vision)', year: 2024, resolution: '4K DV', release: 'REMUX', size: '82.6 GB', seeders: 287, leechers: 5, tracker: 'rutracker', audio: 'RU/EN' },
  { id: 't7', title: 'Дюна: Часть вторая', year: 2024, resolution: '720p', release: 'WEB-DLRip', size: '3.8 GB', seeders: 4231, leechers: 112, tracker: 'kinozal', audio: 'RU Дубляж' },
  { id: 't8', title: 'Дюна: Часть вторая', year: 2024, resolution: '1080p', release: 'CAMRip', size: '2.1 GB', seeders: 14, leechers: 89, tracker: 'unknown', audio: 'RU Многоголосый', warning: true },
];

// Library — movies and series with NO real posters, just titles
window.LIBRARY = [
  { id: 'l1',  title: 'Дюна: Часть вторая', year: 2024, type: 'movie',  badge: '4K', duration: '2ч 46м', added: '12 дн. назад' },
  { id: 'l2',  title: 'Оппенгеймер',         year: 2023, type: 'movie',  badge: '4K HDR', duration: '3ч 00м', added: '1 мес. назад' },
  { id: 'l3',  title: 'Разделение',          year: 2022, type: 'series', badge: 'S02', episodes: '2 сезона · 20 эпизодов', added: '3 дн. назад' },
  { id: 'l4',  title: 'Бегущий по лезвию 2049', year: 2017, type: 'movie',  badge: '1080p', duration: '2ч 44м', added: '2 мес. назад' },
  { id: 'l5',  title: 'Прибытие',             year: 2016, type: 'movie',  badge: '1080p', duration: '1ч 56м', added: '6 мес. назад' },
  { id: 'l6',  title: 'Чернобыль',            year: 2019, type: 'series', badge: 'S01', episodes: '5 эпизодов', added: '4 мес. назад' },
  { id: 'l7',  title: 'Тёмный',                  year: 2017, type: 'series', badge: 'S03', episodes: '3 сезона · 26 эпизодов', added: '8 мес. назад' },
  { id: 'l8',  title: 'Анора',                 year: 2024, type: 'movie',  badge: '1080p', duration: '2ч 19м', added: '6 дн. назад' },
  { id: 'l9',  title: 'Past Lives',            year: 2023, type: 'movie',  badge: '4K', duration: '1ч 45м', added: '2 мес. назад' },
  { id: 'l10', title: 'Конец мира',            year: 2024, type: 'movie',  badge: '4K HDR', duration: '2ч 35м', added: '1 нед. назад' },
  { id: 'l11', title: 'Перевал Дятлова',       year: 2020, type: 'series', badge: 'S01', episodes: '8 эпизодов', added: '5 мес. назад' },
  { id: 'l12', title: 'Лунный свет',           year: 2016, type: 'movie',  badge: '1080p', duration: '1ч 51м', added: '3 мес. назад' },
  { id: 'l13', title: 'Чужой: Завет',          year: 2017, type: 'movie',  badge: '4K', duration: '2ч 02м', added: '2 нед. назад' },
  { id: 'l14', title: 'Викинги: Вальхалла',    year: 2022, type: 'series', badge: 'S03', episodes: '3 сезона · 24 эпизода', added: '3 нед. назад' },
  { id: 'l15', title: 'Достать ножи',           year: 2019, type: 'movie',  badge: '1080p', duration: '2ч 10м', added: '4 мес. назад' },
  { id: 'l16', title: 'Воспоминания убийцы',   year: 2003, type: 'movie',  badge: '1080p', duration: '2ч 11м', added: '1 год назад' },
  { id: 'l17', title: 'Северянин',             year: 2022, type: 'movie',  badge: '4K HDR', duration: '2ч 16м', added: '5 мес. назад' },
  { id: 'l18', title: 'Падение дома Ашеров',   year: 2023, type: 'series', badge: 'S01', episodes: '8 эпизодов', added: '7 мес. назад' },
];

window.FILTER_CHIPS = {
  type: [
    { id: 'all',    label: 'Все' },
    { id: 'movie',  label: 'Фильмы' },
    { id: 'series', label: 'Сериалы' },
  ],
  quality: [
    { id: 'any',    label: 'Любое' },
    { id: '4k',     label: '4K' },
    { id: 'hdr',    label: 'HDR' },
    { id: '1080p',  label: '1080p' },
    { id: '720p',   label: '720p' },
  ],
  release: [
    { id: 'any',     label: 'Любой' },
    { id: 'remux',   label: 'REMUX' },
    { id: 'webdl',   label: 'WEB-DL' },
    { id: 'bdrip',   label: 'BDRip' },
  ],
};
