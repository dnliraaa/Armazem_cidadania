import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import logoAzul from "../../assets/logo.png";
import { useAuth } from "../../contexts/AuthContext";
import { api, ApiError } from "../../lib/api";
import { formatarCodigoSenha } from "../fila/filaUtils";
import type { Senha, Totem } from "../../types";

const DURACAO_TELA_SENHA_MS = 5000;
const CHAVE_TOTEM = "armazem_totem_id";

function lerTotemSalvo(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOTEM);
  } catch {
    return null;
  }
}

function salvarTotem(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(CHAVE_TOTEM, id);
    } else {
      localStorage.removeItem(CHAVE_TOTEM);
    }
  } catch {
    // Sem acesso ao localStorage (ex.: navegação privada) — segue sem persistir.
  }
}

const estiloTela: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "2rem",
  background: "var(--cor-fundo)",
  position: "relative",
  textAlign: "center",
};

function estiloBotaoGrande(cor: string): CSSProperties {
  return {
    width: "min(280px, 40vw)",
    height: "min(280px, 40vw)",
    minWidth: 180,
    minHeight: 180,
    borderRadius: 24,
    border: "none",
    background: cor,
    color: "#fff",
    fontSize: "1.6rem",
    fontWeight: 800,
    lineHeight: 1.3,
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
  };
}

/**
 * Tela de configuração inicial do totem: escolhe qual totem cadastrado este
 * aparelho representa (e, com isso, qual unidade). Fica salvo no localStorage
 * do navegador, então só é pedido de novo se o aparelho/navegador mudar ou o
 * cache for limpo.
 */
function ConfigurarTotem({ onConfigurado }: { onConfigurado: (totem: Totem) => void }) {
  const { sair, funcionario } = useAuth();
  const [totens, setTotens] = useState<Totem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Totem[]>("/totens")
      // A unidade é fixa: só os totens ativos cadastrados na unidade do funcionário (o backend já filtra).
      .then((dados) => setTotens(dados.filter((t) => t.ativo && t.unidade_id === funcionario?.unidade_id)))
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Não foi possível carregar os totens."))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div style={estiloTela}>
      <img
        src={logoAzul}
        alt="Armazém da Cidadania"
        style={{ height: "min(160px, 20vw)", width: "auto", maxWidth: "70vw", marginBottom: "1.5rem" }}
      />
      <h1 style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>Configurar este totem</h1>
      <p style={{ color: "var(--cor-texto-suave)", fontSize: "1rem", maxWidth: 480, marginBottom: "2rem" }}>
        Selecione qual totem cadastrado este aparelho representa. Isso só precisa ser feito uma vez.
      </p>

      {erro && <div className="alerta-erro" style={{ marginBottom: "1.5rem", maxWidth: 480 }}>{erro}</div>}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : totens.length === 0 ? (
        <p className="vazio">Nenhum totem ativo cadastrado. Peça a um administrador para cadastrar um em "Unidades".</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: 380 }}>
          {totens.map((t) => (
            <button
              key={t.id}
              className="btn btn-primario"
              style={{ padding: "0.9rem 1.5rem", fontSize: "1.05rem" }}
              onClick={() => onConfigurado(t)}
            >
              {t.nome} {t.unidade_nome ? `— ${t.unidade_nome}` : ""}
            </button>
          ))}
        </div>
      )}

      <button
        className="btn btn-secundario btn-pequeno"
        style={{ position: "absolute", bottom: 20, right: 20 }}
        onClick={sair}
      >
        Sair
      </button>
    </div>
  );
}

/**
 * Tela do totem: sem sidebar/menu, pensada para tablet/computador em modo
 * quiosque. O funcionário loga uma vez no início do dia (a rota ainda exige
 * sessão válida, ver App.tsx) e deixa esta tela aberta o dia todo. O totem em
 * si representa sempre a mesma unidade (ver ConfigurarTotem acima) — não
 * depende de quem estiver logado no aparelho.
 */
