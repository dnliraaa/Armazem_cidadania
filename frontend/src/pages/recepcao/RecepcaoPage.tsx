import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { api, ApiError } from "../../lib/api";
import type { Senha } from "../../types";
import { formatarCodigoSenha } from "../fila/filaUtils";
import { IniciarAtendimentoModal } from "./IniciarAtendimentoModal";

const INTERVALO_ATUALIZACAO_MS = 4000;
const CHAVE_GUICHE = "armazem_guiche";

interface RespostaFila {
  aguardando: {
    normal: Senha[];
    prioritaria: Senha[];
    totalNormal: number;
    totalPrioritaria: number;
  };
  chamadas: Senha[];
  /** Todas as senhas do dia que já saíram de 'aguardando', da mais recente para a mais antiga. */
  historico: Senha[];
}

const ROTULO_STATUS: Record<Senha["status"], { texto: string; classe: string }> = {
  aguardando: { texto: "Aguardando", classe: "badge-inativo" },
  chamada: { texto: "Chamando", classe: "badge-alerta" },
  atendida: { texto: "Atendida", classe: "badge-ativo" },
  perdida: { texto: "Descartada", classe: "badge-inativo" },
};

function lerGuicheSalvo(): string {
  try {
    return localStorage.getItem(CHAVE_GUICHE) ?? "";
  } catch {
    return "";
  }
}

function salvarGuiche(valor: string) {
  try {
    localStorage.setItem(CHAVE_GUICHE, valor);
  } catch {
    // Sem acesso ao localStorage (ex.: navegação privada) — segue sem persistir.
  }
}

