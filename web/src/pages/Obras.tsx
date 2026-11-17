import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { Aviso, Campo, dataBr, ehGestao, lerForm, Selo, useAcao, useEu, vazioParaNull } from '../util';

export interface Obra {
  id: string;
  codigo: string;
  nome: string;
  endereco: string | null;
  clienteNome: string | null;
  status: string;
  dataInicio: string | null;
  dataPrevistaFim: string | null;
  avancoPercentual: string;
}

export function FormObra({ obra, aoSalvar, aoCancelar }: { obra?: Obra; aoSalvar: () => void; aoCancelar: () => void }) {
  const { ocupado, erro, executar } = useAcao();
  return (
    <form
      className="cartao form-grade"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = lerForm(e.currentTarget);
        const corpo = {
          codigo: f.codigo,
          nome: f.nome,
          endereco: vazioParaNull(f.endereco),
          clienteNome: vazioParaNull(f.clienteNome),
          status: f.status,
          dataInicio: vazioParaNull(f.dataInicio),
          dataPrevistaFim: vazioParaNull(f.dataPrevistaFim),
        };
        const ok = await executar(() => (obra ? api.put(`/obras/${obra.id}`, corpo) : api.post('/obras', corpo)));
        if (ok) aoSalvar();
      }}
    >
      <Campo rotulo="Código">
        <input name="codigo" required maxLength={30} defaultValue={obra?.codigo} />
      </Campo>
      <Campo rotulo="Nome da obra">
        <input name="nome" required maxLength={200} defaultValue={obra?.nome} />
      </Campo>
      <Campo rotulo="Endereço">
        <input name="endereco" maxLength={300} defaultValue={obra?.endereco ?? ''} />
      </Campo>
      <Campo rotulo="Cliente (contratante)">
        <input name="clienteNome" maxLength={200} defaultValue={obra?.clienteNome ?? ''} />
      </Campo>
      <Campo rotulo="Status">
        <select name="status" defaultValue={obra?.status ?? 'planejada'}>
          <option value="planejada">Planejada</option>
          <option value="em_andamento">Em andamento</option>
          <option value="paralisada">Paralisada</option>
          <option value="concluida">Concluída</option>
        </select>
      </Campo>
      <Campo rotulo="Início">
        <input name="dataInicio" type="date" defaultValue={obra?.dataInicio ?? ''} />
      </Campo>
      <Campo rotulo="Término previsto">
        <input name="dataPrevistaFim" type="date" defaultValue={obra?.dataPrevistaFim ?? ''} />
      </Campo>
      <div className="acoes largura-total">
        <Aviso erro={erro} />
        <button type="button" onClick={aoCancelar}>
          Cancelar
        </button>
        <button className="primario" disabled={ocupado}>
          Salvar
        </button>
      </div>
    </form>
  );
}

export function PaginaObras() {
  const eu = useEu();
  const { dados, erro, carregando, recarregar } = useApi<Obra[]>('/obras');
  const [criando, setCriando] = useState(false);

  return (
    <>
      <div className="titulo-pagina">
        <h1>{eu.perfil === 'cliente' ? 'Minhas obras' : 'Obras'}</h1>
        {ehGestao(eu.perfil) && !criando && (
          <button className="primario" onClick={() => setCriando(true)}>
            Nova obra
          </button>
        )}
      </div>
      {criando && (
        <FormObra
          aoCancelar={() => setCriando(false)}
          aoSalvar={() => {
            setCriando(false);
            void recarregar();
          }}
        />
      )}
      <Aviso erro={erro} />
      {carregando && !dados && <p>Carregando...</p>}
      {dados?.length === 0 && <p className="vazio">Nenhuma obra cadastrada.</p>}
      <div className="grade-obras">
        {dados?.map((o) => (
          <Link key={o.id} to={`/obras/${o.id}`} className="cartao obra">
            <div className="obra-cab">
              <small>{o.codigo}</small>
              <Selo v={o.status} />
            </div>
            <h2>{o.nome}</h2>
            <p className="suave">{o.endereco ?? 'Sem endereço'}</p>
            <div className="barra">
              <div style={{ width: `${Math.min(Number(o.avancoPercentual), 100)}%` }} />
            </div>
            <p className="suave">
              {Number(o.avancoPercentual).toFixed(0)}% concluído · {dataBr(o.dataInicio)} a {dataBr(o.dataPrevistaFim)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
