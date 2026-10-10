export type Appearance = {
  name: string;
  logo: string;
  wallpaper: string;
  wallpaperOpacity: number;
  accent: string;
  link: string;
  bg: string;
  surface: string;
  frame: string;
  text: string;
};

export const DEFAULT_LOGO = '/assets/icon/icon.png';

export const DEFAULT_APPEARANCE: Appearance = {
  name: 'ChatX',
  logo: '',
  wallpaper: '',
  wallpaperOpacity: 0.45,
  accent: '#3d9b84',
  link: '#8fc9bb',
  bg: '#101614',
  surface: '#101614',
  frame: '#31403a',
  text: '#e7eeea',
};

export const APPEARANCE_PRESETS: Array<{ id: string; label: string; look: Pick<Appearance, 'accent' | 'bg' | 'surface' | 'frame' | 'text'> }> = [
  { id: 'chatx', label: 'ChatX', look: { accent: '#3d9b84', bg: '#101614', surface: '#101614', frame: '#31403a', text: '#e7eeea' } },
  { id: 'night', label: 'ليل', look: { accent: '#7f97c9', bg: '#10131a', surface: '#10131a', frame: '#3d4c66', text: '#e6ebf5' } },
  { id: 'sand', label: 'رمال', look: { accent: '#c4a574', bg: '#1a1612', surface: '#1a1612', frame: '#5a4a38', text: '#f3ece3' } },
  { id: 'plum', label: 'عنب', look: { accent: '#a56baf', bg: '#16121a', surface: '#16121a', frame: '#5a4064', text: '#f3eaf6' } },
];

const HEX = /^#[0-9a-f]{6}$/i;

function hex(value: string | undefined, fallback: string) {
  return value && HEX.test(value) ? value.toLowerCase() : fallback;
}

function channel(color: string, index: number) {
  return Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
}

