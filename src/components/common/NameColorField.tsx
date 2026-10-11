import type { CSSProperties } from 'react';
import { normalizeUserColorInput, sanitizeUserColor } from '../../lib/userStyle';

type NameColorFieldProps = {
  color: string;
  colorInput: string;
  onColor: (hex: string) => void;
  onInput: (raw: string) => void;
  hint?: string;
};

export default function NameColorField({ color, colorInput, onColor, onInput, hint }: NameColorFieldProps) {
  const valid = /^#?[0-9a-f]{6}$/i.test(colorInput.trim());
  const picker = sanitizeUserColor(color, '#3d9b84');
  return (
    <div className="profile-style-block">
      <span className="profile-style-title">لون الاسم</span>
      {hint ? <p className="profile-style-hint">{hint}</p> : null}
      <div className="look-colors profile-name-colors">
        <label className="look-color">
          اللون
          <span className="look-chip" style={{ background: picker } as CSSProperties}>
            <input type="color" aria-label="لون الاسم" value={picker} onChange={(event) => onColor(event.target.value.toLowerCase())} />
          </span>
        </label>
        <label className="group-name profile-hex">
          <span>رمز اللون</span>
          <input
            dir="ltr"
            maxLength={7}
            value={colorInput}
            aria-invalid={!valid}
            aria-label="رمز اللون"
            onChange={(event) => {
              onInput(event.target.value);
              if (/^#?[0-9a-f]{6}$/i.test(event.target.value.trim())) {
                onColor(normalizeUserColorInput(event.target.value, color));
              }
            }}
          />
        </label>
      </div>
      {!valid && <p className="form-error">اكتب ستة أحرف للون، مثل #3d9b84.</p>}
    </div>
  );
}
