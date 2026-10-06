import type { Senha } from "../../types";

/** Formata o código exibido da senha: "N012" (normal) ou "P003" (prioritária). */
export function formatarCodigoSenha(senha: Pick<Senha, "tipo" | "numero">): string {
  const prefixo = senha.tipo === "normal" ? "N" : "P";
  return `${prefixo}${String(senha.numero).padStart(3, "0")}`;
}