function mix(from: string, to: string, amount: number) {
  const parts = [0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount));
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(color: string) {
  const shade = (value: number) => {
    const channelValue = value / 255;
    return channelValue <= 0.03928 ? channelValue / 12.92 : ((channelValue + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * shade(channel(color, 0)) + 0.7152 * shade(channel(color, 1)) + 0.0722 * shade(channel(color, 2));
}

export function brandName(name: string) {
  const trimmed = name.trim();
  return trimmed || DEFAULT_APPEARANCE.name;
}

export function textDirection(value: string) {
  const letter = value.match(/[A-Za-z\u00C0-\u024F\u0590-\u08FF]/);
  if (!letter) return 'ltr';
  return /[\u0590-\u08FF]/.test(letter[0]) ? 'rtl' : 'ltr';
}

export function sanitizeAppearance(value?: Partial<Appearance>): Appearance {
  const name = (value?.name ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 24);
  const logo = typeof value?.logo === 'string' && value.logo.startsWith('data:image/jpeg') && value.logo.length <= 120_000
    ? value.logo
    : '';
  const wallpaper = typeof value?.wallpaper === 'string' && value.wallpaper.startsWith('data:image/jpeg') && value.wallpaper.length <= 180_000
    ? value.wallpaper
    : '';
  const rawOpacity = Number(value?.wallpaperOpacity);
  const wallpaperOpacity = Number.isFinite(rawOpacity) ? Math.min(0.8, Math.max(0.15, rawOpacity)) : DEFAULT_APPEARANCE.wallpaperOpacity;
  return {
    name,
    logo,
    wallpaper,
    wallpaperOpacity,
    accent: hex(value?.accent, DEFAULT_APPEARANCE.accent),
    link: hex(value?.link, DEFAULT_APPEARANCE.link),
    bg: hex(value?.bg, DEFAULT_APPEARANCE.bg),
    surface: hex(value?.bg, DEFAULT_APPEARANCE.bg),
    frame: hex(value?.frame, DEFAULT_APPEARANCE.frame),
    text: hex(value?.text, DEFAULT_APPEARANCE.text),
  };
}

function inkOn(color: string) {
  return luminance(color) > 0.42 ? '#14201c' : '#f4fbf8';
}

let paintedColors = '';
let paintedWallpaper = '\0';

export function applyAppearance(look: Appearance) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const bg = hex(look.bg, DEFAULT_APPEARANCE.bg);
  const frame = hex(look.frame, DEFAULT_APPEARANCE.frame);
  const accent = hex(look.accent, DEFAULT_APPEARANCE.accent);
  const wallpaper = look.wallpaper.startsWith('data:image/jpeg') ? look.wallpaper : '';
  const colorKey = `${accent}|${bg}|${frame}|${look.link}`;
  document.title = brandName(look.name);
  if (colorKey === paintedColors && wallpaper === paintedWallpaper) {
    if (wallpaper) root.style.setProperty('--chatx-wallpaper-opacity', String(look.wallpaperOpacity));
    return;
  }
  paintedColors = colorKey;
  const surface = bg;
  const raised = bg;
  const mine = mix(accent, bg, 0.55);
  const text = inkOn(bg);
  const onSurface = inkOn(surface);
  const onRaised = inkOn(raised);
  const onMine = inkOn(mine);
  const soft = mix(bg, frame, 0.4);
  root.style.setProperty('--chatx-accent', accent);
  root.style.setProperty('--chatx-link', hex(look.link, DEFAULT_APPEARANCE.link));
  root.style.setProperty('--ion-color-primary', accent);
  root.style.setProperty('--chatx-bg', bg);
  root.style.setProperty('--ion-background-color', bg);
  root.style.setProperty('--chatx-surface', surface);
  root.style.setProperty('--ion-toolbar-background', surface);
  root.style.setProperty('--ion-card-background', surface);
  root.style.setProperty('--chatx-text', text);
  root.style.setProperty('--ion-text-color', text);
  root.style.setProperty('--chatx-ink-surface', onSurface);
  root.style.setProperty('--chatx-ink-raised', onRaised);
  root.style.setProperty('--chatx-on-mine', onMine);
  root.style.setProperty('--chatx-muted', mix(text, bg, 0.42));
  root.style.setProperty('--chatx-muted-surface', mix(onSurface, surface, 0.42));
  root.style.setProperty('--chatx-muted-raised', mix(onRaised, raised, 0.42));
  root.style.setProperty('--chatx-muted-mine', mix(onMine, mine, 0.42));
  root.style.setProperty('--chatx-border', frame);
  root.style.setProperty('--ion-border-color', frame);
  root.style.setProperty('--chatx-frame', frame);
  root.style.setProperty('--chatx-raised', raised);
  root.style.setProperty('--chatx-soft', soft);
  root.style.setProperty('--chatx-on-soft', inkOn(soft));
  root.style.setProperty('--chatx-wash', mix(bg, accent, 0.34));
  root.style.setProperty('--chatx-accent-soft', mix(accent, onSurface, 0.42));
  root.style.setProperty('--chatx-mine', mine);
  root.style.setProperty('--chatx-on-accent', inkOn(accent));
  root.style.setProperty('--ion-toolbar-color', onSurface);
  root.style.setProperty('--ion-item-background', surface);
  const steps = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950];
  steps.forEach((step, index) => {
    root.style.setProperty(`--ion-color-step-${step}`, mix(bg, text, index / (steps.length - 1)));
  });
  if (wallpaper !== paintedWallpaper) {
    paintedWallpaper = wallpaper;
    if (wallpaper) {
      root.dataset.wallpaper = '1';
      root.style.setProperty('--chatx-wallpaper', `url("${wallpaper}")`);
    } else {
      delete root.dataset.wallpaper;
      root.style.removeProperty('--chatx-wallpaper');
      root.style.removeProperty('--chatx-wallpaper-opacity');
      root.style.removeProperty('--chatx-halo');
    }
  }
  if (wallpaper) {
    root.style.setProperty('--chatx-wallpaper-opacity', String(look.wallpaperOpacity));
    root.style.setProperty('--chatx-halo', text === '#14201c' ? '#ffffff' : '#000000');
  }
}

export function logoFromFile(file: File) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return Promise.reject(new Error('type'));
  if (file.size > 4_000_000) return Promise.reject(new Error('size'));
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas'));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL('image/jpeg', 0.82);
      if (data.length > 120_000) reject(new Error('size'));
      else resolve(data);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load'));
    };
    image.src = url;
  });
}

export function wallpaperFromFile(file: File) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return Promise.reject(new Error('type'));
  if (file.size > 4_000_000) return Promise.reject(new Error('size'));
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const longest = Math.max(image.width, image.height);
      const scale = longest > 640 ? 640 / longest : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas'));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      for (const quality of [0.62, 0.48, 0.34]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= 180_000) {
          resolve(data);
          return;
        }
      }
      reject(new Error('size'));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load'));
    };
    image.src = url;
  });
}
