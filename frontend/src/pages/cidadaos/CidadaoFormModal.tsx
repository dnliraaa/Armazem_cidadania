import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { formatarCpfInput, formatarTelefoneInput } from "../../utils/formatters";
import type { Cidadao } from "../../types";

/** Valores pré-preenchidos ao abrir em modo de criação (ex.: vindo do fluxo da recepção). */
export interface ValoresIniciaisCidadao {
  cpf?: string;
  nome?: string;
  data_nascimento?: string;
}

interface Props {
  cidadao: Cidadao | null;
  valoresIniciais?: ValoresIniciaisCidadao;
  onFechar: () => void;
  /** Recebe o cidadão criado/atualizado devolvido pela API. */
  onSalvo: (cidadao: Cidadao) => void;
}

const maiusculo = (valor: string) => valor.toLocaleUpperCase("pt-BR");

export function CidadaoFormModal({ cidadao, valoresIniciais, onFechar, onSalvo }: Props) {
  const editando = Boolean(cidadao);
  const [nome, setNome] = useState(maiusculo(cidadao?.nome ?? valoresIniciais?.nome ?? ""));
  const [nomeSocial, setNomeSocial] = useState(maiusculo(cidadao?.nome_social ?? ""));
  const [dataNascimento, setDataNascimento] = useState(cidadao?.data_nascimento ?? valoresIniciais?.data_nascimento ?? "");
  const [nomeMae, setNomeMae] = useState(maiusculo(cidadao?.nome_mae ?? ""));
  const [telefone, setTelefone] = useState(cidadao ? formatarTelefoneInput(cidadao.telefone) : "");
  const [cpf, setCpf] = useState(
    cidadao?.cpf ? formatarCpfInput(cidadao.cpf) : formatarCpfInput(valoresIniciais?.cpf ?? "")
  );
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const payload = {
        nome,
        nome_social: nomeSocial.trim() || null,
        data_nascimento: dataNascimento,
        nome_mae: nomeMae,
        telefone,
        cpf,
      };
      const salvo =
        editando && cidadao
          ? await api.put<Cidadao>(`/cidadaos/${cidadao.id}`, payload)
          : await api.post<Cidadao>("/cidadaos", payload);
      onSalvo(salvo);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Não foi possível salvar o cidadão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{editando ? "Editar cidadão" : "Novo cidadão"}</h2>

        {erro && <div className="alerta-erro">{erro}</div>}

        <form onSubmit={handleSubmit}>
          <div className="campo">
            <label htmlFor="nome">Nome completo</label>
            <input id="nome" required value={nome} onChange={(e) => setNome(maiusculo(e.target.value))} />
          </div>

          <div className="campo">
            <label htmlFor="nomeSocial">Nome social (opcional)</label>
            <input
              id="nomeSocial"
              value={nomeSocial}
              onChange={(e) => setNomeSocial(maiusculo(e.target.value))}
            />
            <span style={{ fontSize: "0.8rem", color: "var(--cor-texto-suave)" }}>
              Preencha só se a pessoa usa outro nome; será o nome chamado no painel.
            </span>
          </div>

          <div className="campo">
            <label htmlFor="dataNascimento">Data de nascimento</label>
            <input
              id="dataNascimento"
              type="date"
              required
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
            />
          </div>

          <div className="campo">
            <label htmlFor="nomeMae">Nome da mãe</label>
            <input id="nomeMae" required value={nomeMae} onChange={(e) => setNomeMae(maiusculo(e.target.value))} />
          </div>

          <div className="campo">
            <label htmlFor="telefone">Telefone</label>
            <input
              id="telefone"
              required
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefoneInput(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </div>

          <div className="campo">
            <label htmlFor="cpf">CPF (opcional)</label>
            <input
              id="cpf"
              value={cpf}
              onChange={(e) => setCpf(formatarCpfInput(e.target.value))}
              placeholder="000.000.000-00"
            />
          </div>

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
