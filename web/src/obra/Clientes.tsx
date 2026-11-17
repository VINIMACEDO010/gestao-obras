import { useState } from 'react';
import { api, useApi } from '../api';
import { Aviso, useAcao } from '../util';

interface Usuario {
  id: string;
  nome: string;
  email: string;
}

// Spec 002 RF02: quais usuários do perfil cliente acompanham esta obra
export function AbaClientes({ obraId }: { obraId: string }) {
  const base = `/obras/${obraId}/clientes`;
  const vinculados = useApi<Usuario[]>(base);
  const todos = useApi<Usuario[]>('/usuarios?perfil=cliente');
  const [escolhido, setEscolhido] = useState('');
  const acao = useAcao();

  const disponiveis = (todos.dados ?? []).filter((u) => !vinculados.dados?.some((v) => v.id === u.id));

  return (
    <section>
      <div className="titulo-secao">
        <h2>Clientes com acesso a esta obra</h2>
      </div>
      <p className="suave">
        O cliente vê cronograma, orçamento, diários e medições desta obra, sem poder alterar nada. Novos usuários são criados pelo
        administrador com o script <code>scripts/criar-usuario.sh</code>.
      </p>
      <div className="cartao envio-foto">
        <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
          <option value="">Selecione um usuário cliente</option>
          {disponiveis.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome} ({u.email})
            </option>
          ))}
        </select>
        <button
          className="primario"
          disabled={!escolhido || acao.ocupado}
          onClick={async () => {
            if (await acao.executar(() => api.post(base, { usuarioId: escolhido }))) {
              setEscolhido('');
              void vinculados.recarregar();
            }
          }}
        >
          Dar acesso
        </button>
      </div>
      <Aviso erro={acao.erro ?? vinculados.erro} />
      <div className="lista">
        {vinculados.dados?.map((u) => (
          <div key={u.id} className="cartao linha-lista">
            <strong>{u.nome}</strong>
            <span className="suave">{u.email}</span>
            <button
              className="link perigo"
              onClick={async () => {
                if (await acao.executar(() => api.del(`${base}/${u.id}`))) void vinculados.recarregar();
              }}
            >
              Remover acesso
            </button>
          </div>
        ))}
      </div>
      {vinculados.dados?.length === 0 && <p className="vazio">Nenhum cliente vinculado.</p>}
    </section>
  );
}
