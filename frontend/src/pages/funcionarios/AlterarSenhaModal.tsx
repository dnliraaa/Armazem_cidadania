import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { Funcionario } from "../../types";

interface Props {
  funcionario: Funcionario;
  onFechar: () => void;
  onSalvo: () => void;
}

export function AlterarSenhaModal({ funcionario, onFechar, onSalvo }: Props) {
  const [novaSenha, setNovaSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.put(`/funcionarios/${funcionario.id}/senha`, { novaSenha });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Alterar senha de {funcionario.nome}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="novaSenha">Nova senha</label>
            <input
              id="novaSenha"
              type="password"
              required
              minLength={6}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Mínimo de 6 caracteres"
            />
          </div>

          <div className="modal-acoes">
            <button type="button" className="btn btn-secundario" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primario" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar nova senha"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
