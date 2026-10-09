import { applyAppearance, brandName, sanitizeAppearance, textDirection } from './appearance';

describe('appearance', () => {
  it('keeps a local name and rejects unsafe logo data', () => {
    const look = sanitizeAppearance({
      name: '  بيتنا  ',
      logo: 'data:image/svg+xml,<svg>',
      accent: '#112233',
      bg: 'red',
    });
    expect(look.name).toBe('  بيتنا  ');
    expect(brandName(look.name)).toBe('بيتنا');
    expect(textDirection('أهلي')).toBe('rtl');
    expect(textDirection('ChatX')).toBe('ltr');
    expect(look.logo).toBe('');
    expect(look.wallpaper).toBe('');
    expect(sanitizeAppearance({ wallpaper: 'data:image/svg+xml,<svg>', wallpaperOpacity: 2 }).wallpaper).toBe('');
    expect(sanitizeAppearance({ wallpaper: 'data:image/jpeg,abc', wallpaperOpacity: 0.01 }).wallpaperOpacity).toBe(0.15);
    expect(sanitizeAppearance({ wallpaperOpacity: 9 }).wallpaperOpacity).toBe(0.8);
    expect(look.accent).toBe('#112233');
    expect(look.bg).toBe('#101614');
    expect(look.frame).toBe('#31403a');
    expect(sanitizeAppearance({ frame: '#abcdef', bg: '#000000' }).surface).toBe('#000000');
  });

  it('applies the palette on the document', () => {
    applyAppearance(sanitizeAppearance({ name: 'أهلي', accent: '#224466', bg: '#101010', surface: '#202020', text: '#f0f0f0' }));
    expect(document.documentElement.style.getPropertyValue('--chatx-accent')).toBe('#224466');
    expect(document.documentElement.style.getPropertyValue('--chatx-text')).toBe('#f4fbf8');
    expect(document.title).toBe('أهلي');
    applyAppearance(sanitizeAppearance({ bg: '#f7f4ef', surface: '#fff7ee', accent: '#f4fbf8' }));
    expect(document.documentElement.style.getPropertyValue('--chatx-text')).toBe('#14201c');
    expect(document.documentElement.style.getPropertyValue('--chatx-ink-surface')).toBe('#14201c');
    expect(document.documentElement.style.getPropertyValue('--chatx-on-accent')).toBe('#14201c');
    applyAppearance(sanitizeAppearance({ bg: '#000000', surface: '#111111', accent: '#000000', frame: '#66ccff' }));
    expect(document.documentElement.style.getPropertyValue('--chatx-bg')).toBe('#000000');
    expect(document.documentElement.style.getPropertyValue('--chatx-surface')).toBe('#000000');
    expect(document.documentElement.style.getPropertyValue('--chatx-raised')).toBe('#000000');
    expect(document.documentElement.style.getPropertyValue('--chatx-frame')).toBe('#66ccff');
    expect(document.documentElement.style.getPropertyValue('--chatx-border')).toBe('#66ccff');
    expect(document.documentElement.style.getPropertyValue('--chatx-text')).toBe('#f4fbf8');
    applyAppearance(sanitizeAppearance({ wallpaper: 'data:image/jpeg,abc', wallpaperOpacity: 0.3 }));
    expect(document.documentElement.dataset.wallpaper).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--chatx-wallpaper-opacity')).toBe('0.3');
    expect(document.documentElement.style.getPropertyValue('--chatx-halo')).toBe('#000000');
    const wallpaperValue = document.documentElement.style.getPropertyValue('--chatx-wallpaper');
    applyAppearance(sanitizeAppearance({ wallpaper: 'data:image/jpeg,abc', wallpaperOpacity: 0.6, name: 'X' }));
    expect(document.documentElement.style.getPropertyValue('--chatx-wallpaper')).toBe(wallpaperValue);
    expect(document.documentElement.style.getPropertyValue('--chatx-wallpaper-opacity')).toBe('0.6');
    expect(document.title).toBe('X');
    applyAppearance(sanitizeAppearance({}));
    expect(document.documentElement.dataset.wallpaper).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--chatx-halo')).toBe('');
  });
});
