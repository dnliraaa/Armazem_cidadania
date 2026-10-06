import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { formatarCpfInput, formatarDataBr } from "../../utils/formatters";
import type { Atendimento, AtendimentoPendente, AtendimentoRecepcao, Nucleo } from "../../types";
import { DescricaoResumida } from "./DescricaoResumida";
import { descreverErro } from "./erroLabels";
import { PendenteManualModal } from "./PendenteManualModal";
import { RevisarPendenteModal } from "./RevisarPendenteModal";

type Aba = "pendentes" | "confirmados" | "recepcao";

export function AtendimentosPage() {
  const [aba, setAba] = useState<Aba>("pendentes");
  const [nucleos, setNucleos] = useState<Nucleo[]>([]);

  const [pendentes, setPendentes] = useState<AtendimentoPendente[]>([]);
  const [carregandoPendentes, setCarregandoPendentes] = useState(true);
  const [erroPendentes, setErroPendentes] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [confirmados, setConfirmados] = useState<Atendimento[]>([]);
  const [carregandoConfirmados, setCarregandoConfirmados] = useState(true);
  const [erroConfirmados, setErroConfirmados] = useState<string | null>(null);
  const [filtroNucleo, setFiltroNucleo] = useState("");

  const [resolvidosRecepcao, setResolvidosRecepcao] = useState<AtendimentoRecepcao[]>([]);
  const [carregandoRecepcao, setCarregandoRecepcao] = useState(true);
  const [erroRecepcao, setErroRecepcao] = useState<string | null>(null);

  const [modalManual, setModalManual] = useState(false);
  const [pendenteRevisao, setPendenteRevisao] = useState<AtendimentoPendente | null>(null);

  async function carregarNucleos() {
    try {
      const dados = await api.get<Nucleo[]>("/nucleos");
      setNucleos(dados);
    } catch {
      // A tela ainda funciona sem a lista de núcleos carregada; os modais tratam o próprio erro ao tentar usar.
    }
  }

  async function carregarPendentes() {
    setCarregandoPendentes(true);
    setErroPendentes(null);
    try {
      const dados = await api.get<AtendimentoPendente[]>("/atendimentos/pendentes");
      setPendentes(dados);
      setSelecionados(new Set());
    } catch (err) {
      setErroPendentes(err instanceof ApiError ? err.message : "Não foi possível carregar os atendimentos pendentes.");
    } finally {
      setCarregandoPendentes(false);
    }
  }

  async function carregarConfirmados() {
    setCarregandoConfirmados(true);
    setErroConfirmados(null);
    try {
      const query = filtroNucleo ? `?nucleo_id=${filtroNucleo}` : "";
      const dados = await api.get<Atendimento[]>(`/atendimentos${query}`);
      setConfirmados(dados);
    } catch (err) {
      setErroConfirmados(err instanceof ApiError ? err.message : "Não foi possível carregar os atendimentos confirmados.");
    } finally {
      setCarregandoConfirmados(false);
    }
  }

  async function carregarResolvidosRecepcao() {
    setCarregandoRecepcao(true);
    setErroRecepcao(null);
    try {
      setResolvidosRecepcao(await api.get<AtendimentoRecepcao[]>("/atendimentos/resolvidos-recepcao"));
    } catch (err) {
      setErroRecepcao(err instanceof ApiError ? err.message : "Não foi possível carregar os atendimentos da recepção.");
    } finally {
      setCarregandoRecepcao(false);
    }
  }

  useEffect(() => {
    if (aba === "recepcao") {
      carregarResolvidosRecepcao();
    }
  }, [aba]);

  useEffect(() => {
    carregarNucleos();
    carregarPendentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (aba === "confirmados") {
      carregarConfirmados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, filtroNucleo]);

  function alternarSelecionado(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function handleConfirmarSelecionados() {
    if (selecionados.size === 0) return;
    try {
      const resultado = await api.post<{
        confirmados: string[];
        bloqueados: { id: string; erros: string[]; mensagem: string }[];
      }>("/atendimentos/pendentes/confirmar-lote", { ids: [...selecionados] });

      if (resultado.bloqueados.length > 0) {
        const detalhes = resultado.bloqueados
          .map((b) => {
            const pendente = pendentes.find((p) => p.id === b.id);
            const rotulo = pendente?.nome || pendente?.cpf_texto || b.id;
            const motivos = b.erros.length > 0 ? b.erros.map(descreverErro).join(", ") : b.mensagem;
            return `- ${rotulo}: ${motivos}`;
          })
          .join("\n");
        alert(
          `${resultado.confirmados.length} confirmado(s). ${resultado.bloqueados.length} bloqueado(s):\n${detalhes}`
        );
      } else {
        alert(`${resultado.confirmados.length} atendimento(s) confirmado(s) com sucesso.`);
      }
      carregarPendentes();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível confirmar os atendimentos selecionados.");
    }
  }

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Atendimentos</h1>
          <p>Fila de revisão dos atendimentos pendentes e histórico dos já confirmados.</p>
        </div>
        {aba === "pendentes" && (
          <div className="acoes-linha">
            <button className="btn btn-primario" onClick={() => setModalManual(true)}>
              + Cadastrar manualmente
            </button>
          </div>
        )}
      </div>

      <div className="acoes-linha" style={{ marginBottom: "1.25rem" }}>
        <button
          className={aba === "pendentes" ? "btn btn-primario btn-pequeno" : "btn btn-secundario btn-pequeno"}
          onClick={() => setAba("pendentes")}
        >
          Pendentes
        </button>
        <button
          className={aba === "confirmados" ? "btn btn-primario btn-pequeno" : "btn btn-secundario btn-pequeno"}
          onClick={() => setAba("confirmados")}
        >
          Confirmados
        </button>
        <button
          className={aba === "recepcao" ? "btn btn-primario btn-pequeno" : "btn btn-secundario btn-pequeno"}
          onClick={() => setAba("recepcao")}
        >
          Resolvidos na recepção
        </button>
      </div>

      {aba === "pendentes" ? (
        <div>
          {erroPendentes && <div className="alerta-erro">{erroPendentes}</div>}

          {selecionados.size > 0 && (
            <div className="acoes-linha" style={{ marginBottom: "0.75rem" }}>
              <button className="btn btn-primario btn-pequeno" onClick={handleConfirmarSelecionados}>
                Confirmar selecionados ({selecionados.size})
              </button>
            </div>
          )}

          <div className="cartao">
            {carregandoPendentes ? (
              <p className="vazio">Carregando…</p>
            ) : pendentes.length === 0 ? (
              <p className="vazio">Nenhum atendimento pendente de revisão.</p>
            ) : (
              <div className="tabela-responsiva">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Data</th>
                      <th>Núcleo</th>
                      <th>Nome</th>
                      <th>CPF</th>
                      <th>Demanda principal</th>
                      <th>Outras demandas</th>
                      <th>Resolvida</th>
                      <th>Encaminhado</th>
                      <th>Alertas</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendentes.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selecionados.has(p.id)}
                            onChange={() => alternarSelecionado(p.id)}
                          />
                        </td>
                        <td>{p.data_atendimento ? formatarDataBr(p.data_atendimento) : "—"}</td>
                        <td>{p.nucleo_nome ?? "—"}</td>
                        <td>{p.nome ? p.nome : <em>sem nome</em>}</td>
                        <td>{p.cpf_texto ? formatarCpfInput(p.cpf_texto) : "—"}</td>
                        <td>{p.demanda_principal_nome ?? "—"}</td>
                        <td>{p.outras_demandas_nomes.length > 0 ? p.outras_demandas_nomes.join(", ") : "—"}</td>
                        <td>{p.resolvida ? "Sim" : "Não"}</td>
                        <td>{p.houve_encaminhamento ? "Sim" : "Não"}</td>
                        <td>
                          {p.erros.length === 0 ? (
                            "—"
                          ) : (
                            <div className="acoes-linha">
                              {p.erros.map((codigo) => (
                                <span key={codigo} className="badge badge-alerta">
                                  {descreverErro(codigo)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <button className="btn btn-secundario btn-pequeno" onClick={() => setPendenteRevisao(p)}>
                            Revisar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : aba === "recepcao" ? (
        <div>
          {erroRecepcao && <div className="alerta-erro">{erroRecepcao}</div>}

          <div className="cartao">
            {carregandoRecepcao ? (
              <p className="vazio">Carregando…</p>
            ) : resolvidosRecepcao.length === 0 ? (
              <p className="vazio">Nenhuma demanda resolvida na recepção ainda.</p>
            ) : (
              <div className="tabela-responsiva">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Cidadão</th>
                      <th>Unidade</th>
                      <th>Informação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvidosRecepcao.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                        <td>{r.cidadao_nome ?? <em>sem cidadão vinculado</em>}</td>
                        <td>{r.unidade_nome ?? "—"}</td>
                        <td>
                          <DescricaoResumida texto={r.descricao} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="campo" style={{ maxWidth: 260, marginBottom: "1rem" }}>
            <label htmlFor="filtroNucleo">Filtrar por núcleo</label>
            <select id="filtroNucleo" value={filtroNucleo} onChange={(e) => setFiltroNucleo(e.target.value)}>
              <option value="">Todos os núcleos</option>
              {nucleos.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
          </div>

          {erroConfirmados && <div className="alerta-erro">{erroConfirmados}</div>}

          <div className="cartao">
            {carregandoConfirmados ? (
              <p className="vazio">Carregando…</p>
            ) : confirmados.length === 0 ? (
              <p className="vazio">Nenhum atendimento confirmado ainda.</p>
            ) : (
              <div className="tabela-responsiva">
                <table>
                  <thead>
                    <tr>
                      <th>Cidadão</th>
                      <th>Núcleo</th>
                      <th>Demanda principal</th>
                      <th>Descrição</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmados.map((a) => (
                      <tr key={a.id}>
                        <td>{a.cidadao_nome ?? <em>sem cidadão vinculado</em>}</td>
                        <td>{a.nucleo_nome ?? "—"}</td>
                        <td>{a.demanda_principal_nome ?? "—"}</td>
                        <td>
                          <DescricaoResumida texto={a.descricao} />
                        </td>
                        <td>{new Date(a.created_at).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {modalManual && (
        <PendenteManualModal
          nucleos={nucleos}
          onFechar={() => setModalManual(false)}
          onSalvo={() => {
            setModalManual(false);
            carregarPendentes();
          }}
        />
      )}

      {pendenteRevisao && (
        <RevisarPendenteModal
          pendente={pendenteRevisao}
          nucleos={nucleos}
          onFechar={() => setPendenteRevisao(null)}
          onFinalizado={() => {
            setPendenteRevisao(null);
            carregarPendentes();
          }}
        />
      )}
    </div>
  );
}
