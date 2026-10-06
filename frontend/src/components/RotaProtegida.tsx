import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { nivelPermitido, rotaInicial } from "../lib/acesso";

interface Props {
  children: ReactNode;
  /**
   * Níveis com acesso à rota (ex.: ["recepcao"]). "amplo" representa todos os
   * níveis que não são recepção nem núcleo (admin, atendente…). Sem a prop, basta estar logado.
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

export function RotaProtegida({ children, niveis }: Props) {
  const { session, funcionario, carregando } = useAuth();

  if (carregando) {
    return <Carregando />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (niveis) {
    // Logado, mas o cadastro do funcionário (e seu nível) ainda está sendo carregado.
    if (!funcionario) return <Carregando />;
    if (!nivelPermitido(funcionario.role, niveis)) {
      return <Navigate to={rotaInicial(funcionario.role)} replace />;
    }
  }

  return <>{children}</>;
}
