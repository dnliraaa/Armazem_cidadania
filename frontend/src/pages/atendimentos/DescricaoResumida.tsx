import { useState } from "react";

/**
 * Coluna "Descrição" das tabelas de atendimentos: só um botão "Ver descrição"
 * (ou "—" quando vazia). O texto completo abre num modal de visualização,
 * para não alargar a tabela.
 */
export function DescricaoResumida({ texto }: { texto?: string | null }) {
  const [aberta, setAberta] = useState(false);

  if (!texto?.trim()) return <>—</>;

  return (
    <>
      <button type="button" className="btn btn-secundario btn-pequeno" onClick={() => setAberta(true)}>
        Ver descrição
      </button>

      {aberta && (
        <div className="modal-fundo" onClick={() => setAberta(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Descrição do atendimento</h2>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>{texto}</p>
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
