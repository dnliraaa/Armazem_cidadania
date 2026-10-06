import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import logoBranca from "../assets/logo2.png";
import { useAuth } from "../contexts/AuthContext";
import { nivelPermitido } from "../lib/acesso";
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
const links = [
  { to: "/funcionarios", label: "Funcionários", Icon: IconFuncionarios, disponivel: true, niveis: ["amplo"] },
  { to: "/cidadaos", label: "Cidadãos", Icon: IconCidadaos, disponivel: true, niveis: ["amplo"] },
  { to: "/formularios", label: "Formulários", Icon: IconFormularios, disponivel: true, niveis: ["amplo"] },
  { to: "/atendimentos", label: "Atendimentos", Icon: IconAtendimentos, disponivel: true, niveis: ["amplo"] },
  // Recepção e Fila do Núcleo: o admin não opera filas; o "atendente" mantém o acesso.
  { to: "/recepcao", label: "Recepção", Icon: IconRecepcao, disponivel: true, niveis: ["recepcao", "atendente"] },
  {
    to: "/fila-nucleo",
    label: "Fila do Núcleo",
    Icon: IconFilaNucleo,
    disponivel: true,
    niveis: ["nucleo", "atendente"],
  },
  {
    to: "/atendimentos-historico",
    label: "Histórico de Atendimentos",
    Icon: IconAtendimentos,
    disponivel: true,
    niveis: ["nucleo"],
  },
  { to: "/unidades", label: "Unidades", Icon: IconUnidades, disponivel: true, niveis: ["amplo"] },
  // Infraestrutura: só o início e as duas telas de quiosque da sua unidade.
  { to: "/infraestrutura", label: "Início", Icon: IconUnidades, disponivel: true, niveis: ["infraestrutura"] },
  { to: "/totem", label: "Totem", Icon: IconRecepcao, disponivel: true, niveis: ["infraestrutura"] },
  { to: "/painel", label: "Painel", Icon: IconFilaNucleo, disponivel: true, niveis: ["infraestrutura"] },
];

export function Layout() {
  const { funcionario, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  // Sem o cadastro carregado ainda, não mostra item nenhum (evita piscar o menu completo).
  const linksVisiveis = funcionario ? links.filter((l) => nivelPermitido(funcionario.role, l.niveis)) : [];

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

        <nav className="sidebar-nav">
          {linksVisiveis.map((link) =>
            link.disponivel ? (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? "ativo" : "")}
                onClick={() => setMenuAberto(false)}
              >
                <link.Icon /> {link.label}
              </NavLink>
            ) : (
              <span key={link.to} style={{ opacity: 0.5, display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.75rem", fontSize: "0.92rem" }}>
                <link.Icon /> {link.label}
                <span className="em-breve">em breve</span>
              </span>
            )
          )}
        </nav>

        <div className="sidebar-rodape">
          <div className="sidebar-usuario">
            <strong>{funcionario?.nome}</strong>
            <span>{funcionario?.email}</span>
          </div>
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
