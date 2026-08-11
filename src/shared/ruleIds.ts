import type { LayoutRule } from "./types";

/** Стабильный id строки правила (не влияет на транслит). */
export function newRuleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function withRuleId(rule: LayoutRule): LayoutRule {
  return rule.id ? rule : { ...rule, id: newRuleId() };
}

export function withRuleIds(rules: LayoutRule[]): LayoutRule[] {
  return rules.map(withRuleId);
}

export function makeRule(from: string, to: string): LayoutRule {
  return { id: newRuleId(), from, to };
}
