import { api, unwrap } from '@/api/client';
import type { ApiEnvelope } from '@/types/api';

export type OpenBillStatus = 'NotPaid' | 'PartPaid';

/** A bill still owed — settled oldest first, so the newest bills are the ones left open. */
export interface RecoveryBill {
  /** `yyyy-mm-dd`, the shop's own day. */
  onDate: string;
  /** Invoice, OpeningBalance (brought forward from the paper register) or Adjustment. */
  entryType: string;
  referenceId: number | null;
  referenceNumber: string | null;
  billAmount: number;
  remaining: number;
  status: OpenBillStatus;
}

export interface RecoveryAccount {
  customerId: number;
  name: string;
  mobileNumber: string | null;
  isUdhaarCustomer: boolean;
  outstanding: number;
  /** The oldest bill still open — what the due date runs from. `yyyy-mm-dd`. */
  unpaidSince: string | null;
  dueOn: string | null;
  monthsOverdue: number;
  notPaidBills: number;
  partPaidBills: number;
  openBills: RecoveryBill[];
}

export interface RecoveryReport {
  totalOwed: number;
  customersOwing: number;
  overdueCustomers: number;
  overdueAmount: number;
  /** Most overdue first. */
  accounts: RecoveryAccount[];
}

export const recoveryApi = {
  report(): Promise<RecoveryReport> {
    return unwrap(api.get<ApiEnvelope<RecoveryReport>>('/recovery'));
  },
};
