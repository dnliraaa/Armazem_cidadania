import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { contextoDe } from "../middleware/contexto.js";
import type { ContextoModulo } from "../types/index.js";
import { cpfValido, somenteDigitos } from "../utils/cpf.js";
import { aplicarEscopo, escopoInsert, pertenceAoContexto, podeEscrever } from "../utils/escopo.js";
import {
  apagarPendentes,
  camposFicha,
  criarPendentesDestino,
  NOMES_CAMPOS_FICHA,
  normalizarEstado,
  validarEstado,
  type EntradaFicha,
  type EstadoFicha,
} from "../utils/ficha.js";

const statusSchema = z.enum(["pendente_revisao", "em_atendimento", "confirmado", "rejeitado"]);

/** Data de hoje no formato YYYY-MM-DD (mesmo formato aceito pela coluna `date` do Postgres). */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Um funcionário de nível "nucleo" só enxerga/atende a fila do próprio
 * núcleo (mesmo padrão de `unidadeDoFuncionario` na fila da recepção).
 */
function nucleoDoFuncionario(req: Request): string | null {
  return req.funcionario?.role === "nucleo" ? req.funcionario.nucleo_id : null;
}

/** UUID que nunca existe: faz o filtro por unidade não casar com nada quando o cadastro do funcionário está incompleto. */
const UNIDADE_INEXISTENTE = "00000000-0000-0000-0000-000000000000";

/**
 * Funcionário "nucleo" atua em um núcleo DENTRO de uma unidade: só vê os
 * encaminhamentos/atendimentos da recepção da mesma unidade. Sem unidade
 * cadastrada, não vê nada (falha fechada).
 */
function unidadeDoFuncionarioNucleo(req: Request): string | null {
  // No Itinerante não há unidade: o recorte é a ação do contexto (`aplicarEscopo`).
  if (contextoDe(req).modulo === "itinerante") return null;
  return req.funcionario?.role === "nucleo" ? req.funcionario.unidade_id ?? UNIDADE_INEXISTENTE : null;
}

/**
 * Para rotas `/pendentes/:id`: o pendente precisa pertencer ao módulo/ação do
 * contexto (um id de outro módulo é tratado como inexistente — nada vaza entre
 * Armazém e Itinerante). Um funcionário "nucleo" só pode mexer em pendentes do
 * próprio núcleo (e, no Armazém, da própria unidade). Com `respeitarChamador`,
 * também bloqueia pendentes que estão em atendimento por outro funcionário.
 */
function exigirPendenteDoNucleo(respeitarChamador: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { data: pendente, error } = await supabaseAdmin
      .from("atendimentos_pendentes")
      .select("modulo, acao_itinerante_id, nucleo_id, unidade_id, status, chamado_por")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      return res.status(500).json({ erro: "Não foi possível consultar o atendimento pendente." });
    }
    if (!pendente || !pertenceAoContexto(pendente, contextoDe(req))) {
      return res.status(404).json({ erro: "Atendimento pendente não encontrado." });
    }

    if (req.funcionario?.role !== "nucleo") return next();

    const unidadeEsperada = unidadeDoFuncionarioNucleo(req);
    if (
      pendente.nucleo_id !== req.funcionario.nucleo_id ||
      (unidadeEsperada !== null && pendente.unidade_id !== unidadeEsperada)
    ) {
      return res.status(404).json({ erro: "Atendimento pendente não encontrado." });
    }
    if (respeitarChamador && pendente.status === "em_atendimento" && pendente.chamado_por !== req.funcionario.id) {
      return res.status(409).json({ erro: "Este atendimento está sendo feito por outro funcionário." });
    }
    next();
  };
}

/** Rotas `/pendentes/:id` de leitura/edição/confirmação/rejeição/liberação. */
export const exigirPendenteAcessivel = exigirPendenteDoNucleo(true);
/** Rota de chamar: só confere o núcleo (o "travamento" é feito atomicamente no update). */
export const exigirPendenteDoMeuNucleo = exigirPendenteDoNucleo(false);

/**
 * Calcula os problemas objetivos de um atendimento pendente. Não considera
 * `erro_ignorado` — só aponta o que está errado; quem decide se isso barra a
 * confirmação é quem chama esta função.
 */
function calcularErros(pendente: {
  validacoes: unknown;
  cpf_texto: string | null;
  cidadao_id: string | null;
  nome: string | null;
  demanda_principal_id: string | null;
  outras_demandas: string[] | null;
}): string[] {
  const erros: string[] = [];

  const validacoes = pendente.validacoes as { cpfValido?: boolean } | null;
  if (validacoes?.cpfValido === false) {
    erros.push("cpf_invalido");
  }
  if (pendente.cpf_texto && !pendente.cidadao_id) {
    erros.push("cidadao_nao_encontrado");
  }
  if (!pendente.nome || !pendente.nome.trim()) {
    erros.push("nome_vazio");
  }
  const temPrincipal = Boolean(pendente.demanda_principal_id);
  const temOutras = Array.isArray(pendente.outras_demandas) && pendente.outras_demandas.length > 0;
  if (!temPrincipal && !temOutras) {
    erros.push("sem_demanda");
  }

  return erros;
}

const ERRO_LABELS: Record<string, string> = {
  cpf_invalido: "CPF inválido",
  cidadao_nao_encontrado: "cidadão não cadastrado",
  nome_vazio: "nome em branco",
  sem_demanda: "nenhuma demanda selecionada",
};

function descreverErros(erros: string[]): string {
  return erros.map((codigo) => ERRO_LABELS[codigo] ?? codigo).join(", ");
}

