/** Who is named for a return: the customer, or "Walk-in" when the sale stored none. */
export function returnCustomerLabel(customerName: string | null | undefined): string {
  return customerName?.trim() ? customerName : 'Walk-in';
}
