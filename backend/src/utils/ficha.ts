import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import { cpfValido } from "./cpf.js";

/**
 * Ficha preenchida pelo núcleo ao concluir um atendimento (e editada depois no
 * histórico): motivo quando não resolvida, encaminhamentos externos (serviços
 * cadastrados + "outros") e internos (outros núcleos, que geram uma nova
 * solicitação na fila deles).
 */

const uuid = z.string().uuid();

/** Campos da ficha, todos opcionais no formato de entrada (confirmação e PATCH validam o conjunto). */
export const camposFicha = {
  resolvida: z.boolean().optional(),
  motivo_nao_resolvida: z.string().trim().max(1000, "O motivo é longo demais (máximo de 1000 caracteres).").optional().nullable(),
  houve_encaminhamento_externo: z.boolean().optional(),
  servicos_externos_ids: z.array(uuid).optional(),
  encaminhamento_externo_outros: z.string().trim().max(500, "O texto de \"Outros\" é longo demais (máximo de 500 caracteres).").optional().nullable(),
  houve_encaminhamento_interno: z.boolean().optional(),
  nucleos_destino_ids: z.array(uuid).optional(),
};

export const NOMES_CAMPOS_FICHA = Object.keys(camposFicha) as (keyof typeof camposFicha)[];

export type EntradaFicha = {
  [K in keyof typeof camposFicha]?: z.infer<(typeof camposFicha)[K]>;
};

/** Estado completo e normalizado da ficha (o que fica gravado). */
export interface EstadoFicha {
  resolvida: boolean;
  motivo: string | null;
  externo: boolean;
  servicosIds: string[];
  outros: string | null;
  interno: boolean;
  destinosIds: string[];
}

/**
 * Normaliza: "sim/não" desligado descarta os detalhes (motivo, serviços,
 * "outros", destinos), para nunca ficar lixo de uma resposta anterior.
 */
export function normalizarEstado(bruto: {
  resolvida: boolean;
  motivo?: string | null;
  externo: boolean;
  servicosIds?: string[];
  outros?: string | null;
  interno: boolean;
  destinosIds?: string[];
}): EstadoFicha {
  return {
    resolvida: bruto.resolvida,
    motivo: bruto.resolvida ? null : bruto.motivo?.trim() || null,
    externo: bruto.externo,
    servicosIds: bruto.externo ? [...new Set(bruto.servicosIds ?? [])] : [],
    outros: bruto.externo ? bruto.outros?.trim() || null : null,
    interno: bruto.interno,
    destinosIds: bruto.interno ? [...new Set(bruto.destinosIds ?? [])] : [],
  };
}

/**
 * Valida as regras da ficha. Devolve a mensagem de erro, ou null se estiver ok.
 *  - não resolvida exige motivo;
 *  - encaminhamento externo exige ao menos um serviço (ativo e do núcleo do
 *    atendimento — os já vinculados continuam valendo mesmo se inativados depois)
 *    ou o texto de "Outros";
 *  - encaminhamento interno exige exatamente um núcleo de destino, ativo e diferente
 *    do núcleo do atendimento (um por vez, para o cidadão não entrar em duas filas).
 */
