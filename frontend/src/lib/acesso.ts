import type { Funcionario } from "../types";

export type Nivel = Funcionario["role"];

/** Níveis com acesso amplo (menu completo): tudo que não é recepção, núcleo nem infraestrutura (admin, atendente…). */
export function ehNivelAmplo(nivel: string): boolean {
  return nivel !== "recepcao" && nivel !== "nucleo" && nivel !== "infraestrutura";
}

/** Verifica se o nível pode acessar uma rota restrita a `niveis`; "amplo" cobre admin/atendente. */
export function nivelPermitido(nivel: string, niveis: readonly string[]): boolean {
  return niveis.includes(nivel) || (niveis.includes("amplo") && ehNivelAmplo(nivel));
}

/**
 * Tela inicial de cada nível dentro de um módulo. `base` é o prefixo do módulo
 * ("/armazem" ou "/itinerante"). No Itinerante o acesso amplo abre em Ações
 * Itinerantes; no Armazém, em Cidadãos.
 */
export function rotaInicial(nivel: string, base: string): string {
  if (nivel === "recepcao") return `${base}/recepcao`;
  if (nivel === "nucleo") return `${base}/fila-nucleo`;
  if (nivel === "infraestrutura") return `${base}/infraestrutura`;
  return base === "/itinerante" ? `${base}/acoes` : `${base}/cidadaos`;
}
