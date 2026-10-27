export type DebtStatus = "pendente" | "pago" | "atrasado";
export type DebtPriority = "baixa" | "normal" | "alta";

export interface Debt {
  id: string;
  user_id: string;
  name: string;
  creditor: string | null;
  amount: number;
  paid_amount?: number | null;
  due_date: string;
  category: string | null;
  priority: DebtPriority;
  status: DebtStatus;
  created_at: string;
}

export interface GamblingSaving {
  id: string;
  user_id: string;
  amount_saved: number;
  observation: string | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: "trial" | "active" | "past_due" | "canceled" | "expired";
  plan: "mensal_9_90";
  created_at: string;
}
