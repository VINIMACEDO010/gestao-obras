import { useState } from 'react';
import { api, useApi } from '../api';
import { Aviso, Campo, dataBr, ehGestao, lerForm, moeda, num, Selo, useAcao, useEu, vazioParaNull } from '../util';

interface Compra {
  id: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  fornecedor: string | null;
  valorEstimado: string | null;
  dataNecessidade: string | null;
  status: string;
  solicitadoPor: string | null;
  aprovadoPor: string | null;
}

// Spec 005: próximos status possíveis
const PROXIMOS: Record<string, [string, string][]> = {
  solicitada: [
    ['aprovada', 'Aprovar'],
    ['cancelada', 'Cancelar'],
  ],
  aprovada: [
    ['recebida', 'Marcar recebida'],
    ['cancelada', 'Cancelar'],
  ],
};

export function AbaCompras({ obraId }: { obraId: string }) {
  const eu = useEu();
  const base = `/obras/${obraId}/compras`;
  const { dados, erro, recarregar } = useApi<Compra[]>(base);
  const [nova, setNova] = useState(false);
  const acao = useAcao();
  const gestao = ehGestao(eu.perfil);

  if (!dados) return <Aviso erro={erro} />;
  return (
    <section>
      <div className="titulo-secao">
        <h2>Solicitações de compra</h2>
        <button onClick={() => setNova(true)}>Nova solicitação</button>
      </div>
      {nova && (
        <form
          className="cartao form-grade"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = lerForm(e.currentTarget);
            const ok = await acao.executar(() =>
              api.post(base, {
                descricao: f.descricao,
                quantidade: f.quantidade,
                unidade: f.unidade,
                fornecedor: vazioParaNull(f.fornecedor),
                valorEstimado: vazioParaNull(f.valorEstimado),
                dataNecessidade: vazioParaNull(f.dataNecessidade),
              }),
            );
            if (ok) {
              setNova(false);
              void recarregar();
            }
          }}
        >
          <Campo rotulo="Material ou serviço">
            <input name="descricao" required maxLength={300} />
          </Campo>
          <Campo rotulo="Quantidade">
            <input name="quantidade" required inputMode="decimal" />
          </Campo>
          <Campo rotulo="Unidade">
            <input name="unidade" required maxLength={10} placeholder="sc, m³, un" />
          </Campo>
          <Campo rotulo="Fornecedor (opcional)">
            <input name="fornecedor" maxLength={200} />
          </Campo>
          <Campo rotulo="Valor estimado (R$)">
            <input name="valorEstimado" inputMode="decimal" />
          </Campo>
          <Campo rotulo="Precisa até">
            <input name="dataNecessidade" type="date" />
          </Campo>
          <div className="acoes largura-total">
            <Aviso erro={acao.erro} />
            <button type="button" onClick={() => setNova(false)}>
              Cancelar
            </button>
            <button className="primario" disabled={acao.ocupado}>
              Solicitar
            </button>
          </div>
        </form>
      )}
      <div className="rolagem">
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th className="num">Qtd</th>
              <th>Fornecedor</th>
              <th className="num">Valor est.</th>
              <th>Precisa até</th>
              <th>Status</th>
              <th>Solicitado / aprovado</th>
              {gestao && <th />}
            </tr>
          </thead>
          <tbody>
            {dados.map((c) => (
              <tr key={c.id}>
                <td>{c.descricao}</td>
                <td className="num">
                  {num(c.quantidade)} {c.unidade}
                </td>
                <td>{c.fornecedor ?? '-'}</td>
                <td className="num">{c.valorEstimado ? moeda(c.valorEstimado) : '-'}</td>
                <td>{dataBr(c.dataNecessidade)}</td>
                <td>
                  <Selo v={c.status} />
                </td>
                <td className="suave">
                  {c.solicitadoPor ?? '-'}
                  {c.aprovadoPor ? ` / ${c.aprovadoPor}` : ''}
                </td>
                {gestao && (
                  <td className="acoes">
                    {(PROXIMOS[c.status] ?? []).map(([s, rotulo]) => (
                      <button
                        key={s}
                        className={`link ${s === 'cancelada' ? 'perigo' : ''}`}
                        onClick={async () => {
                          if (await acao.executar(() => api.patch(`${base}/${c.id}/status`, { status: s }))) void recarregar();
                        }}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dados.length === 0 && <p className="vazio">Nenhuma solicitação.</p>}
      {!nova && <Aviso erro={acao.erro} />}
    </section>
  );
}
