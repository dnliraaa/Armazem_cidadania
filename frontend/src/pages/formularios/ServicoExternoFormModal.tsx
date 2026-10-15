import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { ServicoExterno } from "../../types";

interface Props {
  nucleoId: string;
  servico: ServicoExterno | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function ServicoExternoFormModal({ nucleoId, servico, onFechar, onSalvo }: Props) {
  const editando = Boolean(servico);
  const [nome, setNome] = useState(servico?.nome ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (editando && servico) {
        await api.put(`/servicos-externos/${servico.id}`, { nome });
      } else {
        await api.post("/servicos-externos", { nucleo_id: nucleoId, nome });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o serviço externo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editando ? "Editar serviço externo" : "Novo serviço externo"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nomeServico">Nome do serviço externo</label>
            <input
              id="nomeServico"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Defensoria Pública"
            />
          </div>

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
