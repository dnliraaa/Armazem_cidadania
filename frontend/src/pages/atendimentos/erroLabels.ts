export const ERRO_LABELS: Record<string, string> = {
  cpf_invalido: "CPF inválido",
  cidadao_nao_encontrado: "Cidadão não cadastrado",
  nome_vazio: "Sem nome",
  sem_demanda: "Sem demanda selecionada",
};

export function descreverErro(codigo: string): string {
  return ERRO_LABELS[codigo] ?? codigo;
}
