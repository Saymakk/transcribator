import { useLocale } from "../i18n/LocaleContext";

export type AppSection = "layouts" | "convert" | "punto" | "transform" | "settings";

type Props = {
  section: AppSection;
  onChange: (section: AppSection) => void;
};

export function SideNav({ section, onChange }: Props) {
  const { t } = useLocale();

  const items: { id: AppSection; label: string; hint: string }[] = [
    { id: "layouts", label: t("nav.layouts"), hint: t("nav.layoutsHint") },
    { id: "convert", label: t("nav.convert"), hint: t("nav.convertHint") },
    { id: "punto", label: t("nav.punto"), hint: t("nav.puntoHint") },
    { id: "transform", label: t("nav.transform"), hint: t("nav.transformHint") },
    { id: "settings", label: t("nav.settings"), hint: t("nav.settingsHint") },
  ];

  return (
    <nav className="side-nav">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`side-nav-item ${section === item.id ? "active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          <span className="side-nav-label">{item.label}</span>
          <span className="side-nav-hint">{item.hint}</span>
        </button>
      ))}
    </nav>
  );
}