/** Busca nomes de núcleos/demandas em lote e devolve mapas id -> nome, para enriquecer listagens sem depender de embeds do PostgREST. */
async function buscarMapasNomes(nucleoIds: string[], demandaIds: string[]) {
  const [{ data: nucleos }, { data: demandas }] = await Promise.all([
    nucleoIds.length
      ? supabaseAdmin.from("nucleos").select("id, nome").in("id", nucleoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    demandaIds.length
      ? supabaseAdmin.from("demandas").select("id, nome").in("id", demandaIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);

  return {
    nucleoMap: new Map((nucleos ?? []).map((n) => [n.id, n.nome])),
    demandaMap: new Map((demandas ?? []).map((d) => [d.id, d.nome])),
  };
}

/**
 * GET /api/atendimentos/pendentes?status=pendente_revisao[,em_atendimento]&nucleo_id=&encaminhados=1
 *
 * `encaminhados=1` restringe aos pendentes encaminhados pela recepção ou por
 * outro núcleo (`encaminhado = true`, com ou sem senha; os lançamentos manuais
 * de papel não são) — é a fila do núcleo. Funcionário de nível "nucleo" sempre
 * vê só o próprio núcleo e só encaminhamentos. Sempre restrito ao módulo (e,
 * no Itinerante, à ação) do contexto.
 */
export async function listarPendentes(req: Request, res: Response) {
  const statusPedidos = (typeof req.query.status === "string" ? req.query.status : "pendente_revisao")
    .split(",")
    .map((s) => statusSchema.safeParse(s.trim()))
    .flatMap((p) => (p.success ? [p.data] : []));
  const statusFiltro = statusPedidos.length > 0 ? statusPedidos : ["pendente_revisao"];

  const nucleoDoUsuario = nucleoDoFuncionario(req);
  const nucleoFiltro = nucleoDoUsuario ?? (z.string().uuid().safeParse(req.query.nucleo_id).data ?? null);

  let consulta = aplicarEscopo(supabaseAdmin.from("atendimentos_pendentes").select("*"), contextoDe(req))
    .in("status", statusFiltro)
    .order("created_at", { ascending: true });
  if (nucleoFiltro) consulta = consulta.eq("nucleo_id", nucleoFiltro);
  const unidadeDoUsuario = unidadeDoFuncionarioNucleo(req);
  if (unidadeDoUsuario) consulta = consulta.eq("unidade_id", unidadeDoUsuario);
  if (nucleoDoUsuario || req.query.encaminhados === "1") consulta = consulta.eq("encaminhado", true);

  const { data: pendentes, error } = await consulta;

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os atendimentos pendentes." });
  }

  const nucleoIds = [...new Set((pendentes ?? []).map((p) => p.nucleo_id))];
  const demandaIds = [
    ...new Set(
      (pendentes ?? []).flatMap((p) => [p.demanda_principal_id, ...(p.outras_demandas ?? [])].filter(Boolean))
    ),
  ];
  const { nucleoMap, demandaMap } = await buscarMapasNomes(nucleoIds, demandaIds);

  const resultado = (pendentes ?? []).map((p) => ({
    ...p,
    nucleo_nome: nucleoMap.get(p.nucleo_id) ?? null,
    demanda_principal_nome: p.demanda_principal_id ? demandaMap.get(p.demanda_principal_id) ?? null : null,
    outras_demandas_nomes: (p.outras_demandas ?? [])
      .map((demandaId: string) => demandaMap.get(demandaId))
      .filter((nome: string | undefined): nome is string => Boolean(nome)),
    erros: calcularErros(p),
  }));

  res.json(resultado);
}

const criarPendenteManualSchema = z.object({
  nucleo_id: z.string().uuid("Selecione um núcleo."),
  cpf_texto: z.string().trim().optional().or(z.literal("")),
  demanda_principal_id: z.string().uuid().optional().nullable(),
  outras_demandas: z.array(z.string().uuid()).optional().default([]),
  resolvida: z.boolean().optional().default(false),
  houve_encaminhamento: z.boolean().optional().default(false),
  data_atendimento: z.string().trim().optional().or(z.literal("")),
});

/** Busca um cidadão pelo CPF (dígitos), devolvendo { id, nome } ou null. */
async function buscarCidadaoPorCpf(cpfTexto: string) {
  const cpfDigitos = somenteDigitos(cpfTexto);
  if (!cpfDigitos) return null;
  const { data } = await supabaseAdmin.from("cidadaos").select("id, nome").eq("cpf", cpfDigitos).maybeSingle();
  return data ?? null;
}

/** POST /api/atendimentos/pendentes (cadastro manual) */
export async function criarPendenteManual(req: Request, res: Response) {
  const parse = criarPendenteManualSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const ctx = contextoDe(req);
  if (!podeEscrever(ctx)) {
    return res.status(400).json({ erro: "Selecione uma ação itinerante.", codigo: "ACAO_OBRIGATORIA" });
  }
  const { nucleo_id, demanda_principal_id, outras_demandas, resolvida, houve_encaminhamento } = parse.data;
  const cpfTexto = parse.data.cpf_texto?.trim() || null;

  let cidadaoId: string | null = null;
  let nome: string | null = null;
  // Só sinaliza a validação do dígito verificador — não bloqueia o
  // cadastro, já que o CPF pode ter sido escrito errado no papel e isso
  // será conferido/corrigido na revisão.
  let validacoes: Record<string, unknown> | null = null;

  if (cpfTexto) {
    const cidadao = await buscarCidadaoPorCpf(cpfTexto);
    if (cidadao) {
      cidadaoId = cidadao.id;
      nome = cidadao.nome;
    }
    validacoes = { cpfValido: cpfValido(cpfTexto) };
  }

  const { data, error } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .insert({
      origem: "manual",
      nucleo_id,
      cpf_texto: cpfTexto,
      cidadao_id: cidadaoId,
      nome,
      demanda_principal_id: demanda_principal_id ?? null,
      outras_demandas,
      resolvida,
      houve_encaminhamento,
      validacoes,
      data_atendimento: parse.data.data_atendimento?.trim() || hoje(),
      status: "pendente_revisao",
      criado_por: req.funcionario?.id ?? null,
      ...escopoInsert(ctx),
    })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível cadastrar o atendimento pendente." });
  }

  res.status(201).json({ ...data, erros: calcularErros(data) });
}

const atualizarPendenteSchema = z.object({
  nome: z.string().trim().optional().nullable(),
  cpf_texto: z.string().trim().optional().nullable(),
  demanda_principal_id: z.string().uuid().optional().nullable(),
  outras_demandas: z.array(z.string().uuid()).optional(),
  resolvida: z.boolean().optional().nullable(),
  houve_encaminhamento: z.boolean().optional().nullable(),
  data_atendimento: z.string().trim().optional().nullable(),
  erro_ignorado: z.boolean().optional(),
});

/** PUT /api/atendimentos/pendentes/:id */
export async function atualizarPendente(req: Request, res: Response) {
  const { id } = req.params;
  const parse = atualizarPendenteSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const atualizacoes: Record<string, unknown> = { ...parse.data };

  // Sempre que o CPF é alterado, tenta buscar o cidadão de novo e só
  // sobrescreve nome/cidadao_id quando encontra alguém — senão mantém o
  // nome que o funcionário já tiver digitado na revisão.
  if ("cpf_texto" in atualizacoes) {
    const cpfTexto = (atualizacoes.cpf_texto as string | null)?.trim() || null;
    atualizacoes.cpf_texto = cpfTexto;

    if (cpfTexto) {
      const cidadao = await buscarCidadaoPorCpf(cpfTexto);
      if (cidadao) {
        atualizacoes.cidadao_id = cidadao.id;
        atualizacoes.nome = cidadao.nome;
      } else {
        atualizacoes.cidadao_id = null;
      }

      // Recalcula o dígito verificador e mescla dentro de validacoes,
      // preservando outras chaves que já existam nesse jsonb. Não bloqueia
      // a atualização se o CPF for inválido — só sinaliza para a revisão.
      const { data: atual } = await supabaseAdmin
        .from("atendimentos_pendentes")
        .select("validacoes")
        .eq("id", id)
        .maybeSingle();
      const validacoesAtuais = (atual?.validacoes as Record<string, unknown> | null) ?? {};
      atualizacoes.validacoes = { ...validacoesAtuais, cpfValido: cpfValido(cpfTexto) };
    } else {
      atualizacoes.cidadao_id = null;
    }
  }

  const { data, error } = await aplicarEscopo(
    supabaseAdmin.from("atendimentos_pendentes").update(atualizacoes),
    contextoDe(req)
  )
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível atualizar o atendimento pendente." });
  }

  res.json({ ...data, erros: calcularErros(data) });
}

type ResultadoConfirmacao =
  | { ok: true; atendimento: unknown }
  | { ok: false; status: number; mensagem: string; erros: string[] };

