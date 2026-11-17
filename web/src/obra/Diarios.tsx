import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, enviarParaS3, useApi } from '../api';
import { Aviso, Campo, dataBr, hoje, lerForm, ROTULOS, Selo, useAcao, useEu, vazioParaNull } from '../util';

interface DiarioResumo {
  id: string;
  data: string;
  clima: string;
  efetivo: number;
  status: string;
  autor: string | null;
  fotos: number;
}

interface Foto {
  id: string;
  legenda: string | null;
  status: string;
  motivoRejeicao: string | null;
}

interface Diario extends Omit<DiarioResumo, 'fotos'> {
  atividades: string;
  ocorrencias: string | null;
  temPdf: boolean;
  fotos: Foto[];
}

const podeEditar = (perfil: string) => perfil !== 'cliente';

function FormDiario({ obraId, diario, aoSalvar, aoCancelar }: { obraId: string; diario?: Diario; aoSalvar: (id: string) => void; aoCancelar: () => void }) {
  const acao = useAcao();
  return (
    <form
      className="cartao form-grade"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = lerForm(e.currentTarget);
        const corpo = {
          data: f.data,
          clima: f.clima,
          efetivo: Number(f.efetivo),
          atividades: f.atividades,
          ocorrencias: vazioParaNull(f.ocorrencias),
        };
        let id = diario?.id ?? '';
        const ok = await acao.executar(async () => {
          if (diario) await api.put(`/obras/${obraId}/diarios/${diario.id}`, corpo);
          else id = (await api.post<{ id: string }>(`/obras/${obraId}/diarios`, corpo)).id;
        });
        if (ok) aoSalvar(id);
      }}
    >
      <Campo rotulo="Data">
        <input name="data" type="date" required defaultValue={diario?.data ?? hoje()} />
      </Campo>
      <Campo rotulo="Clima">
        <select name="clima" defaultValue={diario?.clima ?? 'sol'}>
          {['sol', 'nublado', 'chuva', 'chuva_forte'].map((c) => (
            <option key={c} value={c}>
              {ROTULOS[c]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Efetivo (pessoas)">
        <input name="efetivo" type="number" min={0} required defaultValue={diario?.efetivo ?? 0} />
      </Campo>
      <Campo rotulo="Atividades executadas">
        <textarea name="atividades" required rows={4} maxLength={5000} defaultValue={diario?.atividades} />
      </Campo>
      <Campo rotulo="Ocorrências">
        <textarea name="ocorrencias" rows={3} maxLength={5000} defaultValue={diario?.ocorrencias ?? ''} />
      </Campo>
      <div className="acoes largura-total">
        <Aviso erro={acao.erro} />
        <button type="button" onClick={aoCancelar}>
          Cancelar
        </button>
        <button className="primario" disabled={acao.ocupado}>
          Salvar
        </button>
      </div>
    </form>
  );
}

function Miniatura({ caminho, legenda }: { caminho: string; legenda: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<{ url: string }>(caminho)
      .then((r) => setUrl(r.url))
      .catch(() => setUrl(null));
  }, [caminho]);
  return (
    <figure className="foto">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={legenda ?? 'Foto do diário'} loading="lazy" />
        </a>
      ) : (
        <div className="foto-vazia">...</div>
      )}
      {legenda && <figcaption>{legenda}</figcaption>}
    </figure>
  );
}

