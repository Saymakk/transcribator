import { useEffect, useId, useRef } from "react";
import { DONATE_LINKS } from "../shared/donate";
import { useLocale } from "../i18n/LocaleContext";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function DonateModal({ open, onClose }: Props) {
  const { t } = useLocale();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const openLink = (url: string) => {
    void window.transcribator.openExternal(url);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h3 id={titleId}>{t("donate.title")}</h3>
          <button
            ref={closeRef}
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label={t("donate.close")}
          >
            ×
          </button>
        </div>
        <p className="hint">{t("donate.lead")}</p>
        <div className="donate-links">
          {DONATE_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              className="btn donate-link-btn"
              onClick={() => openLink(link.url)}
            >
              <span className="donate-link-label">{t(link.labelKey)}</span>
              <span className="donate-link-url">{link.url.replace(/^https?:\/\//, "")}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
