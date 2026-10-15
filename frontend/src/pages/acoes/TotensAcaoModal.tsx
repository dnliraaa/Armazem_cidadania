import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import type { AcaoItinerante, Totem } from "../../types";

interface Props {
  acao: AcaoItinerante;
  onFechar: () => void;
}

/** Totens de uma ação itinerante: cadastrar e ativar/desativar. */
export function TotensAcaoModal({ acao, onFechar }: Props) {
  const [totens, setTotens] = useState<Totem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    try {
      setTotens(await api.get<Totem[]>(`/acoes-itinerantes/${acao.id}/totens`));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar os totens.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdicionar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/acoes-itinerantes/${acao.id}/totens`, { nome });
      setNome("");
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível cadastrar o totem.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleAlternar(totem: Totem) {
    setErro(null);
    try {
      await api.put(`/acoes-itinerantes/${acao.id}/totens/${totem.id}`, { ativo: !totem.ativo });
      await carregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível atualizar o totem.");
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" style={{ maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h2>Totens — {acao.nome}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleAdicionar} className="acoes-linha" style={{ alignItems: "flex-end", marginBottom: "1rem" }}>
          <div className="campo" style={{ flex: 1, margin: 0 }}>
            <label htmlFor="nomeTotemAcao">Novo totem</label>
            <input
              id="nomeTotemAcao"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Totem 1"
            />
          </div>
          <button type="submit" className="btn btn-primario" disabled={enviando}>
            Adicionar
          </button>
        </form>

        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : totens.length === 0 ? (
          <p className="vazio">Nenhum totem cadastrado nesta ação.</p>
        ) : (
          <div className="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {totens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nome}</td>
                    <td>
                      <span className={`badge ${t.ativo ? "badge-ativo" : "badge-inativo"}`}>
                        {t.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <button
                        className={`btn btn-pequeno ${t.ativo ? "btn-perigo" : "btn-secundario"}`}
                        onClick={() => handleAlternar(t)}
                      >
                        {t.ativo ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-acoes">
          <button type="button" className="btn btn-primario" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
