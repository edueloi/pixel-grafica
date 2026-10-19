import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../src/lib/utils';
import { normalizeText } from '../utils/format';

/** Variável que pode entrar no texto. No texto salvo ela é `{chave}`; na tela aparece como um badge com o nome amigável. */
export interface TemplateVar { key: string; label: string; hint: string; example: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const makeChip = (v: TemplateVar) => {
  const chip = document.createElement('span');
  chip.contentEditable = 'false';
  chip.dataset.var = v.key;
  chip.className = 'var-chip';
  chip.title = v.hint;
  chip.textContent = v.label;
  return chip;
};

const toHtml = (plain: string, vars: TemplateVar[]) =>
  plain.split(/(\{\w+\})/g).map((part) => {
    const v = vars.find((x) => part === `{${x.key}}`);
    return v ? `<span contenteditable="false" data-var="${v.key}" class="var-chip" title="${esc(v.hint)}">${esc(v.label)}</span>` : esc(part).replace(/\n/g, '<br>');
  }).join('');

const toPlain = (node: Node): string => {
  let out = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) out += c.textContent ?? '';
    else if (c instanceof HTMLElement) {
      if (c.dataset.var) out += `{${c.dataset.var}}`;
      else if (c.tagName === 'BR') out += '\n';
      else out += (c.tagName === 'DIV' || c.tagName === 'P' ? '\n' : '') + toPlain(c);
    }
  });
  return out;
};

interface Props {
  label: string;
  value: string;
  onChange: (plain: string) => void;
  /** Variáveis que fazem sentido nesta mensagem (as demais não aparecem). */
  vars: TemplateVar[];
  rows?: number;
}

/**
 * Editor de mensagem com variáveis em badge: clique no badge abaixo do campo para inserir na posição do cursor,
 * ou digite o nome (ex.: "num") e escolha a sugestão (clique ou Tab). Backspace apaga o badge inteiro.
 */
export const VariableEditor: React.FC<Props> = ({ label, value, onChange, vars, rows = 3 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const internal = useRef(false);
  const saved = useRef<Range | null>(null);
  const [focused, setFocused] = useState(false);
  const [sugs, setSugs] = useState<TemplateVar[]>([]);
  const [active, setActive] = useState(-1);
  const id = useRef(`ve-${Math.random().toString(36).slice(2, 8)}`).current;

  // valor de fora → DOM (só quando não foi o próprio editor que mudou)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (internal.current) { internal.current = false; return; }
    const html = toHtml(value, vars);
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [value, vars]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    internal.current = true;
    onChange(toPlain(ref.current).replace(/\u00A0/g, ' '));
  }, [onChange]);

  const remember = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  };

  // palavra que está sendo digitada antes do cursor (só em texto comum, nunca dentro de um badge)
  const fragmentAtCaret = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !ref.current?.contains(node)) return null;
    const before = (node.textContent ?? '').slice(0, sel.anchorOffset);
    const m = /\{?[\p{L}_]*$/u.exec(before);
    return m && m[0] ? { text: m[0], node: node as Text, end: sel.anchorOffset } : null;
  };

  const refreshSuggestions = () => {
    const f = fragmentAtCaret();
    const q = f ? normalizeText(f.text.replace('{', '')) : '';
    if (!f || (q.length < 3 && !f.text.startsWith('{'))) { setSugs([]); setActive(-1); return; }
    const hit = vars.filter((v) => !q || normalizeText(v.key).startsWith(q) || normalizeText(v.label).startsWith(q) || (q.length >= 4 && normalizeText(v.key).includes(q)));
    setSugs(hit.slice(0, 5)); setActive(-1);
  };

  const place = (range: Range, v: TemplateVar) => {
    const chip = makeChip(v);
    range.insertNode(chip);
    const space = document.createTextNode(' ');
    chip.after(space);
    const r = document.createRange();
    r.setStart(space, 1); r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges(); sel?.addRange(r);
    saved.current = r.cloneRange();
    emit();
  };

  const pickSuggestion = (v: TemplateVar) => {
    const f = fragmentAtCaret();
    if (!f) return;
    const r = document.createRange();
    r.setStart(f.node, f.end - f.text.length); r.setEnd(f.node, f.end);
    r.deleteContents();
    place(r, v);
    setSugs([]); setActive(-1);
    ref.current?.focus();
  };

  const insertFromBadge = (v: TemplateVar) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    let range = saved.current && el.contains(saved.current.startContainer) ? saved.current : null;
    if (!range) { range = document.createRange(); range.selectNodeContents(el); range.collapse(false); }
    sel?.removeAllRanges(); sel?.addRange(range);
    range.deleteContents();
    // um espaço antes, se o cursor está colado numa palavra
    const prev = range.startContainer.nodeType === Node.TEXT_NODE ? (range.startContainer.textContent ?? '')[range.startOffset - 1] : undefined;
    if (prev && !/\s/.test(prev)) { const sp = document.createTextNode(' '); range.insertNode(sp); range.setStartAfter(sp); range.collapse(true); }
    place(range, v);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (sugs.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % sugs.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? sugs.length - 1 : a - 1)); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && active >= 0)) { e.preventDefault(); pickSuggestion(sugs[active >= 0 ? active : 0]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSugs([]); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertText', false, '\n'); }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-slate-700">{label}</label>
      <div className="relative">
        <div
          id={id} ref={ref} role="textbox" aria-multiline="true" aria-label={label} contentEditable suppressContentEditableWarning
          style={{ minHeight: `${rows * 1.5 + 1}rem` }}
          className={cn('w-full rounded-lg border bg-white px-3 py-2 text-[13px] leading-6 text-slate-800 whitespace-pre-wrap break-words outline-none transition-colors',
            focused ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300')}
          onInput={() => { emit(); remember(); refreshSuggestions(); }}
          onKeyDown={onKeyDown} onKeyUp={() => { remember(); }} onMouseUp={remember} onPaste={onPaste}
          onFocus={() => setFocused(true)} onBlur={() => { remember(); setFocused(false); setTimeout(() => setSugs([]), 150); }}
        />
        {sugs.length > 0 && (
          <ul role="listbox" aria-label="Variáveis sugeridas" className="absolute left-2 top-full z-20 mt-1 w-72 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {sugs.map((v, i) => (
              <li key={v.key} role="option" aria-selected={i === active}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(v); }}
                  className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-blue-50', i === active && 'bg-blue-50')}>
                  <span className="var-chip">{v.label}</span>
                  <span className="min-w-0 truncate text-[11px] text-slate-500">{v.hint}</span>
                </button>
              </li>
            ))}
            <li className="border-t border-slate-100 px-3 py-1 text-[10px] text-slate-400">Clique ou aperte Tab para inserir</li>
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Variáveis disponíveis">
        <span className="text-[11px] text-slate-500">Inserir:</span>
        {vars.map((v) => (
          <button key={v.key} type="button" title={`${v.hint} — ex.: ${v.example}`} onMouseDown={(e) => e.preventDefault()} onClick={() => insertFromBadge(v)}
            className="var-chip var-chip-btn"><Plus size={10} className="opacity-60" />{v.label}</button>
        ))}
      </div>
    </div>
  );
};
