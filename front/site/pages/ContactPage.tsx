import React, { useState } from 'react';
import { MessageCircle, Phone, Mail, MapPin, Clock, Instagram, Send } from 'lucide-react';
import { useSite, waLink } from '../siteApi';

const subjects = ['Orçamento', 'Dúvida sobre um produto', 'Criação de arte', 'Pedido em andamento', 'Outro assunto'];

/** Contato / falar com a loja: canais, endereço com mapa e formulário que abre o WhatsApp com a mensagem pronta. */
const ContactPage: React.FC = () => {
  const { home } = useSite();
  const c = home!.company;
  const [f, setF] = useState({ name: '', subject: subjects[0], message: '' });
  const [sent, setSent] = useState(false);
  const wa = c?.whatsapp;
  const insta = c?.instagram ? (c.instagram.startsWith('http') ? c.instagram : `https://instagram.com/${c.instagram.replace('@', '')}`) : null;

  const open = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wa) return;
    const text = [`Olá! Sou ${f.name.trim() || 'cliente do site'}.`, `Assunto: ${f.subject}`, f.message.trim()].filter(Boolean).join('\n');
    window.open(waLink(wa, text), '_blank', 'noopener');
    setSent(true);
  };

  const cards = [
    wa && { icon: MessageCircle, tone: 'bg-emerald-50 text-emerald-600', title: 'WhatsApp', text: c?.phone ?? '', href: waLink(wa, 'Olá! Vim pelo site.'), cta: 'Chamar agora' },
    c?.phone && { icon: Phone, tone: 'bg-blue-50 text-blue-600', title: 'Telefone', text: c.phone, href: `tel:+${c.phone.replace(/\D/g, '').replace(/^(?!55)/, '55')}`, cta: 'Ligar' },
    c?.email && { icon: Mail, tone: 'bg-pink-50 text-pink-600', title: 'E-mail', text: c.email, href: `mailto:${c.email}`, cta: 'Enviar e-mail' },
    insta && { icon: Instagram, tone: 'bg-amber-50 text-amber-600', title: 'Instagram', text: c!.instagram!, href: insta, cta: 'Seguir' },
  ].filter(Boolean) as { icon: typeof Phone; tone: string; title: string; text: string; href: string; cta: string }[];

  return (
    <div className="pxs-container py-10 sm:py-14">
      <header className="mb-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600 mb-2">Contato</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Fale com a loja</h1>
        <p className="mt-2 text-slate-600">Escolha o canal que preferir. Respondemos para tirar dúvidas, combinar arte, prazo e entrega.</p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ icon: Icon, tone, title, text, href, cta }) => (
          <li key={title}><a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="group block h-full rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-lg transition">
            <span className={`h-12 w-12 rounded-xl flex items-center justify-center ${tone}`}><Icon size={24} /></span>
            <p className="mt-4 font-semibold text-slate-900">{title}</p><p className="text-sm text-slate-600 break-words">{text}</p>
            <p className="mt-3 text-sm font-semibold text-blue-700 group-hover:underline">{cta} →</p>
          </a></li>
        ))}
      </ul>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="msg-title" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="msg-title" className="text-xl font-bold text-slate-900">Mande uma mensagem</h2>
          <p className="text-sm text-slate-600 mt-1">Ao enviar, abrimos o WhatsApp da loja com o seu texto pronto.</p>
          <form onSubmit={open} className="mt-4 space-y-3">
            <label className="block"><span className="text-sm text-slate-600">Seu nome</span><input type="text" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="mt-1 w-full h-12 px-4 rounded-xl border border-slate-300 outline-none focus:border-blue-500" /></label>
            <label className="block"><span className="text-sm text-slate-600">Assunto</span>
              <select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="mt-1 w-full h-12 px-4 rounded-xl border border-slate-300 bg-white outline-none focus:border-blue-500">{subjects.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="block"><span className="text-sm text-slate-600">Mensagem</span><textarea rows={5} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Conte o que você precisa…" className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500" required /></label>
            <button type="submit" disabled={!wa} className="w-full h-12 rounded-full bg-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-emerald-600 disabled:opacity-50"><Send size={18} />Enviar pelo WhatsApp</button>
            {sent && <p role="status" className="text-sm text-emerald-700">Abrimos o WhatsApp em outra aba. Se não abriu, use o botão “Chamar agora” acima.</p>}
          </form>
        </section>

        <section aria-labelledby="where-title" className="space-y-4">
          <h2 id="where-title" className="text-xl font-bold text-slate-900">Onde estamos</h2>
          {c?.address && <p className="flex items-start gap-2 text-slate-700"><MapPin size={18} className="mt-0.5 shrink-0 text-blue-600" />{c.address}</p>}
          {c?.hours && <p className="flex items-start gap-2 text-slate-700"><Clock size={18} className="mt-0.5 shrink-0 text-blue-600" />{c.hours}</p>}
          {c?.address && (
            <>
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3]">
                <iframe title="Mapa com a localização da loja" loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-full w-full border-0" src={`https://www.google.com/maps?q=${encodeURIComponent(c.address)}&output=embed`} />
              </div>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"><MapPin size={16} />Como chegar</a>
            </>
          )}
          {!c?.address && !c?.hours && <p className="text-slate-600">Fale com a gente pelos canais acima.</p>}
        </section>
      </div>
    </div>
  );
};

export default ContactPage;
