import { useState } from "react";
import type { Atendimento } from "../../types";

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--cor-texto-suave)", letterSpacing: "0.04em" }}>
        {rotulo.toUpperCase()}
      </div>
      <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

/** Botão "Ver detalhes" + janela de leitura com a ficha completa do atendimento (motivo, encaminhamentos, descrição). */
export function DetalhesAtendimento({ atendimento: a }: { atendimento: Atendimento }) {
  const [aberta, setAberta] = useState(false);

  const registroAntigo =
    a.houve_encaminhamento && a.houve_encaminhamento_externo == null && a.houve_encaminhamento_interno == null;
  const temAlgo =
    Boolean(a.descricao?.trim()) ||
    !a.resolvida ||
    registroAntigo ||
    Boolean(a.houve_encaminhamento_externo) ||
    Boolean(a.houve_encaminhamento_interno);

  if (!temAlgo) return <>—</>;

  const servicos = (a.servicos_externos ?? []).map((s) => s.nome);
  const internos = (a.encaminhamentos_internos ?? []).map((i) => i.nucleo_nome);

  return (
    <>
      <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setAberta(true)}>
        Ver detalhes
      </button>

      {aberta && (
        <div className="modal-fundo" onClick={() => setAberta(false)}>
          <div className="modal" style={{ maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2>Detalhes do atendimento</h2>

            {!a.resolvida && <Linha rotulo="Motivo da demanda não ter sido resolvida">{a.motivo_nao_resolvida || "—"}</Linha>}

            {registroAntigo && <Linha rotulo="Encaminhamento">Encaminhamento (registro antigo)</Linha>}

            {a.houve_encaminhamento_externo && (
              <Linha rotulo="Encaminhamentos para serviços externos">
                {servicos.length > 0 ? servicos.join(", ") : null}
                {servicos.length > 0 && a.encaminhamento_externo_outros ? "\n" : null}
                {a.encaminhamento_externo_outros ? `Outros: ${a.encaminhamento_externo_outros}` : null}
              </Linha>
            )}

            {a.houve_encaminhamento_interno && (
              <Linha rotulo="Encaminhamentos para setores internos">{internos.join(", ") || "—"}</Linha>
            )}

            {a.descricao?.trim() && <Linha rotulo="Descrição">{a.descricao}</Linha>}

            <div className="modal-acoes">
              <button type="button" className="btn btn-primario" onClick={() => setAberta(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
