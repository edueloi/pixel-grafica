// Feriados nacionais brasileiros (formato MM-DD)
const NATIONAL_HOLIDAYS: string[] = [
  '01-01', // Ano Novo
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '12-25', // Natal
];

export function isHoliday(date: Date): boolean {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return NATIONAL_HOLIDAYS.includes(`${mm}-${dd}`);
}
