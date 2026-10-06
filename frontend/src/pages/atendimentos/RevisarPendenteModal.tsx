import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { formatarCpfInput, formatarDataBr, formatarTelefoneInput, somenteDigitos } from "../../utils/formatters";
import type { AtendimentoPendente, Cidadao, Nucleo } from "../../types";
import { descreverErro } from "./erroLabels";
import { PendenteFormCampos } from "./PendenteFormCampos";

interface Props {
  pendente: AtendimentoPendente;
  nucleos: Nucleo[];
  onFechar: () => void;
  onFinalizado: () => void;
}

export function RevisarPendenteModal({ pendente, nucleos, onFechar, onFinalizado }: Props) {
  const [cpfTexto, setCpfTexto] = useState(pendente.cpf_texto ? formatarCpfInput(pendente.cpf_texto) : "");
  const [nome, setNome] = useState(pendente.nome ?? "");
  const [mensagemCpf, setMensagemCpf] = useState<string | null>(null);
  const [buscandoCpf, setBuscandoCpf] = useState(false);
  const [demandaPrincipalId, setDemandaPrincipalId] = useState(pendente.demanda_principal_id ?? "");
  const [outrasDemandas, setOutrasDemandas] = useState<string[]>(pendente.outras_demandas ?? []);
  const [resolvida, setResolvida] = useState(Boolean(pendente.resolvida));
  const [houveEncaminhamento, setHouveEncaminhamento] = useState(Boolean(pendente.houve_encaminhamento));
  const [erroIgnorado, setErroIgnorado] = useState(Boolean(pendente.erro_ignorado));
  const [erros, setErros] = useState<string[]>(pendente.erros ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [mostrarCadastroCidadao, setMostrarCadastroCidadao] = useState(false);
  const [novoCidadaoNome, setNovoCidadaoNome] = useState("");
  const [novoCidadaoDataNascimento, setNovoCidadaoDataNascimento] = useState("");
  const [novoCidadaoTelefone, setNovoCidadaoTelefone] = useState("");
  const [erroCidadao, setErroCidadao] = useState<string | null>(null);
  const [salvandoCidadao, setSalvandoCidadao] = useState(false);

  const nucleo = nucleos.find((n) => n.id === pendente.nucleo_id);
  const demandasDoNucleo = nucleo?.demandas.filter((d) => d.ativo) ?? [];

  function handleToggleOutraDemanda(id: string) {
    setOutrasDemandas((atual) => (atual.includes(id) ? atual.filter((d) => d !== id) : [...atual, id]));
  }

  async function handleCpfBlur() {
    const digitos = somenteDigitos(cpfTexto);
    if (digitos.length < 11) {
      setMensagemCpf(null);
      return;
    }
    setBuscandoCpf(true);
    try {
      const resultados = await api.get<Cidadao[]>(`/cidadaos?busca=${digitos}`);
      const encontrado = resultados.find((c) => c.cpf === digitos);
      if (encontrado) {
        setNome(encontrado.nome);
        setMensagemCpf(`Cidadão encontrado: ${encontrado.nome}`);
      } else {
        setMensagemCpf("Cidadão não encontrado — confirme o nome manualmente.");
      }
    } catch {
      setMensagemCpf(null);
    } finally {
      setBuscandoCpf(false);
    }
  }

  function payloadAtual() {
    return {
      nome: nome || null,
      cpf_texto: cpfTexto || null,
      demanda_principal_id: demandaPrincipalId || null,
      outras_demandas: outrasDemandas,
      resolvida,
      houve_encaminhamento: houveEncaminhamento,
      erro_ignorado: erroIgnorado,
    };
  }

  async function handleSalvar() {
    setErro(null);
    setMensagemSucesso(null);
    setEnviando(true);
    try {
      const atualizado = await api.put<AtendimentoPendente>(`/atendimentos/pendentes/${pendente.id}`, payloadAtual());
      setNome(atualizado.nome ?? "");
      setErros(atualizado.erros ?? []);
      setMensagemSucesso("Alterações salvas.");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar as alterações.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleConfirmar() {
    setErro(null);
    setEnviando(true);
    try {
      // Garante que qualquer edição pendente seja salva antes de confirmar.
      await api.put(`/atendimentos/pendentes/${pendente.id}`, payloadAtual());
      await api.post(`/atendimentos/pendentes/${pendente.id}/confirmar`, {});
      onFinalizado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível confirmar o atendimento.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleRejeitar() {
    if (!confirm("Rejeitar este atendimento pendente? Ele não vira um atendimento confirmado, mas fica salvo para auditoria.")) {
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/atendimentos/pendentes/${pendente.id}/rejeitar`, {});
      onFinalizado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível rejeitar o atendimento.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleCadastrarCidadao(e: FormEvent) {
    e.preventDefault();
    setErroCidadao(null);
    setSalvandoCidadao(true);
    try {
      await api.post("/cidadaos", {
        nome: novoCidadaoNome,
        cpf: cpfTexto,
        data_nascimento: novoCidadaoDataNascimento,
        telefone: novoCidadaoTelefone,
      });
      // Reenvia o mesmo cpf_texto no PUT: o backend busca de novo por CPF e
      // agora encontra o cidadão recém-criado, preenchendo cidadao_id/nome
      // e recalculando os erros — o alerta de "cidadão não cadastrado" some.
      const atualizado = await api.put<AtendimentoPendente>(`/atendimentos/pendentes/${pendente.id}`, payloadAtual());
      setNome(atualizado.nome ?? "");
      setErros(atualizado.erros ?? []);
      setMostrarCadastroCidadao(false);
      setMensagemSucesso("Cidadão cadastrado e vinculado a este atendimento.");
    } catch (err) {
      setErroCidadao(err instanceof ApiError ? err.message : "Não foi possível cadastrar o cidadão.");
    } finally {
      setSalvandoCidadao(false);
    }
  }

  const confirmarBloqueado = erros.length > 0 && !erroIgnorado;

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Revisar atendimento pendente</h2>
        <p style={{ color: "var(--cor-texto-suave)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
          Núcleo: <strong>{pendente.nucleo_nome ?? "—"}</strong>
          {pendente.data_atendimento ? ` • Atendimento em ${formatarDataBr(pendente.data_atendimento)}` : null}
        </p>

        {erro && <div className="alerta-erro">{erro}</div>}
        {mensagemSucesso && (
          <div className="alerta-erro" style={{ background: "#dcfce7", color: "#15803d", borderColor: "#bbf7d0" }}>
            {mensagemSucesso}
          </div>
        )}

        {erros.length > 0 && (
          <div className="alerta-erro">
            <strong>Pendências encontradas:</strong>
            <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.2rem" }}>
              {erros.map((codigo) => (
                <li key={codigo}>{descreverErro(codigo)}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <PendenteFormCampos
              cpfTexto={cpfTexto}
              onCpfTextoChange={setCpfTexto}
              onCpfBlur={handleCpfBlur}
              mensagemCpf={buscandoCpf ? "Buscando…" : mensagemCpf}
              nome={nome}
              onNomeChange={setNome}
              demandas={demandasDoNucleo}
              demandaPrincipalId={demandaPrincipalId}
              onDemandaPrincipalChange={setDemandaPrincipalId}
              outrasDemandas={outrasDemandas}
              onToggleOutraDemanda={handleToggleOutraDemanda}
              resolvida={resolvida}
              onResolvidaChange={setResolvida}
              houveEncaminhamento={houveEncaminhamento}
              onHouveEncaminhamentoChange={setHouveEncaminhamento}
            />

            {erros.includes("cidadao_nao_encontrado") && (
              <div className="campo">
                {!mostrarCadastroCidadao ? (
                  <button
                    type="button"
                    className="btn btn-secundario btn-pequeno"
                    onClick={() => setMostrarCadastroCidadao(true)}
                  >
                    Cadastrar este cidadão agora
                  </button>
                ) : (
                  <div className="cartao" style={{ background: "var(--cor-fundo)", padding: "1rem" }}>
                    <h3 style={{ marginTop: 0, fontSize: "0.95rem" }}>Cadastrar cidadão</h3>

                    {erroCidadao && <div className="alerta-erro">{erroCidadao}</div>}

                    <form onSubmit={handleCadastrarCidadao}>
                      <div className="campo">
                        <label htmlFor="novoCidadaoNome">Nome completo</label>
                        <input
                          id="novoCidadaoNome"
                          required
                          value={novoCidadaoNome}
                          onChange={(e) => setNovoCidadaoNome(e.target.value)}
                        />
                      </div>

                      <div className="campo">
                        <label htmlFor="novoCidadaoCpf">CPF</label>
                        <input id="novoCidadaoCpf" value={cpfTexto} disabled />
                      </div>

                      <div className="campo">
                        <label htmlFor="novoCidadaoDataNascimento">Data de nascimento</label>
                        <input
                          id="novoCidadaoDataNascimento"
                          type="date"
                          required
                          value={novoCidadaoDataNascimento}
                          onChange={(e) => setNovoCidadaoDataNascimento(e.target.value)}
                        />
                      </div>

                      <div className="campo">
                        <label htmlFor="novoCidadaoTelefone">Telefone</label>
                        <input
                          id="novoCidadaoTelefone"
                          required
                          value={novoCidadaoTelefone}
                          onChange={(e) => setNovoCidadaoTelefone(formatarTelefoneInput(e.target.value))}
                          placeholder="(00) 00000-0000"
                        />
                      </div>

                      <div className="modal-acoes">
                        <button
                          type="button"
                          className="btn btn-secundario btn-pequeno"
                          onClick={() => setMostrarCadastroCidadao(false)}
                        >
                          Cancelar
                        </button>
                        <button type="submit" className="btn btn-primario btn-pequeno" disabled={salvandoCidadao}>
                          {salvandoCidadao ? "Salvando…" : "Salvar cidadão"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {erros.length > 0 && (
              <div className="campo">
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={erroIgnorado}
                    onChange={(e) => setErroIgnorado(e.target.checked)}
                  />
                  Ignorar estes alertas e permitir confirmar mesmo assim
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="modal-acoes" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-perigo" onClick={handleRejeitar} disabled={enviando}>
            Rejeitar
          </button>
          <div style={{ textAlign: "right" }}>
            <div className="acoes-linha">
              <button type="button" className="btn btn-secundario" onClick={onFechar}>
                Fechar
              </button>
              <button type="button" className="btn btn-secundario" onClick={handleSalvar} disabled={enviando}>
                Salvar alterações
              </button>
              <button
                type="button"
                className="btn btn-primario"
                onClick={handleConfirmar}
                disabled={enviando || confirmarBloqueado}
              >
                Confirmar atendimento
              </button>
            </div>
            {confirmarBloqueado && (
              <p style={{ fontSize: "0.8rem", color: "var(--cor-texto-suave)", marginTop: "0.4rem" }}>
                Corrija as pendências acima ou marque "Ignorar estes alertas" para liberar a confirmação.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
