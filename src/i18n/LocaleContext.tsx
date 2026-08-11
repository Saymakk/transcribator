import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  getMessages,
  t as translate,
  LOCALE_IDS,
  LOCALE_NATIVE_NAMES,
  type LocaleId,
  type Messages,
} from "../shared/i18n";

type LocaleContextValue = {
  locale: LocaleId;
  messages: Messages;
  t: (path: string, vars?: Record<string, string | number>) => string;
  setLocale: (locale: LocaleId) => void;
  locales: LocaleId[];
  nativeName: (id: LocaleId) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type Props = {
  locale: LocaleId;
  onLocaleChange: (locale: LocaleId) => void;
  children: ReactNode;
};

export function LocaleProvider({ locale, onLocaleChange, children }: Props) {
  const messages = useMemo(() => getMessages(locale), [locale]);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => translate(messages, path, vars),
    [messages],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      messages,
      t,
      setLocale: onLocaleChange,
      locales: LOCALE_IDS,
      nativeName: (id) => LOCALE_NATIVE_NAMES[id],
    }),
    [locale, messages, t, onLocaleChange],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale outside LocaleProvider");
  return ctx;
}
