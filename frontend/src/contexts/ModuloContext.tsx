import { createContext, useContext, useEffect } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { definirAoAcaoEncerrada, definirContextoApi } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { Modulo } from "../types";

const CHAVE_ACAO = "armazem_acao_itinerante";

export interface AcaoAtual {
  id: string;
  nome: string;
}

/** Ação itinerante escolhida neste aparelho (guardada no navegador). */
export function lerAcaoSalva(): AcaoAtual | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ACAO);
    if (!bruto) return null;
    const acao = JSON.parse(bruto) as AcaoAtual;
    return acao?.id ? acao : null;
  } catch {
    return null;
  }
}

export function salvarAcao(acao: AcaoAtual | null) {
  try {
    if (acao) {
      localStorage.setItem(CHAVE_ACAO, JSON.stringify(acao));
    } else {
      localStorage.removeItem(CHAVE_ACAO);
    }
  } catch {
    // Sem acesso ao localStorage (ex.: navegação privada) — segue sem persistir.
  }
}

interface ModuloValue {
  modulo: Modulo;
  /** Ação itinerante em uso (só no Itinerante; o admin pode estar sem ação, para administrar). */
  acao: AcaoAtual | null;
  /** Prefixo das rotas do módulo: "/armazem" ou "/itinerante". */
  base: string;
}

const ModuloContext = createContext<ModuloValue | null>(null);

/** Módulo atual, ou null fora das rotas de um módulo (ex.: na tela de seleção). */
export function useModuloOpcional(): ModuloValue | null {
  return useContext(ModuloContext);
}

export function useModulo(): ModuloValue {
  const ctx = useContext(ModuloContext);
  if (!ctx) throw new Error("useModulo deve ser usado dentro das rotas de um módulo.");
  return ctx;
}

/**
 * Elemento de rota de um módulo (/armazem/... ou /itinerante/...): confere o
 * acesso do funcionário, define o contexto enviado nas requisições (X-Modulo e
 * X-Acao-Id) e, se o backend avisar que a ação encerrou, tira o usuário do módulo.
 */
export function ModuloRota({ modulo }: { modulo: Modulo }) {
  const { funcionario } = useAuth();
  const navigate = useNavigate();

  const acao = modulo === "itinerante" ? lerAcaoSalva() : null;
  const admin = funcionario?.role === "admin";

  // Define o contexto durante a renderização para que as requisições dos filhos já o usem.
  definirContextoApi(modulo, acao?.id ?? null);

  useEffect(() => {
    definirAoAcaoEncerrada(() => {
      salvarAcao(null);
      alert("A ação itinerante foi encerrada. Escolha outro módulo ou ação.");
      navigate("/modulos?trocar=1", { replace: true });
    });
    return () => definirAoAcaoEncerrada(null);
  }, [navigate]);

  if (!funcionario) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        Carregando…
      </div>
    );
  }

  const temAcesso = admin || (modulo === "armazem" ? funcionario.acesso_armazem : funcionario.acesso_itinerante);
  if (!temAcesso) return <Navigate to="/modulos" replace />;
  // No Itinerante, quem não é admin precisa estar numa ação.
  if (modulo === "itinerante" && !acao && !admin) return <Navigate to="/modulos" replace />;

  return (
    <ModuloContext.Provider value={{ modulo, acao, base: `/${modulo}` }}>
      <Outlet />
    </ModuloContext.Provider>
  );
}
