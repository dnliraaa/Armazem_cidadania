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
  /** Validações objetivas calculadas no cadastro/edição: hoje só `cpfValido` (dígito verificador do cpf_texto atual). */
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
  /** Calculado sob demanda (calcularErros), não persistido na tabela. */
  erros?: string[];
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

// Estende o Request do Express para carregar o usuário autenticado
declare global {
  namespace Express {
    interface Request {
      funcionario?: Funcionario;
    }
  }
}
