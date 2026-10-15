import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useModulo } from "../../contexts/ModuloContext";
import { api, ApiError } from "../../lib/api";
import { IconNucleo, IconSala } from "../../components/icons";
import type { ChamadaPainel, RespostaPainel, Unidade } from "../../types";

const INTERVALO_ATUALIZACAO_MS = 3500;
const CHAVE_UNIDADE = "armazem_painel_unidade_id";
const DURACAO_DESTAQUE_MS = 1800;

/** Rótulo do local: sala para chamadas de núcleo, guichê para senhas da recepção. */
function rotuloLocal(chamada: ChamadaPainel): string {
  return chamada.origem === "nucleo" ? "SALA" : "GUICHÊ";
}

/** Bloco com ícone, rótulo e valor (ex.: NÚCLEO / Jurídico). */
function InfoChamada({
  icone,
  rotulo,
  valor,
  tamanho,
}: {
  icone: ReactNode;
  rotulo: string;
  valor: string;
  tamanho: "grande" | "compacto";
}) {
  const grande = tamanho === "grande";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: grande ? "1rem" : "0.6rem", minWidth: 0 }}>
      <span style={{ fontSize: grande ? "min(3rem, 7vw)" : "1.4rem", color: "var(--cor-primaria)", display: "flex" }}>
        {icone}
      </span>
      <div style={{ textAlign: "left", minWidth: 0 }}>
        <div
          style={{
            fontSize: grande ? "min(1.1rem, 3vw)" : "0.7rem",
            color: "var(--cor-texto-suave)",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          {rotulo}
        </div>
        <div
          style={{
            fontSize: grande ? "min(2.6rem, 6vw)" : "1.1rem",
            fontWeight: 700,
            color: "var(--cor-texto)",
            overflowWrap: "anywhere",
          }}
        >
          {valor}
        </div>
      </div>
    </div>
  );
}

function lerUnidadeSalva(): string | null {
  try {
    return localStorage.getItem(CHAVE_UNIDADE);
  } catch {
    return null;
  }
}

function salvarUnidade(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(CHAVE_UNIDADE, id);
    } else {
      localStorage.removeItem(CHAVE_UNIDADE);
    }
  } catch {
    // Sem acesso ao localStorage (ex.: navegação privada) — segue sem persistir.
  }
}