/** Confirma um pendente: cria o atendimento definitivo e marca o pendente como confirmado. */
async function confirmarPendentePorId(
  id: string,
  funcionarioId: string | null,
  descricao: string | null = null,
  ficha: EntradaFicha | null = null,
  ctx: ContextoModulo = { modulo: "armazem", acaoId: null }
): Promise<ResultadoConfirmacao> {
  // Escopado pelo contexto: o id de um pendente de outro módulo/ação é tratado como inexistente.
  const { data: pendente, error: erroPendente } = await aplicarEscopo(
    supabaseAdmin.from("atendimentos_pendentes").select("*"),
    ctx
  )
    .eq("id", id)
    .maybeSingle();

  if (erroPendente) {
    console.error(erroPendente);
    return { ok: false, status: 500, mensagem: "Não foi possível consultar o atendimento pendente.", erros: [] };
  }
  if (!pendente) {
    return { ok: false, status: 404, mensagem: "Atendimento pendente não encontrado.", erros: [] };
  }

  const erros = calcularErros(pendente);
  if (erros.length > 0 && !pendente.erro_ignorado) {
    return {
      ok: false,
      status: 400,
      mensagem: `Não é possível confirmar: ${descreverErros(erros)}. Corrija os campos ou marque para ignorar o alerta.`,
      erros,
    };
  }

  // Nova ficha do núcleo (resolvida + motivo, encaminhamentos externos e internos).
  // Sem ela (confirmação do fluxo de papel, em lote), vale o comportamento antigo.
  let estado: EstadoFicha | null = null;
  if (ficha) {
    estado = normalizarEstado({
      resolvida: ficha.resolvida ?? false,
      motivo: ficha.motivo_nao_resolvida,
      externo: ficha.houve_encaminhamento_externo ?? false,
      servicosIds: ficha.servicos_externos_ids,
      outros: ficha.encaminhamento_externo_outros,
      interno: ficha.houve_encaminhamento_interno ?? false,
      destinosIds: ficha.nucleos_destino_ids,
    });
    const erroFicha = await validarEstado(estado, pendente.nucleo_id);
    if (erroFicha) {
      return { ok: false, status: 400, mensagem: erroFicha, erros: [] };
    }
    // No Armazém o encaminhamento interno precisa de unidade; no Itinerante a ação faz esse papel.
    if (estado.interno && pendente.modulo === "armazem" && !pendente.unidade_id) {
      return {
        ok: false,
        status: 400,
        mensagem: "Este atendimento não tem unidade; não é possível encaminhar para outro núcleo.",
        erros: [],
      };
    }
  }

  // Primeiro cria as solicitações dos núcleos de destino: se falhar, nada foi concluído ainda.
  let pendentesGerados = new Map<string, string>();
  if (estado?.interno) {
    const criados = await criarPendentesDestino({
      cidadaoId: pendente.cidadao_id,
      unidadeId: pendente.unidade_id ?? null,
      // A solicitação gerada fica no MESMO módulo (e na mesma ação) do atendimento de origem.
      escopo: { modulo: pendente.modulo, acao_itinerante_id: pendente.acao_itinerante_id ?? null },
      prioridade: Boolean(pendente.prioridade),
      destinosIds: estado.destinosIds,
      funcionarioId,
    });
    if (!criados.ok) {
      return { ok: false, status: 500, mensagem: criados.erro, erros: [] };
    }
    pendentesGerados = criados.ids;
  }

  const { data: atendimento, error: erroAtendimento } = await supabaseAdmin
    .from("atendimentos")
    .insert({
      cidadao_id: pendente.cidadao_id,
      nucleo_id: pendente.nucleo_id,
      demanda_principal_id: pendente.demanda_principal_id,
      outras_demandas: pendente.outras_demandas ?? [],
      resolvida: estado ? estado.resolvida : pendente.resolvida ?? false,
      // Coluna antiga: só vale para registros antigos; a nova ficha usa os campos externo/interno.
      houve_encaminhamento: estado ? false : pendente.houve_encaminhamento ?? false,
      ...(estado
        ? {
            motivo_nao_resolvida: estado.motivo,
            houve_encaminhamento_externo: estado.externo,
            encaminhamento_externo_outros: estado.outros,
            houve_encaminhamento_interno: estado.interno,
          }
        : {}),
      origem: pendente.origem,
      atendido_por: funcionarioId,
      pendente_id: pendente.id,
      unidade_id: pendente.unidade_id ?? null,
      modulo: pendente.modulo,
      acao_itinerante_id: pendente.acao_itinerante_id ?? null,
      descricao,
      data_atendimento: pendente.data_atendimento,
    })
    .select("*")
    .single();

  if (erroAtendimento) {
    console.error(erroAtendimento);
    await apagarPendentes([...pendentesGerados.values()]);
    return { ok: false, status: 500, mensagem: "Não foi possível confirmar o atendimento.", erros: [] };
  }

  // Desfaz a conclusão (atendimento + solicitações geradas) se uma etapa seguinte falhar.
  async function desfazerConclusao() {
    const { error } = await supabaseAdmin.from("atendimentos").delete().eq("id", atendimento.id);
    if (error) console.error(error);
    await apagarPendentes([...pendentesGerados.values()]);
  }

  if (estado) {
    if (estado.servicosIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("atendimento_servicos_externos")
        .insert(estado.servicosIds.map((servicoId) => ({ atendimento_id: atendimento.id, servico_id: servicoId })));
      if (error) {
        console.error(error);
        await desfazerConclusao();
        return { ok: false, status: 500, mensagem: "Não foi possível gravar os serviços externos.", erros: [] };
      }
    }
    if (estado.destinosIds.length > 0) {
      const { error } = await supabaseAdmin.from("atendimento_encaminhamentos_internos").insert(
        estado.destinosIds.map((nucleoDestinoId) => ({
          atendimento_id: atendimento.id,
          nucleo_destino_id: nucleoDestinoId,
          pendente_gerado_id: pendentesGerados.get(nucleoDestinoId) ?? null,
        }))
      );
      if (error) {
        console.error(error);
        await desfazerConclusao();
        return { ok: false, status: 500, mensagem: "Não foi possível gravar os encaminhamentos internos.", erros: [] };
      }
    }
  }

  const { error: erroUpdate } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .update({ status: "confirmado", revisado_por: funcionarioId, revisado_em: new Date().toISOString() })
    .eq("id", id);

  if (erroUpdate) {
    console.error(erroUpdate);
    // Com a nova ficha a conclusão é desfeita por inteiro; no fluxo antigo mantém o comportamento anterior.
    if (estado) {
      await desfazerConclusao();
      return { ok: false, status: 500, mensagem: "Não foi possível concluir o atendimento.", erros: [] };
    }
    return {
      ok: false,
      status: 500,
      mensagem: "Atendimento criado, mas não foi possível atualizar o status do pendente.",
      erros: [],
    };
  }

  return { ok: true, atendimento };
}

/** Descrição livre e opcional de como foi o atendimento. */
const descricaoSchema = z.string().trim().max(5000, "A descrição é longa demais (máximo de 5000 caracteres).");

const confirmarSchema = z.object({ descricao: descricaoSchema.optional().nullable(), ...camposFicha });

/**
 * POST /api/atendimentos/pendentes/:id/confirmar  { descricao?, resolvida?, motivo_nao_resolvida?,
 *   houve_encaminhamento_externo?, servicos_externos_ids?, encaminhamento_externo_outros?,
 *   houve_encaminhamento_interno?, nucleos_destino_ids? }
 *
 * Com `resolvida` informada, aplica a nova ficha do núcleo (validações e
 * encaminhamentos); sem ela, confirma como no fluxo antigo.
 */
export async function confirmarPendente(req: Request, res: Response) {
  const { id } = req.params;
  const parse = confirmarSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { descricao, ...ficha } = parse.data;
  const resultado = await confirmarPendentePorId(
    id,
    req.funcionario?.id ?? null,
    descricao || null,
    ficha.resolvida === undefined ? null : ficha,
    contextoDe(req)
  );

  if (!resultado.ok) {
    return res.status(resultado.status).json({ erro: resultado.mensagem, erros: resultado.erros });
  }

  res.status(201).json(resultado.atendimento);
}

const confirmarLoteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Selecione ao menos um atendimento."),
});

