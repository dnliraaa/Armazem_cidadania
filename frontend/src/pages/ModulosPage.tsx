import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import logoAzul from "../assets/logo.png";
import { salvarAcao } from "../contexts/ModuloContext";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import { rotaInicial } from "../lib/acesso";
import type { AcaoItinerante, ModulosDisponiveis } from "../types";
import { formatarDataBr } from "../utils/formatters";

const estiloCartao = {
  width: "100%",
  maxWidth: 340,
  textAlign: "center",
  padding: "2rem 1.5rem",
} as const;

function periodo(a: Pick<AcaoItinerante, "data_inicio" | "data_fim">): string {
  return a.data_inicio === a.data_fim
    ? formatarDataBr(a.data_inicio)
    : `${formatarDataBr(a.data_inicio)} a ${formatarDataBr(a.data_fim)}`;
}

/**
 * Seleção de módulo logo após o login. Com um único módulo disponível o usuário
 * entra direto; no Itinerante, com mais de uma ação em andamento, escolhe a ação.
 * `?trocar=1` (botão "Trocar módulo") desliga a entrada automática.
 */
export function ModulosPage() {
  const { funcionario, sair } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const trocando = params.get("trocar") === "1";

  const [dados, setDados] = useState<ModulosDisponiveis | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhendoAcao, setEscolhendoAcao] = useState(false);

  useEffect(() => {
    api
      .get<ModulosDisponiveis>("/modulos-disponiveis")
      .then(setDados)
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Não foi possível carregar os módulos."));
  }, []);

  function entrarArmazem() {
    navigate(rotaInicial(funcionario?.role ?? "", "/armazem"), { replace: true });
  }

  function entrarItinerante(acao: AcaoItinerante | null) {
    salvarAcao(acao ? { id: acao.id, nome: acao.nome } : null);
    navigate(rotaInicial(funcionario?.role ?? "", "/itinerante"), { replace: true });
  }

  const admin = funcionario?.role === "admin";
  const armazemOk = Boolean(dados?.armazem);
  const itineranteOk = Boolean(dados?.itinerante.disponivel);
  const acoes = dados?.itinerante.acoes ?? [];

  // Entrada automática: só um módulo disponível (e, no Itinerante, no máximo uma ação para escolher).
  const [entradaAutomaticaFeita, setEntradaAutomaticaFeita] = useState(false);
  useEffect(() => {
    if (!dados || trocando || entradaAutomaticaFeita) return;
    if (armazemOk && !itineranteOk) {
      setEntradaAutomaticaFeita(true);
      entrarArmazem();
    } else if (!armazemOk && itineranteOk) {
      if (acoes.length === 1) {
        setEntradaAutomaticaFeita(true);
        entrarItinerante(acoes[0]);
      } else if (acoes.length === 0 && admin) {
        setEntradaAutomaticaFeita(true);
        entrarItinerante(null);
      } else {
        setEscolhendoAcao(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, trocando]);

  function handleItinerante() {
    if (acoes.length === 1 && !admin) return entrarItinerante(acoes[0]);
    if (acoes.length === 0) return entrarItinerante(null); // só o admin chega aqui (administrar ações)
    setEscolhendoAcao(true);
  }

  // O cadastro do funcionário ainda está carregando logo após o login: espera, em vez de redirecionar.
  if (!funcionario) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
        Carregando…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        gap: "1.5rem",
        position: "relative",
      }}
    >
      <img src={logoAzul} alt="Armazém da Cidadania" style={{ height: 110, maxWidth: "80%", width: "auto" }} />
      <h1 style={{ margin: 0, fontSize: "1.4rem" }}>
        {escolhendoAcao ? "Escolha a ação itinerante" : "Escolha o módulo"}
      </h1>

      {erro && <div className="alerta-erro">{erro}</div>}
      {!dados && !erro && <p className="vazio">Carregando…</p>}

      {dados && !escolhendoAcao && (
        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
          {dados.armazem && (
            <div className="cartao" style={estiloCartao}>
              <h2 style={{ marginTop: 0 }}>Armazém da Cidadania</h2>
              <p style={{ color: "var(--cor-texto-suave)" }}>Atendimento nas unidades.</p>
              <button className="btn btn-primario" onClick={entrarArmazem}>
                Entrar
              </button>
            </div>
          )}

          {dados.itinerante.acesso && (
            <div className="cartao" style={{ ...estiloCartao, opacity: itineranteOk ? 1 : 0.7 }}>
              <h2 style={{ marginTop: 0 }}>Armazém Itinerante</h2>
              <p style={{ color: "var(--cor-texto-suave)" }}>
                {itineranteOk
                  ? acoes.length > 0
                    ? `${acoes.length} ação(ões) em andamento hoje.`
                    : "Nenhuma ação em andamento hoje (administração)."
                  : "Nenhuma ação itinerante em andamento hoje."}
              </p>
              <button className="btn btn-primario" onClick={handleItinerante} disabled={!itineranteOk}>
                Entrar
              </button>
            </div>
          )}

          {!dados.armazem && !dados.itinerante.acesso && (
            <p className="vazio">Seu usuário não tem acesso a nenhum módulo. Fale com um administrador.</p>
          )}
        </div>
      )}

      {dados && escolhendoAcao && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: 420 }}>
          {acoes.map((a) => (
            <button
              key={a.id}
              className="btn btn-primario"
              style={{ padding: "0.9rem 1.25rem", textAlign: "left" }}
              onClick={() => entrarItinerante(a)}
            >
              <strong>{a.nome}</strong>
              <br />
              <span style={{ fontSize: "0.85rem", fontWeight: 400 }}>
                {a.local ? `${a.local} • ` : ""}
                {periodo(a)}
              </span>
            </button>
          ))}
          {admin && (
            <button className="btn btn-secundario" onClick={() => entrarItinerante(null)}>
              Administrar ações (sem selecionar uma)
            </button>
          )}
          {(armazemOk || trocando) && (
            <button className="btn btn-secundario" onClick={() => setEscolhendoAcao(false)}>
              Voltar
            </button>
          )}
        </div>
      )}

      <button className="btn btn-secundario btn-pequeno" style={{ position: "absolute", bottom: 20, right: 20 }} onClick={sair}>
        Sair
      </button>
    </div>
  );
}
