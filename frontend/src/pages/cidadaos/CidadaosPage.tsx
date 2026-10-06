import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { formatarCpfInput, formatarDataBr, formatarTelefoneInput } from "../../utils/formatters";
import type { Cidadao } from "../../types";
import { CidadaoFormModal } from "./CidadaoFormModal";

export function CidadaosPage() {
  const [cidadaos, setCidadaos] = useState<Cidadao[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modalForm, setModalForm] = useState<{ aberto: boolean; cidadao: Cidadao | null }>({
    aberto: false,
    cidadao: null,
  });

  async function carregar(termoBusca = busca) {
    setCarregando(true);
    setErro(null);
    try {
      const query = termoBusca ? `?busca=${encodeURIComponent(termoBusca)}` : "";
      const dados = await api.get<Cidadao[]>(`/cidadaos${query}`);
      setCidadaos(dados);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar os cidadãos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => carregar(busca), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  async function handleExcluir(cidadao: Cidadao) {
    if (!confirm(`Remover o cadastro de ${cidadao.nome}?`)) return;
    try {
      await api.delete(`/cidadaos/${cidadao.id}`);
      carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível remover o cidadão.");
    }
  }

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Cidadãos</h1>
          <p>Pessoas atendidas pelo Armazém da Cidadania.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setModalForm({ aberto: true, cidadao: null })}>
          + Novo cidadão
        </button>
      </div>

      <div className="campo busca">
        <input
          placeholder="Buscar por nome ou CPF…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {erro && <div className="alerta-erro">{erro}</div>}

      <div className="cartao">
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : cidadaos.length === 0 ? (
          <p className="vazio">Nenhum cidadão encontrado.</p>
        ) : (
          <div className="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Nascimento</th>
                  <th>Telefone</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {cidadaos.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td>{c.cpf ? formatarCpfInput(c.cpf) : "—"}</td>
                    <td>{formatarDataBr(c.data_nascimento)}</td>
                    <td>{formatarTelefoneInput(c.telefone)}</td>
                    <td>
                      <div className="acoes-linha">
                        <button
                          className="btn btn-secundario btn-pequeno"
                          onClick={() => setModalForm({ aberto: true, cidadao: c })}
                        >
                          Editar
                        </button>
                        <button className="btn btn-perigo btn-pequeno" onClick={() => handleExcluir(c)}>
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

      {modalForm.aberto && (
        <CidadaoFormModal
          cidadao={modalForm.cidadao}
          onFechar={() => setModalForm({ aberto: false, cidadao: null })}
          onSalvo={() => {
            setModalForm({ aberto: false, cidadao: null });
            carregar();
          }}
        />
      )}
    </div>
  );
}