export async function validarEstado(
  estado: EstadoFicha,
  nucleoId: string,
  servicosJaVinculados: Set<string> = new Set()
): Promise<string | null> {
  if (!estado.resolvida && !estado.motivo) {
    return "Explique o motivo da demanda não ter sido resolvida.";
  }

  if (estado.externo) {
    if (estado.servicosIds.length === 0 && !estado.outros) {
      return "Selecione ao menos um serviço externo ou descreva em \"Outros\".";
    }
    if (estado.servicosIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("servicos_externos")
        .select("id, ativo")
        .eq("nucleo_id", nucleoId)
        .in("id", estado.servicosIds);
      if (error) {
        console.error(error);
        return "Não foi possível validar os serviços externos.";
      }
      const validos = new Set(
        (data ?? []).filter((s) => s.ativo || servicosJaVinculados.has(s.id)).map((s) => s.id)
      );
      if (estado.servicosIds.some((id) => !validos.has(id))) {
        return "Há serviços externos inválidos, inativos ou de outro núcleo.";
      }
    }
  }

  if (estado.interno) {
    if (estado.destinosIds.length === 0) {
      return "Selecione ao menos um núcleo de destino para o encaminhamento interno.";
    }
    // Um núcleo por vez: evita o cidadão ficar em duas filas e ser chamado por dois núcleos ao mesmo tempo.
    if (estado.destinosIds.length > 1) {
      return "O encaminhamento interno é para um núcleo por vez. Escolha apenas um núcleo de destino.";
    }
    if (estado.destinosIds.includes(nucleoId)) {
      return "O encaminhamento interno deve ser para outro núcleo, diferente do núcleo do atendimento.";
    }
    const { data, error } = await supabaseAdmin
      .from("nucleos")
      .select("id, ativo")
      .in("id", estado.destinosIds);
    if (error) {
      console.error(error);
      return "Não foi possível validar os núcleos de destino.";
    }
    const ativos = new Set((data ?? []).filter((n) => n.ativo).map((n) => n.id));
    if (estado.destinosIds.some((id) => !ativos.has(id))) {
      return "Há núcleos de destino inválidos ou inativos.";
    }
  }

  return null;
}

/** Data de hoje (YYYY-MM-DD), mesmo critério do restante do sistema. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cria, em lote, uma nova solicitação na fila de cada núcleo de destino: mesmo
 * cidadão e unidade, prioridade herdada do atendimento de origem, sem senha.
 * Devolve o mapa núcleo → id do pendente gerado.
 */
export async function criarPendentesDestino(params: {
  cidadaoId: string;
  /** Nulo no Itinerante (que não tem unidade). */
  unidadeId: string | null;
  /** Módulo e ação do atendimento de origem: a solicitação gerada fica no mesmo módulo/ação. */
  escopo: { modulo: string; acao_itinerante_id: string | null };
  prioridade: boolean;
  destinosIds: string[];
  funcionarioId: string | null;
}): Promise<{ ok: true; ids: Map<string, string> } | { ok: false; erro: string }> {
  if (params.destinosIds.length === 0) return { ok: true, ids: new Map() };

  const { data: cidadao, error: erroCidadao } = await supabaseAdmin
    .from("cidadaos")
    .select("nome, cpf")
    .eq("id", params.cidadaoId)
    .maybeSingle();
  if (erroCidadao || !cidadao) {
    if (erroCidadao) console.error(erroCidadao);
    return { ok: false, erro: "Não foi possível localizar o cidadão para o encaminhamento interno." };
  }

  const { data, error } = await supabaseAdmin
    .from("atendimentos_pendentes")
    .insert(
      params.destinosIds.map((nucleoId) => ({
        origem: "manual",
        cidadao_id: params.cidadaoId,
        nome: cidadao.nome,
        cpf_texto: cidadao.cpf,
        validacoes: cidadao.cpf ? { cpfValido: cpfValido(cidadao.cpf) } : null,
        nucleo_id: nucleoId,
        prioridade: params.prioridade,
        senha_id: null,
        unidade_id: params.unidadeId,
        outras_demandas: [],
        resolvida: false,
        houve_encaminhamento: false,
        data_atendimento: hoje(),
        status: "pendente_revisao",
        criado_por: params.funcionarioId,
        // Marca como encaminhamento: é o que a fila do núcleo lista.
        encaminhado: true,
        ...params.escopo,
      }))
    )
    .select("id, nucleo_id");

  if (error || !data) {
    console.error(error);
    return { ok: false, erro: "Não foi possível criar as solicitações nos núcleos de destino." };
  }

  return { ok: true, ids: new Map(data.map((p) => [p.nucleo_id as string, p.id as string])) };
}

/** Apaga pendentes recém-criados (desfazer quando uma etapa seguinte falha). */
export async function apagarPendentes(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from("atendimentos_pendentes").delete().in("id", ids);
  if (error) console.error(error);
}