/** POST /api/atendimentos/pendentes/confirmar-lote */
export async function confirmarLote(req: Request, res: Response) {
  if (req.funcionario?.role === "nucleo") {
    return res.status(403).json({ erro: "Sem permissão para confirmar em lote." });
  }
  const parse = confirmarLoteSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const confirmados: string[] = [];
  const bloqueados: { id: string; erros: string[]; mensagem: string }[] = [];

  for (const id of parse.data.ids) {
    const resultado = await confirmarPendentePorId(id, req.funcionario?.id ?? null, null, null, contextoDe(req));
    if (resultado.ok) {
      confirmados.push(id);
    } else {
      bloqueados.push({ id, erros: resultado.erros, mensagem: resultado.mensagem });
    }
  }

  res.json({ confirmados, bloqueados });
}

/** POST /api/atendimentos/pendentes/:id/rejeitar */
export async function rejeitarPendente(req: Request, res: Response) {
  const { id } = req.params;

  const { data, error } = await aplicarEscopo(
    supabaseAdmin.from("atendimentos_pendentes").update({
      status: "rejeitado",
      revisado_por: req.funcionario?.id ?? null,
      revisado_em: new Date().toISOString(),
    }),
    contextoDe(req)
  )
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível rejeitar o atendimento pendente." });
  }

  res.json(data);
}

/**
 * De onde vem um atendimento iniciado na recepção: de uma senha 'chamada' ou
 * direto (sem senha). Em ambos os casos devolve a unidade onde ele acontece.
 *   - Com senha: valida que está 'chamada', na unidade da recepção, e herda a unidade dela.
 *   - Sem senha: a unidade vem do cadastro do funcionário logado.
 */
async function resolverOrigemRecepcao(
  req: Request,
  senhaId: string | null | undefined
): Promise<{ ok: true; senhaId: string | null; unidadeId: string | null } | { ok: false; status: number; erro: string }> {
  const ctx = contextoDe(req);
  const itinerante = ctx.modulo === "itinerante";

  if (!senhaId) {
    // No Itinerante não há unidade (a ação do contexto faz esse papel).
    if (itinerante) return { ok: true, senhaId: null, unidadeId: null };

    const unidadeId = req.funcionario?.unidade_id ?? null;
    if (!unidadeId) {
      return {
        ok: false,
        status: 400,
        erro: "Seu cadastro não tem unidade vinculada. Peça a um administrador para informar a unidade.",
      };
    }
    return { ok: true, senhaId: null, unidadeId };
  }

  // A senha precisa ser do módulo/ação do contexto (um id de outro módulo é tratado como inexistente).
  const { data: senha, error } = await aplicarEscopo(supabaseAdmin.from("senhas").select("id, status, unidade_id"), ctx)
    .eq("id", senhaId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return { ok: false, status: 500, erro: "Não foi possível consultar a senha." };
  }
  // Recepção só atua na fila da própria unidade (mesma regra de /api/fila) — no Armazém.
  if (
    !senha ||
    (!itinerante && req.funcionario?.role === "recepcao" && senha.unidade_id !== req.funcionario.unidade_id)
  ) {
    return { ok: false, status: 404, erro: "Senha não encontrada." };
  }
  if (senha.status !== "chamada") {
    return { ok: false, status: 409, erro: "A senha precisa estar com status 'chamada' para iniciar o atendimento." };
  }
  return { ok: true, senhaId: senha.id, unidadeId: senha.unidade_id };
}

/** Marca a senha como atendida só se ainda estiver 'chamada' (protege contra duplo clique). */
async function marcarSenhaAtendida(
  senhaId: string,
  ctx: ContextoModulo
): Promise<{ ok: true } | { ok: false; status: number; erro: string }> {
  const { data, error } = await aplicarEscopo(
    supabaseAdmin.from("senhas").update({ status: "atendida", atendida_em: new Date().toISOString() }),
    ctx
  )
    .eq("id", senhaId)
    .eq("status", "chamada")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(error);
    return { ok: false, status: 500, erro: "Não foi possível marcar a senha como atendida." };
  }
  if (!data) {
    return { ok: false, status: 409, erro: "A senha já foi atualizada por outra ação. Recarregue a fila." };
  }
  return { ok: true };
}

const encaminharSchema = z.object({
  // Opcional: a recepção também inicia atendimentos sem senha (totem/painel fora de uso).
  senha_id: z.string().uuid("Senha inválida.").optional().nullable(),
  cidadao_id: z.string().uuid("Cidadão inválido."),
  nucleo_id: z.string().uuid("Selecione o núcleo de destino."),
  prioridade: z.boolean().optional().default(false),
});

/**
 * POST /api/atendimentos/encaminhar  { senha_id?, cidadao_id, nucleo_id, prioridade }
 *
 * A recepção identificou o cidadão e o encaminha a um núcleo: cria um
 * registro leve em `atendimentos_pendentes` (fila do núcleo). Demanda,
 * resolvida etc. só são preenchidos depois, pelo núcleo, ao confirmar o
 * pendente (que aí vira `atendimentos`).
 *
 * Com `senha_id`, a senha chamada é marcada como atendida e o pendente herda a
 * unidade dela; sem, nenhuma senha é tocada e a unidade vem do funcionário.
 * O Supabase JS não expõe transação, então a ordem é: cria o pendente,
 * depois marca a senha; se essa 2ª etapa falhar, o pendente recém-criado é
 * removido, evitando um encaminhamento duplicado ou uma senha atendida sem encaminhamento.
 */
export async function encaminharAtendimento(req: Request, res: Response) {
  const parse = encaminharSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { senha_id, cidadao_id, nucleo_id, prioridade } = parse.data;

  const ctx = contextoDe(req);
  if (!podeEscrever(ctx)) {
    return res.status(400).json({ erro: "Selecione uma ação itinerante.", codigo: "ACAO_OBRIGATORIA" });
  }
  const origem = await resolverOrigemRecepcao(req, senha_id);
  if (!origem.ok) {
    return res.status(origem.status).json({ erro: origem.erro });
  }

  const { data: nucleo } = await supabaseAdmin
    .from("nucleos")
    .select("id, ativo")
    .eq("id", nucleo_id)
    .maybeSingle();
  if (!nucleo || !nucleo.ativo) {
    return res.status(400).json({ erro: "Núcleo inválido ou inativo." });
  }

  const { data: cidadao, error: erroCidadao } = await supabaseAdmin
    .from("cidadaos")
    .select("id, nome, cpf")
    .eq("id", cidadao_id)
    .maybeSingle();

  if (erroCidadao) {
    console.error(erroCidadao);
    return res.status(500).json({ erro: "Não foi possível consultar o cidadão." });
  }
  if (!cidadao) {
    return res.status(404).json({ erro: "Cidadão não encontrado." });
  }

  // nome/cpf_texto vêm do cidadão para o pendente já passar nas validações de
  // "cidadão identificado" (calcularErros) e aparecer com nome na fila.
  const { data: pendente, error: erroPendente } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .insert({
      origem: "manual",
      cidadao_id,
      nome: cidadao.nome,
      cpf_texto: cidadao.cpf,
      validacoes: cidadao.cpf ? { cpfValido: cpfValido(cidadao.cpf) } : null,
      nucleo_id,
      prioridade,
      senha_id: origem.senhaId,
      unidade_id: origem.unidadeId,
      outras_demandas: [],
      resolvida: false,
      houve_encaminhamento: false,
      data_atendimento: hoje(),
      status: "pendente_revisao",
      criado_por: req.funcionario?.id ?? null,
      // Encaminhamento da recepção: é o que a fila do núcleo lista.
      encaminhado: true,
      ...escopoInsert(ctx),
    })
    .select("*")
    .single();

  if (erroPendente || !pendente) {
    console.error(erroPendente);
    return res.status(500).json({ erro: "Não foi possível criar o encaminhamento." });
  }

  if (origem.senhaId) {
    const marcada = await marcarSenhaAtendida(origem.senhaId, ctx);
    if (!marcada.ok) {
      const { error: erroDesfazer } = await supabaseAdmin.from("atendimentos_pendentes").delete().eq("id", pendente.id);
      if (erroDesfazer) console.error(erroDesfazer);
      return res.status(marcada.status).json({ erro: marcada.erro });
    }
  }

  res.status(201).json({ ...pendente, erros: calcularErros(pendente) });
}

