import React from 'react';
import { Combobox } from './ui';
import { maskPhone } from '../utils/format';
import type { Customer } from '../types';

export const CustomerSelect: React.FC<{ customers: Customer[]; value: string; onChange: (id: string) => void; disabled?: boolean }> = ({ customers, value, onChange, disabled }) => (
  <div>
    <label className="ds-label block mb-1">Cliente</label>
    <Combobox
      disabled={disabled} value={value} placeholder="Escolha o cliente" searchPlaceholder="Buscar por nome ou telefone"
      emptyMessage="Nenhum cliente encontrado. Cadastre em Clientes."
      options={customers.map((c) => ({ value: c.id, label: c.name, subtitle: [c.company, maskPhone(c.phone)].filter(Boolean).join(' · ') }))}
      onChange={(v) => onChange(Array.isArray(v) ? v[0] ?? '' : v)}
    />
  </div>
);
