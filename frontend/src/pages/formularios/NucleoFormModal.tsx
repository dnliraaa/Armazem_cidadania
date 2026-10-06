import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Nucleo } from "../../types";

interface Props {
  nucleo: Nucleo | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function NucleoFormModal({ nucleo, onFechar, onSalvo }: Props) {
  const editando = Boolean(nucleo);
  const [nome, setNome] = useState(nucleo?.nome ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (editando && nucleo) {
        await api.put(`/nucleos/${nucleo.id}`, { nome });
      } else {
        await api.post("/nucleos", { nome });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o núcleo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editando ? "Editar núcleo" : "Novo núcleo"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nome">Nome do núcleo</label>
            <input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Jurídico"
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
