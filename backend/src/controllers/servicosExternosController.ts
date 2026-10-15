import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";

const criarServicoSchema = z.object({
  nucleo_id: z.string().uuid("Núcleo inválido."),
  nome: z.string().trim().min(2, "Informe o nome do serviço externo."),
});

const atualizarServicoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do serviço externo.").optional(),
  ativo: z.boolean().optional(),
});

/**
 * GET /api/servicos-externos?nucleo_id=
 *
 * Devolve ativos e inativos: a ficha só oferece os ativos, mas atendimentos
 * antigos continuam mostrando os inativos que já usaram. O funcionário de
 * nível "nucleo" só enxerga os serviços do próprio núcleo.
 */
export async function listarServicosExternos(req: Request, res: Response) {
  let consulta = supabaseAdmin.from("servicos_externos").select("*").order("nome", { ascending: true });

  if (req.funcionario?.role === "nucleo") {
    // Sem núcleo cadastrado não vê nada (falha fechada).
    consulta = consulta.eq("nucleo_id", req.funcionario.nucleo_id ?? "00000000-0000-0000-0000-000000000000");
  } else {
    const filtro = z.string().uuid().safeParse(req.query.nucleo_id);
    if (filtro.success) consulta = consulta.eq("nucleo_id", filtro.data);
  }

  const { data, error } = await consulta;
  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os serviços externos." });
  }

  res.json(data);
}

/** POST /api/servicos-externos */
export async function criarServicoExterno(req: Request, res: Response) {
  const parse = criarServicoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { nucleo_id, nome } = parse.data;

  const { data: existente } = await supabaseAdmin
    .from("servicos_externos")
    .select("id")
    .eq("nucleo_id", nucleo_id)
    .ilike("nome", nome)
    .maybeSingle();
  if (existente) {
    return res.status(409).json({ erro: "Já existe um serviço externo com este nome neste núcleo." });
  }

  const { data, error } = await supabaseAdmin
    .from("servicos_externos")
    .insert({ nucleo_id, nome, ativo: true, criado_por: req.funcionario?.id ?? null })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar o serviço externo." });
  }

  res.status(201).json(data);
}

/** PUT /api/servicos-externos/:id — renomear e/ou ativar/desativar (não há exclusão: o histórico depende deles). */
export async function atualizarServicoExterno(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarServicoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };

  if (typeof atualizacoes.nome === "string") {
    const { data: atual, error: erroAtual } = await supabaseAdmin
      .from("servicos_externos")
      .select("nucleo_id")
      .eq("id", id)
      .maybeSingle();
    if (erroAtual) {
      console.error(erroAtual);
      return res.status(500).json({ erro: "Não foi possível atualizar o serviço externo." });
    }
    if (!atual) {
      return res.status(404).json({ erro: "Serviço externo não encontrado." });
    }

    const { data: existente } = await supabaseAdmin
      .from("servicos_externos")
      .select("id")
      .eq("nucleo_id", atual.nucleo_id)
      .ilike("nome", atualizacoes.nome)
      .neq("id", id)
      .maybeSingle();
    if (existente) {
      return res.status(409).json({ erro: "Já existe outro serviço externo com este nome neste núcleo." });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("servicos_externos")
    .update(atualizacoes)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o serviço externo." });
  }

  res.json(data);
}
