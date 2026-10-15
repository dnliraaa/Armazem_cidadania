import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Atendimento, Nucleo, ServicoExterno } from "../../types";
import { DetalhesAtendimento } from "./DetalhesAtendimento";
import { FichaEncaminhamentosCampos } from "./FichaEncaminhamentosCampos";
import {
  fichaDoAtendimento,
  fichaParaPayload,
  resumoEncaminhamentos,
  validarFicha,
  type FichaForm,
} from "./fichaAtendimento";
import { PendenteFormCampos } from "./PendenteFormCampos";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

interface EditarProps {
  atendimento: Atendimento;
  nucleo: Nucleo | undefined;
  /** Todos os núcleos (candidatos a encaminhamento interno, exceto o do próprio atendimento). */
  nucleos: Nucleo[];
  onFechar: () => void;
  onSalvo: () => void;
}

/**
 * Edição posterior: só os campos preenchidos pelo núcleo são editáveis. Os que
 * vieram da recepção (cidadão, núcleo, unidade, prioridade, data) ficam bloqueados.
 */
function EditarAtendimentoModal({ atendimento, nucleo, nucleos, onFechar, onSalvo }: EditarProps) {
  const [demandaPrincipalId, setDemandaPrincipalId] = useState(atendimento.demanda_principal_id ?? "");
  const [outrasDemandas, setOutrasDemandas] = useState<string[]>(atendimento.outras_demandas ?? []);
  const [ficha, setFicha] = useState<FichaForm>(() => fichaDoAtendimento(atendimento));
  const [servicos, setServicos] = useState<ServicoExterno[]>([]);
  const [descricao, setDescricao] = useState(atendimento.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const demandas = nucleo?.demandas.filter((d) => d.ativo || d.id === atendimento.demanda_principal_id) ?? [];
  const nucleosDestino = nucleos.filter(
    (n) => n.id !== atendimento.nucleo_id && (n.ativo || ficha.destinosIds.includes(n.id))
  );
  const registroAntigoComEncaminhamento =
    atendimento.houve_encaminhamento &&
    atendimento.houve_encaminhamento_externo == null &&
    atendimento.houve_encaminhamento_interno == null;

  // Serviços ativos do núcleo + os já escolhidos neste atendimento (mesmo inativados depois).
  useEffect(() => {
    api
      .get<ServicoExterno[]>(`/servicos-externos?nucleo_id=${atendimento.nucleo_id}`)
      .then((dados) => {
        const jaEscolhidos = new Set((atendimento.servicos_externos ?? []).map((s) => s.id));
        setServicos(dados.filter((s) => s.ativo || jaEscolhidos.has(s.id)));
      })
      .catch(() => setErro("Não foi possível carregar os serviços externos."));
  }, [atendimento.nucleo_id, atendimento.servicos_externos]);

  function handleToggleOutraDemanda(id: string) {
    setOutrasDemandas((atual) => (atual.includes(id) ? atual.filter((d) => d !== id) : [...atual, id]));
  }

  async function handleSalvar() {
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
      await api.patch(`/atendimentos/${atendimento.id}`, {
        demanda_principal_id: demandaPrincipalId,
        outras_demandas: outrasDemandas.filter((id) => id !== demandaPrincipalId),
        ...fichaParaPayload(ficha),
        descricao: descricao.trim() || null,
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o atendimento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" style={{ maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2>Editar atendimento</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Dados da recepção (somente leitura)</h3>
        <div className="campo">
          <label>Cidadão</label>
          <input value={atendimento.cidadao_nome ?? "—"} disabled />
        </div>
        <div className="campo">
          <label>Núcleo</label>
          <input value={atendimento.nucleo_nome ?? "—"} disabled />
        </div>
        <div className="campo">
          <label>Unidade</label>
          <input value={atendimento.unidade_nome ?? "—"} disabled />
        </div>
        <div className="campo">
          <label>Prioridade</label>
          <input value={atendimento.prioridade ? "Sim" : "Não"} disabled />
        </div>
        <div className="campo">
          <label>Criado em</label>
          <input value={formatarDataHora(atendimento.created_at)} disabled />
        </div>

        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Preenchido pelo núcleo</h3>
        {registroAntigoComEncaminhamento && (
          <p style={{ fontSize: "0.85rem", color: "var(--cor-texto-suave)" }}>
            Este registro antigo tem "Encaminhamento" sem detalhes. Se quiser, informe abaixo para onde foi.
          </p>
        )}
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

        <div className="modal-acoes">
          <button type="button" className="btn btn-secundario" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primario" onClick={handleSalvar} disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AtendimentosHistoricoPage() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Atendimento | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      setAtendimentos(await api.get<Atendimento[]>("/atendimentos"));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar o histórico.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    api
      .get<Nucleo[]>("/nucleos")
      .then(setNucleos)
      .catch(() => setErro("Não foi possível carregar os núcleos."));
  }, []);

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Histórico de Atendimentos</h1>
          <p>Atendimentos concluídos do seu núcleo. Você pode corrigir o que preencheu no atendimento.</p>
        </div>
      </div>

      {erro && <div className="alerta-erro">{erro}</div>}

      <div className="cartao">
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : atendimentos.length === 0 ? (
          <p className="vazio">Nenhum atendimento concluído ainda.</p>
        ) : (
          <div className="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cidadão</th>
                  <th>Demanda principal</th>
                  <th>Outras demandas</th>
                  <th>Resolvida</th>
                  <th>Encaminhamentos</th>
                  <th>Detalhes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {atendimentos.map((a) => (
                  <tr key={a.id}>
                    <td>{formatarDataHora(a.created_at)}</td>
                    <td>
                      {a.cidadao_nome ?? <em>sem cidadão vinculado</em>}{" "}
                      {a.prioridade && <span className="badge badge-alerta">Prioridade</span>}
                    </td>
                    <td>{a.demanda_principal_nome ?? "—"}</td>
                    <td>{a.outras_demandas_nomes.length > 0 ? a.outras_demandas_nomes.join(", ") : "—"}</td>
                    <td>{a.resolvida ? "Sim" : "Não"}</td>
                    <td>{resumoEncaminhamentos(a)}</td>
                    <td>
                      <DetalhesAtendimento atendimento={a} />
                    </td>
                    <td>
                      <button className="btn btn-secundario btn-pequeno" onClick={() => setEditando(a)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <EditarAtendimentoModal
          atendimento={editando}
          nucleo={nucleos.find((n) => n.id === editando.nucleo_id)}
          nucleos={nucleos}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}
