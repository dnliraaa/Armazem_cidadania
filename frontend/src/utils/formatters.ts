export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Validação de CPF pelo algoritmo oficial dos dígitos verificadores (mesma lógica do backend). */
export function cpfValido(cpfBruto: string): boolean {
  const cpf = somenteDigitos(cpfBruto);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais

  const calcularDigito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const digito1 = calcularDigito(cpf.slice(0, 9), 10);
  const digito2 = calcularDigito(cpf.slice(0, 10), 11);

  return digito1 === Number(cpf[9]) && digito2 === Number(cpf[10]);
}

/** Formata progressivamente enquanto o usuário digita: 000.000.000-00 */
export function formatarCpfInput(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11);
  return digitos
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/** Formata progressivamente enquanto o usuário digita: (00) 00000-0000 */
export function formatarTelefoneInput(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11);
  if (digitos.length <= 10) {
    return digitos
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digitos
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function formatarDataBr(isoDate: string): string {
  if (!isoDate) return "";
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${ano}`;
}
