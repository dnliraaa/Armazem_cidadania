import type { Atendimento } from "../../types";

/** Estado do formulário da ficha do núcleo (resolvida + motivo, encaminhamentos externos e internos). */
export interface FichaForm {
  /** null = ainda não respondeu (precisa escolher Sim ou Não). */
  resolvida: boolean | null;
  motivo: string;
  externo: boolean;
  servicosIds: string[];
  outros: string;
  interno: boolean;
  destinosIds: string[];
}

export function fichaVazia(): FichaForm {
  return { resolvida: null, motivo: "", externo: false, servicosIds: [], outros: "", interno: false, destinosIds: [] };
}

/** Ficha preenchida a partir de um atendimento já concluído (edição no histórico). Registros antigos contam como "não". */
export function fichaDoAtendimento(a: Atendimento): FichaForm {
  return {
    resolvida: a.resolvida,
    motivo: a.motivo_nao_resolvida ?? "",
    externo: a.houve_encaminhamento_externo ?? false,
    servicosIds: (a.servicos_externos ?? []).map((s) => s.id),
    outros: a.encaminhamento_externo_outros ?? "",
    interno: a.houve_encaminhamento_interno ?? false,
    destinosIds: (a.encaminhamentos_internos ?? []).map((i) => i.nucleo_id),
  };
}

/** Regras da ficha (as mesmas que o backend confere). Devolve a mensagem de erro ou null. */
export function validarFicha(f: FichaForm): string | null {
  if (f.resolvida === null) return "Informe se a demanda foi resolvida.";
  if (!f.resolvida && !f.motivo.trim()) return "Explique o motivo da demanda não ter sido resolvida.";
  if (f.externo && f.servicosIds.length === 0 && !f.outros.trim()) {
    return 'Selecione ao menos um serviço externo ou descreva em "Outros".';
  }
  if (f.interno && f.destinosIds.length === 0) {
    return "Selecione o núcleo de destino do encaminhamento interno.";
  }
  if (f.interno && f.destinosIds.length > 1) {
    return "O encaminhamento interno é para um núcleo por vez. Escolha apenas um núcleo de destino.";
  }
  return null;
}

/** Campos enviados à API (o backend descarta os detalhes de respostas "Não"). */
export function fichaParaPayload(f: FichaForm) {
  return {
    resolvida: f.resolvida ?? false,
    motivo_nao_resolvida: f.resolvida ? null : f.motivo.trim() || null,
    houve_encaminhamento_externo: f.externo,
    servicos_externos_ids: f.externo ? f.servicosIds : [],
    encaminhamento_externo_outros: f.externo ? f.outros.trim() || null : null,
    houve_encaminhamento_interno: f.interno,
    nucleos_destino_ids: f.interno ? f.destinosIds : [],
  };
}

/** Resumo curto para a linha da tabela, ex.: "Externo: 2 · Interno: 1". */
export function resumoEncaminhamentos(a: Atendimento): string {
  const semCamposNovos = a.houve_encaminhamento_externo == null && a.houve_encaminhamento_interno == null;
  // Registro antigo: só existia o "houve encaminhamento?" genérico.
  if (semCamposNovos) return a.houve_encaminhamento ? "Encaminhamento (registro antigo)" : "—";

  const externos = (a.servicos_externos?.length ?? 0) + (a.encaminhamento_externo_outros ? 1 : 0);
  const internos = a.encaminhamentos_internos?.length ?? 0;
  const partes = [];
  if (a.houve_encaminhamento_externo) partes.push(`Externo: ${externos}`);
  if (a.houve_encaminhamento_interno) partes.push(`Interno: ${internos}`);
  return partes.length > 0 ? partes.join(" · ") : "Nenhum";
}
