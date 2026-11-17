import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { Aviso, Campo, dataBr, ehGestao, lerForm, moeda, num, Selo, useAcao, useEu } from '../util';

interface MedicaoResumo {
  id: string;
  numero: number;
  periodoInicio: string;
  periodoFim: string;
  status: string;
  valor: string;
}

interface ItemMedicao {
  orcamentoItemId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidadeOrcada: string;
  valorUnitario: string;
  quantidadePeriodo: string;
  valorPeriodo: string;
  quantidadeAcumulada: string;
  percentualAcumulado: string;
}

interface Medicao extends Omit<MedicaoResumo, 'valor'> {
  temPdf: boolean;
  itens: ItemMedicao[];
  valorTotal: string;
}

function DetalheMedicao({ obraId }: { obraId: string }) {
  const { medicaoId } = useParams();
  const eu = useEu();
  const navegar = useNavigate();
  const base = `/obras/${obraId}/medicoes/${medicaoId}`;
  const { dados: m, erro, recarregar } = useApi<Medicao>(base);
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const acao = useAcao();

  if (!m) return <Aviso erro={erro} />;
  const editavel = m.status === 'rascunho' && ehGestao(eu.perfil);
  const alterados = Object.keys(qtds).length > 0;

  const salvar = () =>
    acao.executar(async () => {
      await api.put(
        `${base}/itens`,
        Object.entries(qtds).map(([orcamentoItemId, q]) => ({ orcamentoItemId, quantidade: q.trim() === '' ? '0' : q })),
      );
      setQtds({});
      await recarregar();
    });

  return (
    <section>
      <Link to={`/obras/${obraId}/medicoes`} className="voltar">
        ← Medições
      </Link>
      <div className="titulo-secao">
        <h2>
          Medição nº {m.numero} <Selo v={m.status} />
        </h2>
        <div className="acoes">
          {m.temPdf && (
            <button onClick={() => acao.executar(async () => window.open((await api.get<{ url: string }>(`${base}/pdf`)).url, '_blank', 'noopener'))}>
              Baixar PDF
            </button>
          )}
          {m.status === 'fechada' && !m.temPdf && <span className="suave">Gerando PDF...</span>}
          {editavel && (
            <>
              <button
                className="perigo"
                onClick={async () => {
                  if (confirm('Excluir esta medição em rascunho?') && (await acao.executar(() => api.del(base)))) navegar(`/obras/${obraId}/medicoes`);
                }}
              >
                Excluir
              </button>
              <button disabled={!alterados || acao.ocupado} onClick={() => void salvar()}>
                Salvar quantidades
              </button>
              <button
                className="primario"
                disabled={alterados || acao.ocupado}
                title={alterados ? 'Salve as quantidades antes' : ''}
                onClick={async () => {
                  if (!confirm('Depois de fechada a medição não pode ser alterada. Fechar?')) return;
                  if (await acao.executar(() => api.post(`${base}/fechar`))) void recarregar();
                }}
              >
                Fechar medição
              </button>
            </>
          )}
        </div>
      </div>
      <p className="suave">
        Período de {dataBr(m.periodoInicio)} a {dataBr(m.periodoFim)} · Valor desta medição: <strong>{moeda(m.valorTotal)}</strong>
      </p>
      <Aviso erro={acao.erro} />
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th className="num">Orçado</th>
              <th className="num">Neste período</th>
              <th className="num">Acumulado</th>
              <th className="num">% acum.</th>
              <th className="num">Valor período</th>
            </tr>
          </thead>
          <tbody>
            {m.itens.map((i) => (
              <tr key={i.orcamentoItemId} className={Number(i.percentualAcumulado) > 100 ? 'excedido' : ''}>
                <td>{i.codigo}</td>
                <td>{i.descricao}</td>
                <td className="num">
                  {num(i.quantidadeOrcada)} {i.unidade}
                </td>
                <td className="num">
                  {editavel ? (
                    <input
                      className="qtd"
                      inputMode="decimal"
                      value={qtds[i.orcamentoItemId] ?? (Number(i.quantidadePeriodo) ? String(Number(i.quantidadePeriodo)) : '')}
                      onChange={(e) => setQtds({ ...qtds, [i.orcamentoItemId]: e.target.value })}
                    />
                  ) : (
                    num(i.quantidadePeriodo)
                  )}
                </td>
                <td className="num">{num(i.quantidadeAcumulada)}</td>
                <td className="num">{num(i.percentualAcumulado)}%</td>
                <td className="num">{moeda(i.valorPeriodo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {m.itens.length === 0 && <p className="vazio">Cadastre o orçamento da obra antes de medir.</p>}
    </section>
  );
}

function ListaMedicoes({ obraId }: { obraId: string }) {
  const eu = useEu();
  const navegar = useNavigate();
  const base = `/obras/${obraId}/medicoes`;
  const { dados, erro } = useApi<MedicaoResumo[]>(base);
  const [nova, setNova] = useState(false);
  const acao = useAcao();
  if (!dados) return <Aviso erro={erro} />;
  const acumulado = dados.filter((m) => m.status === 'fechada').reduce((s, m) => s + Number(m.valor), 0);

  return (
    <section>
      <div className="titulo-secao">
        <h2>Medições · {moeda(acumulado)} medidos</h2>
        {ehGestao(eu.perfil) && <button onClick={() => setNova(true)}>Nova medição</button>}
      </div>
      {nova && (
        <form
          className="cartao form-grade"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = lerForm(e.currentTarget);
            let id = '';
            const ok = await acao.executar(async () => {
              id = (await api.post<{ id: string }>(base, { periodoInicio: f.periodoInicio, periodoFim: f.periodoFim })).id;
            });
            if (ok) navegar(`/obras/${obraId}/medicoes/${id}`);
          }}
        >
          <Campo rotulo="Início do período">
            <input name="periodoInicio" type="date" required />
          </Campo>
          <Campo rotulo="Fim do período">
            <input name="periodoFim" type="date" required />
          </Campo>
          <div className="acoes largura-total">
            <Aviso erro={acao.erro} />
            <button type="button" onClick={() => setNova(false)}>
              Cancelar
            </button>
            <button className="primario" disabled={acao.ocupado}>
              Criar
            </button>
          </div>
        </form>
      )}
      <div className="lista">
        {dados.map((m) => (
          <Link key={m.id} to={`/obras/${obraId}/medicoes/${m.id}`} className="cartao linha-lista">
            <strong>Nº {m.numero}</strong>
            <span>
              {dataBr(m.periodoInicio)} a {dataBr(m.periodoFim)}
            </span>
            <span>{moeda(m.valor)}</span>
            <Selo v={m.status} />
          </Link>
        ))}
      </div>
      {dados.length === 0 && <p className="vazio">Nenhuma medição.</p>}
    </section>
  );
}

export function AbaMedicoes({ obraId }: { obraId: string }) {
  return (
    <Routes>
      <Route index element={<ListaMedicoes obraId={obraId} />} />
      <Route path=":medicaoId" element={<DetalheMedicao obraId={obraId} />} />
    </Routes>
  );
}