/**
 * GET /api/atendimentos/pendentes/proxima-sugestao?nucleo_id=
 *
 * Decide quem o núcleo deve chamar a seguir, sem chamar ainda. Mesma
 * alternância 1:1 da fila de senhas (`proximaSenhaSugerida`), trocando
 * normal/prioritária pelo boolean `prioridade`:
 *   1. Só um dos grupos esperando → sugere o mais antigo dele (ou null).
 *   2. Os dois esperando e o prioritário chegou antes do normal → prioritário.
 *   3. Senão, se já foi chamado ao menos 1 não-prioritário hoje desde o
 *      último prioritário chamado → prioritário; senão o normal.
 * Considera só encaminhamentos da recepção (com `unidade_id`) ainda 'pendente_revisao'.
 */
export async function proximaSugestaoPendente(req: Request, res: Response) {
  const nucleoId = nucleoDoFuncionario(req) ?? (z.string().uuid().safeParse(req.query.nucleo_id).data ?? null);
  if (!nucleoId) {
    return res.status(400).json({ erro: "Informe o núcleo." });
  }

  // Funcionário "nucleo" só enxerga a fila da própria unidade; as contagens da
  // alternância abaixo usam o mesmo recorte.
  const unidadeId = unidadeDoFuncionarioNucleo(req);

  const ctx = contextoDe(req);

  const maisAntigo = (prioridade: boolean) => {
    let consulta = aplicarEscopo(supabaseAdmin.from("atendimentos_pendentes").select("*"), ctx)
      .eq("nucleo_id", nucleoId)
      .eq("status", "pendente_revisao")
      .eq("prioridade", prioridade)
      .eq("encaminhado", true)
      .order("created_at", { ascending: true })
      .limit(1);
    if (unidadeId) consulta = consulta.eq("unidade_id", unidadeId);
    return consulta;
  };

  const [{ data: prioritarioArr, error: e1 }, { data: normalArr, error: e2 }] = await Promise.all([
    maisAntigo(true),
    maisAntigo(false),
  ]);
  if (e1 || e2) {
    console.error(e1 ?? e2);
    return res.status(500).json({ erro: "Não foi possível calcular o próximo atendimento." });
  }

  const prioritario = prioritarioArr?.[0] ?? null;
  const normal = normalArr?.[0] ?? null;

  if (!prioritario) return res.json({ sugestao: normal });
  if (!normal) return res.json({ sugestao: prioritario });

  if (new Date(prioritario.created_at).getTime() < new Date(normal.created_at).getTime()) {
    return res.json({ sugestao: prioritario });
  }

  const inicioDoDia = `${hoje()}T00:00:00.000Z`;

  let consultaUltimoPrioritario = aplicarEscopo(supabaseAdmin.from("atendimentos_pendentes").select("chamado_em"), ctx)
    .eq("nucleo_id", nucleoId)
    .eq("prioridade", true)
    .gte("chamado_em", inicioDoDia)
    .order("chamado_em", { ascending: false })
    .limit(1);
  if (unidadeId) consultaUltimoPrioritario = consultaUltimoPrioritario.eq("unidade_id", unidadeId);
  const { data: ultimoPrioritarioChamado, error: e3 } = await consultaUltimoPrioritario;
  if (e3) {
    console.error(e3);
    return res.status(500).json({ erro: "Não foi possível calcular o próximo atendimento." });
  }

  const desde = ultimoPrioritarioChamado?.[0]?.chamado_em ?? inicioDoDia;

  let consultaNormaisChamadas = aplicarEscopo(
    supabaseAdmin.from("atendimentos_pendentes").select("id", { count: "exact", head: true }),
    ctx
  )
    .eq("nucleo_id", nucleoId)
    .eq("prioridade", false)
    .gt("chamado_em", desde);
  if (unidadeId) consultaNormaisChamadas = consultaNormaisChamadas.eq("unidade_id", unidadeId);
  const { count: normaisChamadasDepois, error: e4 } = await consultaNormaisChamadas;
  if (e4) {
    console.error(e4);
    return res.status(500).json({ erro: "Não foi possível calcular o próximo atendimento." });
  }

  res.json({ sugestao: (normaisChamadasDepois ?? 0) >= 1 ? prioritario : normal });
}

const chamarPendenteSchema = z.object({
  sala: z.string().trim().max(60, "A sala é longa demais (máximo de 60 caracteres).").optional().nullable(),
});

/**
 * POST /api/atendimentos/pendentes/:id/chamar  { sala? }
 *
 * Marca o pendente como 'em_atendimento' pelo funcionário logado. O update só
 * acontece se ele ainda estiver 'pendente_revisao', então dois funcionários
 * do núcleo nunca pegam o mesmo cidadão: quem chegar depois recebe 409.
 */
export async function chamarPendente(req: Request, res: Response) {
  const parse = chamarPendenteSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  const { data, error } = await aplicarEscopo(
    supabaseAdmin.from("atendimentos_pendentes").update({
      status: "em_atendimento",
      chamado_por: req.funcionario?.id ?? null,
      chamado_em: new Date().toISOString(),
      // Sala/guichê exibido no Painel de Chamados.
      sala: parse.data.sala || null,
    }),
    contextoDe(req)
  )
    .eq("id", req.params.id)
    .eq("status", "pendente_revisao")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível chamar o atendimento." });
  }
  if (!data) {
    return res.status(409).json({ erro: "Este atendimento já foi chamado por outra pessoa ou não está mais na fila." });
  }

  res.json({ ...data, erros: calcularErros(data) });
}

/** POST /api/atendimentos/pendentes/:id/liberar — devolve um pendente 'em_atendimento' para a fila. */
export async function liberarPendente(req: Request, res: Response) {
  const { data, error } = await aplicarEscopo(
    supabaseAdmin.from("atendimentos_pendentes").update({ status: "pendente_revisao", chamado_por: null }),
    contextoDe(req)
  )
    .eq("id", req.params.id)
    .eq("status", "em_atendimento")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível devolver o atendimento à fila." });
  }
  if (!data) {
    return res.status(409).json({ erro: "Este atendimento não está em atendimento." });
  }

  res.json(data);
}

