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

export function CidadaoFormModal({ cidadao, valoresIniciais, onFechar, onSalvo }: Props) {
  const editando = Boolean(cidadao);
  const [nome, setNome] = useState((cidadao?.nome ?? valoresIniciais?.nome ?? "").toLocaleUpperCase("pt-BR"));
  const [cpf, setCpf] = useState(
    cidadao?.cpf ? formatarCpfInput(cidadao.cpf) : formatarCpfInput(valoresIniciais?.cpf ?? "")
  );
  const [dataNascimento, setDataNascimento] = useState(cidadao?.data_nascimento ?? valoresIniciais?.data_nascimento ?? "");
  const [telefone, setTelefone] = useState(cidadao ? formatarTelefoneInput(cidadao.telefone) : "");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const payload = { nome, cpf, data_nascimento: dataNascimento, telefone };
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
            <input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value.toLocaleUpperCase("pt-BR"))}
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
            <label htmlFor="telefone">Telefone</label>
            <input
              id="telefone"
              required
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefoneInput(e.target.value))}
              placeholder="(00) 00000-0000"
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
