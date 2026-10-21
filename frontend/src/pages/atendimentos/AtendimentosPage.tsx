import { useEffect, useState } from "react";
import { useModulo } from "../../contexts/ModuloContext";
import { api, ApiError } from "../../lib/api";
import type { Atendimento, Unidade } from "../../types";
import { DetalhesAtendimento } from "./DetalhesAtendimento";
import { resumoEncaminhamentos } from "./fichaAtendimento";

/**
 * Consulta dos atendimentos realizados (somente leitura). Os atendimentos são
 * criados pela recepção e concluídos pelos núcleos; aqui só se lista e filtra.
 */
export function AtendimentosPage() {
  const { modulo } = useModulo();
  // Unidades só existem no Cidadania Presente; no Itinerante o recorte já é a ação.
  const filtraPorUnidade = modulo === "armazem";

  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [filtroUnidade, setFiltroUnidade] = useState("");

  useEffect(() => {
    if (!filtraPorUnidade) return;
    api
      .get<Unidade[]>("/unidades")
      .then(setUnidades)
      .catch(() => setErro("Não foi possível carregar as unidades."));
  }, [filtraPorUnidade]);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    const query = filtroUnidade ? `?unidade_id=${filtroUnidade}` : "";
    api
      .get<Atendimento[]>(`/atendimentos${query}`)
      .then(setAtendimentos)
      .catch((err) => setErro(err instanceof ApiError ? err.message : "Não foi possível carregar os atendimentos."))
      .finally(() => setCarregando(false));
  }, [filtroUnidade]);

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Atendimentos</h1>
          <p>Atendimentos realizados pelos núcleos.</p>
        </div>
      </div>

      {filtraPorUnidade && (
        <div className="campo" style={{ maxWidth: 260, marginBottom: "1rem" }}>
          <label htmlFor="filtroUnidade">Filtrar por unidade</label>
          <select id="filtroUnidade" value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
            <option value="">Todas as unidades</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
                {u.ativo ? "" : " (inativa)"}
              </option>
            ))}
          </select>
        </div>
      )}

      {erro && <div className="alerta-erro">{erro}</div>}

      <div className="cartao">
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : atendimentos.length === 0 ? (
          <p className="vazio">Nenhum atendimento realizado{filtroUnidade ? " nesta unidade" : ""}.</p>
        ) : (
          <div className="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  {filtraPorUnidade && <th>Unidade</th>}
                  <th>Cidadão</th>
                  <th>Núcleo</th>
                  <th>Demanda principal</th>
                  <th>Resolvida</th>
                  <th>Encaminhamentos</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {atendimentos.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.created_at).toLocaleString("pt-BR")}</td>
                    {filtraPorUnidade && <td>{a.unidade_nome ?? "—"}</td>}
                    <td>
                      {a.cidadao_nome ?? <em>sem cidadão vinculado</em>}{" "}
                      {a.prioridade && <span className="badge badge-alerta">Prioridade</span>}
                    </td>
                    <td>{a.nucleo_nome ?? "—"}</td>
                    <td>{a.demanda_principal_nome ?? "—"}</td>
                    <td>{a.resolvida ? "Sim" : "Não"}</td>
                    <td>{resumoEncaminhamentos(a)}</td>
                    <td>
                      <DetalhesAtendimento atendimento={a} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
