import type { CSSProperties } from 'react';
import { normalizeUserColorInput, sanitizeUserColor } from '../../lib/userStyle';
import { useI18n } from '../../lib/i18n';

type NameColorFieldProps = {
  color: string;
  colorInput: string;
  onColor: (hex: string) => void;
  onInput: (raw: string) => void;
  hint?: string;
};

export default function NameColorField({ color, colorInput, onColor, onInput, hint }: NameColorFieldProps) {
  const { t } = useI18n();
  const valid = /^#?[0-9a-f]{6}$/i.test(colorInput.trim());
  const picker = sanitizeUserColor(color, '#3d9b84');
  return (
    <div className="profile-style-block">
      <span className="profile-style-title">{t('nameColor.title')}</span>
      {hint ? <p className="profile-style-hint">{hint}</p> : null}
      <div className="look-colors profile-name-colors">
        <label className="look-color">
          {t('nameColor.picker')}
          <span className="look-chip" style={{ background: picker } as CSSProperties}>
            <input type="color" aria-label={t('nameColor.picker')} value={picker} onChange={(event) => onColor(event.target.value.toLowerCase())} />
          </span>
        </label>
        <label className="group-name profile-hex">
          <span>{t('nameColor.code')}</span>
          <input
            dir="ltr"
            maxLength={7}
            value={colorInput}
            aria-invalid={!valid}
            aria-label={t('nameColor.code')}
            onChange={(event) => {
              onInput(event.target.value);
              if (/^#?[0-9a-f]{6}$/i.test(event.target.value.trim())) {
                onColor(normalizeUserColorInput(event.target.value, color));
              }
            }}
          />
        </label>
      </div>
      {!valid && <p className="form-error">{t('nameColor.invalid')}</p>}
    </div>
  );
}