/** GET /api/atendimentos?nucleo_id=&de=&ate= */
export async function listarAtendimentos(req: Request, res: Response) {
  let query = aplicarEscopo(supabaseAdmin.from("atendimentos").select("*"), contextoDe(req)).order("created_at", {
    ascending: false,
  });

  const nucleoDoUsuario = nucleoDoFuncionario(req);
  if (nucleoDoUsuario) {
    query = query.eq("nucleo_id", nucleoDoUsuario);
  } else if (typeof req.query.nucleo_id === "string" && req.query.nucleo_id) {
    query = query.eq("nucleo_id", req.query.nucleo_id);
  }
  // Histórico do funcionário "nucleo": só o próprio núcleo E a própria unidade.
  // Admin/atendente veem tudo (e podem filtrar por ?unidade_id=).
  const unidadeDoUsuario = unidadeDoFuncionarioNucleo(req);
  if (unidadeDoUsuario) {
    query = query.eq("unidade_id", unidadeDoUsuario);
  } else if (typeof req.query.unidade_id === "string" && req.query.unidade_id) {
    query = query.eq("unidade_id", req.query.unidade_id);
  }
  if (typeof req.query.de === "string" && req.query.de) {
    query = query.gte("created_at", req.query.de);
  }
  if (typeof req.query.ate === "string" && req.query.ate) {
    query = query.lte("created_at", req.query.ate);
  }

  const { data: atendimentos, error } = await query;

  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os atendimentos." });
  }

  const lista = atendimentos ?? [];
  const cidadaoIds = [...new Set(lista.map((a) => a.cidadao_id).filter(Boolean))];
  const nucleoIds = [...new Set(lista.map((a) => a.nucleo_id).filter(Boolean))];
  const demandaIds = [
    ...new Set(lista.flatMap((a) => [a.demanda_principal_id, ...(a.outras_demandas ?? [])]).filter(Boolean)),
  ];
  const unidadeIds = [...new Set(lista.map((a) => a.unidade_id).filter(Boolean))];
  const pendenteIds = [...new Set(lista.map((a) => a.pendente_id).filter(Boolean))];

  const [{ data: cidadaos }, { nucleoMap, demandaMap }, { data: unidades }, { data: pendentes }] = await Promise.all([
    cidadaoIds.length
      ? supabaseAdmin.from("cidadaos").select("id, nome").in("id", cidadaoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    buscarMapasNomes(nucleoIds, demandaIds),
    unidadeIds.length
      ? supabaseAdmin.from("unidades").select("id, nome").in("id", unidadeIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    // Dados que vieram da recepção (prioridade, senha, quem encaminhou) ficam no pendente de origem.
    pendenteIds.length
      ? supabaseAdmin.from("atendimentos_pendentes").select("id, prioridade, senha_id, criado_por").in("id", pendenteIds)
      : Promise.resolve({
          data: [] as { id: string; prioridade: boolean; senha_id: string | null; criado_por: string | null }[],
        }),
  ]);

  // Encaminhamentos da nova ficha: serviços externos escolhidos e núcleos de destino.
  const atendimentoIds = lista.map((a) => a.id);
  const [{ data: servicosLigados }, { data: internosLigados }] = await Promise.all([
    atendimentoIds.length
      ? supabaseAdmin
          .from("atendimento_servicos_externos")
          .select("atendimento_id, servico_id")
          .in("atendimento_id", atendimentoIds)
      : Promise.resolve({ data: [] as { atendimento_id: string; servico_id: string }[] }),
    atendimentoIds.length
      ? supabaseAdmin
          .from("atendimento_encaminhamentos_internos")
          .select("atendimento_id, nucleo_destino_id, pendente_gerado_id")
          .in("atendimento_id", atendimentoIds)
      : Promise.resolve({
          data: [] as { atendimento_id: string; nucleo_destino_id: string; pendente_gerado_id: string | null }[],
        }),
  ]);

  const servicoIds = [...new Set((servicosLigados ?? []).map((s) => s.servico_id))];
  const destinoIds = [...new Set((internosLigados ?? []).map((i) => i.nucleo_destino_id))];
  const [{ data: servicos }, { data: nucleosDestino }] = await Promise.all([
    servicoIds.length
      ? supabaseAdmin.from("servicos_externos").select("id, nome").in("id", servicoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    destinoIds.length
      ? supabaseAdmin.from("nucleos").select("id, nome").in("id", destinoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const servicoNomeMap = new Map((servicos ?? []).map((s) => [s.id, s.nome]));
  const nucleoDestinoMap = new Map((nucleosDestino ?? []).map((n) => [n.id, n.nome]));

  const cidadaoMap = new Map((cidadaos ?? []).map((c) => [c.id, c.nome]));
  const unidadeMap = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const pendenteMap = new Map((pendentes ?? []).map((p) => [p.id, p]));

  const resultado = lista.map((a) => {
    const origem = a.pendente_id ? pendenteMap.get(a.pendente_id) : undefined;
    return {
      servicos_externos: (servicosLigados ?? [])
        .filter((s) => s.atendimento_id === a.id)
        .map((s) => ({ id: s.servico_id, nome: servicoNomeMap.get(s.servico_id) ?? "—" })),
      encaminhamentos_internos: (internosLigados ?? [])
        .filter((i) => i.atendimento_id === a.id)
        .map((i) => ({
          nucleo_id: i.nucleo_destino_id,
          nucleo_nome: nucleoDestinoMap.get(i.nucleo_destino_id) ?? "—",
          pendente_gerado_id: i.pendente_gerado_id,
        })),
      ...a,
      cidadao_nome: a.cidadao_id ? cidadaoMap.get(a.cidadao_id) ?? null : null,
      nucleo_nome: a.nucleo_id ? nucleoMap.get(a.nucleo_id) ?? null : null,
      unidade_nome: a.unidade_id ? unidadeMap.get(a.unidade_id) ?? null : null,
      demanda_principal_nome: a.demanda_principal_id ? demandaMap.get(a.demanda_principal_id) ?? null : null,
      outras_demandas_nomes: (a.outras_demandas ?? [])
        .map((demandaId: string) => demandaMap.get(demandaId))
        .filter((nome: string | undefined): nome is string => Boolean(nome)),
      prioridade: origem?.prioridade ?? false,
      senha_id: origem?.senha_id ?? null,
      encaminhado_por: origem?.criado_por ?? null,
    };
  });

  res.json(resultado);
}

const resolverNaRecepcaoSchema = z.object({
  senha_id: z.string().uuid("Senha inválida.").optional().nullable(),
  cidadao_id: z.string().uuid("Cidadão inválido."),
  descricao: z.string().trim().min(1, "Descreva a informação da demanda resolvida.").max(1000, "A informação é longa demais (máximo de 1000 caracteres)."),
});

/**
 * POST /api/atendimentos/resolvido-recepcao  { senha_id, cidadao_id, descricao }
 *
 * A demanda foi resolvida na própria recepção: não há encaminhamento nem
 * núcleo. Só registra o atendimento (`atendimentos_recepcao`) e marca a senha
 * como atendida; se essa 2ª etapa falhar, o registro é desfeito.
 */
export async function resolverNaRecepcao(req: Request, res: Response) {
  const parse = resolverNaRecepcaoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }
  const { senha_id, cidadao_id, descricao } = parse.data;

  const ctx = contextoDe(req);
  if (!podeEscrever(ctx)) {
    return res.status(400).json({ erro: "Selecione uma ação itinerante.", codigo: "ACAO_OBRIGATORIA" });
  }
  // Com senha: valida a senha chamada; sem: a unidade vem do funcionário.
  const origem = await resolverOrigemRecepcao(req, senha_id);
  if (!origem.ok) {
    return res.status(origem.status).json({ erro: origem.erro });
  }

  const { data: cidadao } = await supabaseAdmin.from("cidadaos").select("id").eq("id", cidadao_id).maybeSingle();
  if (!cidadao) {
    return res.status(404).json({ erro: "Cidadão não encontrado." });
  }

  const { data: registro, error: erroRegistro } = await supabaseAdmin
    .from("atendimentos_recepcao")
    .insert({
      cidadao_id,
      senha_id: origem.senhaId,
      unidade_id: origem.unidadeId,
      descricao,
      criado_por: req.funcionario?.id ?? null,
      ...escopoInsert(ctx),
    })
    .select("*")
    .single();

  if (erroRegistro || !registro) {
    console.error(erroRegistro);
    return res.status(500).json({ erro: "Não foi possível registrar o atendimento." });
  }

  if (origem.senhaId) {
    const marcada = await marcarSenhaAtendida(origem.senhaId, ctx);
    if (!marcada.ok) {
      const { error: erroDesfazer } = await supabaseAdmin.from("atendimentos_recepcao").delete().eq("id", registro.id);
      if (erroDesfazer) console.error(erroDesfazer);
      return res.status(marcada.status).json({ erro: marcada.erro });
    }
  }

  res.status(201).json(registro);
}

/** GET /api/atendimentos/resolvidos-recepcao — a recepção vê só a própria unidade; acesso amplo vê tudo. */
export async function listarResolvidosRecepcao(req: Request, res: Response) {
  const ctx = contextoDe(req);
  let query = aplicarEscopo(supabaseAdmin.from("atendimentos_recepcao").select("*"), ctx).order("created_at", {
    ascending: false,
  });
  // Recepção do Armazém só vê a própria unidade; no Itinerante o recorte é a ação (`aplicarEscopo`).
  if (ctx.modulo === "armazem" && req.funcionario?.role === "recepcao") {
    query = query.eq("unidade_id", req.funcionario.unidade_id ?? UNIDADE_INEXISTENTE);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return res.status(500).json({ erro: "Não foi possível listar os atendimentos da recepção." });
  }

  const lista = data ?? [];
  const cidadaoIds = [...new Set(lista.map((r) => r.cidadao_id).filter(Boolean))];
  const unidadeIds = [...new Set(lista.map((r) => r.unidade_id).filter(Boolean))];
  const [{ data: cidadaos }, { data: unidades }] = await Promise.all([
    cidadaoIds.length
      ? supabaseAdmin.from("cidadaos").select("id, nome").in("id", cidadaoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    unidadeIds.length
      ? supabaseAdmin.from("unidades").select("id, nome").in("id", unidadeIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const cidadaoMap = new Map((cidadaos ?? []).map((c) => [c.id, c.nome]));
  const unidadeMap = new Map((unidades ?? []).map((u) => [u.id, u.nome]));

  res.json(
    lista.map((r) => ({
      ...r,
      cidadao_nome: r.cidadao_id ? cidadaoMap.get(r.cidadao_id) ?? null : null,
      unidade_nome: r.unidade_id ? unidadeMap.get(r.unidade_id) ?? null : null,
    }))
  );
}

const atualizarAtendimentoSchema = z
  .object({
    demanda_principal_id: z.string().uuid().nullable().optional(),
    outras_demandas: z.array(z.string().uuid()).optional(),
    // `houve_encaminhamento` (coluna antiga) segue aceito só por compatibilidade; a ficha nova usa externo/interno.
    houve_encaminhamento: z.boolean().optional(),
    descricao: descricaoSchema.nullable().optional(),
    ...camposFicha,
  })
  // strict: qualquer outro campo (cidadao_id, nucleo_id, unidade_id...) é rejeitado, não ignorado em silêncio.
  .strict(
    "Só é possível editar demandas, resolvida e motivo, encaminhamentos externos e internos, e descrição."
  );

/** PATCH /api/atendimentos/:id — edição posterior, só dos campos preenchidos pelo núcleo. */
export async function atualizarAtendimento(req: Request, res: Response) {
  const parse = atualizarAtendimentoSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: parse.error.issues[0]?.message ?? "Dados inválidos." });
  }

  // O atendimento precisa ser do módulo/ação do contexto (um id de outro módulo é tratado como inexistente).
  const { data: atendimento, error: erroBusca } = await aplicarEscopo(
    supabaseAdmin
      .from("atendimentos")
      .select(
        "id, modulo, acao_itinerante_id, nucleo_id, unidade_id, cidadao_id, pendente_id, demanda_principal_id, outras_demandas, resolvida, motivo_nao_resolvida, houve_encaminhamento_externo, encaminhamento_externo_outros, houve_encaminhamento_interno"
      ),
    contextoDe(req)
  )
    .eq("id", req.params.id)
    .maybeSingle();

  if (erroBusca) {
    console.error(erroBusca);
    return res.status(500).json({ erro: "Não foi possível consultar o atendimento." });
  }
  if (!atendimento) {
    return res.status(404).json({ erro: "Atendimento não encontrado." });
  }

  if (
    req.funcionario?.role === "nucleo" &&
    (atendimento.nucleo_id !== req.funcionario.nucleo_id || atendimento.unidade_id !== unidadeDoFuncionarioNucleo(req))
  ) {
    return res.status(403).json({ erro: "Você não tem permissão para editar este atendimento." });
  }

  // Separa a ficha de encaminhamentos (tratada à parte) do restante dos campos editáveis.
  const { resolvida, motivo_nao_resolvida, houve_encaminhamento_externo, servicos_externos_ids,
    encaminhamento_externo_outros, houve_encaminhamento_interno, nucleos_destino_ids, ...simples } = parse.data;
  const fichaEnviada: EntradaFicha = {
    resolvida, motivo_nao_resolvida, houve_encaminhamento_externo, servicos_externos_ids,
    encaminhamento_externo_outros, houve_encaminhamento_interno, nucleos_destino_ids,
  };
  const temFicha = NOMES_CAMPOS_FICHA.some((campo) => fichaEnviada[campo] !== undefined);

  const atualizacoes: Record<string, unknown> = { ...simples };
  // Descrição vazia = sem descrição (guarda null, não string vazia).
  if (typeof atualizacoes.descricao === "string" && !atualizacoes.descricao) {
    atualizacoes.descricao = null;
  }
  if (Object.keys(atualizacoes).length === 0 && !temFicha) {
    return res.status(400).json({ erro: "Nenhum campo para atualizar." });
  }

  // As demandas escolhidas precisam pertencer ao núcleo do atendimento.
  const demandasEnviadas = [
    ...(atualizacoes.demanda_principal_id ? [atualizacoes.demanda_principal_id as string] : []),
    ...((atualizacoes.outras_demandas as string[] | undefined) ?? []),
  ];
  if (demandasEnviadas.length > 0) {
    const idsUnicos = [...new Set(demandasEnviadas)];
    const { data: validas, error: erroDemandas } = await supabaseAdmin
      .from("demandas")
      .select("id")
      .eq("nucleo_id", atendimento.nucleo_id)
      .in("id", idsUnicos);
    if (erroDemandas) {
      console.error(erroDemandas);
      return res.status(500).json({ erro: "Não foi possível validar as demandas." });
    }
    if ((validas ?? []).length !== idsUnicos.length) {
      return res.status(400).json({ erro: "Há demandas que não pertencem ao núcleo deste atendimento." });
    }
  }

  // --- Ficha de encaminhamentos: calcula o estado final e o que muda nas tabelas de ligação ---
  let pendentesNovos = new Map<string, string>(); // núcleo de destino -> pendente criado agora
  let servicosFinais: string[] | null = null; // não nulo = regravar o conjunto
  let destinosRemover: { nucleo_destino_id: string; pendente_gerado_id: string | null }[] = [];
  let destinosAdicionar: string[] = [];

  if (temFicha) {
    const [{ data: servicosAtuaisRows }, { data: internosAtuaisRows }] = await Promise.all([
      supabaseAdmin.from("atendimento_servicos_externos").select("servico_id").eq("atendimento_id", atendimento.id),
      supabaseAdmin
        .from("atendimento_encaminhamentos_internos")
        .select("nucleo_destino_id, pendente_gerado_id")
        .eq("atendimento_id", atendimento.id),
    ]);
    const servicosAtuais = (servicosAtuaisRows ?? []).map((s) => s.servico_id as string);
    const internosAtuais = (internosAtuaisRows ?? []) as { nucleo_destino_id: string; pendente_gerado_id: string | null }[];

    // O que não foi enviado mantém o valor atual; registros antigos (nulos) contam como "não".
    const estado = normalizarEstado({
      resolvida: fichaEnviada.resolvida ?? atendimento.resolvida ?? false,
      motivo: fichaEnviada.motivo_nao_resolvida !== undefined ? fichaEnviada.motivo_nao_resolvida : atendimento.motivo_nao_resolvida,
      externo: fichaEnviada.houve_encaminhamento_externo ?? atendimento.houve_encaminhamento_externo ?? false,
      servicosIds: fichaEnviada.servicos_externos_ids ?? servicosAtuais,
      outros:
        fichaEnviada.encaminhamento_externo_outros !== undefined
          ? fichaEnviada.encaminhamento_externo_outros
          : atendimento.encaminhamento_externo_outros,
      interno: fichaEnviada.houve_encaminhamento_interno ?? atendimento.houve_encaminhamento_interno ?? false,
      destinosIds: fichaEnviada.nucleos_destino_ids ?? internosAtuais.map((i) => i.nucleo_destino_id),
    });

    const erroFicha = await validarEstado(estado, atendimento.nucleo_id, new Set(servicosAtuais));
    if (erroFicha) {
      return res.status(400).json({ erro: erroFicha });
    }

    atualizacoes.resolvida = estado.resolvida;
    atualizacoes.motivo_nao_resolvida = estado.motivo;
    atualizacoes.houve_encaminhamento_externo = estado.externo;
    atualizacoes.encaminhamento_externo_outros = estado.outros;
    atualizacoes.houve_encaminhamento_interno = estado.interno;

    servicosFinais = estado.servicosIds;

    // Internos: só adiciona o que é NOVO; nunca duplica nem apaga pendentes já gerados.
    const jaVinculados = new Set(internosAtuais.map((i) => i.nucleo_destino_id));
    destinosAdicionar = estado.destinosIds.filter((id) => !jaVinculados.has(id));
    destinosRemover = internosAtuais.filter((i) => !estado.destinosIds.includes(i.nucleo_destino_id));

    // Só dá para retirar um destino cuja solicitação ainda não foi chamada.
    const pendentesParaRetirar = destinosRemover.map((d) => d.pendente_gerado_id).filter((id): id is string => Boolean(id));
    if (pendentesParaRetirar.length > 0) {
      const { data: situacao, error: erroSituacao } = await supabaseAdmin
        .from("atendimentos_pendentes")
        .select("id, nucleo_id, status")
        .in("id", pendentesParaRetirar);
      if (erroSituacao) {
        console.error(erroSituacao);
        return res.status(500).json({ erro: "Não foi possível conferir os encaminhamentos internos." });
      }
      const travado = (situacao ?? []).find((p) => p.status !== "pendente_revisao");
      if (travado) {
        const { data: nucleoTravado } = await supabaseAdmin.from("nucleos").select("nome").eq("id", travado.nucleo_id).maybeSingle();
        return res.status(409).json({
          erro: `O encaminhamento para ${nucleoTravado?.nome ?? "o núcleo de destino"} não pode ser removido: a solicitação já foi chamada ou atendida.`,
        });
      }
    }

    if (destinosAdicionar.length > 0) {
      // No Armazém precisa de unidade; no Itinerante a ação faz esse papel.
      if ((atendimento.modulo === "armazem" && !atendimento.unidade_id) || !atendimento.cidadao_id) {
        return res.status(400).json({ erro: "Este atendimento não tem unidade ou cidadão; não é possível encaminhar para outro núcleo." });
      }
      // A prioridade é herdada do atendimento de origem (guardada no pendente que o gerou).
      let prioridade = false;
      if (atendimento.pendente_id) {
        const { data: origemPendente } = await supabaseAdmin
          .from("atendimentos_pendentes")
          .select("prioridade")
          .eq("id", atendimento.pendente_id)
          .maybeSingle();
        prioridade = Boolean(origemPendente?.prioridade);
      }
      const criados = await criarPendentesDestino({
        cidadaoId: atendimento.cidadao_id,
        unidadeId: atendimento.unidade_id ?? null,
        // A solicitação gerada fica no MESMO módulo (e na mesma ação) do atendimento.
        escopo: { modulo: atendimento.modulo, acao_itinerante_id: atendimento.acao_itinerante_id ?? null },
        prioridade,
        destinosIds: destinosAdicionar,
        funcionarioId: req.funcionario?.id ?? null,
      });
      if (!criados.ok) {
        return res.status(500).json({ erro: criados.erro });
      }
      pendentesNovos = criados.ids;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("atendimentos")
    .update(atualizacoes)
    .eq("id", atendimento.id)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    await apagarPendentes([...pendentesNovos.values()]);
    return res.status(500).json({ erro: "Não foi possível atualizar o atendimento." });
  }

  if (temFicha) {
    // Regrava o conjunto de serviços externos.
    if (servicosFinais) {
      const { error: erroLimpa } = await supabaseAdmin
        .from("atendimento_servicos_externos")
        .delete()
        .eq("atendimento_id", atendimento.id);
      if (erroLimpa) console.error(erroLimpa);
      if (servicosFinais.length > 0) {
        const { error: erroServicos } = await supabaseAdmin
          .from("atendimento_servicos_externos")
          .insert(servicosFinais.map((servicoId) => ({ atendimento_id: atendimento.id, servico_id: servicoId })));
        if (erroServicos) {
          console.error(erroServicos);
          return res.status(500).json({ erro: "Atendimento atualizado, mas não foi possível gravar os serviços externos." });
        }
      }
    }

    // Retira destinos cuja solicitação ainda não foi chamada: o vínculo sai e a solicitação é
    // marcada como rejeitada (fica no banco para auditoria; nada é apagado).
    for (const destino of destinosRemover) {
      if (destino.pendente_gerado_id) {
        const { error: erroRejeita } = await supabaseAdmin
          .from("atendimentos_pendentes")
          .update({
            status: "rejeitado",
            revisado_por: req.funcionario?.id ?? null,
            revisado_em: new Date().toISOString(),
          })
          .eq("id", destino.pendente_gerado_id)
          .eq("status", "pendente_revisao");
        if (erroRejeita) console.error(erroRejeita);
      }
      const { error: erroRemove } = await supabaseAdmin
        .from("atendimento_encaminhamentos_internos")
        .delete()
        .eq("atendimento_id", atendimento.id)
        .eq("nucleo_destino_id", destino.nucleo_destino_id);
      if (erroRemove) console.error(erroRemove);
    }

    if (destinosAdicionar.length > 0) {
      const { error: erroInternos } = await supabaseAdmin.from("atendimento_encaminhamentos_internos").insert(
        destinosAdicionar.map((nucleoDestinoId) => ({
          atendimento_id: atendimento.id,
          nucleo_destino_id: nucleoDestinoId,
          pendente_gerado_id: pendentesNovos.get(nucleoDestinoId) ?? null,
        }))
      );
      if (erroInternos) {
        console.error(erroInternos);
        await apagarPendentes([...pendentesNovos.values()]);
        return res.status(500).json({ erro: "Atendimento atualizado, mas não foi possível gravar os encaminhamentos internos." });
      }
    }
  }

  res.json(data);
}
