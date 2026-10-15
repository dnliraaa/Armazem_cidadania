import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useModulo } from "../../contexts/ModuloContext";

/** Início do nível infraestrutura: atalhos para as duas telas de quiosque da unidade (ou da ação itinerante). */
export function InfraestruturaPage() {
  const { funcionario } = useAuth();
  const { modulo, acao, base } = useModulo();

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Infraestrutura</h1>
          <p>Abra e deixe rodando o totem e o painel de chamados da sua unidade.</p>
          {modulo === "armazem" && funcionario?.unidade_nome && (
            <p style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--cor-texto-suave)" }}>
              Unidade: <strong>{funcionario.unidade_nome}</strong>
            </p>
          )}
          {modulo === "itinerante" && acao && (
            <p style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--cor-texto-suave)" }}>
              Ação itinerante: <strong>{acao.nome}</strong>
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Totem</h3>
          <p>Tela de retirada de senha para o cidadão.</p>
          <Link to={`${base}/totem`} className="btn btn-primario">
            Abrir totem
          </Link>
        </div>
        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>Painel de chamados</h3>
          <p>Tela para o monitor da sala de espera.</p>
          <Link to={`${base}/painel`} className="btn btn-primario">
            Abrir painel
          </Link>
        </div>
      </div>
    </div>
  );
}
