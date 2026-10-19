import React, { useState } from 'react';
import { Send, FileText, AlertTriangle } from 'lucide-react';
import { Modal, ModalFooter, Button, Textarea } from './ui';
import { errMsg } from '../api';
import { maskPhone } from '../utils/format';

interface Props {
  title: string; customerName: string; phone?: string | null; defaultMessage: string; fileName?: string;
  onSend: (message: string) => Promise<void>; onClose: () => void; sendLabel?: string;
}

/** Pequena janela de confirmação para enviar um documento (PDF) ou aviso ao cliente pelo WhatsApp, com a mensagem editável. */
export const SendWhatsappModal: React.FC<Props> = ({ title, customerName, phone, defaultMessage, fileName, onSend, onClose, sendLabel = 'Enviar pelo WhatsApp' }) => {
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const noPhone = !phone || phone.replace(/\D/g, '').length < 10;

  const send = async () => {
    if (sending || noPhone) return;
    if (!message.trim()) { setError('Escreva a mensagem.'); return; }
    setSending(true); setError('');
    try { await onSend(message.trim()); } catch (e) { setError(errMsg(e)); setSending(false); }
  };

  return (
    <Modal isOpen onClose={sending ? () => {} : onClose} size="md" title={title}
      footer={<ModalFooter align="between"><Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>Cancelar</Button>
        <Button size="sm" loading={sending} disabled={noPhone} iconLeft={<Send size={14} />} onClick={send}>{sendLabel}</Button></ModalFooter>}>
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
          <p><span className="text-slate-500">Para:</span> <b className="font-medium text-slate-800">{customerName}</b>{!noPhone && <span className="text-slate-600"> · {maskPhone(phone)}</span>}</p>
          {fileName && <p className="flex items-center gap-1.5 text-slate-600"><FileText size={13} className="text-blue-600" />{fileName} vai junto com a mensagem</p>}
        </div>
        {noPhone && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />Este cliente não tem WhatsApp cadastrado. Edite o cliente e informe o número com DDD para poder enviar.
          </p>
        )}
        <Textarea label="Mensagem" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} disabled={noPhone} />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};
