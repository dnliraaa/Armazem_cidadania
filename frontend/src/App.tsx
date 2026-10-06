import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RotaProtegida } from "./components/RotaProtegida";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { rotaInicial } from "./lib/acesso";
import { AtendimentosHistoricoPage } from "./pages/atendimentos/AtendimentosHistoricoPage";
import { AtendimentosPage } from "./pages/atendimentos/AtendimentosPage";
import { CidadaosPage } from "./pages/cidadaos/CidadaosPage";
import { FormulariosPage } from "./pages/formularios/FormulariosPage";
import { FuncionariosPage } from "./pages/funcionarios/FuncionariosPage";
import { InfraestruturaPage } from "./pages/infraestrutura/InfraestruturaPage";
import { Login } from "./pages/Login";
import { FilaNucleoPage } from "./pages/nucleo/FilaNucleoPage";
import { PainelPage } from "./pages/painel/PainelPage";
import { RecepcaoPage } from "./pages/recepcao/RecepcaoPage";
import { TotemPage } from "./pages/totem/TotemPage";
import { UnidadesPage } from "./pages/unidades/UnidadesPage";

/** Rota já dentro do Layout (logado): só deixa passar quem tem um dos níveis; os demais vão para a própria tela inicial. */
function Restrita({ niveis, children }: { niveis: string[]; children: ReactNode }) {
  return <RotaProtegida niveis={niveis}>{children}</RotaProtegida>;
}

/** "/" leva cada nível para a sua tela inicial. */
function InicioPorNivel() {
  const { funcionario } = useAuth();
  if (!funcionario) return null;
  return <Navigate to={rotaInicial(funcionario.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Sem sidebar/menu: tela de quiosque para o cidadão retirar a senha. */}
        <Route
          path="/totem"
          element={
            <RotaProtegida niveis={["infraestrutura"]}>
              <TotemPage />
            </RotaProtegida>
          }
        />

        {/* Sem sidebar/menu: painel público de chamados para monitor na sala de espera. */}
        <Route
          path="/painel"
          element={
            <RotaProtegida niveis={["infraestrutura"]}>
              <PainelPage />
            </RotaProtegida>
          }
        />

        <Route
          element={
            <RotaProtegida>
              <Layout />
            </RotaProtegida>
          }
        >
          <Route index element={<InicioPorNivel />} />

          {/* Infraestrutura: início com atalhos para o totem e o painel (telas de quiosque, fora do Layout). */}
          <Route
            path="/infraestrutura"
            element={<Restrita niveis={["infraestrutura"]}><InfraestruturaPage /></Restrita>}
          />

          {/* Acesso amplo: admin/atendente (qualquer nível que não seja recepção nem núcleo). */}
          <Route path="/funcionarios" element={<Restrita niveis={["amplo"]}><FuncionariosPage /></Restrita>} />
          <Route path="/cidadaos" element={<Restrita niveis={["amplo"]}><CidadaosPage /></Restrita>} />
          <Route path="/formularios" element={<Restrita niveis={["amplo"]}><FormulariosPage /></Restrita>} />
          <Route path="/atendimentos" element={<Restrita niveis={["amplo"]}><AtendimentosPage /></Restrita>} />
          <Route path="/unidades" element={<Restrita niveis={["amplo"]}><UnidadesPage /></Restrita>} />

          {/* Recepção e Fila do Núcleo são operacionais (por unidade/núcleo): o admin não opera filas.
              O "atendente" mantém o acesso que já tinha. */}
          <Route path="/recepcao" element={<Restrita niveis={["recepcao", "atendente"]}><RecepcaoPage /></Restrita>} />
          <Route path="/fila-nucleo" element={<Restrita niveis={["nucleo", "atendente"]}><FilaNucleoPage /></Restrita>} />
          <Route
            path="/atendimentos-historico"
            element={<Restrita niveis={["nucleo"]}><AtendimentosHistoricoPage /></Restrita>}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
