import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useModuloOpcional } from "../contexts/ModuloContext";
import { nivelPermitido, rotaInicial } from "../lib/acesso";

interface Props {
  children: ReactNode;
  /**
   * Níveis com acesso à rota (ex.: ["recepcao"]). "amplo" representa todos os
   * níveis que não são recepção, núcleo nem infraestrutura (admin, atendente…). Sem a prop, basta estar logado.
   */
  niveis?: string[];
}

function Carregando() {
  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
      Carregando…
    </div>
  );
}

function ErroCadastro() {
  const { recarregarFuncionario, sair } = useAuth();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "1.5rem",
        textAlign: "center",
      }}
    >
      <div className="alerta-erro">Não foi possível carregar o seu cadastro. Verifique a conexão e tente novamente.</div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button className="btn btn-primario" onClick={() => void recarregarFuncionario()}>
          Tentar de novo
        </button>
        <button className="btn" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </div>
  );
}

export function RotaProtegida({ children, niveis }: Props) {
  const { session, funcionario, carregando, erroFuncionario } = useAuth();
  const modulo = useModuloOpcional();

  if (carregando) {
    return <Carregando />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (erroFuncionario) {
    return <ErroCadastro />;
  }

  if (niveis) {
    // Logado, mas o cadastro do funcionário (e seu nível) ainda está sendo carregado.
    if (!funcionario) return <Carregando />;
    if (!nivelPermitido(funcionario.role, niveis)) {
      // Sem permissão: volta para a tela inicial do nível dentro do módulo atual (ou para a seleção de módulo).
      return <Navigate to={modulo ? rotaInicial(funcionario.role, modulo.base) : "/modulos"} replace />;
    }
  }

  return <>{children}</>;
}
