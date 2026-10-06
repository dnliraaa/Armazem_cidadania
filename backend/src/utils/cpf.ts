/** Remove pontuação, deixando apenas os dígitos do CPF. */
export function somenteDigitos(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/** Validação de CPF pelo algoritmo oficial dos dígitos verificadores. */
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