/** Beep curto via Web Audio API — sem depender de nenhum arquivo de áudio. */
function tocarBeep() {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {
    // Navegador bloqueou áudio (ex.: sem interação prévia do usuário) — segue sem som.
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

/** Tela de configuração inicial do painel: escolhe qual unidade este aparelho exibe. */
function ConfigurarPainel({ onConfigurado }: { onConfigurado: (unidade: Unidade) => void }) {
  const { sair } = useAuth();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Unidade[]>("/unidades")
      .then((dados) => setUnidades(dados.filter((u) => u.ativo)))
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Não foi possível carregar as unidades."))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div style={estiloTela}>
      <h1 style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>Configurar este painel</h1>
      <p style={{ color: "var(--cor-texto-suave)", fontSize: "1rem", maxWidth: 480, marginBottom: "2rem" }}>
        Selecione qual unidade este painel vai exibir. Isso só precisa ser feito uma vez.
      </p>

      {erro && <div className="alerta-erro" style={{ marginBottom: "1.5rem", maxWidth: 480 }}>{erro}</div>}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : unidades.length === 0 ? (
        <p className="vazio">Nenhuma unidade ativa cadastrada. Cadastre uma em "Unidades".</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: 380 }}>
          {unidades.map((u) => (
            <button
              key={u.id}
              className="btn btn-primario"
              style={{ padding: "0.9rem 1.5rem", fontSize: "1.05rem" }}
              onClick={() => onConfigurado(u)}
            >
              {u.nome}
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
 * Painel público de chamados: tela cheia, sem menu, pensada para um monitor
 * grande na sala de espera. Vinculado a uma UNIDADE (não a um totem
 * específico) pelo mesmo motivo da fila da Recepção já ser filtrada por
 * unidade — várias telas de painel na mesma unidade mostram sempre a mesma
 * coisa.
 */
export function PainelPage() {
  const { sair, funcionario } = useAuth();
  const { modulo, acao, base } = useModulo();
  const itinerante = modulo === "itinerante";
  // Esta tela é do nível infraestrutura: no Armazém a unidade é sempre a dele, sem seleção nem
  // troca; no Itinerante não há unidade — o painel é da ação em uso.
  const unidadeFixa = itinerante ? null : funcionario?.unidade_id ?? null;
  const [unidadeId, setUnidadeId] = useState<string | null>(() => unidadeFixa ?? lerUnidadeSalva());
  const [unidadeNome, setUnidadeNome] = useState<string | null>(null);
  const [painel, setPainel] = useState<RespostaPainel | null>(null);
  const [destaque, setDestaque] = useState(false);
  const [mostrarControles, setMostrarControles] = useState(false);
  const ultimoIdRef = useRef<string | null>(null);
  const primeiraCargaRef = useRef(true);

  function handleConfigurado(unidade: Unidade) {
    salvarUnidade(unidade.id);
    setUnidadeId(unidade.id);
    setUnidadeNome(unidade.nome);
  }

  // Se a unidade já estava salva no localStorage (recarregou a página),
  // busca o nome dela de novo — e, se ela não existir mais (foi removida ou
  // desativada), pede para configurar de novo.
  useEffect(() => {
    if (itinerante || !unidadeId || unidadeNome) return;
    api
      .get<Unidade[]>("/unidades")
      .then((unidades) => {
        const atual = unidades.find((u) => u.id === unidadeId && u.ativo);
        if (atual) {
          setUnidadeNome(atual.nome);
        } else {
          salvarUnidade(null);
          setUnidadeId(null);
        }
      })
      .catch(() => {
        // Falha de rede momentânea: mantém a unidade configurada, só não
        // mostra o nome agora.
      });
  }, [itinerante, unidadeId, unidadeNome]);

  useEffect(() => {
    if (!itinerante && !unidadeId) return;

    let cancelado = false;

    async function carregar() {
      try {
        const dados = await api.get<RespostaPainel>(itinerante ? "/painel" : `/painel?unidade_id=${unidadeId}`);
        if (cancelado) return;
        setPainel(dados);

        // Inclui o horário na chave: rechamar a mesma senha/cidadão também conta como nova chamada.
        const atual = dados.chamada_atual;
        const chave = atual ? `${atual.id}|${atual.chamada_em}` : null;
        if (!primeiraCargaRef.current && chave && chave !== ultimoIdRef.current) {
          setDestaque(true);
          tocarBeep();
          setTimeout(() => setDestaque(false), DURACAO_DESTAQUE_MS);
        }
        ultimoIdRef.current = chave;
        primeiraCargaRef.current = false;
      } catch {
        // Falha de rede momentânea: mantém o último estado exibido na tela.
      }
    }

    carregar();
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [itinerante, unidadeId]);

  useEffect(() => {
    if (!mostrarControles) return;
    const t = setTimeout(() => setMostrarControles(false), 6000);
    return () => clearTimeout(t);
  }, [mostrarControles]);

  if (!itinerante && !unidadeId) {
    return <ConfigurarPainel onConfigurado={handleConfigurado} />;
  }

  const atual = painel?.chamada_atual ?? null;
  const historico = painel?.historico ?? [];

  return (
    <div style={{ ...estiloTela, justifyContent: "flex-start", paddingTop: "4rem" }}>
      <style>{`
        @keyframes painelPulso {
          0% { transform: scale(1); }
          25% { transform: scale(1.05); }
          50% { transform: scale(1); }
          75% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        .painel-destaque {
          animation: painelPulso ${DURACAO_DESTAQUE_MS}ms ease-in-out;
        }
      `}</style>

      <p style={{ position: "absolute", top: 20, left: 24, color: "var(--cor-texto-suave)", fontSize: "1rem" }}>
        {itinerante ? acao?.nome : unidadeNome}
      </p>

      <div style={{ width: "100%", maxWidth: 1200 }}>
        <div
          className={`cartao ${destaque ? "painel-destaque" : ""}`}
          style={{ padding: "2rem 1.5rem", marginBottom: "2rem", borderColor: destaque ? "#ea580c" : undefined }}
        >
          <p
            style={{
              margin: 0,
              color: "var(--cor-texto-suave)",
              fontWeight: 800,
              fontSize: "min(1.4rem, 4vw)",
              letterSpacing: "0.12em",
            }}
          >
            CHAMADA ATUAL
          </p>

          {atual ? (
            <>
              {atual.rechamada && (
                <p
                  style={{
                    margin: "0.5rem 0 0",
                    color: "#ea580c",
                    fontWeight: 800,
                    fontSize: "min(1.8rem, 5vw)",
                    letterSpacing: "0.05em",
                  }}
                >
                  CHAMANDO NOVAMENTE
                </p>
              )}
              <h1
                style={{
                  fontSize: atual.origem === "senha" ? "min(11rem, 26vw)" : "min(6rem, 12vw)",
                  margin: "0.5rem 0 1.25rem",
                  lineHeight: 1.05,
                  color: destaque ? "#ea580c" : "var(--cor-primaria)",
                  fontWeight: 800,
                  letterSpacing: "0.03em",
                  transition: "color 0.3s",
                  overflowWrap: "anywhere",
                }}
              >
                {atual.titulo}
              </h1>
              <div style={{ display: "flex", justifyContent: "center", gap: "min(4rem, 6vw)", flexWrap: "wrap" }}>
                {atual.origem === "nucleo" && atual.nucleo && (
                  <InfoChamada icone={<IconNucleo />} rotulo="NÚCLEO" valor={atual.nucleo} tamanho="grande" />
                )}
                {atual.local && (
                  <InfoChamada icone={<IconSala />} rotulo={rotuloLocal(atual)} valor={atual.local} tamanho="grande" />
                )}
              </div>
            </>
          ) : (
            <h1 style={{ fontSize: "min(3rem, 8vw)", color: "var(--cor-texto-suave)", fontWeight: 700, margin: "1rem 0 0" }}>
              Aguardando próxima chamada…
            </h1>
          )}
        </div>

        {historico.length > 0 && (
          <div className="cartao" style={{ textAlign: "left" }}>
            <p
              style={{
                margin: "0 0 0.75rem",
                color: "var(--cor-texto-suave)",
                fontWeight: 800,
                letterSpacing: "0.12em",
                fontSize: "0.95rem",
              }}
            >
              ÚLTIMAS CHAMADAS
            </p>
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {historico.map((c, indice) => (
                <li
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2rem minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.65rem 0",
                    borderTop: indice === 0 ? "none" : "1px solid var(--cor-borda)",
                  }}
                >
                  <span style={{ fontWeight: 800, color: "var(--cor-texto-suave)" }}>{indice + 1}</span>
                  <strong style={{ fontSize: "1.5rem", overflowWrap: "anywhere" }}>{c.titulo}</strong>
                  <div>
                    {c.origem === "nucleo" && c.nucleo && (
                      <InfoChamada icone={<IconNucleo />} rotulo="NÚCLEO" valor={c.nucleo} tamanho="compacto" />
                    )}
                  </div>
                  <div>
                    {c.local && (
                      <InfoChamada icone={<IconSala />} rotulo={rotuloLocal(c)} valor={c.local} tamanho="compacto" />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div
        onClick={() => setMostrarControles((v) => !v)}
        style={{ position: "absolute", bottom: 0, right: 0, width: 90, height: 90, cursor: "pointer" }}
        aria-hidden="true"
      />
      {mostrarControles && (
        <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", gap: "0.5rem" }}>
          <Link to={`${base}/infraestrutura`} className="btn btn-secundario btn-pequeno">
            Menu
          </Link>
          <button className="btn btn-secundario btn-pequeno" onClick={sair}>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