export function TotemPage() {
  const { sair } = useAuth();
  const [totemId, setTotemId] = useState<string | null>(lerTotemSalvo);
  const [totemNome, setTotemNome] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"normal" | "prioritaria" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<Senha | null>(null);

  useEffect(() => {
    if (!senhaGerada) return;
    const timer = setTimeout(() => setSenhaGerada(null), DURACAO_TELA_SENHA_MS);
    return () => clearTimeout(timer);
  }, [senhaGerada]);

  // Se o totem já estava salvo no localStorage (recarregou a página), busca o
  // nome dele de novo para exibir — e, se ele não existir mais (foi removido
  // ou desativado), pede para configurar de novo.
  useEffect(() => {
    if (!totemId || totemNome) return;
    api
      .get<Totem[]>("/totens")
      .then((totens) => {
        const atual = totens.find((t) => t.id === totemId && t.ativo);
        if (atual) {
          setTotemNome(atual.nome);
        } else {
          salvarTotem(null);
          setTotemId(null);
        }
      })
      .catch(() => {
        // Falha de rede momentânea: mantém o totem configurado, só não
        // mostra o nome agora.
      });
  }, [totemId, totemNome]);

  function handleConfigurado(totem: Totem) {
    salvarTotem(totem.id);
    setTotemId(totem.id);
    setTotemNome(totem.nome);
  }

  function handleTrocarTotem() {
    salvarTotem(null);
    setTotemId(null);
    setTotemNome(null);
  }

  async function retirar(tipo: "normal" | "prioritaria") {
    if (!totemId) return;
    setErro(null);
    setEnviando(tipo);
    try {
      const senha = await api.post<Senha>("/fila/retirar", { tipo, totem_id: totemId });
      setSenhaGerada(senha);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível gerar a senha. Tente novamente.");
    } finally {
      setEnviando(null);
    }
  }

  if (!totemId) {
    return <ConfigurarTotem onConfigurado={handleConfigurado} />;
  }

  if (senhaGerada) {
    return (
      <div style={estiloTela}>
        <img
          src={logoAzul}
          alt="Armazém da Cidadania"
          style={{ height: "min(240px, 26vw)", width: "auto", maxWidth: "70vw", marginBottom: "2rem" }}
        />
        <p style={{ fontSize: "1.8rem", color: "var(--cor-texto-suave)", margin: 0 }}>Sua senha é</p>
        <h1 style={{ fontSize: "min(9rem, 22vw)", margin: "0.5rem 0", color: "var(--cor-primaria)", fontWeight: 800, letterSpacing: "0.05em" }}>
          {formatarCodigoSenha(senhaGerada)}
        </h1>
        <p style={{ fontSize: "1.2rem", color: "var(--cor-texto-suave)" }}>Aguarde ser chamado no painel.</p>
        <button
          className="btn btn-primario"
          style={{ marginTop: "2rem", fontSize: "1.2rem", padding: "0.9rem 2.5rem" }}
          onClick={() => setSenhaGerada(null)}
        >
          OK
        </button>
      </div>
    );
  }

  return (
    <div style={estiloTela}>
      <img
        src={logoAzul}
        alt="Armazém da Cidadania"
        style={{ height: "min(270px, 28vw)", width: "auto", maxWidth: "70vw", marginBottom: "2rem" }}
      />
      <h1 style={{ fontSize: "2.2rem", marginBottom: "0.5rem" }}>Retire sua senha</h1>
      <p style={{ color: "var(--cor-texto-suave)", fontSize: "1.05rem", maxWidth: 520, marginBottom: "2.5rem" }}>
        Toque em um dos botões abaixo.
      </p>

      {erro && <div className="alerta-erro" style={{ marginBottom: "1.5rem" }}>{erro}</div>}

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button disabled={enviando !== null} onClick={() => retirar("normal")} style={estiloBotaoGrande("var(--cor-primaria)")}>
          {enviando === "normal" ? "Gerando…" : (
            <>
              SENHA
              <br />
              NORMAL
            </>
          )}
        </button>
        <button disabled={enviando !== null} onClick={() => retirar("prioritaria")} style={estiloBotaoGrande("#ea580c")}>
          {enviando === "prioritaria" ? "Gerando…" : (
            <>
              SENHA
              <br />
              PRIORITÁRIA
            </>
          )}
        </button>
      </div>

      <p style={{ marginTop: "2.5rem", color: "var(--cor-texto-suave)", fontSize: "0.9rem", maxWidth: 560 }}>
        Tem prioridade: pessoas idosas, gestantes, lactantes, pessoas com deficiência ou mobilidade reduzida, e
        pessoas acompanhadas de criança de colo.
      </p>

      <div style={{ position: "absolute", bottom: 20, right: 20, display: "flex", gap: "0.5rem", alignItems: "center" }}>
        {totemNome && (
          <span style={{ fontSize: "0.8rem", color: "var(--cor-texto-suave)" }}>{totemNome}</span>
        )}
        <Link to="/infraestrutura" className="btn btn-secundario btn-pequeno">
          Menu
        </Link>
        <button className="btn btn-secundario btn-pequeno" onClick={handleTrocarTotem}>
          Trocar totem
        </button>
        <button className="btn btn-secundario btn-pequeno" onClick={sair}>
          Sair
        </button>
      </div>
    </div>
  );
}
