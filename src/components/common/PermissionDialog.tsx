import { createPortal } from 'react-dom';

type PermissionDialogProps = {
  title: string;
  body: string;
  allowLabel: string;
  onAllow: () => void;
  onLater: () => void;
};

export default function PermissionDialog({ title, body, allowLabel, onAllow, onLater }: PermissionDialogProps) {
  return createPortal(
    <div className="wa-scrim center" onClick={onLater}>
      <div className="account-dialog notify-ask" role="alertdialog" aria-labelledby="permission-ask-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="permission-ask-title">{title}</h2>
        <p className="account-warn">{body}</p>
        <div className="account-actions">
          <button type="button" className="is-allow" onClick={onAllow}>{allowLabel}</button>
          <button type="button" onClick={onLater}>ليس الآن</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
