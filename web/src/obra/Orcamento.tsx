import { useState } from 'react';
import { api, useApi } from '../api';
import { Aviso, Campo, ehGestao, lerForm, moeda, num, useAcao, useEu } from '../util';

export interface ItemOrcamento {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  total: string;
}

export function AbaOrcamento({ obraId }: { obraId: string }) {
  const eu = useEu();
  const base = `/obras/${obraId}/orcamento`;
  const { dados, erro, recarregar } = useApi<{ itens: ItemOrcamento[]; totalGeral: string }>(base);
  const [editando, setEditando] = useState<ItemOrcamento | 'novo' | null>(null);
  const acao = useAcao();
  const pode = ehGestao(eu.perfil);
  const v = (c: keyof ItemOrcamento) => (editando && editando !== 'novo' ? editando[c] : '');

  if (!dados) return <Aviso erro={erro} />;
  return (
    <section>
      <div className="titulo-secao">
        <h2>Total orçado: {moeda(dados.totalGeral)}</h2>
        {pode && <button onClick={() => setEditando('novo')}>Novo item</button>}
      </div>
      {editando && (
        <form
          className="cartao form-grade"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = lerForm(e.currentTarget);
            const ok = await acao.executar(() =>
              editando === 'novo' ? api.post(base, f) : api.put(`${base}/${editando.id}`, f),
            );
            if (ok) {
              setEditando(null);
              void recarregar();
            }
          }}
        >
          <Campo rotulo="Código">
            <input name="codigo" required maxLength={30} defaultValue={v('codigo')} />
          </Campo>
          <Campo rotulo="Descrição do serviço">
            <input name="descricao" required maxLength={300} defaultValue={v('descricao')} />
          </Campo>
          <Campo rotulo="Unidade">
            <input name="unidade" required maxLength={10} placeholder="m², m³, un" defaultValue={v('unidade')} />
          </Campo>
          <Campo rotulo="Quantidade">
            <input name="quantidade" required inputMode="decimal" defaultValue={v('quantidade')} />
          </Campo>
          <Campo rotulo="Valor unitário (R$)">
            <input name="valorUnitario" required inputMode="decimal" defaultValue={v('valorUnitario')} />
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
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Un</th>
              <th className="num">Quantidade</th>
              <th className="num">Unitário</th>
              <th className="num">Total</th>
              {pode && <th />}
            </tr>
          </thead>
          <tbody>
            {dados.itens.map((i) => (
              <tr key={i.id}>
                <td>{i.codigo}</td>
                <td>{i.descricao}</td>
                <td>{i.unidade}</td>
                <td className="num">{num(i.quantidade)}</td>
                <td className="num">{moeda(i.valorUnitario)}</td>
                <td className="num">{moeda(i.total)}</td>
                {pode && (
                  <td className="acoes">
                    <button className="link" onClick={() => setEditando(i)}>
                      Editar
                    </button>
                    <button
                      className="link perigo"
                      onClick={async () => {
                        if (confirm(`Excluir o item ${i.codigo}?`) && (await acao.executar(() => api.del(`${base}/${i.id}`))))
                          void recarregar();
                      }}
                    >
                      Excluir
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dados.itens.length === 0 && <p className="vazio">Nenhum item no orçamento.</p>}
      {!editando && <Aviso erro={acao.erro} />}
    </section>
  );
}
