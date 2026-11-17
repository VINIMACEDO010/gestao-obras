import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import { concluirLogin, entrar, iniciarAuth, MODO, obterToken, sair } from './auth';
import { EuContexto, type Eu } from './util';
import { PaginaObras } from './pages/Obras';
import { PaginaObra } from './pages/Obra';
import { PaginaAuditoria } from './pages/Auditoria';
import { PaginaDevLogin } from './pages/DevLogin';
import './styles.css';

const PERFIL: Record<string, string> = {
  admin: 'Administrador',
  escritorio: 'Escritório',
  canteiro: 'Canteiro',
  cliente: 'Cliente',
};

function Callback() {
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    concluirLogin()
      .then(() => {
        window.location.replace('/');
      })
      .catch(() => setErro('Não foi possível concluir o login.'));
  }, [navegar]);
  return <div className="centro">{erro ?? 'Entrando...'}</div>;
}

function Entrada() {
  return (
    <div className="centro entrada">
      <img src="/icon.svg" width={72} height={72} alt="" />
      <h1>Gestão de Obras</h1>
      <p>Orçamento, cronograma, compras, diário de obra e medições num só lugar.</p>
      <button className="primario" onClick={() => void entrar()}>
        Entrar
      </button>
    </div>
  );
}

function Aplicacao() {
  const [eu, setEu] = useState<Eu | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'anonimo' | 'ok' | 'sem-acesso'>('carregando');

  useEffect(() => {
    if (window.location.pathname === '/callback' || window.location.pathname === '/dev-login') {
      setEstado('anonimo');
      return;
    }
    obterToken().then(async (t) => {
      if (!t) return setEstado('anonimo');
      try {
        setEu(await api.get<Eu>('/me'));
        setEstado('ok');
      } catch {
        setEstado('sem-acesso');
      }
    });
  }, []);

  if (estado === 'carregando') return <div className="centro">Carregando...</div>;
  if (estado === 'sem-acesso')
    return (
      <div className="centro">
        <p>Seu usuário ainda não tem acesso. Fale com o administrador da construtora.</p>
        <button onClick={() => void sair()}>Sair</button>
      </div>
    );

  return (
    <Routes>
      <Route path="/callback" element={<Callback />} />
      <Route path="/dev-login" element={MODO === 'dev' ? <PaginaDevLogin /> : <Navigate to="/" />} />
      {estado === 'anonimo' || !eu ? (
        <Route path="*" element={<Entrada />} />
      ) : (
        <Route
          path="*"
          element={
            <EuContexto.Provider value={eu}>
              <header className="topo">
                <Link to="/" className="marca">
                  <img src="/icon.svg" width={28} height={28} alt="" /> Gestão de Obras
                </Link>
                <nav>
                  {eu.perfil === 'admin' && <Link to="/auditoria">Auditoria</Link>}
                  <span className="usuario">
                    {eu.nome} <small>{PERFIL[eu.perfil]}</small>
                  </span>
                  <button onClick={() => void sair()}>Sair</button>
                </nav>
              </header>
              {MODO === 'dev' && <div className="faixa-dev">Ambiente de desenvolvimento (login simulado)</div>}
              <main>
                <Routes>
                  <Route path="/" element={<PaginaObras />} />
                  <Route path="/obras/:obraId/*" element={<PaginaObra />} />
                  {eu.perfil === 'admin' && <Route path="/auditoria" element={<PaginaAuditoria />} />}
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </main>
            </EuContexto.Provider>
          }
        />
      )}
    </Routes>
  );
}

const raiz = createRoot(document.getElementById('root')!);
iniciarAuth()
  .then(() =>
    raiz.render(
      <StrictMode>
        <BrowserRouter>
          <Aplicacao />
        </BrowserRouter>
      </StrictMode>,
    ),
  )
  .catch(() => raiz.render(<div className="centro">Sistema indisponível no momento. Tente novamente em instantes.</div>));