export function RecepcaoPage() {
  const { funcionario } = useAuth();
  const [guiche, setGuiche] = useState(lerGuicheSalvo);
  const [fila, setFila] = useState<RespostaFila | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [iniciandoAtendimento, setIniciandoAtendimento] = useState(false);

  async function carregarFila() {
    try {
      const dados = await api.get<RespostaFila>("/fila");
      setFila(dados);
      setErro(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar a fila.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarFila();
    const intervalo = setInterval(carregarFila, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(intervalo);
  }, []);

  function handleGuicheChange(valor: string) {
    setGuiche(valor);
    salvarGuiche(valor);
  }

  const chamadaAtual = fila?.chamadas[0] ?? null;

  async function handleChamarProxima() {
    setProcessando(true);
    setErro(null);
    try {
      const { sugestao } = await api.get<{ sugestao: Senha | null }>("/fila/proxima-sugestao");
      if (!sugestao) {
        setErro("Não há ninguém aguardando na fila.");
        return;
      }
      await api.post(`/fila/${sugestao.id}/chamar`, { guiche: guiche || undefined });
      await carregarFila();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível chamar a próxima senha.");
    } finally {
      setProcessando(false);
    }
  }

  async function handleChamarNovamente() {
    if (!chamadaAtual) return;
    setProcessando(true);
    setErro(null);
    try {
      await api.post(`/fila/${chamadaAtual.id}/chamar`, { guiche: guiche || undefined });
      await carregarFila();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível rechamar a senha.");
    } finally {
      setProcessando(false);
    }
  }

  async function handleRechamarManual(senha: Senha) {
    setProcessando(true);
    setErro(null);
    try {
      await api.post(`/fila/${senha.id}/rechamar-manual`, { guiche: guiche || undefined });
      await carregarFila();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível rechamar a senha.");
      await carregarFila();
    } finally {
      setProcessando(false);
    }
  }

  async function handleResolver(acao: "perdida") {
    if (!chamadaAtual) return;
    setProcessando(true);
    setErro(null);
    try {
      await api.post(`/fila/${chamadaAtual.id}/${acao}`, {});
      await carregarFila();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível atualizar a senha.");
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Recepção</h1>
          <p>Chame a próxima senha da fila e acompanhe quem está esperando.</p>
          {funcionario?.role === "recepcao" && funcionario.unidade_nome && (
            <p style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--cor-texto-suave)" }}>
              Atendendo: <strong>{funcionario.unidade_nome}</strong>
            </p>
          )}
        </div>
      </div>

      {erro && <div className="alerta-erro">{erro}</div>}

      <div className="cartao" style={{ marginBottom: "1.5rem", textAlign: "center", padding: "2rem 1.5rem" }}>
        {chamadaAtual ? (
          <>
            <p style={{ margin: 0, color: "var(--cor-texto-suave)", fontSize: "0.95rem" }}>Chamando</p>
            <h2
              style={{
                fontSize: "3.5rem",
                margin: "0.25rem 0",
                color: "var(--cor-primaria)",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
              }}
            >
              {formatarCodigoSenha(chamadaAtual)}
              {chamadaAtual.tentativas >= 2 && (
                <span className="badge badge-inativo" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  {chamadaAtual.tentativas >= 3 ? "Última chance" : "2ª chamada"}
                </span>
              )}
            </h2>
            {chamadaAtual.guiche && (
              <p style={{ margin: "0 0 1rem", color: "var(--cor-texto-suave)" }}>{chamadaAtual.guiche}</p>
            )}
          </>
        ) : (
          <p className="vazio" style={{ padding: "1.5rem 0" }}>Nenhuma senha chamada no momento.</p>
        )}

        <div className="campo" style={{ maxWidth: 240, margin: "0 auto 1.25rem" }}>
          <label htmlFor="guiche">Guichê</label>
          <input
            id="guiche"
            value={guiche}
            onChange={(e) => handleGuicheChange(e.target.value)}
            placeholder="Ex: Guichê 1"
          />
        </div>

        {chamadaAtual ? (
          <div className="acoes-linha" style={{ justifyContent: "center" }}>
            <button className="btn btn-secundario" onClick={handleChamarNovamente} disabled={processando}>
              Chamar novamente
            </button>
            <button className="btn btn-primario" onClick={() => setIniciandoAtendimento(true)} disabled={processando}>
              Iniciar atendimento
            </button>
            <button className="btn btn-perigo" onClick={() => handleResolver("perdida")} disabled={processando}>
              Não compareceu
            </button>
          </div>
        ) : (
          <div className="acoes-linha" style={{ justifyContent: "center" }}>
            <button className="btn btn-primario" onClick={handleChamarProxima} disabled={processando}>
              Chamar próxima
            </button>
          </div>
        )}
      </div>

      {carregando ? (
        <div className="cartao">
          <p className="vazio">Carregando…</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
          <div className="cartao">
            <h3 style={{ marginTop: 0 }}>
              Aguardando — Normal{" "}
              <span className="badge badge-ativo">{fila?.aguardando.totalNormal ?? 0}</span>
            </h3>
            {fila && fila.aguardando.normal.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {fila.aguardando.normal.map((s) => (
                  <span key={s.id} className="badge badge-inativo">
                    {formatarCodigoSenha(s)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="vazio">Ninguém aguardando.</p>
            )}
          </div>

          <div className="cartao">
            <h3 style={{ marginTop: 0 }}>
              Aguardando — Prioritária{" "}
              <span className="badge badge-ativo">{fila?.aguardando.totalPrioritaria ?? 0}</span>
            </h3>
            {fila && fila.aguardando.prioritaria.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {fila.aguardando.prioritaria.map((s) => (
                  <span key={s.id} className="badge badge-inativo">
                    {formatarCodigoSenha(s)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="vazio">Ninguém aguardando.</p>
            )}
          </div>
        </div>
      )}

      {fila && (
        <div className="cartao" style={{ marginTop: "1.25rem" }}>
          <h3 style={{ marginTop: 0 }}>Histórico de hoje</h3>
          {fila.historico.length === 0 ? (
            <p className="vazio">Nenhuma senha chamada ainda hoje.</p>
          ) : (
            <div className="tabela-responsiva">
              <table>
                <thead>
                  <tr>
                    <th>Senha</th>
                    <th>Status</th>
                    <th>Tentativas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fila.historico.map((s) => {
                    const rotulo = ROTULO_STATUS[s.status];
                    // Última chance: descartada após o ciclo automático (2 tentativas) e ainda sem rechamada manual.
                    const podeRechamarManual = s.status === "perdida" && s.tentativas === 2;
                    return (
                      <tr key={s.id}>
                        <td>
                          <strong>{formatarCodigoSenha(s)}</strong>
                        </td>
                        <td>
                          <span className={`badge ${rotulo.classe}`}>{rotulo.texto}</span>
                        </td>
                        <td>{s.tentativas}</td>
                        <td>
                          {podeRechamarManual && (
                            <button
                              className="btn btn-secundario btn-pequeno"
                              onClick={() => handleRechamarManual(s)}
                              disabled={processando || Boolean(chamadaAtual)}
                              title={chamadaAtual ? "Finalize a senha que está sendo chamada antes." : undefined}
                            >
                              Chamar mais uma vez
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {iniciandoAtendimento && chamadaAtual && (
        <IniciarAtendimentoModal
          senha={chamadaAtual}
          onFechar={() => setIniciandoAtendimento(false)}
          onConcluido={async () => {
            setIniciandoAtendimento(false);
            await carregarFila();
          }}
        />
      )}
    </div>
  );
}
