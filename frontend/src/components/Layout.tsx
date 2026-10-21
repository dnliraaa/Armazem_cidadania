import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import logoBranca from "../assets/logo2.png";
import { useAuth } from "../contexts/AuthContext";
import { useModulo } from "../contexts/ModuloContext";
import { nivelPermitido } from "../lib/acesso";
import type { Modulo } from "../types";
import {
  IconAtendimentos,
  IconCidadaos,
  IconFilaNucleo,
  IconFormularios,
  IconFuncionarios,
  IconMenu,
  IconRecepcao,
  IconUnidades,
} from "./icons";
import "../styles/layout.css";

// `niveis` segue o mesmo critério das rotas em App.tsx ("amplo" = admin/atendente).
// `modulos` limita o item a um módulo (sem ele, aparece nos dois). `sufixo` é somado ao
// prefixo do módulo atual (/armazem ou /itinerante).
const links: {
  sufixo: string;
  label: string;
  Icon: typeof IconUnidades;
  niveis: string[];
  modulos?: Modulo[];
}[] = [
  { sufixo: "/funcionarios", label: "Funcionários", Icon: IconFuncionarios, niveis: ["amplo"] },
  { sufixo: "/cidadaos", label: "Cidadãos", Icon: IconCidadaos, niveis: ["amplo"] },
  { sufixo: "/formularios", label: "Formulários", Icon: IconFormularios, niveis: ["amplo"] },
  { sufixo: "/atendimentos", label: "Atendimentos", Icon: IconAtendimentos, niveis: ["amplo"] },
  // Recepção e Fila do Núcleo: o admin não opera filas; o "atendente" mantém o acesso.
  { sufixo: "/recepcao", label: "Recepção", Icon: IconRecepcao, niveis: ["recepcao", "atendente"] },
  { sufixo: "/fila-nucleo", label: "Fila do Núcleo", Icon: IconFilaNucleo, niveis: ["nucleo", "atendente"] },
  { sufixo: "/atendimentos-historico", label: "Histórico de Atendimentos", Icon: IconAtendimentos, niveis: ["nucleo"] },
  // Exclusivos de cada módulo: unidades só existem no Armazém; ações só no Itinerante (admin).
  { sufixo: "/unidades", label: "Unidades", Icon: IconUnidades, niveis: ["amplo"], modulos: ["armazem"] },
  { sufixo: "/acoes", label: "Ações Itinerantes", Icon: IconUnidades, niveis: ["admin"], modulos: ["itinerante"] },
  // Infraestrutura: só o início e as duas telas de quiosque da sua unidade/ação.
  { sufixo: "/infraestrutura", label: "Início", Icon: IconUnidades, niveis: ["infraestrutura"] },
  { sufixo: "/totem", label: "Totem", Icon: IconRecepcao, niveis: ["infraestrutura"] },
  { sufixo: "/painel", label: "Painel", Icon: IconFilaNucleo, niveis: ["infraestrutura"] },
];

export function Layout() {
  const { funcionario, sair } = useAuth();
  const { modulo, acao, base } = useModulo();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);
  // Sem o cadastro carregado ainda, não mostra item nenhum (evita piscar o menu completo).
  const linksVisiveis = funcionario
    ? links.filter(
        (l) => nivelPermitido(funcionario.role, l.niveis) && (!l.modulos || l.modulos.includes(modulo))
      )
    : [];

  const nomeModulo = modulo === "armazem" ? "Cidadania Presente" : "Cidadania Itinerante";

  return (
    <div className="app-shell">
      <div className="topo-mobile">
        <button className="botao-menu" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
          <IconMenu />
        </button>
        <img src={logoBranca} alt="Armazém da Cidadania" className="logo-topo-mobile" />
        <span style={{ width: "1.6rem" }} />
      </div>

      {menuAberto && <div className="sidebar-fundo" onClick={() => setMenuAberto(false)} />}

      <aside className={`sidebar ${menuAberto ? "aberta" : ""}`}>
        <div className="sidebar-marca">
          <img src={logoBranca} alt="Armazém da Cidadania" />
        </div>

        {/* Em qual módulo (e ação) o usuário está; o botão de trocar fica no rodapé. */}
        <div
          style={{
            margin: "0 0.75rem 0.75rem",
            padding: "0.6rem 0.75rem",
            borderRadius: 8,
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            fontSize: "0.82rem",
          }}
        >
          <div style={{ fontWeight: 700 }}>{nomeModulo}</div>
          {modulo === "itinerante" && (
            <div style={{ opacity: 0.85, marginTop: "0.15rem" }}>{acao?.nome ?? "Todas as ações"}</div>
          )}
        </div>

        <nav className="sidebar-nav">
          {linksVisiveis.map((link) => (
            <NavLink
              key={link.sufixo}
              to={`${base}${link.sufixo}`}
              className={({ isActive }) => (isActive ? "ativo" : "")}
              onClick={() => setMenuAberto(false)}
            >
              <link.Icon /> {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-rodape">
          <div className="sidebar-usuario">
            <strong>{funcionario?.nome}</strong>
            <span>{funcionario?.email}</span>
          </div>
          <button
            type="button"
            className="btn btn-sair"
            style={{ marginBottom: "0.5rem" }}
            onClick={() => navigate("/modulos?trocar=1")}
          >
            Trocar módulo
          </button>
          <button className="btn btn-sair" onClick={sair}>
            Sair
          </button>
        </div>
      </aside>

      <main className="conteudo-principal">
        <Outlet />
      </main>
    </div>
  );
}
