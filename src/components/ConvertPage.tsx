import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssFieldCase,
  AssSrtFormat,
  AssSrtPrefs,
  AssSrtProfile,
  Layout,
  PuntoDictEntry,
  PuntoPairId,
} from "../shared/types";
import { DEFAULT_ASS_SRT_PREFS } from "../shared/types";
import {
  binaryToText,
  morseToText,
  textToBinary,
  textToMorse,
  transliterateLettersOnly,
} from "../shared/convert";
import { formatSupportHint, isSupportedDocument } from "../shared/documentFormats";
import {
  applyAssPreset,
  ASS_FORMAT_PRESETS,
  applyFormatToPrefs,
  caseForField,
  cloneFormat,
  formatSnapshot,
  formatsEqual,
  resolveAssFields,
  resolveActorSeparator,
  wrapperForField,
} from "../shared/assSrtPrefs";
import { CUE_MARKUP_PRESETS } from "../shared/cueMarkup";
import {
  formatAssCueLine,
  looksLikeAss,
  optionsFromFormat,
  parseAss,
  assParsedToSrt,
} from "../shared/assToSrt";
import {
  looksLikeMontage,
  montageLinesFromPlainText,
  parseMontage,
  type MontageLine,
} from "../shared/montage";
import { puntoConvert } from "../shared/punto";
import { getPuntoPair, PUNTO_PAIRS } from "../shared/puntoPairs";
import { loadDictPacks } from "../shared/dicts/load";
import { videoSupportHint } from "../shared/videoFormats";
import { useLocale } from "../i18n/LocaleContext";
import { VideoSubsPanel } from "./VideoSubsPanel";

const WRAPPER_PRESETS = ["", "[]", "{}", "()", "«»"] as const;
const CASE_OPTIONS: AssFieldCase[] = ["as-is", "upper", "lower"];

function newProfileId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type Props = {
  layout: Layout;
  assSrtPrefs: AssSrtPrefs;
  onAssSrtPrefsChange: (prefs: AssSrtPrefs) => void;
};

type ConvertMode = "translit" | "ass-srt" | "binary" | "morse" | "video-subs" | "punto";
type CodeDirection = "encode" | "decode" | "auto";
type PuntoDir = "a2b" | "b2a" | "auto";
type LoadedItem = {
  name: string;
  text: string;
  montageLines?: MontageLine[];
};

const MONTAGES_EXT = /\.(docx|doc|dotx)$/i;
const ASS_EXT = /\.(ass|ssa)$/i;

function isAssItem(item: LoadedItem): boolean {
  return ASS_EXT.test(item.name) || looksLikeAss(item.text);
}

function isMontageItem(item: LoadedItem): boolean {
  if (isAssItem(item)) return false;
  if (item.montageLines && parseMontage(item.montageLines).actors.length > 0) return true;
  if (MONTAGES_EXT.test(item.name) && looksLikeMontage(item.text)) return true;
  return looksLikeMontage(item.text);
}

