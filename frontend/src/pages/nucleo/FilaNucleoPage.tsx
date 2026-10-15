import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { api, ApiError } from "../../lib/api";
import type { AtendimentoPendente, Nucleo, ServicoExterno } from "../../types";
import { FichaEncaminhamentosCampos } from "../atendimentos/FichaEncaminhamentosCampos";
import { fichaParaPayload, fichaVazia, validarFicha, type FichaForm } from "../atendimentos/fichaAtendimento";
import { PendenteFormCampos } from "../atendimentos/PendenteFormCampos";

const INTERVALO_ATUALIZACAO_MS = 4000;
const CHAVE_SALA = "armazem_sala_nucleo";

function lerSalaSalva(): string {
  try {
    return localStorage.getItem(CHAVE_SALA) ?? "";
  } catch {
    return "";
  }
}

function salvarSala(valor: string) {
  try {
    localStorage.setItem(CHAVE_SALA, valor);
  } catch {
    // Sem acesso ao localStorage (ex.: navegação privada) — segue sem persistir.
  }
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

interface AtendimentoEmCursoProps {
  pendente: AtendimentoPendente;
  nucleo: Nucleo | undefined;
  /** Todos os núcleos (candidatos a encaminhamento interno, exceto o do próprio atendimento). */
  nucleos: Nucleo[];
  onFinalizado: () => void;
}

/** Formulário do cidadão chamado: o núcleo preenche a ficha e finaliza (vira atendimento definitivo). */
function AtendimentoEmCurso({ pendente, nucleo, nucleos, onFinalizado }: AtendimentoEmCursoProps) {
  const [demandaPrincipalId, setDemandaPrincipalId] = useState(pendente.demanda_principal_id ?? "");
  const [outrasDemandas, setOutrasDemandas] = useState<string[]>(pendente.outras_demandas ?? []);
  const [ficha, setFicha] = useState<FichaForm>(fichaVazia);
  const [servicos, setServicos] = useState<ServicoExterno[]>([]);
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const demandas = nucleo?.demandas.filter((d) => d.ativo) ?? [];
  const nucleosDestino = nucleos.filter((n) => n.ativo && n.id !== pendente.nucleo_id);

  // Serviços externos cadastrados para o núcleo deste atendimento (só os ativos podem ser escolhidos).
  useEffect(() => {
    api
      .get<ServicoExterno[]>(`/servicos-externos?nucleo_id=${pendente.nucleo_id}`)
      .then((dados) => setServicos(dados.filter((s) => s.ativo)))
      .catch(() => setErro("Não foi possível carregar os serviços externos."));
  }, [pendente.nucleo_id]);

  function handleToggleOutraDemanda(id: string) {
    setOutrasDemandas((atual) => (atual.includes(id) ? atual.filter((d) => d !== id) : [...atual, id]));
  }

  async function handleFinalizar() {
    if (!demandaPrincipalId) {
      setErro("Selecione a demanda principal.");
      return;
    }
    const erroFicha = validarFicha(ficha);
    if (erroFicha) {
      setErro(erroFicha);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await api.put(`/atendimentos/pendentes/${pendente.id}`, {
        demanda_principal_id: demandaPrincipalId,
        outras_demandas: outrasDemandas.filter((id) => id !== demandaPrincipalId),
      });
      // A ficha (resolvida/motivo e encaminhamentos) vai direto na conclusão; o backend valida e
      // cria as solicitações dos núcleos de destino junto com o atendimento.
      await api.post(`/atendimentos/pendentes/${pendente.id}/confirmar`, {
        descricao: descricao.trim() || null,
        ...fichaParaPayload(ficha),
      });
      onFinalizado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível finalizar o atendimento.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleDevolver() {
    if (!confirm("Devolver este cidadão para a fila?")) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/atendimentos/pendentes/${pendente.id}/liberar`, {});
      onFinalizado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível devolver à fila.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="cartao" style={{ marginBottom: "1.5rem" }}>
      <p style={{ margin: 0, color: "var(--cor-texto-suave)", fontSize: "0.95rem" }}>Em atendimento</p>
      <h2 style={{ margin: "0.25rem 0 1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        {pendente.nome ?? "Cidadão"}
        {pendente.prioridade && <span className="badge badge-alerta">Prioridade</span>}
      </h2>

      {erro && <div className="alerta-erro">{erro}</div>}

      <PendenteFormCampos
        demandas={demandas}
        demandaPrincipalId={demandaPrincipalId}
        onDemandaPrincipalChange={setDemandaPrincipalId}
        outrasDemandas={outrasDemandas}
        onToggleOutraDemanda={handleToggleOutraDemanda}
        blocoResolucao={
          <FichaEncaminhamentosCampos
            ficha={ficha}
            onChange={setFicha}
            servicos={servicos}
            nucleosDestino={nucleosDestino}
          />
        }
        descricao={descricao}
        onDescricaoChange={setDescricao}
      />

      <div className="modal-acoes" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn btn-secundario" onClick={handleDevolver} disabled={enviando}>
          Devolver à fila
        </button>
        <button type="button" className="btn btn-primario" onClick={handleFinalizar} disabled={enviando}>
          {enviando ? "Finalizando…" : "Finalizar atendimento"}
        </button>
      </div>
    </div>
  );
}

export function FilaNucleoPage() {
  const { funcionario } = useAuth();
  const ehNucleo = funcionario?.role === "nucleo";
  // Admin escolhe qual fila de núcleo acompanhar; funcionário "nucleo" sempre vê o próprio.
  const [nucleoEscolhido, setNucleoEscolhido] = useState("");
  const nucleoId = ehNucleo ? funcionario?.nucleo_id ?? "" : nucleoEscolhido;

  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [pendentes, setPendentes] = useState<AtendimentoPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  // Sala de onde este aparelho atende; vai ao Painel de Chamados junto com a chamada.
  const [sala, setSala] = useState(lerSalaSalva);

  function handleSalaChange(valor: string) {
    setSala(valor);
    salvarSala(valor);
  }

  useEffect(() => {
    api
      .get<Nucleo[]>("/nucleos")
      .then(setNucleos)
      .catch(() => setErro("Não foi possível carregar os núcleos."));
  }, []);

  async function carregarFila() {
    try {
      const query = new URLSearchParams({ status: "pendente_revisao,em_atendimento", encaminhados: "1" });
      if (nucleoId) query.set("nucleo_id", nucleoId);
      setPendentes(await api.get<AtendimentoPendente[]>(`/atendimentos/pendentes?${query.toString()}`));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nucleoId]);

  const meuAtendimento = pendentes.find((p) => p.status === "em_atendimento" && p.chamado_por === funcionario?.id) ?? null;
  const emAtendimentoPorOutros = pendentes.filter((p) => p.status === "em_atendimento" && p.id !== meuAtendimento?.id);
  const aguardando = pendentes.filter((p) => p.status === "pendente_revisao");
  const nucleoAtual = nucleos.find((n) => n.id === (meuAtendimento?.nucleo_id ?? nucleoId));

  async function handleChamarProximo() {
    setProcessando(true);
    setErro(null);
    try {
      const query = nucleoId ? `?nucleo_id=${nucleoId}` : "";
      const { sugestao } = await api.get<{ sugestao: AtendimentoPendente | null }>(
        `/atendimentos/pendentes/proxima-sugestao${query}`
      );
      if (!sugestao) {
        setErro("Não há ninguém aguardando na fila.");
        return;
      }
      await api.post(`/atendimentos/pendentes/${sugestao.id}/chamar`, { sala: sala.trim() || undefined });
      await carregarFila();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível chamar o próximo.");
      await carregarFila();
    } finally {
      setProcessando(false);
    }
  }

  const semNucleo = !nucleoId;

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Fila do Núcleo</h1>
          <p>Chame o próximo cidadão encaminhado pela recepção e registre o atendimento.</p>
          {ehNucleo && funcionario?.nucleo_nome && (
            <p style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--cor-texto-suave)" }}>
              Núcleo: <strong>{funcionario.nucleo_nome}</strong>
            </p>
          )}
        </div>
      </div>

      {!ehNucleo && (
        <div className="campo" style={{ maxWidth: 260, marginBottom: "1rem" }}>
          <label htmlFor="nucleoFila">Núcleo</label>
          <select id="nucleoFila" value={nucleoEscolhido} onChange={(e) => setNucleoEscolhido(e.target.value)}>
            <option value="">Todos os núcleos</option>
            {nucleos
              .filter((n) => n.ativo)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
          </select>
        </div>
      )}

      {erro && <div className="alerta-erro">{erro}</div>}

      <div className="campo" style={{ maxWidth: 260, marginBottom: "1rem" }}>
        <label htmlFor="sala">Sala</label>
        <input
          id="sala"
          value={sala}
          onChange={(e) => handleSalaChange(e.target.value)}
          placeholder="Ex: Sala 2"
        />
      </div>

      {meuAtendimento ? (
        <AtendimentoEmCurso
          key={meuAtendimento.id}
          pendente={meuAtendimento}
          nucleo={nucleoAtual}
          nucleos={nucleos}
          onFinalizado={carregarFila}
        />
      ) : (
        <div className="cartao" style={{ marginBottom: "1.5rem", textAlign: "center", padding: "2rem 1.5rem" }}>
          <p className="vazio" style={{ padding: "0 0 1rem" }}>Nenhum atendimento em andamento.</p>
          <div className="acoes-linha" style={{ justifyContent: "center" }}>
            <button
              className="btn btn-primario"
              onClick={handleChamarProximo}
              disabled={processando || (!ehNucleo && semNucleo)}
              title={!ehNucleo && semNucleo ? "Selecione um núcleo" : undefined}
            >
              Chamar próximo
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="cartao">
          <p className="vazio">Carregando…</p>
        </div>
      ) : (
        <div className="cartao">
          <h3 style={{ marginTop: 0 }}>
            Aguardando <span className="badge badge-ativo">{aguardando.length}</span>
          </h3>
          {aguardando.length === 0 ? (
            <p className="vazio">Ninguém aguardando.</p>
          ) : (
            <div className="tabela-responsiva">
              <table>
                <thead>
                  <tr>
                    <th>Chegada</th>
                    <th>Cidadão</th>
                    {!ehNucleo && <th>Núcleo</th>}
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {aguardando.map((p) => (
                    <tr key={p.id} style={p.prioridade ? { background: "#fef9c3", fontWeight: 600 } : undefined}>
                      <td>{formatarHora(p.created_at)}</td>
                      <td>{p.nome ?? "—"}</td>
                      {!ehNucleo && <td>{nucleos.find((n) => n.id === p.nucleo_id)?.nome ?? "—"}</td>}
                      <td>
                        {p.prioridade ? (
                          <span className="badge badge-alerta">Prioridade</span>
                        ) : (
                          <span className="badge badge-inativo">Normal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {emAtendimentoPorOutros.length > 0 && (
            <p style={{ marginBottom: 0, marginTop: "1rem", fontSize: "0.85rem", color: "var(--cor-texto-suave)" }}>
              Em atendimento por outros: {emAtendimentoPorOutros.map((p) => p.nome ?? "—").join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
