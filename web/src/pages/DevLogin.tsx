import { entrarDev } from '../auth';

// Usuários criados pelo seed da API (npm run seed:dev). Só existe no modo dev.
const USUARIOS = [
  ['dev-admin', 'Ana Admin', 'Administrador - Construtora Alto Vale'],
  ['dev-escritorio', 'Bruno Escritório', 'Escritório - Construtora Alto Vale'],
  ['dev-canteiro', 'Carlos Encarregado', 'Canteiro - Construtora Alto Vale'],
  ['dev-cliente', 'Diana Cliente', 'Cliente da obra OB-001'],
  ['dev-outra-empresa', 'Eduardo Litoral', 'Administrador - Construtora Litoral (outra empresa)'],
];

export function PaginaDevLogin() {
  return (
    <div className="centro entrada">
      <h1>Login de desenvolvimento</h1>
      <p>Escolha um usuário. Em produção esta tela não existe e o login é pelo Cognito com MFA.</p>
      <div className="lista-dev">
        {USUARIOS.map(([sub, nome, desc]) => (
          <button key={sub} onClick={() => entrarDev(sub)}>
            <strong>{nome}</strong>
            <small>{desc}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
