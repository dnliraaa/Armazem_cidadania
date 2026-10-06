import type { Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { cpfValido, somenteDigitos } from "../utils/cpf.js";

/** Níveis que atuam dentro de uma unidade (unidade_id obrigatório). */
const NIVEIS_COM_UNIDADE = ["recepcao", "nucleo", "infraestrutura"];

/**
 * CPF do funcionário: obrigatório e válido em todos os níveis, exceto
 * 'infraestrutura' (conta de aparelho, não de uma pessoa), onde pode ficar
 * vazio — mas, se informado, continua validado. Na edição (`parcial`), CPF
 * ausente significa "não alterar"; um CPF vazio só é aceito para infraestrutura.
 */
function validarCpfPorNivel(
  data: { cpf?: string | null; role?: string },
  ctx: z.RefinementCtx,
  parcial: boolean
) {
  const cpf = data.cpf?.trim() ?? "";
  if (!cpf) {
    const ausente = data.cpf === undefined || data.cpf === null;
    if (data.role !== "infraestrutura" && !(parcial && ausente)) {
      ctx.addIssue({ code: "custom", message: "Informe o CPF.", path: ["cpf"] });
    }
    return;
  }
  if (!cpfValido(cpf)) {
    ctx.addIssue({ code: "custom", message: "CPF inválido.", path: ["cpf"] });
  }
}

const criarFuncionarioSchema = z
  .object({
    nome: z.string().trim().min(3, "Informe o nome completo."),
    cpf: z.string().optional().nullable(),
    email: z.string().trim().email("E-mail inválido."),
    senha: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    role: z.enum(["admin", "recepcao", "nucleo", "infraestrutura"]).default("admin"),
    unidade_id: z.string().uuid("Unidade inválida.").nullable().optional(),
    nucleo_id: z.string().uuid("Núcleo inválido.").nullable().optional(),
  })
  .superRefine((data, ctx) => validarCpfPorNivel(data, ctx, false))
  .refine((data) => !NIVEIS_COM_UNIDADE.includes(data.role ?? "") || Boolean(data.unidade_id), {
    message: "Selecione a unidade para este nível.",
    path: ["unidade_id"],
  })
  .refine((data) => data.role !== "nucleo" || Boolean(data.nucleo_id), {
    message: "Selecione o núcleo para o nível núcleo.",
    path: ["nucleo_id"],
  });

const atualizarFuncionarioSchema = z
  .object({
    nome: z.string().trim().min(3).optional(),
    cpf: z.string().optional().nullable(),
    email: z.string().trim().email().optional(),
    ativo: z.boolean().optional(),
    role: z.enum(["admin", "recepcao", "nucleo", "infraestrutura"]).optional(),
    unidade_id: z.string().uuid("Unidade inválida.").nullable().optional(),
    nucleo_id: z.string().uuid("Núcleo inválido.").nullable().optional(),
  })
  .superRefine((data, ctx) => validarCpfPorNivel(data, ctx, true))
  .refine((data) => !NIVEIS_COM_UNIDADE.includes(data.role ?? "") || Boolean(data.unidade_id), {
    message: "Selecione a unidade para este nível.",
    path: ["unidade_id"],
  })
  .refine((data) => data.role !== "nucleo" || Boolean(data.nucleo_id), {
    message: "Selecione o núcleo para o nível núcleo.",
    path: ["nucleo_id"],
  });

const alterarSenhaSchema = z.object({
  novaSenha: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
});

/** GET /api/funcionarios */
export async function listarFuncionarios(_req: Request, res: Response) {
  // `unidades!funcionarios_unidade_id_fkey` desambigua o embed: há duas FKs
  // entre as tabelas (funcionarios.unidade_id -> unidades.id, e também
  // unidades.criado_por -> funcionarios.id), e o PostgREST recusa o embed
  // "unidades(nome)" simples por não saber qual delas usar.
  const { data, error } = await supabaseAdmin
    .from("funcionarios")
    .select(
      "id, nome, cpf, email, role, unidade_id, nucleo_id, ativo, created_at, updated_at, unidades!funcionarios_unidade_id_fkey(nome), nucleos!funcionarios_nucleo_id_fkey(nome)"
    )
    .order("nome", { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os funcionários." });
  }

  const funcionarios = (data ?? []).map(({ unidades, nucleos, ...f }) => ({
    ...f,
    unidade_nome: (unidades as unknown as { nome: string } | null)?.nome ?? null,
    nucleo_nome: (nucleos as unknown as { nome: string } | null)?.nome ?? null,
  }));

  res.json(funcionarios);
}

/** POST /api/funcionarios */
export async function criarFuncionario(req: Request, res: Response) {
  const parse = criarFuncionarioSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { nome, email, senha, role } = parse.data;
  // Infraestrutura pode não ter CPF: grava null (nunca string vazia, que colidiria no índice único).
  const cpf = parse.data.cpf?.trim() ? somenteDigitos(parse.data.cpf) : null;
  const unidadeId = NIVEIS_COM_UNIDADE.includes(role) ? parse.data.unidade_id ?? null : null;
  const nucleoId = role === "nucleo" ? parse.data.nucleo_id ?? null : null;

  // Verifica duplicidade de CPF antes de criar o usuário no Auth (só quando informado)
  if (cpf) {
    const { data: existente } = await supabaseAdmin
      .from("funcionarios")
      .select("id")
      .eq("cpf", cpf)
      .maybeSingle();

    if (existente) {
      return res.status(409).json({ erro: "Já existe um funcionário cadastrado com este CPF." });
    }
  }

  // 1) Cria o usuário no Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    const mensagem = authError?.message?.includes("already registered")
      ? "Já existe um usuário cadastrado com este e-mail."
      : authError?.message ?? "Não foi possível criar o usuário de autenticação.";
    return res.status(409).json({ erro: mensagem });
  }

  // 2) Cria o registro em public.funcionarios
  const { data: funcionario, error: erroFuncionario } = await supabaseAdmin
    .from("funcionarios")
    .insert({ id: authData.user.id, nome, cpf, email, role, unidade_id: unidadeId, nucleo_id: nucleoId, ativo: true })
    .select("id, nome, cpf, email, role, unidade_id, nucleo_id, ativo, created_at, updated_at")
    .single();

  if (erroFuncionario) {
    // Compensação: remove o usuário do Auth para não deixar órfão
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    console.error(erroFuncionario);
    return res.status(500).json({ erro: "Não foi possível salvar o cadastro do funcionário." });
  }

  res.status(201).json(funcionario);
}

/** PUT /api/funcionarios/:id */
export async function atualizarFuncionario(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarFuncionarioSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };

  // Cada nível só guarda o vínculo que lhe cabe (recepção → unidade, núcleo → unidade + núcleo).
  if (atualizacoes.role === "admin") {
    atualizacoes.unidade_id = null;
    atualizacoes.nucleo_id = null;
  } else if (atualizacoes.role === "recepcao" || atualizacoes.role === "infraestrutura") {
    atualizacoes.nucleo_id = null;
  }

  // CPF vazio (só possível para infraestrutura) vira null; ausente = não altera.
  if ("cpf" in atualizacoes && !(atualizacoes.cpf as string | null | undefined)?.trim()) {
    atualizacoes.cpf = null;
  }

  if (atualizacoes.cpf) {
    atualizacoes.cpf = somenteDigitos(parse.data.cpf as string);

    const { data: existente } = await supabaseAdmin
      .from("funcionarios")
      .select("id")
      .eq("cpf", atualizacoes.cpf)
      .neq("id", id)
      .maybeSingle();

    if (existente) {
      return res.status(409).json({ erro: "Já existe outro funcionário cadastrado com este CPF." });
    }
  }

  // Se o e-mail mudou, atualiza também no Supabase Auth
  if (atualizacoes.email) {
    const { error: erroAuthUpdate } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: atualizacoes.email as string,
    });
    if (erroAuthUpdate) {
      return res.status(500).json({ erro: "Não foi possível atualizar o e-mail de login." });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("funcionarios")
    .update(atualizacoes)
    .eq("id", id)
    .select("id, nome, cpf, email, role, unidade_id, nucleo_id, ativo, created_at, updated_at")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o funcionário." });
  }

  res.json(data);
}

