import type { Senha } from "../../types";

/** Formata o código exibido da senha: "G012" (atendimento geral) ou "P003" (prioritária). */
export function formatarCodigoSenha(senha: Pick<Senha, "tipo" | "numero">): string {
  const prefixo = senha.tipo === "geral" ? "G" : "P";
  return `${prefixo}${String(senha.numero).padStart(3, "0")}`;
}
