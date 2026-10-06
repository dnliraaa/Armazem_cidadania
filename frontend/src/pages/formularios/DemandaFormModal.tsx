import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Demanda } from "../../types";

interface Props {
  nucleoId: string;
  demanda: Demanda | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function DemandaFormModal({ nucleoId, demanda, onFechar, onSalvo }: Props) {
  const editando = Boolean(demanda);
  const [nome, setNome] = useState(demanda?.nome ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (editando && demanda) {
        await api.put(`/demandas/${demanda.id}`, { nome });
      } else {
        await api.post("/demandas", { nucleo_id: nucleoId, nome });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar a demanda.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editando ? "Editar demanda" : "Nova demanda"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nome">Nome da demanda</label>
            <input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Divórcio"
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
