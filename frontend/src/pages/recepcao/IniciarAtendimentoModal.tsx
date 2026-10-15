import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { cpfValido, formatarCpfInput, formatarDataBr, somenteDigitos } from "../../utils/formatters";
import type { Cidadao, Nucleo, Senha } from "../../types";
import { formatarCodigoSenha } from "../fila/filaUtils";
import { CidadaoFormModal, type ValoresIniciaisCidadao } from "../cidadaos/CidadaoFormModal";

interface Props {
  /** Senha chamada que originou o atendimento; sem ela, o atendimento é iniciado direto (sem senha). */
  senha?: Senha | null;
  onFechar: () => void;
  /** Chamado depois que o encaminhamento foi criado (e a senha, se houver, marcada como atendida). */
  onConcluido: () => void;
}

type Etapa = "pergunta" | "cpf" | "nome" | "destino";

export function IniciarAtendimentoModal({ senha, onFechar, onConcluido }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("pergunta");
  const [etapaBusca, setEtapaBusca] = useState<"cpf" | "nome">("cpf");
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [encaminhando, setEncaminhando] = useState(false);

  // Etapa "destino": cidadão já identificado/cadastrado, falta escolher o núcleo.
  const [cidadaoDestino, setCidadaoDestino] = useState<Pick<Cidadao, "id" | "nome"> | null>(null);
  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [nucleoId, setNucleoId] = useState("");
  const [prioridade, setPrioridade] = useState(false);
  const [resolvidaRecepcao, setResolvidaRecepcao] = useState(false);
  const [descricaoRecepcao, setDescricaoRecepcao] = useState("");

  useEffect(() => {
    api
      .get<Nucleo[]>("/nucleos")
      .then((dados) => setNucleos(dados.filter((n) => n.ativo)))
      .catch(() => setErro("Não foi possível carregar os núcleos."));
  }, []);

  // Etapa "cpf"
  const [cpf, setCpf] = useState("");
  const [cidadaoEncontrado, setCidadaoEncontrado] = useState<Cidadao | null>(null);
  const [cpfSemCadastro, setCpfSemCadastro] = useState(false);

  // Etapa "nome"
  const [nome, setNome] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [resultados, setResultados] = useState<Cidadao[] | null>(null);

  const [cadastrando, setCadastrando] = useState<ValoresIniciaisCidadao | null>(null);

  function voltarParaPergunta() {
    setEtapa("pergunta");
    setErro(null);
  }

  /** Cidadão identificado (encontrado ou recém-cadastrado): segue para a escolha do núcleo. */
  function selecionarCidadao(cidadao: Pick<Cidadao, "id" | "nome">, veioDe: "cpf" | "nome") {
    setErro(null);
    setCadastrando(null);
    setCidadaoDestino(cidadao);
    setEtapaBusca(veioDe);
    setEtapa("destino");
  }

  async function confirmarEncaminhamento() {
    if (!cidadaoDestino) return;
    if (resolvidaRecepcao) {
      if (!descricaoRecepcao.trim()) {
        setErro("Descreva a informação da demanda resolvida.");
        return;
      }
    } else if (!nucleoId) {
      setErro("Selecione o núcleo de destino.");
      return;
    }
    setErro(null);
    setEncaminhando(true);
    try {
      if (resolvidaRecepcao) {
        // Resolvida na própria recepção: só registra o atendimento, sem encaminhar a núcleo.
        await api.post("/atendimentos/resolvido-recepcao", {
          senha_id: senha?.id,
          cidadao_id: cidadaoDestino.id,
          descricao: descricaoRecepcao.trim(),
        });
      } else {
        await api.post("/atendimentos/encaminhar", {
          senha_id: senha?.id,
          cidadao_id: cidadaoDestino.id,
          nucleo_id: nucleoId,
          prioridade,
        });
      }
      onConcluido();
    } catch (err) {
      setErro(
        err instanceof ApiError
          ? err.message
          : resolvidaRecepcao
            ? "Não foi possível registrar o atendimento."
            : "Não foi possível iniciar o encaminhamento."
      );
    } finally {
      setEncaminhando(false);
    }
  }

  async function handleBuscarCpf(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCidadaoEncontrado(null);
    setCpfSemCadastro(false);

    if (!cpfValido(cpf)) {
      setErro("CPF inválido.");
      return;
    }

    setBuscando(true);
    try {
      const lista = await api.get<Cidadao[]>(`/cidadaos?cpf=${somenteDigitos(cpf)}`);
      if (lista.length > 0) {
        setCidadaoEncontrado(lista[0]);
      } else {
        setCpfSemCadastro(true);
      }
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível buscar o cidadão.");
    } finally {
      setBuscando(false);
    }
  }

  async function handleBuscarNome(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setResultados(null);
    setBuscando(true);
    try {
      const params = new URLSearchParams({ nome: nome.trim(), data_nascimento: dataNascimento });
      setResultados(await api.get<Cidadao[]>(`/cidadaos?${params.toString()}`));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível buscar o cidadão.");
    } finally {
      setBuscando(false);
    }
  }

  // Cadastro (CidadaoFormModal) sobrepõe o modal principal; ao salvar, já encaminha.
  if (cadastrando) {
    return (
      <CidadaoFormModal
        cidadao={null}
        valoresIniciais={cadastrando}
        onFechar={() => setCadastrando(null)}
        onSalvo={(novo) => selecionarCidadao(novo, etapa === "nome" ? "nome" : "cpf")}
      />
    );
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{senha ? `Iniciar atendimento — ${formatarCodigoSenha(senha)}` : "Novo atendimento"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        {etapa === "pergunta" && (
          <>
            <p>O cidadão possui CPF?</p>
            <div className="acoes-linha">
              <button className="btn btn-primario" onClick={() => setEtapa("cpf")}>
                Sim
              </button>
              <button className="btn btn-secundario" onClick={() => setEtapa("nome")}>
                Não
              </button>
            </div>
            <div className="modal-acoes">
              <button type="button" className="btn btn-secundario" onClick={onFechar}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {etapa === "cpf" && (
          <>
            <form onSubmit={handleBuscarCpf}>
              <div className="campo">
                <label htmlFor="cpfBusca">CPF</label>
                <input
                  id="cpfBusca"
                  autoFocus
                  value={cpf}
                  onChange={(e) => {
                    setCpf(formatarCpfInput(e.target.value));
                    setCidadaoEncontrado(null);
                    setCpfSemCadastro(false);
                  }}
                  placeholder="000.000.000-00"
                />
              </div>
              <button type="submit" className="btn btn-primario" disabled={buscando}>
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            </form>

            {cidadaoEncontrado && (
              <div className="cartao" style={{ marginTop: "1rem" }}>
                <p style={{ margin: 0 }}>
                  <strong>{cidadaoEncontrado.nome}</strong>
                  {cidadaoEncontrado.nome_social && ` (nome social: ${cidadaoEncontrado.nome_social})`}
                </p>
                <p style={{ margin: "0.25rem 0 0.75rem", color: "var(--cor-texto-suave)" }}>
                  Nascimento: {formatarDataBr(cidadaoEncontrado.data_nascimento)}
                  {cidadaoEncontrado.nome_mae && ` • Mãe: ${cidadaoEncontrado.nome_mae}`}
                </p>
                <button className="btn btn-primario" onClick={() => selecionarCidadao(cidadaoEncontrado, "cpf")}>
                  Iniciar encaminhamento
                </button>
              </div>
            )}

            {cpfSemCadastro && (
              <div className="cartao" style={{ marginTop: "1rem" }}>
                <p style={{ marginTop: 0 }}>Não possui cadastro.</p>
                <button className="btn btn-primario" onClick={() => setCadastrando({ cpf })}>
                  Cadastrar cidadão
                </button>
              </div>
            )}

            <div className="modal-acoes">
              <button type="button" className="btn btn-secundario" onClick={voltarParaPergunta}>
                Voltar
              </button>
              <button type="button" className="btn btn-secundario" onClick={onFechar}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {etapa === "nome" && (
          <>
            <form onSubmit={handleBuscarNome}>
              <div className="campo">
                <label htmlFor="nomeBusca">Nome completo</label>
                <input
                  id="nomeBusca"
                  autoFocus
                  required
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    setResultados(null);
                  }}
                />
              </div>
              <div className="campo">
                <label htmlFor="nascimentoBusca">Data de nascimento</label>
                <input
                  id="nascimentoBusca"
                  type="date"
                  required
                  value={dataNascimento}
                  onChange={(e) => {
                    setDataNascimento(e.target.value);
                    setResultados(null);
                  }}
                />
              </div>
              <div className="acoes-linha">
                <button type="submit" className="btn btn-primario" disabled={buscando}>
                  {buscando ? "Buscando…" : "Buscar"}
                </button>
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={() => setCadastrando({ nome: nome.trim(), data_nascimento: dataNascimento })}
                >
                  Cadastrar
                </button>
              </div>
            </form>

            {resultados && (
              <div style={{ marginTop: "1rem" }}>
                {resultados.length === 0 ? (
                  <p className="vazio">Nenhum cidadão encontrado.</p>
                ) : (
                  resultados.map((c) => (
                    <div
                      key={c.id}
                      className="cartao"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <span>
                        <strong>{c.nome}</strong>
                        {c.nome_social && ` (nome social: ${c.nome_social})`} — {formatarDataBr(c.data_nascimento)}
                        <br />
                        <span style={{ fontSize: "0.85rem", color: "var(--cor-texto-suave)" }}>
                          Mãe: {c.nome_mae || "não informada"}
                        </span>
                      </span>
                      <button className="btn btn-primario" onClick={() => selecionarCidadao(c, "nome")}>
                        Iniciar encaminhamento
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="modal-acoes">
              <button type="button" className="btn btn-secundario" onClick={voltarParaPergunta}>
                Voltar
              </button>
              <button type="button" className="btn btn-secundario" onClick={onFechar}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {etapa === "destino" && cidadaoDestino && (
          <>
            <p style={{ marginTop: 0 }}>
              Cidadão: <strong>{cidadaoDestino.nome}</strong>
            </p>

            <div className="campo">
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={resolvidaRecepcao}
                  onChange={(e) => setResolvidaRecepcao(e.target.checked)}
                />
                Demanda resolvida na recepção (não encaminha para núcleo)
              </label>
            </div>

            {resolvidaRecepcao ? (
              <div className="campo">
                <label htmlFor="descricaoRecepcao">Informação</label>
                <textarea
                  id="descricaoRecepcao"
                  rows={3}
                  maxLength={1000}
                  autoFocus
                  value={descricaoRecepcao}
                  onChange={(e) => setDescricaoRecepcao(e.target.value)}
                  placeholder="Descreva brevemente o que foi resolvido na recepção"
                />
              </div>
            ) : (
              <>
                <div className="campo">
                  <label htmlFor="nucleoDestino">Núcleo de destino</label>
                  <select id="nucleoDestino" value={nucleoId} onChange={(e) => setNucleoId(e.target.value)}>
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

                <div className="campo">
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                    <input type="checkbox" checked={prioridade} onChange={(e) => setPrioridade(e.target.checked)} />
                    Prioridade
                  </label>
                </div>
              </>
            )}

            <div className="modal-acoes">
              <button type="button" className="btn btn-secundario" onClick={() => setEtapa(etapaBusca)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn btn-primario"
                onClick={confirmarEncaminhamento}
                disabled={encaminhando || (resolvidaRecepcao ? !descricaoRecepcao.trim() : !nucleoId)}
              >
                {encaminhando
                  ? resolvidaRecepcao
                    ? "Registrando…"
                    : "Encaminhando…"
                  : resolvidaRecepcao
                    ? "Registrar atendimento"
                    : "Confirmar encaminhamento"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
