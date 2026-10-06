import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Totem, Unidade } from "../../types";
import { TotemFormModal } from "./TotemFormModal";
import { UnidadeFormModal } from "./UnidadeFormModal";

export function UnidadesPage() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [totens, setTotens] = useState<Totem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modalUnidade, setModalUnidade] = useState<{ aberto: boolean; unidade: Unidade | null }>({
    aberto: false,
    unidade: null,
  });
  const [modalTotem, setModalTotem] = useState<{ aberto: boolean; totem: Totem | null }>({
    aberto: false,
    totem: null,
  });

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const [dadosUnidades, dadosTotens] = await Promise.all([
        api.get<Unidade[]>("/unidades"),
        api.get<Totem[]>("/totens"),
      ]);
      setUnidades(dadosUnidades);
      setTotens(dadosTotens);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar as unidades.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleAlternarUnidade(unidade: Unidade) {
    try {
      await api.put(`/unidades/${unidade.id}`, { ativo: !unidade.ativo });
      carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível atualizar a unidade.");
    }
  }

  async function handleAlternarTotem(totem: Totem) {
    try {
      await api.put(`/totens/${totem.id}`, { ativo: !totem.ativo });
      carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível atualizar o totem.");
    }
  }

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Unidades</h1>
          <p>Locais físicos de atendimento e os totens vinculados a cada um.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setModalUnidade({ aberto: true, unidade: null })}>
          + Nova unidade
        </button>
      </div>

      {erro && <div className="alerta-erro">{erro}</div>}

      <div className="cartao" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0 }}>Unidades</h3>
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : unidades.length === 0 ? (
          <p className="vazio">Nenhuma unidade cadastrada ainda.</p>
        ) : (
          <div className="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Endereço</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nome}</td>
                    <td>{u.endereco || "—"}</td>
                    <td>
                      <span className={`badge ${u.ativo ? "badge-ativo" : "badge-inativo"}`}>
                        {u.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td>
                      <div className="acoes-linha">
                        <button
                          className="btn btn-secundario btn-pequeno"
                          onClick={() => setModalUnidade({ aberto: true, unidade: u })}
                        >
                          Editar
                        </button>
                        <button
                          className={`btn btn-pequeno ${u.ativo ? "btn-perigo" : "btn-secundario"}`}
                          onClick={() => handleAlternarUnidade(u)}
                        >
                          {u.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="cartao">
        <div className="acoes-linha" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0 }}>Totens</h3>
          <button className="btn btn-secundario btn-pequeno" onClick={() => setModalTotem({ aberto: true, totem: null })}>
            + Novo totem
          </button>
        </div>
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : totens.length === 0 ? (
          <p className="vazio">Nenhum totem cadastrado ainda.</p>
        ) : (
          <div className="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Unidade</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {totens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nome}</td>
                    <td>{t.unidade_nome ?? "—"}</td>
                    <td>
                      <span className={`badge ${t.ativo ? "badge-ativo" : "badge-inativo"}`}>
                        {t.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <div className="acoes-linha">
                        <button
                          className="btn btn-secundario btn-pequeno"
                          onClick={() => setModalTotem({ aberto: true, totem: t })}
                        >
                          Editar
                        </button>
                        <button
                          className={`btn btn-pequeno ${t.ativo ? "btn-perigo" : "btn-secundario"}`}
                          onClick={() => handleAlternarTotem(t)}
                        >
                          {t.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalUnidade.aberto && (
        <UnidadeFormModal
          unidade={modalUnidade.unidade}
          onFechar={() => setModalUnidade({ aberto: false, unidade: null })}
          onSalvo={() => {
            setModalUnidade({ aberto: false, unidade: null });
            carregar();
          }}
        />
      )}

      {modalTotem.aberto && (
        <TotemFormModal
          totem={modalTotem.totem}
          unidades={unidades.filter((u) => u.ativo)}
          onFechar={() => setModalTotem({ aberto: false, totem: null })}
          onSalvo={() => {
            setModalTotem({ aberto: false, totem: null });
            carregar();
          }}
        />
      )}
    </div>
  );
}
