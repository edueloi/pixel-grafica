import React, { useState } from 'react';
import { FolderOpen, Sparkles, ClipboardList, MessageCircle } from 'lucide-react';
import { PageWrapper, SectionTitle, Tabs, Alert, FilterLine, FilterLineSection, FilterLineSearch, ContentCard } from '../components/ui';
import { FilesPanel } from '../components/FilesPanel';
import { useUrlTab } from '../src/hooks/useUrlTab';

const tabs = [
  { id: 'ia', label: 'Base da IA', icon: Sparkles },
  { id: 'pedidos', label: 'Pedidos e clientes', icon: ClipboardList },
  { id: 'whatsapp', label: 'Do WhatsApp', icon: MessageCircle },
] as const;
const tabIds = tabs.map((t) => t.id);

const Files: React.FC = () => {
  const [tab, setTab] = useUrlTab(tabIds, 'ia');
  const [search, setSearch] = useState('');

  return (
    <PageWrapper>
      <div className="space-y-4">
        <SectionTitle title="Arquivos" icon={FolderOpen} description="Tabelas de preço, catálogos, artes e arquivos recebidos dos clientes" />
        <FilterLine>
          <FilterLineSection grow><FilterLineSearch value={search} onChange={setSearch} placeholder="Buscar pelo nome do arquivo" aria-label="Buscar arquivos" /></FilterLineSection>
        </FilterLine>
        <Tabs<typeof tabs[number]['id']> items={tabs} value={tab} onChange={setTab} label="Arquivos">
          <ContentCard padding="md">
            {tab === 'ia' && (
              <div className="space-y-3">
                <Alert variant="info" title="A Pixel IA lê estes arquivos">
                  Envie tabelas de preço, catálogos, regras de prazo e perguntas frequentes (PDF, Word, Excel, CSV ou texto). Quando o cliente perguntar algo, a IA procura a resposta aqui.
                </Alert>
                <FilesPanel kind="knowledge" query={search} emptyHint="Envie sua tabela de preços ou catálogo para a IA aprender." />
              </div>
            )}
            {tab === 'pedidos' && <FilesPanel kind="order" query={search} allowUpload={false} emptyHint="Os arquivos anexados aos pedidos aparecem aqui. Envie pelo pedido." />}
            {tab === 'whatsapp' && <FilesPanel kind="chat" query={search} allowUpload={false} aiToggle={false} emptyHint="Artes e documentos enviados pelos clientes no WhatsApp aparecem aqui." />}
          </ContentCard>
        </Tabs>
      </div>
    </PageWrapper>
  );
};

export default Files;