function DetalheDiario({ obraId }: { obraId: string }) {
  const { diarioId } = useParams();
  const eu = useEu();
  const base = `/obras/${obraId}/diarios/${diarioId}`;
  const { dados: d, erro, recarregar } = useApi<Diario>(base);
  const [editando, setEditando] = useState(false);
  const acao = useAcao();
  const arquivo = useRef<HTMLInputElement>(null);
  const [legenda, setLegenda] = useState('');

  // Enquanto houver foto em validação, atualiza a cada 3 segundos
  useEffect(() => {
    if (!d?.fotos.some((f) => f.status === 'pendente')) return;
    const t = setTimeout(() => void recarregar(), 3000);
    return () => clearTimeout(t);
  }, [d, recarregar]);

  if (!d) return <Aviso erro={erro} />;
  const aberto = d.status === 'aberto' && podeEditar(eu.perfil);

  const enviarFoto = async (f: File) => {
    // Spec 006: só JPEG ou PNG; o tipo real é conferido de novo pelo worker
    if (!['image/jpeg', 'image/png'].includes(f.type)) throw new Error('Envie fotos em JPEG ou PNG');
    if (f.size > 10 * 1024 * 1024) throw new Error('Foto maior que 10 MB');
    const r = await api.post<{ fotoId: string; upload: { url: string; campos: Record<string, string> } }>(`${base}/fotos`, {
      contentType: f.type,
      legenda: vazioParaNull(legenda),
    });
    await enviarParaS3(r.upload, f);
    await api.post(`${base}/fotos/${r.fotoId}/confirmar`);
  };

  return (
    <section>
      <Link to={`/obras/${obraId}/diario`} className="voltar">
        ← Diários
      </Link>
      <div className="titulo-secao">
        <h2>
          Diário de {dataBr(d.data)} <Selo v={d.status} />
        </h2>
        <div className="acoes">
          {d.temPdf && (
            <button
              onClick={() =>
                acao.executar(async () => window.open((await api.get<{ url: string }>(`${base}/pdf`)).url, '_blank', 'noopener'))
              }
            >
              Baixar PDF
            </button>
          )}
          {d.status === 'fechado' && !d.temPdf && <span className="suave">Gerando PDF...</span>}
          {aberto && <button onClick={() => setEditando(!editando)}>Editar</button>}
          {aberto && (
            <button
              className="primario"
              disabled={acao.ocupado}
              onClick={async () => {
                if (!confirm('Depois de fechado o diário não pode mais ser alterado. Fechar?')) return;
                if (await acao.executar(() => api.post(`${base}/fechar`))) void recarregar();
              }}
            >
              Fechar diário
            </button>
          )}
        </div>
      </div>
      <Aviso erro={acao.erro} />
      {editando ? (
        <FormDiario
          obraId={obraId}
          diario={d}
          aoCancelar={() => setEditando(false)}
          aoSalvar={() => {
            setEditando(false);
            void recarregar();
          }}
        />
      ) : (
        <div className="cartao">
          <p>
            <strong>Clima:</strong> {ROTULOS[d.clima]} · <strong>Efetivo:</strong> {d.efetivo} pessoas · <strong>Responsável:</strong>{' '}
            {d.autor ?? '-'}
          </p>
          <h3>Atividades</h3>
          <p className="pre">{d.atividades}</p>
          {d.ocorrencias && (
            <>
              <h3>Ocorrências</h3>
              <p className="pre">{d.ocorrencias}</p>
            </>
          )}
        </div>
      )}

      <h3>Fotos</h3>
      {aberto && (
        <div className="cartao envio-foto">
          <input
            placeholder="Legenda (opcional)"
            value={legenda}
            maxLength={300}
            onChange={(e) => setLegenda(e.target.value)}
          />
          <input ref={arquivo} type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f && (await acao.executar(() => enviarFoto(f)))) {
              setLegenda('');
              void recarregar();
            }
          }} />
          <button className="primario" disabled={acao.ocupado} onClick={() => arquivo.current?.click()}>
            {acao.ocupado ? 'Enviando...' : 'Tirar ou escolher foto'}
          </button>
        </div>
      )}
      <div className="galeria">
        {d.fotos.map((f) =>
          f.status === 'validada' ? (
            <Miniatura key={f.id} caminho={`${base}/fotos/${f.id}/url`} legenda={f.legenda} />
          ) : (
            <figure key={f.id} className="foto">
              <div className="foto-vazia">
                <Selo v={f.status} />
                {f.motivoRejeicao && <small>{f.motivoRejeicao}</small>}
              </div>
              {aberto && (
                <button className="link perigo" onClick={async () => (await acao.executar(() => api.del(`${base}/fotos/${f.id}`))) && recarregar()}>
                  Remover
                </button>
              )}
            </figure>
          ),
        )}
      </div>
      {d.fotos.length === 0 && <p className="vazio">Nenhuma foto.</p>}
    </section>
  );
}

function ListaDiarios({ obraId }: { obraId: string }) {
  const eu = useEu();
  const navegar = useNavigate();
  const { dados, erro } = useApi<DiarioResumo[]>(`/obras/${obraId}/diarios`);
  const [novo, setNovo] = useState(false);
  if (!dados) return <Aviso erro={erro} />;
  return (
    <section>
      <div className="titulo-secao">
        <h2>Diários</h2>
        {podeEditar(eu.perfil) && <button onClick={() => setNovo(true)}>Novo diário</button>}
      </div>
      {novo && <FormDiario obraId={obraId} aoCancelar={() => setNovo(false)} aoSalvar={(id) => navegar(`/obras/${obraId}/diario/${id}`)} />}
      <div className="lista">
        {dados.map((d) => (
          <Link key={d.id} to={`/obras/${obraId}/diario/${d.id}`} className="cartao linha-lista">
            <strong>{dataBr(d.data)}</strong>
            <span>{ROTULOS[d.clima]}</span>
            <span>{d.efetivo} pessoas</span>
            <span>{d.fotos} foto(s)</span>
            <span className="suave">{d.autor}</span>
            <Selo v={d.status} />
          </Link>
        ))}
      </div>
      {dados.length === 0 && <p className="vazio">Nenhum diário registrado.</p>}
    </section>
  );
}

export function AbaDiarios({ obraId }: { obraId: string }) {
  return (
    <Routes>
      <Route index element={<ListaDiarios obraId={obraId} />} />
      <Route path=":diarioId" element={<DetalheDiario obraId={obraId} />} />
    </Routes>
  );
}
