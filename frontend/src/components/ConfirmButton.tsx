// Confirmation for important actions (delete, remove, leave, disconnect): a Base UI Alert Dialog with Animate UI's motion
// (the dialog scales up out of a soft blur, the backdrop fades). Esc or Cancel keeps everything as it was.
import { useState } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Spinner } from './Icons';

export function ConfirmButton({ label, onConfirm, children, className = 'ib', title, description, confirmLabel, danger = true }: {
  /** accessible name of the trigger, also the default dialog title */
  label: string;
  onConfirm(): void | Promise<unknown>;
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm() } finally { setBusy(false); setOpen(false) }
  };
  return (
    <AlertDialog.Root open={open} onOpenChange={o => { if (!busy) setOpen(o) }}>
      <AlertDialog.Trigger className={className} aria-label={label} title={label}>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="cd-backdrop" />
        <AlertDialog.Popup className="cd-popup">
          <AlertDialog.Title className="cd-title">{title ?? label + '?'}</AlertDialog.Title>
          <AlertDialog.Description className="cd-desc">{description ?? 'This cannot be undone.'}</AlertDialog.Description>
          <div className="cd-actions">
            <AlertDialog.Close className="btn" disabled={busy}>Cancel</AlertDialog.Close>
            <button type="button" className={'btn ' + (danger ? 'cd-danger' : 'primary')} onClick={confirm} disabled={busy} aria-busy={busy} autoFocus>
              {busy && <Spinner />}{confirmLabel ?? label}</button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
