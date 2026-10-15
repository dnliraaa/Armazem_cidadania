import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { formatarCpfInput } from "../../utils/formatters";
import type { Funcionario, Nucleo, Unidade } from "../../types";

interface Props {
  funcionario: Funcionario | null;
  onFechar: () => void;
  onSalvo: () => void;
}

export function FuncionarioFormModal({ funcionario, onFechar, onSalvo }: Props) {
  const editando = Boolean(funcionario);
  const [nome, setNome] = useState(funcionario?.nome ?? "");
  const [cpf, setCpf] = useState(funcionario?.cpf ? formatarCpfInput(funcionario.cpf) : "");
  const [email, setEmail] = useState(funcionario?.email ?? "");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<Funcionario["role"]>(funcionario?.role ?? "admin");
  const [unidadeId, setUnidadeId] = useState(funcionario?.unidade_id ?? "");
  const [nucleoId, setNucleoId] = useState(funcionario?.nucleo_id ?? "");
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Recepção e núcleo atuam dentro de uma unidade; o núcleo, além disso, tem o seu núcleo.
  // Conta de infraestrutura é de um aparelho (totem/painel), não de uma pessoa: CPF opcional.
  const cpfObrigatorio = role !== "infraestrutura";
  // Módulos de acesso (o admin acessa os dois sempre, então a seção some para ele).
  const [acessoArmazem, setAcessoArmazem] = useState(funcionario?.acesso_armazem ?? true);
  const [acessoItinerante, setAcessoItinerante] = useState(funcionario?.acesso_itinerante ?? false);
  const ehAdmin = role === "admin";
  // A unidade só é exigida quando o Armazém está marcado (no Itinerante a ação substitui a unidade).
  const nivelComUnidade = role === "recepcao" || role === "nucleo" || role === "infraestrutura";
  const precisaUnidade = nivelComUnidade && acessoArmazem;

  useEffect(() => {
    api
      .get<Unidade[]>("/unidades")
      .then((dados) => setUnidades(dados.filter((u) => u.ativo)))
      .catch(() => setUnidades([]));
    api
      .get<Nucleo[]>("/nucleos")
      .then((dados) => setNucleos(dados.filter((n) => n.ativo)))
      .catch(() => setNucleos([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!ehAdmin && !acessoArmazem && !acessoItinerante) {
      setErro("Marque ao menos um módulo de acesso.");
      return;
    }
    if (precisaUnidade && !unidadeId) {
      setErro("Selecione a unidade para este nível.");
      return;
    }
    if (role === "nucleo" && !nucleoId) {
      setErro("Selecione o núcleo para o nível núcleo.");
      return;
    }

    setEnviando(true);
    try {
      const dados = {
        nome,
        cpf,
        email,
        role,
        unidade_id: precisaUnidade ? unidadeId : null,
        nucleo_id: role === "nucleo" ? nucleoId : null,
        acesso_armazem: ehAdmin ? true : acessoArmazem,
        acesso_itinerante: ehAdmin ? true : acessoItinerante,
      };
      if (editando && funcionario) {
        await api.put(`/funcionarios/${funcionario.id}`, dados);
      } else {
        await api.post("/funcionarios", { ...dados, senha });
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o funcionário.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editando ? "Editar funcionário" : "Novo funcionário"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nome">Nome completo</label>
            <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div className="campo">
            <label htmlFor="cpf">{cpfObrigatorio ? "CPF" : "CPF (opcional)"}</label>
            <input
              id="cpf"
              required={cpfObrigatorio}
              value={cpf}
              onChange={(e) => setCpf(formatarCpfInput(e.target.value))}
              placeholder="000.000.000-00"
            />
          </div>

          <div className="campo">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {!editando && (
            <div className="campo">
              <label htmlFor="senha">Senha inicial</label>
              <input
                id="senha"
                type="password"
                required
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
              />
            </div>
          )}

          <div className="campo">
            <label htmlFor="role">Nível</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as Funcionario["role"])}>
              <option value="admin">Administrador</option>
              <option value="recepcao">Recepção</option>
              <option value="nucleo">Núcleo</option>
              <option value="infraestrutura">Infraestrutura</option>
            </select>
          </div>

          {!ehAdmin && (
            <div className="campo">
              <label>Módulos de acesso</label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={acessoArmazem}
                  onChange={(e) => setAcessoArmazem(e.target.checked)}
                />
                Armazém da Cidadania
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={acessoItinerante}
                  onChange={(e) => setAcessoItinerante(e.target.checked)}
                />
                Armazém Itinerante
              </label>
              {nivelComUnidade && !acessoArmazem && (
                <span style={{ fontSize: "0.8rem", color: "var(--cor-texto-suave)" }}>
                  No Itinerante a ação itinerante substitui a unidade.
                </span>
              )}
            </div>
          )}

          {role === "nucleo" && (
            <div className="campo">
              <label htmlFor="nucleo">Núcleo</label>
              <select id="nucleo" required value={nucleoId} onChange={(e) => setNucleoId(e.target.value)}>
                <option value="" disabled>
                  Selecione…
                </option>
                {nucleos.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {precisaUnidade && (
            <div className="campo">
              <label htmlFor="unidade">Unidade</label>
              <select id="unidade" required value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                <option value="" disabled>
                  Selecione…
                </option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

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
