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

/** Tela inicial de cada nível. */
export function rotaInicial(nivel: string): string {
  if (nivel === "recepcao") return "/recepcao";
  if (nivel === "nucleo") return "/fila-nucleo";
  if (nivel === "infraestrutura") return "/infraestrutura";
  return "/cidadaos";
}
