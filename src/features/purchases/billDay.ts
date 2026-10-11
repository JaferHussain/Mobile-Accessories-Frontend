const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A `yyyy-mm-dd` shop day, read from its parts — never through Date, which would shift it to UTC. */
export function billDay(isoDate: string): string {
  const [year, month, date] = isoDate.split('-');
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
}
