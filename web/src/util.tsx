import { createContext, useContext, useState, type ReactNode } from 'react';
import { mensagemDeErro } from './api';

export type Perfil = 'admin' | 'escritorio' | 'canteiro' | 'cliente';
export interface Eu {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  empresaId: string;
}

export const EuContexto = createContext<Eu | null>(null);
export const useEu = () => useContext(EuContexto)!;
export const ehGestao = (p: Perfil) => p === 'admin' || p === 'escritorio';

export const moeda = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const num = (v: string | number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const dataBr = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '-');
export const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export const ROTULOS: Record<string, string> = {
  planejada: 'Planejada',
  em_andamento: 'Em andamento',
  paralisada: 'Paralisada',
  concluida: 'Concluída',
  solicitada: 'Solicitada',
  aprovada: 'Aprovada',
  recebida: 'Recebida',
  cancelada: 'Cancelada',
  aberto: 'Aberto',
  fechado: 'Fechado',
  rascunho: 'Rascunho',
  fechada: 'Fechada',
  pendente: 'Validando',
  validada: 'Validada',
  rejeitada: 'Rejeitada',
  sol: 'Sol',
  nublado: 'Nublado',
  chuva: 'Chuva',
  chuva_forte: 'Chuva forte',
};

export const Selo = ({ v }: { v: string }) => <span className={`selo selo-${v}`}>{ROTULOS[v] ?? v}</span>;

export function Aviso({ erro }: { erro: string | null }) {
  return erro ? <p className="erro">{erro}</p> : null;
}

/** Executa uma ação assíncrona controlando "ocupado" e mensagem de erro */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const executar = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    setErro(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(mensagemDeErro(e));
      return false;
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, erro, executar, setErro };
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      {children}
    </label>
  );
}

/** Lê os campos de um formulário como objeto */
export const lerForm = (f: HTMLFormElement) => Object.fromEntries(new FormData(f).entries()) as Record<string, string>;
export const vazioParaNull = (v?: string) => (v && v.trim() ? v.trim() : null);
