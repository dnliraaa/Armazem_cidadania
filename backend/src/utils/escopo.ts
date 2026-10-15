import type { ContextoModulo } from "../types/index.js";

/**
 * Escopo por módulo das consultas operacionais (senhas, filas, atendimentos,
 * totens...). Um módulo nunca enxerga os dados do outro:
 *   - Armazém: modulo = 'armazem' (o recorte por unidade segue nos controllers);
 *   - Itinerante: modulo = 'itinerante' e, quando há ação no contexto, só dela.
 *     (Só o admin pode estar no Itinerante sem ação, para consultar todo o módulo.)
 *
 * Usar em TODA consulta/alteração de tabela operacional, para não esquecer em
 * nenhum endpoint. Recebe e devolve o builder do Supabase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aplicarEscopo<T>(query: T, contexto: ContextoModulo): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (query as any).eq("modulo", contexto.modulo);
  if (contexto.modulo === "itinerante") {
    if (contexto.acaoId) q = q.eq("acao_itinerante_id", contexto.acaoId);
  } else {
    q = q.is("acao_itinerante_id", null);
  }
  return q as T;
}

/** Campos de módulo/ação a gravar em toda criação de registro operacional. */
export function escopoInsert(contexto: ContextoModulo): { modulo: string; acao_itinerante_id: string | null } {
  return { modulo: contexto.modulo, acao_itinerante_id: contexto.modulo === "itinerante" ? contexto.acaoId : null };
}

/** Um registro lido por id pertence a este contexto? (evita vazamento entre módulos/ações) */
export function pertenceAoContexto(
  registro: { modulo?: string | null; acao_itinerante_id?: string | null } | null | undefined,
  contexto: ContextoModulo
): boolean {
  if (!registro) return false;
  if ((registro.modulo ?? "armazem") !== contexto.modulo) return false;
  if (contexto.modulo === "itinerante" && contexto.acaoId) {
    return registro.acao_itinerante_id === contexto.acaoId;
  }
  return contexto.modulo === "armazem" ? !registro.acao_itinerante_id : true;
}

/** No Itinerante, quem cria dados operacionais precisa estar numa ação. */
export function podeEscrever(contexto: ContextoModulo): boolean {
  return contexto.modulo === "armazem" || Boolean(contexto.acaoId);
}
