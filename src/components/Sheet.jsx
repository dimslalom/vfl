import { useEffect, useRef } from 'react';
import { IconX } from '@tabler/icons-react';
import { t } from '../lib/i18n';
import styles from './Sheet.module.css';

// The one modal for new UI, on the native <dialog>: focus trap, Esc and the
// backdrop come free. Esc is caught on `cancel` as well as `close`, since some
// browsers close the dialog without firing `close`. A click on the backdrop
// targets the dialog itself, but so does a click whose press and release land
// on different children, so the point is checked too.
const outside = (event, element) => {
  const rect = element.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right
    || event.clientY < rect.top || event.clientY > rect.bottom;
};

export default function Sheet({ open, onClose, title, head = null, side = 'center', children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      data-side={side}
      aria-label={title}
      onClose={() => { if (open) onClose(); }}
      onCancel={() => { if (open) onClose(); }}
      onClick={event => { if (event.target === ref.current && outside(event, ref.current)) onClose(); }}
    >
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {head}
        <button type="button" className={styles.close} aria-label={t('Close')} onClick={onClose}>
          <IconX size={20} stroke={2} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.body}>{open && children}</div>
    </dialog>
  );
}
