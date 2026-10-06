import { useEffect, useState } from "react";
import { IconChevronDown } from "../../components/icons";
import { api, ApiError } from "../../lib/api";
import type { Demanda, Nucleo } from "../../types";
import { DemandaFormModal } from "./DemandaFormModal";
import { NucleoFormModal } from "./NucleoFormModal";

export function FormulariosPage() {
  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const [modalNucleo, setModalNucleo] = useState<{ aberto: boolean; nucleo: Nucleo | null }>({
    aberto: false,
    nucleo: null,
  });
  const [modalDemanda, setModalDemanda] = useState<{
    aberto: boolean;
    nucleoId: string;
    demanda: Demanda | null;
  }>({ aberto: false, nucleoId: "", demanda: null });

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await api.get<Nucleo[]>("/nucleos");
      setNucleos(dados);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar os núcleos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function alternarExpandido(id: string) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) {
        proximo.delete(id);
      } else {
        proximo.add(id);
      }
      return proximo;
    });
  }

  async function handleRemoverNucleo(nucleo: Nucleo) {
    const aviso =
      nucleo.demandas.length > 0
        ? `Remover o núcleo ${nucleo.nome} e todas as suas ${nucleo.demandas.length} demandas?`
        : `Remover o núcleo ${nucleo.nome}?`;
    if (!confirm(aviso)) return;
    try {
      await api.delete(`/nucleos/${nucleo.id}`);
      carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível remover o núcleo.");
    }
  }

  async function handleRemoverDemanda(demanda: Demanda) {
    if (!confirm(`Remover a demanda "${demanda.nome}"?`)) return;
    try {
      await api.delete(`/demandas/${demanda.id}`);
      carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível remover a demanda.");
    }
  }

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Formulários</h1>
          <p>Núcleos de atendimento e as demandas de cada um.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setModalNucleo({ aberto: true, nucleo: null })}>
          + Novo núcleo
        </button>
      </div>

      {erro && <div className="alerta-erro">{erro}</div>}

      {carregando ? (
        <div className="cartao">
          <p className="vazio">Carregando…</p>
        </div>
      ) : nucleos.length === 0 ? (
        <div className="cartao">
          <p className="vazio">Nenhum núcleo cadastrado ainda.</p>
        </div>
      ) : (
        <div className="lista-nucleos">
          {nucleos.map((nucleo) => {
            const expandido = expandidos.has(nucleo.id);
            return (
              <div key={nucleo.id} className="cartao">
                <div className="nucleo-cabecalho">
                  <button className="nucleo-titulo" onClick={() => alternarExpandido(nucleo.id)}>
                    <IconChevronDown className={expandido ? "aberto" : ""} />
                    <strong>{nucleo.nome}</strong>
                    <span className="badge badge-ativo">
                      {nucleo.demandas.length} demanda{nucleo.demandas.length === 1 ? "" : "s"}
                    </span>
                    {!nucleo.ativo && <span className="badge badge-inativo">Inativo</span>}
                  </button>

                  <div className="acoes-linha">
                    <button
                      className="btn btn-secundario btn-pequeno"
                      onClick={() => setModalNucleo({ aberto: true, nucleo })}
                    >
                      Editar
                    </button>
                    <button className="btn btn-perigo btn-pequeno" onClick={() => handleRemoverNucleo(nucleo)}>
                      Remover
                    </button>
                  </div>
                </div>

                {expandido && (
                  <div className="nucleo-conteudo">
                    <div className="acoes-linha" style={{ justifyContent: "flex-end", marginBottom: "0.75rem" }}>
                      <button
                        className="btn btn-secundario btn-pequeno"
                        onClick={() => setModalDemanda({ aberto: true, nucleoId: nucleo.id, demanda: null })}
                      >
                        + Nova demanda
                      </button>
                    </div>

                    {nucleo.demandas.length === 0 ? (
                      <p className="vazio">Nenhuma demanda cadastrada neste núcleo.</p>
                    ) : (
                      <div className="tabela-responsiva">
                        <table>
                          <thead>
                            <tr>
                              <th>Nome</th>
                              <th>Status</th>
                              <th>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {nucleo.demandas.map((demanda) => (
                              <tr key={demanda.id}>
                                <td>{demanda.nome}</td>
                                <td>
                                  <span className={`badge ${demanda.ativo ? "badge-ativo" : "badge-inativo"}`}>
                                    {demanda.ativo ? "Ativa" : "Inativa"}
                                  </span>
                                </td>
                                <td>
                                  <div className="acoes-linha">
                                    <button
                                      className="btn btn-secundario btn-pequeno"
                                      onClick={() =>
                                        setModalDemanda({ aberto: true, nucleoId: nucleo.id, demanda })
                                      }
                                    >
                                      Editar
                                    </button>
                                    <button
                                      className="btn btn-perigo btn-pequeno"
                                      onClick={() => handleRemoverDemanda(demanda)}
                                    >
                                      Remover
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
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalNucleo.aberto && (
        <NucleoFormModal
          nucleo={modalNucleo.nucleo}
          onFechar={() => setModalNucleo({ aberto: false, nucleo: null })}
          onSalvo={() => {
            setModalNucleo({ aberto: false, nucleo: null });
            carregar();
          }}
        />
      )}

      {modalDemanda.aberto && (
        <DemandaFormModal
          nucleoId={modalDemanda.nucleoId}
          demanda={modalDemanda.demanda}
          onFechar={() => setModalDemanda({ aberto: false, nucleoId: "", demanda: null })}
          onSalvo={() => {
            setModalDemanda({ aberto: false, nucleoId: "", demanda: null });
            carregar();
          }}
        />
      )}
    </div>
  );
}
