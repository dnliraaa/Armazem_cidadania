import type { ReactNode } from "react";
import { cpfValido, formatarCpfInput, somenteDigitos } from "../../utils/formatters";
import type { Demanda } from "../../types";

interface Props {
  /** Sem `onCpfTextoChange`, o campo de CPF não é exibido (ex.: fila do núcleo, cidadão já identificado). */
  cpfTexto?: string;
  onCpfTextoChange?: (valor: string) => void;
  onCpfBlur?: () => void;
  mensagemCpf?: string | null;
  nome?: string;
  onNomeChange?: (valor: string) => void;
  demandas: Demanda[];
  demandaPrincipalId: string;
  onDemandaPrincipalChange: (id: string) => void;
  outrasDemandas: string[];
  onToggleOutraDemanda: (id: string) => void;
  resolvida?: boolean;
  onResolvidaChange?: (valor: boolean) => void;
  houveEncaminhamento?: boolean;
  onHouveEncaminhamentoChange?: (valor: boolean) => void;
  /** Com `blocoResolucao`, ele substitui os campos antigos "Resolvida?" e "Houve encaminhamento?" (ficha nova do núcleo). */
  blocoResolucao?: ReactNode;
  /** Com `onDescricaoChange`, exibe o campo opcional "Descrição" do atendimento. */
  descricao?: string;
  onDescricaoChange?: (valor: string) => void;
}

export function PendenteFormCampos({
  cpfTexto,
  onCpfTextoChange,
  onCpfBlur,
  mensagemCpf,
  nome,
  onNomeChange,
  demandas,
  demandaPrincipalId,
  onDemandaPrincipalChange,
  outrasDemandas,
  onToggleOutraDemanda,
  resolvida,
  onResolvidaChange,
  houveEncaminhamento,
  onHouveEncaminhamentoChange,
  blocoResolucao,
  descricao,
  onDescricaoChange,
}: Props) {
  const digitosCpf = somenteDigitos(cpfTexto ?? "");
  const digitoVerificadorInvalido = digitosCpf.length === 11 && !cpfValido(digitosCpf);

  return (
    <>
      {onCpfTextoChange && (
      <div className="campo">
        <label htmlFor="cpfTexto">CPF</label>
        <input
          id="cpfTexto"
          value={cpfTexto ?? ""}
          onChange={(e) => onCpfTextoChange(formatarCpfInput(e.target.value))}
          onBlur={onCpfBlur}
          placeholder="000.000.000-00"
        />
        {mensagemCpf && <span style={{ fontSize: "0.82rem", color: "var(--cor-texto-suave)" }}>{mensagemCpf}</span>}
        {digitoVerificadorInvalido && (
          <span style={{ fontSize: "0.82rem", color: "var(--cor-erro)" }}>
            Dígito verificador não confere — confira o CPF.
          </span>
        )}
      </div>
      )}

      {onNomeChange && (
        <div className="campo">
          <label htmlFor="nome">Nome</label>
          <input
            id="nome"
            value={nome ?? ""}
            onChange={(e) => onNomeChange(e.target.value)}
            placeholder="Nome do cidadão atendido"
          />
        </div>
      )}

      <div className="campo">
        <label>Demanda principal</label>
        {demandas.length === 0 ? (
          <p className="vazio" style={{ padding: "0.5rem 0" }}>
            Este núcleo não tem demandas ativas cadastradas.
          </p>
        ) : (
          demandas.map((demanda) => (
            <label key={demanda.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400, padding: "0.15rem 0" }}>
              <input
                type="radio"
                name="demandaPrincipal"
                checked={demandaPrincipalId === demanda.id}
                onChange={() => onDemandaPrincipalChange(demanda.id)}
              />
              {demanda.nome}
            </label>
          ))
        )}
      </div>

      <div className="campo">
        <label>Outras demandas</label>
        {demandas.map((demanda) => (
          <label key={demanda.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400, padding: "0.15rem 0" }}>
            <input
              type="checkbox"
              checked={outrasDemandas.includes(demanda.id)}
              onChange={() => onToggleOutraDemanda(demanda.id)}
            />
            {demanda.nome}
          </label>
        ))}
      </div>

      {blocoResolucao ?? (
        <>
          <div className="campo">
            <label>A demanda foi resolvida?</label>
            <div className="acoes-linha">
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                <input type="radio" name="resolvida" checked={Boolean(resolvida)} onChange={() => onResolvidaChange?.(true)} /> Sim
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                <input type="radio" name="resolvida" checked={!resolvida} onChange={() => onResolvidaChange?.(false)} /> Não
              </label>
            </div>
          </div>

          <div className="campo">
            <label>Houve encaminhamento?</label>
            <div className="acoes-linha">
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                <input
                  type="radio"
                  name="encaminhamento"
                  checked={Boolean(houveEncaminhamento)}
                  onChange={() => onHouveEncaminhamentoChange?.(true)}
                />{" "}
                Sim
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
                <input
                  type="radio"
                  name="encaminhamento"
                  checked={!houveEncaminhamento}
                  onChange={() => onHouveEncaminhamentoChange?.(false)}
                />{" "}
                Não
              </label>
            </div>
          </div>
        </>
      )}

      {onDescricaoChange && (
        <div className="campo">
          <label htmlFor="descricao">Descrição</label>
          <textarea
            id="descricao"
            rows={4}
            maxLength={5000}
            value={descricao ?? ""}
            onChange={(e) => onDescricaoChange(e.target.value)}
            placeholder="Detalhe como foi o atendimento (opcional)"
          />
        </div>
      )}
    </>
  );
}
