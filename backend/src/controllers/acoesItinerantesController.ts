import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import type { AcaoItinerante } from "../types/index.js";
import { acaoEmAndamento, hojeSaoPaulo, situacaoAcao } from "../utils/acoes.js";

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const criarAcaoSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome da ação."),
    descricao: z.string().trim().max(1000, "A descrição é longa demais.").optional().nullable(),
    local: z.string().trim().max(300, "O local é longo demais.").optional().nullable(),
    data_inicio: dataSchema,
    // Igual à data de início quando a ação é de um dia só.
    data_fim: dataSchema,
  })
  .refine((a) => a.data_fim >= a.data_inicio, {
    message: "A data final não pode ser anterior à data inicial.",
    path: ["data_fim"],
  });

const atualizarAcaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da ação.").optional(),
  descricao: z.string().trim().max(1000, "A descrição é longa demais.").optional().nullable(),
  local: z.string().trim().max(300, "O local é longo demais.").optional().nullable(),
  data_inicio: dataSchema.optional(),
  data_fim: dataSchema.optional(),
  ativo: z.boolean().optional(),
});

const criarTotemAcaoSchema = z.object({ nome: z.string().trim().min(2, "Informe o nome do totem.") });
const atualizarTotemAcaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do totem.").optional(),
  ativo: z.boolean().optional(),
});

/** Acrescenta a situação calculada (em andamento / futura / encerrada) a uma ação. */
function comSituacao(acao: AcaoItinerante) {
  return { ...acao, situacao: situacaoAcao(acao), em_andamento: acaoEmAndamento(acao) };
}

/** GET /api/acoes-itinerantes — todas as ações (admin), com a situação de cada uma. */
export async function listarAcoes(_req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from("acoes_itinerantes")
    .select("*")
    .order("data_inicio", { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar as ações itinerantes." });
  }

  res.json((data ?? []).map(comSituacao));
}

/**
 * GET /api/acoes-itinerantes/em-andamento — ações em andamento hoje (ativas e com
 * hoje, no fuso de São Paulo, entre início e fim). Usada na seleção de módulo/ação.
 */
export async function listarAcoesEmAndamento(_req: Request, res: Response) {
  const hoje = hojeSaoPaulo();
  const { data, error } = await supabaseAdmin
    .from("acoes_itinerantes")
    .select("*")
    .eq("ativo", true)
    .lte("data_inicio", hoje)
    .gte("data_fim", hoje)
    .order("nome", { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar as ações em andamento." });
  }

  res.json((data ?? []).map(comSituacao));
}

/** POST /api/acoes-itinerantes */
export async function criarAcao(req: Request, res: Response) {
  const parse = criarAcaoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { data, error } = await supabaseAdmin
    .from("acoes_itinerantes")
    .insert({
      ...parse.data,
      descricao: parse.data.descricao || null,
      local: parse.data.local || null,
      ativo: true,
      criado_por: req.funcionario?.id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar a ação itinerante." });
  }

  res.status(201).json(comSituacao(data));
}

/** PUT /api/acoes-itinerantes/:id — editar e/ou ativar/desativar. */
export async function atualizarAcao(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarAcaoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { data: atual, error: erroAtual } = await supabaseAdmin
    .from("acoes_itinerantes")
    .select("data_inicio, data_fim")
    .eq("id", id)
    .maybeSingle();
  if (erroAtual) {
    console.error(erroAtual);
    return res.status(500).json({ erro: "Não foi possível atualizar a ação itinerante." });
  }
  if (!atual) {
    return res.status(404).json({ erro: "Ação itinerante não encontrada." });
  }

  const inicio = parse.data.data_inicio ?? atual.data_inicio;
  const fim = parse.data.data_fim ?? atual.data_fim;
  if (fim < inicio) {
    return res.status(400).json({ erro: "A data final não pode ser anterior à data inicial." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };
  if ("descricao" in atualizacoes) atualizacoes.descricao = parse.data.descricao || null;
  if ("local" in atualizacoes) atualizacoes.local = parse.data.local || null;

  const { data, error } = await supabaseAdmin
    .from("acoes_itinerantes")
    .update(atualizacoes)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar a ação itinerante." });
  }

  res.json(comSituacao(data));
}

// --- Totens da ação (reaproveitam a tabela `totens` com acao_itinerante_id) ---

async function acaoExiste(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("acoes_itinerantes").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

/** GET /api/acoes-itinerantes/:id/totens */
export async function listarTotensDaAcao(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from("totens")
    .select("*")
    .eq("modulo", "itinerante")
    .eq("acao_itinerante_id", req.params.id)
    .order("nome", { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os totens da ação." });
  }

  res.json(data);
}

/** POST /api/acoes-itinerantes/:id/totens */
export async function criarTotemDaAcao(req: Request, res: Response) {
  const { id } = req.params;
  const parse = criarTotemAcaoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }
  if (!(await acaoExiste(id))) {
    return res.status(404).json({ erro: "Ação itinerante não encontrada." });
  }

  const { data, error } = await supabaseAdmin
    .from("totens")
    .insert({ nome: parse.data.nome, ativo: true, unidade_id: null, modulo: "itinerante", acao_itinerante_id: id })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar o totem da ação." });
  }

  res.status(201).json(data);
}

/** PUT /api/acoes-itinerantes/:id/totens/:totemId */
export async function atualizarTotemDaAcao(req: Request, res: Response) {
  const { id, totemId } = req.params;
  const parse = atualizarTotemAcaoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  // O totem precisa ser desta ação (um totem de outra ação ou do Armazém não é encontrado).
  const { data, error } = await supabaseAdmin
    .from("totens")
    .update(parse.data)
    .eq("id", totemId)
    .eq("modulo", "itinerante")
    .eq("acao_itinerante_id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o totem da ação." });
  }
  if (!data) {
    return res.status(404).json({ erro: "Totem não encontrado nesta ação." });
  }

  res.json(data);
}
