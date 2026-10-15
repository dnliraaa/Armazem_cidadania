import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { AcaoItinerante } from "../../types";

interface Props {
  acao: AcaoItinerante | null;
  onFechar: () => void;
  onSalvo: () => void;
}

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo — o mesmo critério de "em andamento" do backend. */
function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function AcaoFormModal({ acao, onFechar, onSalvo }: Props) {
  const editando = Boolean(acao);
  const [nome, setNome] = useState(acao?.nome ?? "");
  const [descricao, setDescricao] = useState(acao?.descricao ?? "");
  const [local, setLocal] = useState(acao?.local ?? "");
  const [dataInicio, setDataInicio] = useState(acao?.data_inicio ?? hojeSaoPaulo());
  const [dataFim, setDataFim] = useState(acao?.data_fim ?? hojeSaoPaulo());
  const [ativo, setAtivo] = useState(acao?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (dataFim < dataInicio) {
      setErro("A data final não pode ser anterior à data inicial.");
      return;
    }
    setEnviando(true);
    try {
      const dados = {
        nome,
        descricao: descricao.trim() || null,
        local: local.trim() || null,
        data_inicio: dataInicio,
        data_fim: dataFim,
      };
      if (editando && acao) {
        await api.put(`/acoes-itinerantes/${acao.id}`, { ...dados, ativo });
      } else {
        await api.post("/acoes-itinerantes", dados);
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar a ação itinerante.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" style={{ maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2>{editando ? "Editar ação itinerante" : "Nova ação itinerante"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nomeAcao">Nome da ação</label>
            <input
              id="nomeAcao"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Ação no Bairro Esperança"
            />
          </div>

          <div className="campo">
            <label htmlFor="localAcao">Local (endereço)</label>
            <input id="localAcao" value={local} onChange={(e) => setLocal(e.target.value)} />
          </div>

          <div className="campo">
            <label htmlFor="descricaoAcao">Descrição</label>
            <textarea
              id="descricaoAcao"
              rows={3}
              maxLength={1000}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div className="acoes-linha" style={{ alignItems: "flex-start" }}>
            <div className="campo" style={{ flex: 1 }}>
              <label htmlFor="inicioAcao">Data de início</label>
              <input
                id="inicioAcao"
                type="date"
                required
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  // Ação de um dia só: a data final acompanha a inicial enquanto ainda for anterior.
                  if (dataFim < e.target.value) setDataFim(e.target.value);
                }}
              />
            </div>
            <div className="campo" style={{ flex: 1 }}>
              <label htmlFor="fimAcao">Data de fim</label>
              <input
                id="fimAcao"
                type="date"
                required
                min={dataInicio}
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--cor-texto-suave)" }}>
            Para uma ação de um dia só, use a mesma data nos dois campos.
          </span>

          {editando && (
            <div className="campo" style={{ marginTop: "0.75rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                Ativa (desmarcar encerra a ação na próxima requisição de quem estiver usando)
              </label>
            </div>
          )}

          <div className="modal-acoes">
            <button type="button" className="btn btn-secundario" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primario" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
