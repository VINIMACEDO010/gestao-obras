import { useState } from 'react';
import { useApi } from '../api';
import { Aviso } from '../util';

interface Registro {
  id: number;
  tabela: string;
  registroId: string | null;
  acao: string;
  dadosAntes: Record<string, unknown> | null;
  dadosDepois: Record<string, unknown> | null;
  criadoEm: string;
  usuario: string | null;
}

const TABELAS = ['', 'obras', 'orcamento_itens', 'cronograma_etapas', 'compras', 'diarios', 'diario_fotos', 'medicoes', 'medicao_itens', 'obra_clientes'];
const IGNORAR = new Set(['atualizado_em', 'criado_em']);

/** Mostra só os campos que mudaram */
function diferencas(r: Registro) {
  if (r.acao !== 'UPDATE' || !r.dadosAntes || !r.dadosDepois) return null;
  return Object.keys(r.dadosDepois)
    .filter((k) => !IGNORAR.has(k) && JSON.stringify(r.dadosAntes![k]) !== JSON.stringify(r.dadosDepois![k]))
    .map((k) => `${k}: ${JSON.stringify(r.dadosAntes![k])} → ${JSON.stringify(r.dadosDepois![k])}`);
}

export function PaginaAuditoria() {
  const [tabela, setTabela] = useState('');
  const { dados, erro } = useApi<Registro[]>(`/auditoria?limite=200${tabela ? `&tabela=${tabela}` : ''}`);
  return (
    <>
      <div className="titulo-pagina">
        <h1>Auditoria</h1>
        <select value={tabela} onChange={(e) => setTabela(e.target.value)}>
          {TABELAS.map((t) => (
            <option key={t} value={t}>
              {t || 'Todas as tabelas'}
            </option>
          ))}
        </select>
      </div>
      <Aviso erro={erro} />
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Tabela</th>
              <th>Alterações</th>
            </tr>
          </thead>
          <tbody>
            {dados?.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.criadoEm).toLocaleString('pt-BR')}</td>
                <td>{r.usuario ?? 'sistema'}</td>
                <td>{{ INSERT: 'Inclusão', UPDATE: 'Alteração', DELETE: 'Exclusão' }[r.acao]}</td>
                <td>{r.tabela}</td>
                <td className="mono">{diferencas(r)?.join('; ') ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
