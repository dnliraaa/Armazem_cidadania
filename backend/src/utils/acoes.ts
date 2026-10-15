import type { AcaoItinerante } from "../types/index.js";

/** Data de hoje (YYYY-MM-DD) no fuso America/Sao_Paulo — o critério de "em andamento" das ações itinerantes. */
export function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Uma ação está em andamento quando está ativa e hoje (São Paulo) cai entre data_inicio e data_fim. */
export function acaoEmAndamento(
  acao: Pick<AcaoItinerante, "ativo" | "data_inicio" | "data_fim">,
  hoje: string = hojeSaoPaulo()
): boolean {
  return acao.ativo && acao.data_inicio <= hoje && hoje <= acao.data_fim;
}

/** Situação para exibição: em andamento, futura (ainda não começou) ou encerrada (acabou ou foi desativada). */
export function situacaoAcao(
  acao: Pick<AcaoItinerante, "ativo" | "data_inicio" | "data_fim">,
  hoje: string = hojeSaoPaulo()
): "em_andamento" | "futura" | "encerrada" {
  if (!acao.ativo || hoje > acao.data_fim) return "encerrada";
  if (hoje < acao.data_inicio) return "futura";
  return "em_andamento";
}
