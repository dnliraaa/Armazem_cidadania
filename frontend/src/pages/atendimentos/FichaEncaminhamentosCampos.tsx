import type { Nucleo, ServicoExterno } from "../../types";
import type { FichaForm } from "./fichaAtendimento";

interface Props {
  ficha: FichaForm;
  onChange: (ficha: FichaForm) => void;
  /** Serviços externos do núcleo do atendimento que podem ser escolhidos (ativos + os já escolhidos antes). */
  servicos: ServicoExterno[];
  /** Núcleos que podem receber encaminhamento interno (já sem o núcleo do próprio atendimento). */
  nucleosDestino: Nucleo[];
}

const estiloOpcao = { display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400, padding: "0.15rem 0" } as const;

function SimNao({
  nome,
  valor,
  onChange,
}: {
  nome: string;
  valor: boolean | null;
  onChange: (valor: boolean) => void;
}) {
  return (
    <div className="acoes-linha">
      <label style={{ ...estiloOpcao, gap: "0.4rem" }}>
        <input type="radio" name={nome} checked={valor === true} onChange={() => onChange(true)} /> Sim
      </label>
      <label style={{ ...estiloOpcao, gap: "0.4rem" }}>
        <input type="radio" name={nome} checked={valor === false} onChange={() => onChange(false)} /> Não
      </label>
    </div>
  );
}

function alternar(lista: string[], id: string): string[] {
  return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
}

/**
 * Ficha do núcleo: a demanda foi resolvida? (com motivo se não), houve
 * encaminhamento para serviços externos? e para setores internos?
 */
export function FichaEncaminhamentosCampos({ ficha, onChange, servicos, nucleosDestino }: Props) {
  const set = (parcial: Partial<FichaForm>) => onChange({ ...ficha, ...parcial });

  return (
    <>
      <div className="campo">
        <label>A demanda foi resolvida?</label>
        <SimNao nome="ficha-resolvida" valor={ficha.resolvida} onChange={(v) => set({ resolvida: v })} />
        {ficha.resolvida === false && (
          <>
            <label htmlFor="motivoNaoResolvida" style={{ marginTop: "0.5rem" }}>
              Explique o motivo
            </label>
            <textarea
              id="motivoNaoResolvida"
              rows={3}
              maxLength={1000}
              required
              value={ficha.motivo}
              onChange={(e) => set({ motivo: e.target.value })}
              placeholder="Por que a demanda não foi resolvida?"
            />
          </>
        )}
      </div>

      <div className="campo">
        <label>Houveram encaminhamentos para serviços externos?</label>
        <SimNao nome="ficha-externo" valor={ficha.externo} onChange={(v) => set({ externo: v })} />
        {ficha.externo && (
          <div style={{ marginTop: "0.5rem" }}>
            {servicos.length === 0 ? (
              <p className="vazio" style={{ padding: "0.25rem 0" }}>
                Este núcleo não tem serviços externos cadastrados. Use "Outros" abaixo.
              </p>
            ) : (
              servicos.map((s) => (
                <label key={s.id} style={estiloOpcao}>
                  <input
                    type="checkbox"
                    checked={ficha.servicosIds.includes(s.id)}
                    onChange={() => set({ servicosIds: alternar(ficha.servicosIds, s.id) })}
                  />
                  {s.nome}
                  {!s.ativo && <span className="badge badge-inativo">Inativo</span>}
                </label>
              ))
            )}
            <label htmlFor="externoOutros" style={{ marginTop: "0.5rem" }}>
              Outros
            </label>
            <input
              id="externoOutros"
              maxLength={500}
              value={ficha.outros}
              onChange={(e) => set({ outros: e.target.value })}
              placeholder="Descreva o serviço, se não estiver na lista"
            />
          </div>
        )}
      </div>

      <div className="campo">
        <label>Houveram encaminhamentos para setores internos?</label>
        <SimNao nome="ficha-interno" valor={ficha.interno} onChange={(v) => set({ interno: v })} />
        {ficha.interno && (
          <div style={{ marginTop: "0.5rem" }}>
            <label style={{ marginBottom: "0.25rem" }}>Núcleo de destino</label>
            {nucleosDestino.length === 0 ? (
              <p className="vazio" style={{ padding: "0.25rem 0" }}>
                Não há outros núcleos ativos.
              </p>
            ) : (
              nucleosDestino.map((n) => (
                <label key={n.id} style={estiloOpcao}>
                  <input
                    type="radio"
                    name="ficha-nucleo-destino"
                    checked={ficha.destinosIds[0] === n.id}
                    onChange={() => set({ destinosIds: [n.id] })}
                  />
                  {n.nome}
                </label>
              ))
            )}
            <span style={{ fontSize: "0.8rem", color: "var(--cor-texto-suave)" }}>
              Um núcleo por vez: ao concluir, o cidadão entra na fila do núcleo escolhido.
            </span>
          </div>
        )}
      </div>
    </>
  );
}
