import { useState } from 'react';
import { api, useApi } from '../api';
import { Aviso, Campo, dataBr, ehGestao, lerForm, num, useAcao, useEu } from '../util';

interface Etapa {
  id: string;
  ordem: number;
  nome: string;
  inicio: string;
  fim: string;
  percentual: string;
}

export function AbaCronograma({ obraId, aoMudar }: { obraId: string; aoMudar: () => void }) {
  const eu = useEu();
  const base = `/obras/${obraId}/cronograma`;
  const { dados, erro, recarregar } = useApi<{ etapas: Etapa[]; avancoPercentual: string }>(base);
  const [editando, setEditando] = useState<Etapa | 'nova' | null>(null);
  const acao = useAcao();
  const pode = ehGestao(eu.perfil);

  const atualizar = () => {
    setEditando(null);
    void recarregar();
    aoMudar();
  };

  if (!dados) return <Aviso erro={erro} />;
  const etapas = dados.etapas;
  const ini = etapas.length ? Math.min(...etapas.map((e) => Date.parse(e.inicio))) : 0;
  const fim = etapas.length ? Math.max(...etapas.map((e) => Date.parse(e.fim))) : 1;
  const total = Math.max(fim - ini, 1);

  return (
    <section>
      <div className="titulo-secao">
        <h2>Avanço geral: {num(dados.avancoPercentual)}%</h2>
        {pode && <button onClick={() => setEditando('nova')}>Nova etapa</button>}
      </div>
      {editando && (
        <form
          className="cartao form-grade"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = lerForm(e.currentTarget);
            const corpo = { ordem: Number(f.ordem), nome: f.nome, inicio: f.inicio, fim: f.fim, percentual: f.percentual };
            const ok = await acao.executar(() =>
              editando === 'nova' ? api.post(base, corpo) : api.put(`${base}/${editando.id}`, corpo),
            );
            if (ok) atualizar();
          }}
        >
          <Campo rotulo="Ordem">
            <input name="ordem" type="number" min={0} defaultValue={editando === 'nova' ? etapas.length + 1 : editando.ordem} />
          </Campo>
          <Campo rotulo="Etapa">
            <input name="nome" required defaultValue={editando === 'nova' ? '' : editando.nome} />
          </Campo>
          <Campo rotulo="Início">
            <input name="inicio" type="date" required defaultValue={editando === 'nova' ? '' : editando.inicio} />
          </Campo>
          <Campo rotulo="Fim">
            <input name="fim" type="date" required defaultValue={editando === 'nova' ? '' : editando.fim} />
          </Campo>
          <Campo rotulo="% concluído">
            <input name="percentual" type="number" min={0} max={100} step="0.01" defaultValue={editando === 'nova' ? 0 : editando.percentual} />
          </Campo>
          <div className="acoes largura-total">
            <Aviso erro={acao.erro} />
            <button type="button" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button className="primario" disabled={acao.ocupado}>
              Salvar
            </button>
          </div>
        </form>
      )}
      {etapas.length === 0 && <p className="vazio">Nenhuma etapa cadastrada.</p>}
      <div className="gantt">
        {etapas.map((e) => {
          const esq = ((Date.parse(e.inicio) - ini) / total) * 100;
          const larg = Math.max(((Date.parse(e.fim) - Date.parse(e.inicio)) / total) * 100, 1.5);
          return (
            <div key={e.id} className="gantt-linha">
              <div className="gantt-nome">
                <strong>{e.nome}</strong>
                <small>
                  {dataBr(e.inicio)} a {dataBr(e.fim)} · {num(e.percentual)}%
                </small>
              </div>
              <div className="gantt-trilho">
                <div className="gantt-barra" style={{ left: `${esq}%`, width: `${larg}%` }}>
                  <div style={{ width: `${e.percentual}%` }} />
                </div>
              </div>
              {pode && (
                <div className="acoes">
                  <button className="link" onClick={() => setEditando(e)}>
                    Editar
                  </button>
                  <button
                    className="link perigo"
                    onClick={async () => {
                      if (confirm(`Excluir a etapa ${e.nome}?`) && (await acao.executar(() => api.del(`${base}/${e.id}`)))) atualizar();
                    }}
                  >
                    Excluir
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!editando && <Aviso erro={acao.erro} />}
    </section>
  );
}
