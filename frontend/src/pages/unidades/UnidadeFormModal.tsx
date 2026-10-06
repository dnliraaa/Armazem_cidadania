import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Unidade } from "../../types";

interface Props {
  unidade: Unidade | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function UnidadeFormModal({ unidade, onFechar, onSalvo }: Props) {
  const editando = Boolean(unidade);
  const [nome, setNome] = useState(unidade?.nome ?? "");
  const [endereco, setEndereco] = useState(unidade?.endereco ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const dados = { nome, endereco: endereco.trim() || null };
      if (editando && unidade) {
        await api.put(`/unidades/${unidade.id}`, dados);
      } else {
        await api.post("/unidades", dados);
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar a unidade.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editando ? "Editar unidade" : "Nova unidade"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nome">Nome da unidade</label>
            <input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Unidade Centro"
            />
          </div>

          <div className="campo">
            <label htmlFor="endereco">Endereço</label>
            <input
              id="endereco"
              maxLength={300}
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Ex: Rua das Flores, 123 - Centro (opcional)"
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
