import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  onFocus?: () => void;
  /** When true, external value updates are applied even while focused (palette insert). */
  syncWhileFocused?: boolean;
  /** Request focus when this token changes (and is truthy). */
  focusToken?: string | number | null;
};

/**
 * Text field: uncontrolled while typing (native undo/selection),
 * synced from props when blurred or when syncWhileFocused is set.
 */
export function EditorTextField({
  value,
  onChange,
  className,
  placeholder,
  id,
  "aria-label": ariaLabel,
  onFocus,
  syncWhileFocused = false,
  focusToken = null,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const lastSent = useRef(value);
  const lastFocusToken = useRef<string | number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focusedRef.current && !syncWhileFocused) return;
    if (el.value !== value) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = value;
      if (focusedRef.current && syncWhileFocused) {
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          /* ignore */
        }
      } else if (focusedRef.current && start != null && end != null) {
        const max = el.value.length;
        try {
          el.setSelectionRange(Math.min(start, max), Math.min(end, max));
        } catch {
          /* ignore */
        }
      }
    }
    lastSent.current = value;
  }, [value, syncWhileFocused]);

  useEffect(() => {
    if (focusToken == null || focusToken === "") return;
    if (lastFocusToken.current === focusToken) return;
    lastFocusToken.current = focusToken;
    const el = ref.current;
    if (!el) return;
    // rAF: дождаться монтирования новой строки после addRule
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    });
  }, [focusToken]);

  return (
    <input
      ref={ref}
      id={id}
      className={className}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      onMouseDown={(e) => {
        // Не даём родительским кнопкам/хэндлерам перехватить первый клик.
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onFocus={() => {
        focusedRef.current = true;
        onFocus?.();
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        const next = e.currentTarget.value;
        if (next !== lastSent.current) {
          lastSent.current = next;
          onChange(next);
        }
      }}
      onInput={(e) => {
        const next = e.currentTarget.value;
        lastSent.current = next;
        onChange(next);
      }}
      onChange={(e) => {
        const next = e.currentTarget.value;
        if (next === lastSent.current) return;
        lastSent.current = next;
        onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey) {
          const k = e.key.toLowerCase();
          if (["a", "c", "v", "x", "z", "y"].includes(k)) {
            e.stopPropagation();
          }
        }
      }}
    />
  );
}
