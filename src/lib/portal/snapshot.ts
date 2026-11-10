/**
 * Trimmed form-control snapshot (role, accessible name, required, options,
 * value, error) — what the planner sees instead of the raw page. < 2k tokens.
 */
import type { Page } from 'playwright';
import { shortHash } from '../claude/client';
import type { FormSnapshot, SnapshotControl } from '../types';

/** Runs in the browser. Kept dependency-free and serializable. */
function collect(): Omit<FormSnapshot, 'url'> {
  const visible = (el: Element) => {
    const h = el as HTMLElement;
    if (h.closest('[hidden],[aria-hidden="true"]')) return false;
    const st = getComputedStyle(h);
    return st.display !== 'none' && st.visibility !== 'hidden' && (h.offsetParent !== null || st.position === 'fixed');
  };
  const textWithoutHidden = (el: Element): string => {
    let out = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) out += n.textContent ?? '';
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as Element;
        if (e.getAttribute('aria-hidden') === 'true') return;
        out += textWithoutHidden(e);
      }
    });
    return out;
  };
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const nameOf = (el: HTMLElement): string => {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) return clean(labelledby.split(/\s+/).map((id) => textWithoutHidden(document.getElementById(id) ?? document.createElement('i'))).join(' '));
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return clean(textWithoutHidden(lab));
    }
    const wrap = el.closest('label');
    if (wrap) return clean(textWithoutHidden(wrap));
    if (el.tagName === 'BUTTON') return clean(textWithoutHidden(el));
    return '';
  };

  const form = document.querySelector('form[data-portal-form]');
  const controls: SnapshotControl[] = [];
  if (form) {
    form.querySelectorAll('input, select, textarea, button').forEach((node) => {
      const el = node as HTMLElement;
      if (!visible(el)) return;
      let role: SnapshotControl['role'] | null = null;
      if (el.tagName === 'SELECT') role = 'combobox';
      else if (el.tagName === 'TEXTAREA') role = 'textbox';
      else if (el.tagName === 'BUTTON') role = 'button';
      else if (el.tagName === 'INPUT') {
        const t = (el as HTMLInputElement).type;
        if (t === 'checkbox') role = 'checkbox';
        else if (t === 'file') role = 'file';
        else if (t === 'submit' || t === 'button') role = 'button';
        else if (t === 'text' || t === 'email' || t === '' || t === 'tel') role = 'textbox';
      }
      if (!role) return;
      const c: SnapshotControl = {
        role,
        name: nameOf(el),
        required: el.getAttribute('aria-required') === 'true' || (el as HTMLInputElement).required === true,
      };
      const legend = el.closest('fieldset')?.querySelector('legend');
      if (legend) c.section = clean(legend.textContent ?? '');
      if (el.tagName === 'SELECT') {
        const s = el as HTMLSelectElement;
        c.options = Array.from(s.options).map((o) => clean(o.textContent ?? ''));
        c.value = clean(s.selectedOptions[0]?.textContent ?? '');
      } else if (role === 'checkbox') c.checked = (el as HTMLInputElement).checked;
      else if (role === 'file') c.value = (el as HTMLInputElement).files?.[0]?.name ?? '';
      else if (role === 'textbox') {
        const v = (el as HTMLInputElement).value;
        c.value = v.length > 60 ? `${v.slice(0, 57)}…` : v;
      }
      const described = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id.startsWith('error-'));
      const err = described.map((id) => clean(document.getElementById(id)?.textContent ?? '')).filter(Boolean).join(' ');
      if (err) c.error = err;
      controls.push(c);
    });
  }
  const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
    .filter(visible)
    .map((a) => clean((a as HTMLElement).innerText ?? a.textContent ?? '').slice(0, 400))
    .filter(Boolean);
  const conf = document.querySelector('#confirmation-number');
  return {
    title: document.title,
    formVersion: form?.getAttribute('data-portal-form') ?? 'none',
    alerts,
    controls,
    confirmationId: conf?.getAttribute('data-confirmation-id') ?? undefined,
  };
}

/** tsx/esbuild wraps named functions in __name(); define it in the page so collect() runs. */
const NAME_SHIM = 'window.__name = window.__name || function (f) { return f; };';

export async function captureSnapshot(page: Page): Promise<FormSnapshot> {
  await page.evaluate(NAME_SHIM);
  const data = await page.evaluate(collect);
  return { url: page.url(), ...data };
}

/** Structure only (no values): roles, names, required, options, errors, alerts. */
export function snapshotFingerprint(s: FormSnapshot): string {
  const structure = {
    v: s.formVersion,
    c: s.controls.map((c) => [c.role, c.name, c.required ? 1 : 0, c.options ?? null, c.error ?? null]),
    a: s.alerts,
  };
  return shortHash(JSON.stringify(structure));
}

export function renderSnapshot(s: FormSnapshot): string {
  const lines: string[] = [`Page: ${s.title} (form ${s.formVersion})`];
  if (s.alerts.length) lines.push(`Alerts: ${s.alerts.join(' | ')}`);
  let section = '';
  for (const c of s.controls) {
    if (c.section && c.section !== section) {
      section = c.section;
      lines.push(`[${section}]`);
    }
    const bits = [`- ${c.role} "${c.name}"`];
    if (c.required) bits.push('required');
    if (c.options) bits.push(`options=${JSON.stringify(c.options)}`);
    if (c.value !== undefined) bits.push(`value=${JSON.stringify(c.value)}`);
    if (c.checked !== undefined) bits.push(`checked=${c.checked}`);
    if (c.error) bits.push(`ERROR=${JSON.stringify(c.error)}`);
    lines.push(bits.join(' '));
  }
  return lines.join('\n');
}
