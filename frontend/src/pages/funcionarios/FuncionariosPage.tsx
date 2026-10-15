import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { formatarCpfInput } from "../../utils/formatters";
import type { Funcionario } from "../../types";
import { FuncionarioFormModal } from "./FuncionarioFormModal";
import { AlterarSenhaModal } from "./AlterarSenhaModal";

export function FuncionariosPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modalForm, setModalForm] = useState<{ aberto: boolean; funcionario: Funcionario | null }>({
    aberto: false,
    funcionario: null,
  });
  const [modalSenha, setModalSenha] = useState<Funcionario | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await api.get<Funcionario[]>("/funcionarios");
      setFuncionarios(dados);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível carregar os funcionários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleDesativar(funcionario: Funcionario) {
    if (!confirm(`Desativar o acesso de ${funcionario.nome}?`)) return;
    try {
      await api.delete(`/funcionarios/${funcionario.id}`);
      carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível desativar o funcionário.");
    }
  }

  async function handleAtivar(funcionario: Funcionario) {
    if (!confirm(`Reativar o acesso de ${funcionario.nome}?`)) return;
    try {
      await api.post(`/funcionarios/${funcionario.id}/ativar`, {});
      carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Não foi possível ativar o funcionário.");
    }
  }

  return (
    <div>
      <div className="pagina-cabecalho">
        <div>
          <h1>Funcionários</h1>
          <p>Cadastro de funcionários com acesso ao sistema.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setModalForm({ aberto: true, funcionario: null })}>
          + Novo funcionário
        </button>
      </div>

      {erro && <div className="alerta-erro">{erro}</div>}

      <div className="cartao">
        {carregando ? (
          <p className="vazio">Carregando…</p>
        ) : funcionarios.length === 0 ? (
          <p className="vazio">Nenhum funcionário cadastrado ainda.</p>
        ) : (
          <div className="tabela-responsiva">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>E-mail</th>
                  <th>Nível</th>
                  <th>Unidade / Núcleo</th>
                  <th>Módulos</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {funcionarios.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nome}</td>
                    <td>{f.cpf ? formatarCpfInput(f.cpf) : "—"}</td>
                    <td>{f.email}</td>
                    <td>{{ recepcao: "Recepção", nucleo: "Núcleo", infraestrutura: "Infraestrutura" }[f.role as string] ?? "Administrador"}</td>
                    <td>
                      {f.role === "nucleo"
                        ? [f.nucleo_nome, f.unidade_nome].filter(Boolean).join(" — ") || "—"
                        : f.unidade_nome ?? "—"}
                    </td>
                    <td>
                      {/* Selos dos módulos de acesso (o admin acessa os dois sempre). */}
                      <div className="acoes-linha">
                        {(f.role === "admin" || f.acesso_armazem) && <span className="badge badge-ativo">Armazém</span>}
                        {(f.role === "admin" || f.acesso_itinerante) && (
                          <span className="badge badge-alerta">Itinerante</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${f.ativo ? "badge-ativo" : "badge-inativo"}`}>
                        {f.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <div className="acoes-linha">
                        <button
                          className="btn btn-secundario btn-pequeno"
                          onClick={() => setModalForm({ aberto: true, funcionario: f })}
                        >
                          Editar
                        </button>
                        <button className="btn btn-secundario btn-pequeno" onClick={() => setModalSenha(f)}>
                          Alterar senha
                        </button>
                        {f.ativo ? (
                          <button className="btn btn-perigo btn-pequeno" onClick={() => handleDesativar(f)}>
                            Desativar
                          </button>
                        ) : (
                          <button className="btn btn-primario btn-pequeno" onClick={() => handleAtivar(f)}>
                            Ativar
                          </button>
                        )}
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
        <FuncionarioFormModal
          funcionario={modalForm.funcionario}
          onFechar={() => setModalForm({ aberto: false, funcionario: null })}
          onSalvo={() => {
            setModalForm({ aberto: false, funcionario: null });
            carregar();
          }}
        />
      )}

      {modalSenha && (
        <AlterarSenhaModal
          funcionario={modalSenha}
          onFechar={() => setModalSenha(null)}
          onSalvo={() => {
            setModalSenha(null);
            alert("Senha alterada com sucesso.");
          }}
        />
      )}
    </div>
  );
}
