import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Totem, Unidade } from "../../types";

interface Props {
  totem: Totem | null;
  unidades: Unidade[];
  onFechar: () => void;
  onSalvo: () => void;
}

export function TotemFormModal({ totem, unidades, onFechar, onSalvo }: Props) {
  const editando = Boolean(totem);
  const [nome, setNome] = useState(totem?.nome ?? "");
  const [unidadeId, setUnidadeId] = useState(totem?.unidade_id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (editando && totem) {
        await api.put(`/totens/${totem.id}`, { nome, unidade_id: unidadeId });
      } else {
        await api.post("/totens", { nome, unidade_id: unidadeId });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o totem.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editando ? "Editar totem" : "Novo totem"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nome">Nome do totem</label>
            <input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Totem entrada"
            />
          </div>

          <div className="campo">
            <label htmlFor="unidade">Unidade</label>
            <select id="unidade" required value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
              <option value="" disabled>
                Selecione…
              </option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
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
