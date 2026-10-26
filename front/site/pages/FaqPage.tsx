import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, ArrowRight } from 'lucide-react';
import { SITE, buildFaq, useSite, waLink } from '../siteApi';
import { Faq, PageHero, Reveal } from '../components';

/** Dúvidas frequentes: perguntas montadas com os dados reais da loja (pagamento, entrega, arte, horário e endereço). */
const FaqPage: React.FC = () => {
  const { home } = useSite();
  const c = home!.company;
  const items = buildFaq(c);

  return (
    <>
      <PageHero eyebrow="Dúvidas frequentes" title="Perguntas que sempre recebemos" text="Pagamento, entrega, criação de arte e horário de atendimento, de forma rápida." crumbs={[{ label: 'Dúvidas' }]} />
      <div className="pxs-container py-12 grid gap-8 lg:grid-cols-3 items-start">
        <Reveal className="lg:col-span-2"><Faq items={items} /></Reveal>
        <aside className="lg:sticky lg:top-24 space-y-4">
          <Reveal className="rounded-2xl border border-slate-200 bg-white p-5">
            <span className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><MessageCircle size={22} /></span>
            <h2 className="mt-3 font-semibold text-slate-900">Não achou o que procurava?</h2>
            <p className="mt-1 text-sm text-slate-600">Chame a gente no WhatsApp que a equipe responde.</p>
            {c?.whatsapp && <a href={waLink(c.whatsapp, 'Olá! Tenho uma dúvida.')} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 h-10 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"><MessageCircle size={16} />Falar no WhatsApp</a>}
            <Link to={`${SITE}/contato`} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 h-10 rounded-full border border-slate-300 text-sm font-semibold text-slate-800 hover:border-blue-500">Outras formas de contato<ArrowRight size={15} /></Link>
          </Reveal>
        </aside>
      </div>
    </>
  );
};

export default FaqPage;
