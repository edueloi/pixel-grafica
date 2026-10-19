import React, { useId } from 'react';

interface TabItem<T extends string> { id: T; label: string; icon?: React.ElementType; }
interface TabsProps<T extends string> { items: readonly TabItem<T>[]; value: T; onChange: (value: T) => void; label: string; children: React.ReactNode; }

export function Tabs<T extends string>({ items, value, onChange, label, children }: TabsProps<T>) {
  const id = useId();
  const selectByKey = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    onChange(items[next].id);
    document.getElementById(`${id}-${items[next].id}`)?.focus();
  };
  return <div className="min-w-0 space-y-3">
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {items.map((tab, index) => <button key={tab.id} id={`${id}-${tab.id}`} role="tab" type="button" aria-selected={value === tab.id} aria-controls={`${id}-panel`} tabIndex={value === tab.id ? 0 : -1}
        onClick={() => onChange(tab.id)} onKeyDown={event => selectByKey(event, index)}
        className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-blue-500 ${value === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
        {tab.icon && <tab.icon size={14} />}{tab.label}
      </button>)}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${value}`} tabIndex={0} className="min-w-0 focus-visible:outline-blue-500">{children}</div>
  </div>;
}