/** PUT /api/funcionarios/:id/senha */
export async function alterarSenhaFuncionario(req: Request, res: Response) {
  const { id } = req.params;
  const parse = alterarSenhaSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    password: parse.data.novaSenha,
  });

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível alterar a senha." });
  }

  res.json({ ok: true });
}

/**
 * POST /api/funcionarios/:id/ativar — reativa um funcionário desativado.
 * Desfaz os dois efeitos de `removerFuncionario`: libera o login no Auth
 * (remove o banimento) e volta `ativo` para true.
 */
export async function ativarFuncionario(req: Request, res: Response) {
  const { id } = req.params;

  // Primeiro libera o login: se falhar, o cadastro não fica "ativo" com login bloqueado.
  const { error: erroAuth } = await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (erroAuth) {
    console.error(erroAuth);
    return res.status(500).json({ erro: "Não foi possível liberar o login do funcionário." });
  }

  const { data, error } = await supabaseAdmin
    .from("funcionarios")
    .update({ ativo: true })
    .eq("id", id)
    .select("id, nome, cpf, email, role, unidade_id, nucleo_id, ativo, created_at, updated_at")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível ativar o funcionário." });
  }
  if (!data) {
    return res.status(404).json({ erro: "Funcionário não encontrado." });
  }

  res.json(data);
}

/** DELETE /api/funcionarios/:id */
export async function removerFuncionario(req: Request, res: Response) {
  const { id } = req.params;

  if (req.funcionario?.id === id) {
    return res.status(400).json({ erro: "Você não pode remover seu próprio usuário." });
  }

  // Em vez de apagar de vez, desativa o funcionário (soft delete) e
  // também desativa o login no Auth. Preserva o histórico de cadastros.
  const { error } = await supabaseAdmin
    .from("funcionarios")
    .update({ ativo: false })
    .eq("id", id);

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível desativar o funcionário." });
  }

  await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: "876000h" });

  res.json({ ok: true });
}