export function ConvertPage({ layout, assSrtPrefs, onAssSrtPrefsChange }: Props) {
  const { t, locale } = useLocale();
  const prefs = assSrtPrefs ?? DEFAULT_ASS_SRT_PREFS;
  const [mode, setMode] = useState<ConvertMode>("translit");
  const [input, setInput] = useState("");
  const [direction, setDirection] = useState<"forward" | "reverse">("forward");
  const [codeDirection, setCodeDirection] = useState<CodeDirection>("auto");
  const [puntoPairId, setPuntoPairId] = useState<PuntoPairId>("ru-en");
  const [puntoDir, setPuntoDir] = useState<PuntoDir>("auto");
  const [puntoPack, setPuntoPack] = useState<PuntoDictEntry[]>([]);
  const [puntoPackLoading, setPuntoPackLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [montageName, setMontageName] = useState<string | null>(null);
  const [montageLines, setMontageLines] = useState<MontageLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragFieldIndex, setDragFieldIndex] = useState<number | null>(null);
  const [dropFieldIndex, setDropFieldIndex] = useState<number | null>(null);

  const [format, setFormat] = useState<AssSrtFormat>(() => formatSnapshot(prefs));
  const [profiles, setProfiles] = useState<AssSrtProfile[]>(() =>
    (prefs.profiles ?? []).map((p) => ({ ...cloneFormat(p), id: p.id, name: p.name })),
  );
  const [customActorSep, setCustomActorSep] = useState(
    () => prefs.actorSeparator !== null,
  );
  const skipPersist = useRef(true);
  const prefsFieldsKey = prefs.fields.join("\0");

  // Defer heavy ASS parse while typing so the UI stays responsive.
  const deferredInput = useDeferredValue(input);
  const assParsed = useMemo(
    () => (mode === "ass-srt" && deferredInput.trim() ? parseAss(deferredInput) : null),
    [mode, deferredInput],
  );
  const formatColumns = assParsed?.formatColumns ?? [];
  const formatKey = formatColumns.join("\0");

  useEffect(() => {
    setFormat(formatSnapshot(prefs));
    setProfiles((prefs.profiles ?? []).map((p) => ({ ...cloneFormat(p), id: p.id, name: p.name })));
    setCustomActorSep(prefs.actorSeparator !== null);
  }, [prefs]);

  // Restore saved field order when the ASS Format: columns change.
  useEffect(() => {
    if (formatColumns.length === 0) {
      setFormat((prev) => (prev.fields.length ? { ...prev, fields: [] } : prev));
      return;
    }
    const nextFields = resolveAssFields(formatColumns, prefs.fields);
    setFormat((prev) => {
      if (
        prev.fields.length === nextFields.length &&
        prev.fields.every((f, i) => f === nextFields[i])
      ) {
        return prev;
      }
      return { ...prev, fields: nextFields };
    });
  }, [formatKey, prefsFieldsKey]);

  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    const next: AssSrtPrefs = {
      ...applyFormatToPrefs(prefs, {
        ...format,
        fields: format.fields.length > 0 ? format.fields : prefs.fields,
        actorSeparator: customActorSep ? format.actorSeparator ?? format.separator : null,
      }),
      profiles,
    };
    if (
      formatsEqual(formatSnapshot(next), formatSnapshot(prefs)) &&
      next.profiles.length === prefs.profiles.length &&
      next.profiles.every(
        (p, i) =>
          p.id === prefs.profiles[i]?.id &&
          p.name === prefs.profiles[i]?.name &&
          formatsEqual(p, prefs.profiles[i]),
      )
    ) {
      return;
    }
    onAssSrtPrefsChange(next);
  }, [format, profiles, customActorSep]);

  const puntoPair = useMemo(() => getPuntoPair(puntoPairId), [puntoPairId]);

  useEffect(() => {
    if (mode !== "punto") return;
    let cancelled = false;
    setPuntoPackLoading(true);
    void loadDictPacks(puntoPair.packIds).then((entries) => {
      if (!cancelled) {
        setPuntoPack(entries);
        setPuntoPackLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, puntoPair.packIds]);

  const puntoResolvedSide: "a2b" | "b2a" = useMemo(() => {
    if (puntoDir !== "auto") return puntoDir;
    if (puntoPair.engine === "dict") return "a2b";
    const hasCyr = /[а-яёА-ЯЁ]/.test(input);
    return hasCyr ? "b2a" : "a2b";
  }, [puntoDir, puntoPair.engine, input]);

  const puntoOut = useMemo(() => {
    if (mode !== "punto") return "";
    const layoutDir =
      puntoResolvedSide === "a2b" ? puntoPair.a2b.layoutDir : puntoPair.b2a.layoutDir;
    return puntoConvert(input, layoutDir, puntoPack, puntoPair.engine);
  }, [mode, input, puntoResolvedSide, puntoPair, puntoPack]);

  const translitOut = useMemo(
    () => transliterateLettersOnly(input, layout, direction),
    [input, layout, direction],
  );

  const binaryResult = useMemo(() => {
    const trimmed = input.trim();
    const looksBinary = /^[01\s]+$/.test(trimmed) && /[01]{8}/.test(trimmed);
    const effectiveDirection: Exclude<CodeDirection, "auto"> =
      codeDirection === "auto" ? (looksBinary ? "decode" : "encode") : codeDirection;
    try {
      return {
        output:
          effectiveDirection === "encode" ? textToBinary(input) : binaryToText(input),
        error: null as string | null,
      };
    } catch (e) {
      return {
        output: "",
        error:
          e instanceof Error ? e.message : "Invalid binary input (use 8-bit groups)",
      };
    }
  }, [input, codeDirection]);

  const morseResult = useMemo(() => {
    const trimmed = input.trim();
    const looksMorse = /^[.\-\/\s]+$/.test(trimmed) && /[.\-]/.test(trimmed);
    const effectiveDirection: Exclude<CodeDirection, "auto"> =
      codeDirection === "auto" ? (looksMorse ? "decode" : "encode") : codeDirection;
    try {
      return {
        output: effectiveDirection === "encode" ? textToMorse(input) : morseToText(input),
        error: null as string | null,
      };
    } catch (e) {
      return {
        output: "",
        error:
          e instanceof Error ? e.message : "Invalid Morse input",
      };
    }
  }, [input, codeDirection]);

  const montageCast = useMemo(
    () => (montageLines && montageLines.length ? parseMontage(montageLines) : null),
    [montageLines],
  );

  const activeFormat = useMemo<AssSrtFormat>(
    () => ({
      ...format,
      fields: format.fields.length
        ? format.fields
        : resolveAssFields(formatColumns, prefs.fields),
      actorSeparator: customActorSep ? format.actorSeparator ?? format.separator : null,
    }),
    [format, formatColumns, prefs.fields, customActorSep],
  );

  const srtOptions = useMemo(
    () => optionsFromFormat(activeFormat, montageCast),
    [activeFormat, montageCast],
  );

  const srtOut = useMemo(() => {
    if (!assParsed) return "";
    return assParsedToSrt(assParsed, srtOptions);
  }, [assParsed, srtOptions]);

  const cuePreview = useMemo(() => {
    if (!assParsed?.rows.length) {
      return t("convert.assPreviewEmpty");
    }
    for (const row of assParsed.rows) {
      const line = formatAssCueLine(row, srtOptions);
      if (line) return line.replace(/\n/g, " / ");
    }
    return t("convert.assPreviewEmpty");
  }, [assParsed, srtOptions, t]);

  const patchFormat = (patch: Partial<AssSrtFormat>) => {
    setFormat((prev) => ({ ...prev, ...patch }));
  };

  const setFieldWrapper = (field: string, wrapper: string) => {
    setFormat((prev) => {
      const nextWrappers: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev.fieldWrappers)) {
        if (key.toLowerCase() === field.toLowerCase()) continue;
        nextWrappers[key] = value;
      }
      const trimmed = wrapper.trim();
      if (trimmed) nextWrappers[field] = trimmed;
      return { ...prev, fieldWrappers: nextWrappers };
    });
  };

  const setFieldCase = (field: string, mode: AssFieldCase) => {
    setFormat((prev) => {
      const nextCases: Record<string, AssFieldCase> = {};
      for (const [key, value] of Object.entries(prev.fieldCases)) {
        if (key.toLowerCase() === field.toLowerCase()) continue;
        nextCases[key] = value;
      }
      if (mode !== "as-is") nextCases[field] = mode;
      return { ...prev, fieldCases: nextCases };
    });
  };

  const applyPreset = (presetId: (typeof ASS_FORMAT_PRESETS)[number]["id"]) => {
    const preset = ASS_FORMAT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const next = applyAssPreset(preset, formatColumns.length ? formatColumns : ["Name", "Text"]);
    setFormat(next);
    setCustomActorSep(next.actorSeparator !== null);
  };

  const saveProfile = () => {
    const name = window.prompt(t("convert.assProfileNamePrompt"), t("convert.assProfileDefaultName"));
    if (!name || !name.trim()) return;
    const profile: AssSrtProfile = {
      id: newProfileId(),
      name: name.trim(),
      ...cloneFormat(activeFormat),
    };
    setProfiles((prev) => [...prev, profile]);
  };

  const loadProfile = (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    setFormat(cloneFormat(profile));
    setCustomActorSep(profile.actorSeparator !== null);
  };

  const deleteProfile = (id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  };

  const assFields = activeFormat.fields;
  const assFieldWrappers = activeFormat.fieldWrappers;
  const assActorWrapper = activeFormat.actorWrapper;
  const assSeparator = activeFormat.separator;
  const assKeepEmpty = activeFormat.keepEmpty;

  const output =
    mode === "ass-srt"
      ? srtOut
      : mode === "binary"
        ? binaryResult.output
        : mode === "morse"
          ? morseResult.output
          : mode === "punto"
            ? puntoOut
            : translitOut;
  const codeError =
    mode === "binary"
      ? binaryResult.error
      : mode === "morse"
        ? morseResult.error
        : null;

  const applyAssSource = (name: string, text: string) => {
    setFileName(name);
    setInput(text);
    setError(null);
    setMode("ass-srt");
    const parsed = parseAss(text);
    setFormat((prev) => ({
      ...prev,
      fields: resolveAssFields(parsed.formatColumns, prefs.fields),
    }));
  };

  const applyMontage = (name: string, lines: MontageLine[]) => {
    setMontageName(name);
    setMontageLines(lines);
    setError(null);
    setMode("ass-srt");
  };

  const applyItems = (items: LoadedItem[]) => {
    if (items.length === 0) return;
    let ass: LoadedItem | undefined;
    let montage: LoadedItem | undefined;
    let other: LoadedItem | undefined;
    for (const item of items) {
      if (isAssItem(item)) ass = item;
      else if (isMontageItem(item)) montage = item;
      else other = item;
    }

    if (ass) {
      applyAssSource(ass.name, ass.text);
    } else if (other) {
      setFileName(other.name);
      setInput(other.text);
      setError(null);
      if (looksLikeAss(other.text)) {
        setMode("ass-srt");
        const parsed = parseAss(other.text);
        setFormat((prev) => ({
          ...prev,
          fields: resolveAssFields(parsed.formatColumns, prefs.fields),
        }));
      }
    }

    if (montage) {
      const lines =
        montage.montageLines && montage.montageLines.length > 0
          ? montage.montageLines
          : montageLinesFromPlainText(montage.text);
      applyMontage(montage.name, lines);
    }
  };

  const loadFile = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await window.transcribator.openDocuments();
      if (!result.ok) {
        if (!result.canceled) setError(result.error);
        return;
      }
      applyItems(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadDroppedFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const items: LoadedItem[] = [];
      for (const file of list) {
        void isSupportedDocument(file.name);
        const bytes = await file.arrayBuffer();
        const result = await window.transcribator.extractDocument(file.name, bytes);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        items.push({
          name: file.name,
          text: result.text,
          montageLines: result.montageLines,
        });
      }
      applyItems(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveResult = async () => {
    const base = fileName ? fileName.replace(/\.[^.]+$/, "") : "converted";
    const ext = mode === "ass-srt" ? "srt" : "txt";
    const result = await window.transcribator.saveText(`${base}-out.${ext}`, output);
    if (!result.ok && !result.canceled && "error" in result) {
      setError(result.error);
    }
  };

  const copyOut = async () => {
    await navigator.clipboard.writeText(output);
  };

  const toggleField = (field: string) => {
    setFormat((prev) => {
      const list = prev.fields;
      if (list.some((f) => f.toLowerCase() === field.toLowerCase())) {
        const next = list.filter((f) => f.toLowerCase() !== field.toLowerCase());
        return {
          ...prev,
          fields: next.length ? next : resolveAssFields(formatColumns, prefs.fields),
        };
      }
      return { ...prev, fields: [...list, field] };
    });
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFormat((prev) => {
      const next = [...prev.fields];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...prev, fields: next };
    });
  };

  const reorderField = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setFormat((prev) => {
      const next = [...prev.fields];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return { ...prev, fields: next };
    });
  };

  const clearFieldDrag = () => {
    setDragFieldIndex(null);
    setDropFieldIndex(null);
  };

  return (
    <div className="page">
      <div className="main-header">
        <div>
          <h2>{t("convert.title")}</h2>
          <p>
            {mode === "ass-srt"
              ? t("convert.assLead")
              : mode === "video-subs"
                ? t("convert.videoLead", { formats: videoSupportHint() })
                : mode === "punto"
                  ? t("convert.puntoLead")
                  : t("convert.lead", { formats: formatSupportHint(), layout: layout.name })}
          </p>
        </div>
      </div>

      <div className="tool-toolbar">
        <div className="row-actions">
          <button
            type="button"
            className={`btn ${mode === "translit" ? "active-forward" : ""}`}
            onClick={() => setMode("translit")}
          >
            {t("convert.modeTranslit")}
          </button>
          <button
            type="button"
            className={`btn ${mode === "punto" ? "active-reverse" : ""}`}
            onClick={() => setMode("punto")}
          >
            {t("convert.modePunto")}
          </button>
          <button
            type="button"
            className={`btn ${mode === "ass-srt" ? "active-reverse" : ""}`}
            onClick={() => setMode("ass-srt")}
          >
            {t("convert.modeAssSrt")}
          </button>
          <button
            type="button"
            className={`btn ${mode === "video-subs" ? "active-forward" : ""}`}
            onClick={() => setMode("video-subs")}
          >
            {t("convert.modeVideoSubs")}
          </button>
          <button
            type="button"
            className={`btn ${mode === "binary" ? "active-forward" : ""}`}
            onClick={() => setMode("binary")}
          >
            Binary
          </button>
          <button
            type="button"
            className={`btn ${mode === "morse" ? "active-reverse" : ""}`}
            onClick={() => setMode("morse")}
          >
            Morse
          </button>
        </div>
        {mode === "translit" && (
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${direction === "forward" ? "active-forward" : ""}`}
              onClick={() => setDirection("forward")}
            >
              {t("convert.forward")}
            </button>
            <button
              type="button"
              className={`btn ${direction === "reverse" ? "active-reverse" : ""}`}
              onClick={() => setDirection("reverse")}
            >
              {t("convert.reverse")}
            </button>
          </div>
        )}
        {mode === "punto" && (
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${puntoDir === "auto" ? "active-off" : ""}`}
              onClick={() => setPuntoDir("auto")}
            >
              {t("convert.puntoAuto")}
            </button>
            <button
              type="button"
              className={`btn ${puntoDir === "a2b" ? "active-forward" : ""}`}
              onClick={() => setPuntoDir("a2b")}
              title={puntoPair.a2b.hint}
            >
              {puntoPair.a2b.label}
            </button>
            <button
              type="button"
              className={`btn ${puntoDir === "b2a" ? "active-reverse" : ""}`}
              onClick={() => setPuntoDir("b2a")}
              title={puntoPair.b2a.hint}
            >
              {puntoPair.b2a.label}
            </button>
          </div>
        )}
        {(mode === "binary" || mode === "morse") && (
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${codeDirection === "auto" ? "active-off" : ""}`}
              onClick={() => setCodeDirection("auto")}
            >
              Auto
            </button>
            <button
              type="button"
              className={`btn ${codeDirection === "encode" ? "active-forward" : ""}`}
              onClick={() => setCodeDirection("encode")}
            >
              Text → Code
            </button>
            <button
              type="button"
              className={`btn ${codeDirection === "decode" ? "active-reverse" : ""}`}
              onClick={() => setCodeDirection("decode")}
            >
              Code → Text
            </button>
          </div>
        )}
        {mode !== "video-subs" && (
          <div className="row-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void loadFile()}>
              {busy ? t("convert.loading") : t("convert.file")}
            </button>
            <button type="button" className="btn" onClick={() => setInput("")}>
              {t("convert.clear")}
            </button>
            <button type="button" className="btn" onClick={() => void copyOut()} disabled={!output}>
              {t("convert.copy")}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => void saveResult()}
              disabled={!output}
            >
              {mode === "ass-srt" ? t("convert.assSave") : t("convert.save")}
            </button>
          </div>
        )}
      </div>

      {mode === "video-subs" ? (
        <VideoSubsPanel />
      ) : (
        <>
      {mode === "punto" && (
        <div className="tool-block">
          <p className="pane-title">{t("convert.puntoPair")}</p>
          <div className="chip-grid">
            {PUNTO_PAIRS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip ${puntoPairId === p.id ? "chip-forward" : ""}`}
                onClick={() => setPuntoPairId(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {t("convert.puntoCurrent", { label: puntoPair.label })}
            {puntoPackLoading
              ? ` · ${t("convert.puntoLoadingDict")}`
              : ` · ${t("convert.puntoDictWords", { n: puntoPack.length.toLocaleString(locale) })}`}
            {puntoDir === "auto"
              ? ` · ${t("convert.puntoAutoResolved", {
                  dir: puntoResolvedSide === "a2b" ? puntoPair.a2b.label : puntoPair.b2a.label,
                })}`
              : ""}
          </p>
        </div>
      )}
      {mode === "ass-srt" && (
        <div className="tool-block ass-options">
          <div className="ass-montage-row">
            <div>
              <p className="pane-title">{t("convert.montageTitle")}</p>
              <p className="hint">
                {montageName
                  ? t("convert.montageLabel", {
                      name: montageName,
                      actors: String(montageCast?.actors.length ?? 0),
                      roles: String(montageCast?.roleToActors.size ?? 0),
                    })
                  : t("convert.montageHint")}
              </p>
            </div>
            {montageName && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setMontageName(null);
                  setMontageLines(null);
                }}
              >
                {t("convert.montageClear")}
              </button>
            )}
          </div>
          <div className="ass-presets-row">
            <span className="pane-title">{t("convert.assPresets")}</span>
            <div className="ass-wrap-presets">
              {ASS_FORMAT_PRESETS.map((preset) => {
                const cue = CUE_MARKUP_PRESETS.find((p) => p.id === preset.id);
                return (
                  <button
                    type="button"
                    key={preset.id}
                    className="btn btn-sm"
                    onClick={() => applyPreset(preset.id)}
                    title={t(`convert.assPreset_${preset.id}`)}
                  >
                    {cue?.sample ?? t(`convert.assPreset_${preset.id}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ass-presets-row">
            <span className="pane-title">{t("convert.assProfiles")}</span>
            <div className="ass-wrap-presets">
              <button type="button" className="btn btn-sm" onClick={saveProfile}>
                {t("convert.assProfileSave")}
              </button>
              {profiles.map((profile) => (
                <span className="ass-profile-chip" key={profile.id}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => loadProfile(profile.id)}
                    title={t("convert.assProfileLoad")}
                  >
                    {profile.name}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => deleteProfile(profile.id)}
                    title={t("convert.assProfileDelete")}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <h3>{t("convert.assFields")}</h3>
          {formatColumns.length === 0 ? (
            <p className="hint">{t("convert.assNoDialogues")}</p>
          ) : (
            <div className="ass-fields-compact">
              <div className="ass-fields-col">
                <p className="pane-title">{t("convert.assFieldsPick")}</p>
                <div className="ass-field-list ass-field-list--compact">
                  {formatColumns.map((field) => {
                    const checked = assFields.some((f) => f.toLowerCase() === field.toLowerCase());
                    const orderIdx = assFields.findIndex(
                      (f) => f.toLowerCase() === field.toLowerCase(),
                    );
                    return (
                      <label className={`ass-field-chip ${checked ? "is-on" : ""}`} key={field}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleField(field)}
                        />
                        <span className="ass-field-chip-name">{field}</span>
                        {checked && <span className="ass-field-chip-order">{orderIdx + 1}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="ass-fields-col">
                <p className="pane-title">{t("convert.assFieldsOrder")}</p>
                <p className="hint ass-order-hint">{t("convert.assDragHint")}</p>
                <div className="ass-order-list">
                  {assFields.map((field, index) => {
                    const wrap = wrapperForField(assFieldWrappers, field);
                    const fieldCase = caseForField(activeFormat.fieldCases, field);
                    return (
                      <div
                        className={`ass-order-row${
                          dragFieldIndex === index ? " is-dragging" : ""
                        }${dropFieldIndex === index ? " is-drop-target" : ""}`}
                        key={field}
                        draggable
                        onDragStart={(e) => {
                          if ((e.target as HTMLElement).closest("button,input,select")) {
                            e.preventDefault();
                            return;
                          }
                          setDragFieldIndex(index);
                          setDropFieldIndex(index);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", String(index));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dropFieldIndex !== index) setDropFieldIndex(index);
                        }}
                        onDragLeave={(e) => {
                          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                          if (dropFieldIndex === index) setDropFieldIndex(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from =
                            dragFieldIndex ?? Number(e.dataTransfer.getData("text/plain"));
                          if (!Number.isNaN(from)) reorderField(from, index);
                          clearFieldDrag();
                        }}
                        onDragEnd={clearFieldDrag}
                      >
                        <span className="ass-order-grip" aria-hidden title={t("convert.assDragHint")}>
                          ⠿
                        </span>
                        <span className="ass-order-index">{index + 1}</span>
                        <span className="ass-order-name">{field}</span>
                        <div className="ass-wrap-controls" title={t("convert.assWrapperHint")}>
                          <span className="hint ass-wrap-label">{t("convert.assWrapper")}</span>
                          <div className="ass-wrap-presets">
                            {WRAPPER_PRESETS.map((preset) => (
                              <button
                                type="button"
                                key={`${field}:${preset || "none"}`}
                                className={`btn btn-sm ass-wrap-preset${
                                  wrap === preset ? " is-on" : ""
                                }`}
                                onClick={() => setFieldWrapper(field, preset)}
                                title={
                                  preset
                                    ? t("convert.assWrapperExample", {
                                        sample: preset[0] + "…" + preset.slice(1),
                                      })
                                    : t("convert.assWrapperNone")
                                }
                              >
                                {preset || "∅"}
                              </button>
                            ))}
                          </div>
                          <input
                            className="ass-wrap-input"
                            value={wrap}
                            onChange={(e) => setFieldWrapper(field, e.target.value)}
                            placeholder="[]"
                            spellCheck={false}
                            aria-label={t("convert.assWrapper")}
                          />
                          <select
                            className="ass-case-select"
                            value={fieldCase}
                            onChange={(e) => setFieldCase(field, e.target.value as AssFieldCase)}
                            aria-label={t("convert.assCase")}
                            title={t("convert.assCase")}
                          >
                            {CASE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {t(`convert.assCase_${opt}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="row-actions ass-order-actions">
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={index <= 0}
                            onClick={() => moveField(index, -1)}
                            title={t("convert.assMoveUp")}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={index >= assFields.length - 1}
                            onClick={() => moveField(index, 1)}
                            title={t("convert.assMoveDown")}
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <label className="ass-sep-row">
            <span className="pane-title">{t("convert.assSeparator")}</span>
            <input
              value={assSeparator}
              onChange={(e) => patchFormat({ separator: e.target.value })}
              placeholder=". "
              spellCheck={false}
            />
            <span className="hint">{t("convert.assSeparatorHint")}</span>
          </label>
          <div className="ass-sep-row ass-actor-wrap-row">
            <span className="pane-title">{t("convert.assActorWrapper")}</span>
            <div className="ass-wrap-presets">
              {WRAPPER_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={`actor:${preset || "none"}`}
                  className={`btn btn-sm ass-wrap-preset${
                    assActorWrapper.trim() === preset ? " is-on" : ""
                  }`}
                  onClick={() => patchFormat({ actorWrapper: preset })}
                  title={
                    preset
                      ? t("convert.assWrapperExample", {
                          sample: preset[0] + "…" + preset.slice(1),
                        })
                      : t("convert.assWrapperNone")
                  }
                >
                  {preset || "∅"}
                </button>
              ))}
            </div>
            <input
              className="ass-wrap-input"
              value={assActorWrapper}
              onChange={(e) => patchFormat({ actorWrapper: e.target.value })}
              placeholder="{}"
              spellCheck={false}
            />
            <select
              className="ass-case-select"
              value={activeFormat.actorCase}
              onChange={(e) => patchFormat({ actorCase: e.target.value as AssFieldCase })}
              aria-label={t("convert.assActorCase")}
              title={t("convert.assActorCase")}
            >
              {CASE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {t(`convert.assCase_${opt}`)}
                </option>
              ))}
            </select>
            <span className="hint">{t("convert.assActorWrapperHint")}</span>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={customActorSep}
              onChange={(e) => {
                const on = e.target.checked;
                setCustomActorSep(on);
                patchFormat({
                  actorSeparator: on
                    ? format.actorSeparator ?? format.separator
                    : null,
                });
              }}
            />
            {t("convert.assActorSeparatorToggle")}
          </label>
          {customActorSep && (
            <label className="ass-sep-row">
              <span className="pane-title">{t("convert.assActorSeparator")}</span>
              <input
                value={resolveActorSeparator(activeFormat)}
                onChange={(e) => patchFormat({ actorSeparator: e.target.value })}
                placeholder=". "
                spellCheck={false}
              />
              <span className="hint">{t("convert.assActorSeparatorHint")}</span>
            </label>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={assKeepEmpty}
              onChange={(e) => patchFormat({ keepEmpty: e.target.checked })}
            />
            {t("convert.assKeepEmpty")}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={activeFormat.omitEmptyWrapped}
              onChange={(e) => patchFormat({ omitEmptyWrapped: e.target.checked })}
            />
            {t("convert.assOmitEmptyWrapped")}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={activeFormat.skipCuesWithoutActor}
              onChange={(e) => patchFormat({ skipCuesWithoutActor: e.target.checked })}
            />
            {t("convert.assSkipWithoutActor")}
          </label>
          <div className="ass-live-preview">
            <span className="pane-title">{t("convert.assLivePreview")}</span>
            <code className="ass-live-preview-line">{cuePreview}</code>
          </div>
          {formatColumns.length > 0 && !srtOut && input.trim() && (
            <p className="hint">{t("convert.assNoDialogues")}</p>
          )}
        </div>
      )}

      {fileName && <p className="hint">{t("convert.fileLabel", { name: fileName })}</p>}
      {mode === "ass-srt" && montageName && (
        <p className="hint">{t("convert.montageFileLabel", { name: montageName })}</p>
      )}
      {codeError && <p className="error-text">{codeError}</p>}
      {error && <p className="error-text">{error}</p>}

      <div
        className={`convert-dropzone ${dragOver ? "is-dragover" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void loadDroppedFiles(e.dataTransfer.files);
        }}
      >
        {busy && (
          <div className="convert-busy-overlay" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            <span>{t("convert.loading")}</span>
          </div>
        )}
        <p className="hint convert-drop-hint">
          {busy
            ? t("convert.dropBusy")
            : mode === "ass-srt"
              ? t("convert.dropAssMontage")
              : t("convert.dropIdle")}
        </p>

        <div className="dual-panes">
          <label className="pane">
            <span className="pane-title">{t("convert.source")}</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("convert.placeholder")}
              spellCheck={false}
            />
          </label>
          <label className="pane">
            <span className="pane-title">
              {mode === "ass-srt" ? t("convert.assPreview") : t("convert.result")}
            </span>
            <textarea value={output} readOnly spellCheck={false} />
          </label>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
