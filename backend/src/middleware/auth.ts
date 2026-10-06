import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin, supabaseAuthClient } from "../config/supabase.js";

/**
 * Exige um token válido do Supabase Auth (Authorization: Bearer <token>).
 * Se válido, carrega o registro correspondente em `public.funcionarios`
 * para `req.funcionario`.
 */
export async function exigirAutenticacao(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ erro: "Token de autenticação ausente." });
    }

    const { data, error } = await supabaseAuthClient.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ erro: "Token inválido ou expirado." });
    }

    const { data: funcionario, error: erroFuncionario } = await supabaseAdmin
      .from("funcionarios")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    if (erroFuncionario || !funcionario) {
      return res.status(403).json({ erro: "Usuário autenticado, mas sem cadastro de funcionário." });
    }

    if (!funcionario.ativo) {
      return res.status(403).json({ erro: "Este usuário está inativo." });
    }

    req.funcionario = funcionario;
    next();
  } catch (err) {
    console.error("Erro no middleware de autenticação:", err);
    res.status(500).json({ erro: "Erro interno ao validar autenticação." });
  }
}

/** UUID que nunca existe: faz filtros por unidade não casarem com nada quando o cadastro do funcionário está incompleto. */
export const UNIDADE_INEXISTENTE = "00000000-0000-0000-0000-000000000000";

/**
 * Funcionário "infraestrutura" só opera a unidade em que atua (totens e painel).
 * Devolve essa unidade, ou null para os demais níveis (sem restrição por aqui).
 * Sem unidade cadastrada, falha fechada: não casa com nenhuma unidade.
 */
export function unidadeDaInfraestrutura(req: Request): string | null {
  return req.funcionario?.role === "infraestrutura" ? req.funcionario.unidade_id ?? UNIDADE_INEXISTENTE : null;
}

export type NivelAcesso = "amplo" | "recepcao" | "nucleo" | "infraestrutura";

/**
 * Exige que o nível do funcionário autenticado esteja entre os permitidos
 * (deve vir depois de `exigirAutenticacao`). "amplo" cobre todo nível que não é
 * recepção, núcleo nem infraestrutura (admin, atendente…) — o mesmo critério do frontend.
 */
export function exigirNivel(...permitidos: NivelAcesso[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.funcionario?.role as string | undefined;
    const nivel: NivelAcesso =
      role === "recepcao" || role === "nucleo" || role === "infraestrutura" ? role : "amplo";
    if (!permitidos.includes(nivel)) {
      return res.status(403).json({ erro: "Seu nível de acesso não permite esta ação." });
    }
    next();
  };
}

/**
 * Exige que o funcionário autenticado tenha o papel "admin".
 * Hoje todo funcionário cadastrado é admin, mas o middleware já fica
 * pronto para quando surgirem outros papéis.
 */
export function exigirAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.funcionario?.role !== "admin") {
    return res.status(403).json({ erro: "Apenas administradores podem realizar esta ação." });
  }
  next();
}
