// Modular courier adapter contract.
// Every method MUST be safe: never throw. Use `supported:false` when the
// courier API has no such capability, and `error:string` when an upstream
// call failed.

export type Credentials = {
  apiKey: string | null;
  secretKey: string | null;
  baseUrl: string | null;
};

export type Range = { from: Date; to: Date };

export type Unsupported = { supported: false };
export type Supported<T> = { supported: true; error?: string } & T;
export type Result<T> = Unsupported | Supported<T>;

export type BalanceData = {
  current: number | null;
  available: number | null;
  pending: number | null;
};

export type CodHistoryItem = {
  date: string;
  amount: number;
  status: string;
  transferDate?: string | null;
  reference?: string | null;
};

export type CodReportData = {
  total: number | null;
  pending: number | null;
  paid: number | null;
  history: CodHistoryItem[];
};

export type ReturnItem = {
  consignmentId: string;
  invoice?: string | null;
  reason?: string | null;
  status?: string | null;
  date?: string | null;
};

export type ReturnsData = {
  pending: number | null;
  returned: number | null;
  items: ReturnItem[];
};

export type PaymentItem = {
  amount: number;
  date: string;
  transactionId?: string | null;
  method?: string | null;
  status?: string | null;
};

export type PaymentsData = {
  items: PaymentItem[];
};

export type TrackingTimelineItem = {
  status: string;
  location?: string | null;
  at?: string | null;
};

export type TrackingData = {
  status: string | null;
  location: string | null;
  timeline: TrackingTimelineItem[];
  consignmentId?: string | null;
  trackingCode?: string | null;
};

export interface CourierAdapter {
  name: string;
  getBalance(c: Credentials): Promise<Result<BalanceData>>;
  getCodReport(c: Credentials, r: Range): Promise<Result<CodReportData>>;
  getReturns(c: Credentials, r: Range): Promise<Result<ReturnsData>>;
  getPayments(c: Credentials, r: Range): Promise<Result<PaymentsData>>;
  getTracking(c: Credentials, consignmentId: string): Promise<Result<TrackingData>>;
}
