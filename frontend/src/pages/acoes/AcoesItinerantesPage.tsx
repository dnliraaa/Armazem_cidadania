import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { AcaoItinerante } from "../../types";
import { formatarDataBr } from "../../utils/formatters";
import { AcaoFormModal } from "./AcaoFormModal";
import { TotensAcaoModal } from "./TotensAcaoModal";

const SITUACAO: Record<NonNullable<AcaoItinerante["situacao"]>, { texto: string; classe: string }> = {
  em_andamento: { texto: "Em andamento hoje", classe: "badge-ativo" },
  futura: { texto: "Futura", classe: "badge-alerta" },
  encerrada: { texto: "Encerrada", classe: "badge-inativo" },
};

function periodo(a: AcaoItinerante): string {
  return a.data_inicio === a.data_fim
    ? formatarDataBr(a.data_inicio)
    : `${formatarDataBr(a.data_inicio)} a ${formatarDataBr(a.data_fim)}`;
}

/** Administração das ações do Armazém Itinerante (só admin): criar, editar, ativar/desativar e gerir os totens. */
export function AcoesItinerantesPage() {
  const [acoes, setAcoes] = useState<AcaoItinerante[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState<{ aberto: boolean; acao: AcaoItinerante | null }>({
    aberto: false,
    acao: null,
  });
  const [totensDe, setTotensDe] = useState<AcaoItinerante | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      setAcoes(await api.get<AcaoItinerante[]>("/acoes-itinerantes"));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar as ações itinerantes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleAlternar(acao: AcaoItinerante) {
    const verbo = acao.ativo ? "Desativar" : "Ativar";
    const aviso = acao.ativo
      ? `Desativar "${acao.nome}"? Quem estiver usando a ação será retirado do módulo na próxima requisição.`
      : `Ativar "${acao.nome}"?`;
    if (!confirm(aviso)) return;
    try {
      await api.put(`/acoes-itinerantes/${acao.id}`, { ativo: !acao.ativo });
      carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : `Não foi possível ${verbo.toLowerCase()} a ação.`);
    }
  }

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Ações Itinerantes</h1>
          <p>Ações do Cidadania Itinerante. Cada ação tem seus próprios totens, senhas, filas e atendimentos.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setModalForm({ aberto: true, acao: null })}>
          + Nova ação
        </button>
      </div>

      {erro && <div className="alerta-erro">{erro}</div>}

      <div className="cartao">
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : acoes.length === 0 ? (
          <p className="vazio">Nenhuma ação itinerante cadastrada ainda.</p>
        ) : (
          <div className="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Ação</th>
                  <th>Local</th>
                  <th>Período</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {acoes.map((a) => {
                  const situacao = SITUACAO[a.situacao ?? "encerrada"];
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.nome}</strong>
                        {a.descricao && (
                          <div style={{ fontSize: "0.82rem", color: "var(--cor-texto-suave)" }}>{a.descricao}</div>
                        )}
                      </td>
                      <td>{a.local || "—"}</td>
                      <td>{periodo(a)}</td>
                      <td>
                        <span className={`badge ${situacao.classe}`}>{situacao.texto}</span>
                        {!a.ativo && <span className="badge badge-inativo">Desativada</span>}
                      </td>
                      <td>
                        <div className="acoes-linha">
                          <button
                            className="btn btn-secundario btn-pequeno"
                            onClick={() => setModalForm({ aberto: true, acao: a })}
                          >
                            Editar
                          </button>
                          <button className="btn btn-secundario btn-pequeno" onClick={() => setTotensDe(a)}>
                            Totens
                          </button>
                          <button
                            className={`btn btn-pequeno ${a.ativo ? "btn-perigo" : "btn-secundario"}`}
                            onClick={() => handleAlternar(a)}
                          >
                            {a.ativo ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalForm.aberto && (
        <AcaoFormModal
          acao={modalForm.acao}
          onFechar={() => setModalForm({ aberto: false, acao: null })}
          onSalvo={() => {
            setModalForm({ aberto: false, acao: null });
            carregar();
          }}
        />
      )}

      {totensDe && <TotensAcaoModal acao={totensDe} onFechar={() => setTotensDe(null)} />}
    </div>
  );
}
