import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RotaProtegida } from "./components/RotaProtegida";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ModuloRota, useModulo } from "./contexts/ModuloContext";
import { rotaInicial } from "./lib/acesso";
import type { Modulo } from "./types";
import { AcoesItinerantesPage } from "./pages/acoes/AcoesItinerantesPage";
import { AtendimentosHistoricoPage } from "./pages/atendimentos/AtendimentosHistoricoPage";
import { AtendimentosPage } from "./pages/atendimentos/AtendimentosPage";
import { CidadaosPage } from "./pages/cidadaos/CidadaosPage";
import { FormulariosPage } from "./pages/formularios/FormulariosPage";
import { FuncionariosPage } from "./pages/funcionarios/FuncionariosPage";
import { InfraestruturaPage } from "./pages/infraestrutura/InfraestruturaPage";
import { Login } from "./pages/Login";
import { ModulosPage } from "./pages/ModulosPage";
import { FilaNucleoPage } from "./pages/nucleo/FilaNucleoPage";
import { PainelPage } from "./pages/painel/PainelPage";
import { RecepcaoPage } from "./pages/recepcao/RecepcaoPage";
import { TotemPage } from "./pages/totem/TotemPage";
import { UnidadesPage } from "./pages/unidades/UnidadesPage";

/** Rota já dentro do Layout (logado): só deixa passar quem tem um dos níveis; os demais vão para a própria tela inicial. */
function Restrita({ niveis, children }: { niveis: string[]; children: ReactNode }) {
  return <RotaProtegida niveis={niveis}>{children}</RotaProtegida>;
}

/** Raiz de um módulo (/armazem ou /itinerante): leva cada nível para a sua tela inicial. */
function InicioPorNivel() {
  const { funcionario } = useAuth();
  const { base } = useModulo();
  if (!funcionario) return null;
  return <Navigate to={rotaInicial(funcionario.role, base)} replace />;
}

/** URLs de antes da separação em módulos: redirecionam para o Armazém, para não quebrar favoritos. */
const ROTAS_LEGADAS = [
  "funcionarios",
  "cidadaos",
  "formularios",
  "atendimentos",
  "recepcao",
  "fila-nucleo",
  "atendimentos-historico",
  "unidades",
  "infraestrutura",
  "totem",
  "painel",
];

/**
 * Rotas de um módulo. As mesmas telas existem nos dois; o que muda é o contexto
 * (módulo/ação) enviado ao backend, que escopa todos os dados operacionais.
 */
function rotasDoModulo(modulo: Modulo) {
  const itinerante = modulo === "itinerante";
  return (
    <>
      {/* Sem sidebar/menu: tela de quiosque para o cidadão retirar a senha. */}
      <Route
        path="totem"
        element={
          <RotaProtegida niveis={["infraestrutura"]}>
            <TotemPage />
          </RotaProtegida>
        }
      />

      {/* Sem sidebar/menu: painel público de chamados para monitor na sala de espera. */}
      <Route
        path="painel"
        element={
          <RotaProtegida niveis={["infraestrutura"]}>
            <PainelPage />
          </RotaProtegida>
        }
      />

      <Route element={<Layout />}>
        <Route index element={<InicioPorNivel />} />

        {/* Infraestrutura: início com atalhos para o totem e o painel (telas de quiosque, fora do Layout). */}
        <Route
          path="infraestrutura"
          element={<Restrita niveis={["infraestrutura"]}><InfraestruturaPage /></Restrita>}
        />

        {/* Acesso amplo: admin/atendente (qualquer nível que não seja recepção, núcleo nem infraestrutura). */}
        <Route path="funcionarios" element={<Restrita niveis={["amplo"]}><FuncionariosPage /></Restrita>} />
        <Route path="cidadaos" element={<Restrita niveis={["amplo"]}><CidadaosPage /></Restrita>} />
        <Route path="formularios" element={<Restrita niveis={["amplo"]}><FormulariosPage /></Restrita>} />
        <Route path="atendimentos" element={<Restrita niveis={["amplo"]}><AtendimentosPage /></Restrita>} />

        {/* Unidades só existem no Armazém; ações itinerantes só no Itinerante (admin). */}
        {!itinerante && (
          <Route path="unidades" element={<Restrita niveis={["amplo"]}><UnidadesPage /></Restrita>} />
        )}
        {itinerante && (
          <Route path="acoes" element={<Restrita niveis={["admin"]}><AcoesItinerantesPage /></Restrita>} />
        )}

        {/* Recepção e Fila do Núcleo são operacionais: o admin não opera filas; o "atendente" mantém o acesso. */}
        <Route path="recepcao" element={<Restrita niveis={["recepcao", "atendente"]}><RecepcaoPage /></Restrita>} />
        <Route path="fila-nucleo" element={<Restrita niveis={["nucleo", "atendente"]}><FilaNucleoPage /></Restrita>} />
        <Route
          path="atendimentos-historico"
          element={<Restrita niveis={["nucleo"]}><AtendimentosHistoricoPage /></Restrita>}
        />
      </Route>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Seleção de módulo (e de ação itinerante) logo após o login. */}
        <Route
          path="/modulos"
          element={
            <RotaProtegida>
              <ModulosPage />
            </RotaProtegida>
          }
        />

        <Route
          path="/armazem"
          element={
            <RotaProtegida>
              <ModuloRota modulo="armazem" />
            </RotaProtegida>
          }
        >
          {rotasDoModulo("armazem")}
        </Route>

        <Route
          path="/itinerante"
          element={
            <RotaProtegida>
              <ModuloRota modulo="itinerante" />
            </RotaProtegida>
          }
        >
          {rotasDoModulo("itinerante")}
        </Route>

        {ROTAS_LEGADAS.map((rota) => (
          <Route key={rota} path={`/${rota}`} element={<Navigate to={`/armazem/${rota}`} replace />} />
        ))}

        <Route path="*" element={<Navigate to="/modulos" replace />} />
      </Routes>
    </AuthProvider>
  );
}
