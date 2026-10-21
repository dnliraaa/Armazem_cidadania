import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import type { ContextoModulo } from "../types/index.js";
import { acaoEmAndamento } from "../utils/acoes.js";

const uuid = z.string().uuid();

/**
 * Resolve o módulo da requisição (headers X-Modulo e X-Acao-Id) e injeta
 * `req.contexto`. Deve vir depois de `exigirAutenticacao`.
 *
 *  - 'armazem' (padrão, se o header faltar): exige acesso_armazem (ou admin).
 *  - 'itinerante': exige acesso_itinerante (ou admin) e X-Acao-Id válido. Para
 *    quem não é admin a ação precisa estar EM ANDAMENTO agora; se ela encerrar
 *    (acabou o dia ou foi desativada) as próximas requisições falham com
 *    `codigo: "ACAO_ENCERRADA"` para o frontend tirar o usuário do módulo.
 *    O admin pode consultar também ações passadas, ou entrar sem ação (para
 *    administrar), caso em que vê todo o módulo Itinerante.
 */
export async function resolverContextoModulo(req: Request, res: Response, next: NextFunction) {
  const funcionario = req.funcionario;
  if (!funcionario) {
    return res.status(401).json({ erro: "Token de autenticação ausente." });
  }
  const admin = funcionario.role === "admin";

  const moduloHeader = req.header("x-modulo") ?? "armazem";
  if (moduloHeader !== "armazem" && moduloHeader !== "itinerante") {
    return res.status(400).json({ erro: "Módulo inválido.", codigo: "MODULO_INVALIDO" });
  }

  if (moduloHeader === "armazem") {
    if (!admin && !funcionario.acesso_armazem) {
      return res.status(403).json({ erro: "Você não tem acesso ao módulo Cidadania Presente.", codigo: "SEM_ACESSO_MODULO" });
    }
    req.contexto = { modulo: "armazem", acaoId: null };
    return next();
  }

  if (!admin && !funcionario.acesso_itinerante) {
    return res.status(403).json({ erro: "Você não tem acesso ao módulo Cidadania Itinerante.", codigo: "SEM_ACESSO_MODULO" });
  }

  const acaoHeader = req.header("x-acao-id");
  if (!acaoHeader) {
    if (admin) {
      req.contexto = { modulo: "itinerante", acaoId: null };
      return next();
    }
    return res.status(400).json({ erro: "Selecione uma ação itinerante.", codigo: "ACAO_OBRIGATORIA" });
  }

  const acaoId = uuid.safeParse(acaoHeader);
  if (!acaoId.success) {
    return res.status(400).json({ erro: "Ação itinerante inválida.", codigo: "ACAO_OBRIGATORIA" });
  }

  const { data: acao, error } = await supabaseAdmin
    .from("acoes_itinerantes")
    .select("id, ativo, data_inicio, data_fim")
    .eq("id", acaoId.data)
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível validar a ação itinerante." });
  }
  if (!acao || (!admin && !acaoEmAndamento(acao))) {
    return res.status(409).json({ erro: "Esta ação itinerante foi encerrada.", codigo: "ACAO_ENCERRADA" });
  }

  req.contexto = { modulo: "itinerante", acaoId: acao.id };
  next();
}

/** Contexto da requisição (sempre definido nas rotas que passam por `resolverContextoModulo`). */
export function contextoDe(req: Request): ContextoModulo {
  return req.contexto ?? { modulo: "armazem", acaoId: null };
}
