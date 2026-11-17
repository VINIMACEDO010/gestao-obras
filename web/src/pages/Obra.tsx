import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { Aviso, dataBr, ehGestao, Selo, useAcao, useEu, type Perfil } from '../util';
import { FormObra, type Obra } from './Obras';
import { AbaCronograma } from '../obra/Cronograma';
import { AbaOrcamento } from '../obra/Orcamento';
import { AbaCompras } from '../obra/Compras';
import { AbaDiarios } from '../obra/Diarios';
import { AbaMedicoes } from '../obra/Medicoes';
import { AbaClientes } from '../obra/Clientes';

// Abas visíveis por perfil (matriz em specs/README.md)
const ABAS: { caminho: string; nome: string; perfis: Perfil[] }[] = [
  { caminho: 'cronograma', nome: 'Cronograma', perfis: ['admin', 'escritorio', 'canteiro', 'cliente'] },
  { caminho: 'orcamento', nome: 'Orçamento', perfis: ['admin', 'escritorio', 'cliente'] },
  { caminho: 'compras', nome: 'Compras', perfis: ['admin', 'escritorio', 'canteiro'] },
  { caminho: 'diario', nome: 'Diário de obra', perfis: ['admin', 'escritorio', 'canteiro', 'cliente'] },
  { caminho: 'medicoes', nome: 'Medições', perfis: ['admin', 'escritorio', 'cliente'] },
  { caminho: 'clientes', nome: 'Acesso do cliente', perfis: ['admin', 'escritorio'] },
];

export function PaginaObra() {
  const { obraId } = useParams();
  const eu = useEu();
  const navegar = useNavigate();
  const { dados: obra, erro, recarregar } = useApi<Obra>(`/obras/${obraId}`);
  const [editando, setEditando] = useState(false);
  const excluir = useAcao();
  const abas = ABAS.filter((a) => a.perfis.includes(eu.perfil));

  if (erro) return <Aviso erro={erro} />;
  if (!obra) return <p>Carregando...</p>;

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <small className="suave">{obra.codigo}</small>
          <h1>
            {obra.nome} <Selo v={obra.status} />
          </h1>
          <p className="suave">
            {obra.endereco ?? ''} {obra.clienteNome ? `· Cliente: ${obra.clienteNome}` : ''} · {dataBr(obra.dataInicio)} a{' '}
            {dataBr(obra.dataPrevistaFim)}
          </p>
        </div>
        <div className="acoes">
          {ehGestao(eu.perfil) && <button onClick={() => setEditando(!editando)}>Editar</button>}
          {eu.perfil === 'admin' && (
            <button
              className="perigo"
              disabled={excluir.ocupado}
              onClick={async () => {
                if (!confirm(`Excluir a obra ${obra.codigo} e todos os dados dela?`)) return;
                if (await excluir.executar(() => api.del(`/obras/${obra.id}`))) navegar('/');
              }}
            >
              Excluir
            </button>
          )}
        </div>
      </div>
      <Aviso erro={excluir.erro} />
      {editando && (
        <FormObra
          obra={obra}
          aoCancelar={() => setEditando(false)}
          aoSalvar={() => {
            setEditando(false);
            void recarregar();
          }}
        />
      )}
      <nav className="abas">
        {abas.map((a) => (
          <NavLink key={a.caminho} to={`/obras/${obra.id}/${a.caminho}`}>
            {a.nome}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Navigate to={`/obras/${obra.id}/${abas[0].caminho}`} replace />} />
        <Route path="cronograma" element={<AbaCronograma obraId={obra.id} aoMudar={recarregar} />} />
        <Route path="orcamento" element={<AbaOrcamento obraId={obra.id} />} />
        <Route path="compras" element={<AbaCompras obraId={obra.id} />} />
        <Route path="diario/*" element={<AbaDiarios obraId={obra.id} />} />
        <Route path="medicoes/*" element={<AbaMedicoes obraId={obra.id} />} />
        <Route path="clientes" element={<AbaClientes obraId={obra.id} />} />
      </Routes>
    </>
  );
}
