export interface Funcionario {
  id: string;
  nome: string;
  /** Opcional apenas para o nível 'infraestrutura' (conta de aparelho). */
  cpf?: string | null;
  email: string;
  role: "admin" | "recepcao" | "nucleo" | "infraestrutura";
  /** Obrigatório (validado na aplicação) quando role = "recepcao", "nucleo" ou "infraestrutura". */
  unidade_id: string | null;
  /** Obrigatório (validado na aplicação) quando role = "nucleo". */
  nucleo_id: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Calculado pelo backend para exibição, não existe na tabela.
  unidade_nome?: string | null;
  nucleo_nome?: string | null;
}

export interface Unidade {
  id: string;
  nome: string;
  endereco?: string | null;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface Totem {
  id: string;
  nome: string;
  unidade_id: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Calculado pelo backend para exibição, não existe na tabela.
  unidade_nome?: string | null;
}

export interface Cidadao {
  id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string;
  telefone: string;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface Nucleo {
  id: string;
  nome: string;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  demandas: Demanda[];
}

export interface Demanda {
  id: string;
  nucleo_id: string;
  nome: string;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtendimentoPendente {
  id: string;
  nucleo_id: string;
  origem: "manual";
  cpf_texto: string | null;
  cidadao_id: string | null;
  nome: string | null;
  demanda_principal_id: string | null;
  outras_demandas: string[];
  resolvida: boolean | null;
  houve_encaminhamento: boolean | null;
  validacoes: { cpfValido?: boolean } | null;
  status: "pendente_revisao" | "em_atendimento" | "confirmado" | "rejeitado";
  /** Caso prioritário na fila do núcleo. */
  prioridade: boolean;
  /** Preenchidos quando o pendente nasce de um encaminhamento da recepção. */
  senha_id: string | null;
  unidade_id: string | null;
  chamado_por: string | null;
  chamado_em: string | null;
  data_atendimento: string | null;
  erro_ignorado: boolean;
  criado_por: string | null;
  revisado_por: string | null;
  revisado_em: string | null;
  created_at: string;
  updated_at: string;
  // Campos calculados pelo backend para exibição, não existem na tabela.
  nucleo_nome: string | null;
  demanda_principal_nome: string | null;
  outras_demandas_nomes: string[];
  erros: string[];
}

export interface Atendimento {
  id: string;
  cidadao_id: string | null;
  nucleo_id: string;
  demanda_principal_id: string | null;
  outras_demandas: string[];
  resolvida: boolean;
  houve_encaminhamento: boolean;
  origem: string;
  /** Atendimentos só nascem quando o núcleo confirma, então é sempre 'concluido'. */
  status: "encaminhado" | "concluido";
  atendido_por: string | null;
  pendente_id: string | null;
  unidade_id?: string | null;
  /** Texto livre opcional de como foi o atendimento, preenchido pelo núcleo. */
  descricao?: string | null;
  data_atendimento: string | null;
  created_at: string;
  updated_at: string;
  // Campos calculados pelo backend para exibição, não existem na tabela.
  cidadao_nome: string | null;
  nucleo_nome: string | null;
  unidade_nome: string | null;
  demanda_principal_nome: string | null;
  outras_demandas_nomes: string[];
  /** Vindos do encaminhamento da recepção (pendente de origem): somente leitura. */
  prioridade: boolean;
  senha_id: string | null;
  encaminhado_por: string | null;
}

/** Atendimento cuja demanda foi resolvida na própria recepção (sem encaminhamento para núcleo). */
export interface AtendimentoRecepcao {
  id: string;
  cidadao_id: string | null;
  senha_id: string | null;
  unidade_id: string | null;
  descricao: string;
  criado_por: string | null;
  created_at: string;
  // Campos calculados pelo backend para exibição, não existem na tabela.
  cidadao_nome: string | null;
  unidade_nome: string | null;
}

/** Uma chamada exibida no Painel: senha da recepção ou cidadão chamado por um núcleo. */
export interface ChamadaPainel {
  id: string;
  origem: "senha" | "nucleo";
  /** Código da senha (origem 'senha') ou nome do cidadão (origem 'nucleo'). */
  titulo: string;
  /** Nome do núcleo — só quando origem = 'nucleo'. */
  nucleo: string | null;
  /** Guichê (senha) ou sala (núcleo). */
  local: string | null;
  chamada_em: string;
  /** Senha chamada novamente (2ª tentativa em diante). */
  rechamada: boolean;
}

/** Resposta de GET /api/painel?unidade_id= */
export interface RespostaPainel {
  chamada_atual: ChamadaPainel | null;
  historico: ChamadaPainel[];
}

export interface Senha {
  id: string;
  data: string;
  tipo: "normal" | "prioritaria";
  numero: number;
  status: "aguardando" | "chamada" | "atendida" | "perdida";
  guiche: string | null;
  chamada_por: string | null;
  unidade_id: string | null;
  tentativas: number;
  /** true = levou "não compareceu" na 1ª tentativa e está esperando ser rechamada. */
  aguardando_recall: boolean;
  /** true = já passou por outra chamada desde então; pode ser sugerida de novo. */
  recall_liberado: boolean;
  criada_em: string;
  chamada_em: string | null;
  atendida_em: string | null;
}
