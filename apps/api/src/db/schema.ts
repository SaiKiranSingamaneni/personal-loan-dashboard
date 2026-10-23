import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const loans = sqliteTable("loans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lender: text("lender").notNull(),
  loanType: text("loan_type", {
    enum: ["home", "plot", "vehicle", "personal", "other"],
  }).notNull(),
  accountReference: text("account_reference"),
  status: text("status", { enum: ["active", "closed"] })
    .notNull()
    .default("active"),
  sanctionedAmount: integer("sanctioned_amount_paise").notNull(),
  annualRatePercent: real("annual_rate_percent").notNull(),
  rateType: text("rate_type", { enum: ["fixed", "floating"] }).notNull(),
  tenureMonths: integer("tenure_months").notNull(),
  startDate: text("start_date").notNull(),
  emiDueDay: integer("emi_due_day").notNull(),
  emiBasis: text("emi_basis", { enum: ["SANCTIONED", "DISBURSED"] }).notNull().default("DISBURSED"),
  preEmiInterestOnly: integer("pre_emi_interest_only", { mode: "boolean" }).notNull().default(false),
  interestMethod: text("interest_method", { enum: ["DAILY", "MONTHLY"] }).notNull().default("DAILY"),
  emiOverride: integer("emi_override_paise"),
  processingFee: integer("processing_fee_paise"),
  otherCharges: integer("other_charges_paise"),
  propertyCost: integer("property_cost_paise"),
  emiStartRule: text("emi_start_rule", { enum: ["full-disbursement", "date"] })
    .notNull()
    .default("full-disbursement"),
  emiStartDate: text("emi_start_date"),
  archivedAt: text("archived_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const propertyCostComponents = sqliteTable(
  "property_cost_components",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    group: text("cost_group", { enum: ["AGREEMENT", "OUTSIDE_AGREEMENT"] }).notNull(),
    kind: text("kind").notNull(),
    amount: integer("amount_paise").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("property_cost_components_loan_idx").on(table.loanId)],
);

export const activityEntries = sqliteTable(
  "activity_entries",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["SELF_CONTRIBUTION", "LOAN_DISBURSEMENT", "EMI", "EXTRA_EMI", "RATE_CHANGE"],
    }).notNull(),
    date: text("date").notNull(),
    amount: integer("amount_paise"),
    title: text("title").notNull(),
    notes: text("notes"),
    origin: text("origin", { enum: ["USER", "AUTO"] }).notNull(),
    userEdited: integer("user_edited", { mode: "boolean" }).notNull().default(false),
    deletedAt: text("deleted_at"),
    source: text("source", { enum: ["BANK", "CASH", "OTHER"] }),
    componentId: text("component_id").references(() => propertyCostComponents.id, {
      onDelete: "set null",
    }),
    trancheLabel: text("tranche_label"),
    bankReference: text("bank_reference"),
    status: text("status", { enum: ["PAID", "MISSED", "SKIPPED"] }),
    dueDate: text("due_date"),
    mode: text("mode", { enum: ["REDUCE_TENURE", "REDUCE_EMI"] }),
    newRatePercent: real("new_rate_percent"),
    effectiveDate: text("effective_date"),
    rateOption: text("rate_option", {
      enum: ["KEEP_EMI_CHANGE_TENURE", "KEEP_TENURE_CHANGE_EMI"],
    }),
    interestPart: integer("interest_part_paise"),
    principalPart: integer("principal_part_paise"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("activity_entries_loan_date_idx").on(table.loanId, table.date),
    index("activity_entries_due_date_idx").on(table.loanId, table.dueDate),
  ],
);

export const disbursements = sqliteTable(
  "disbursements",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    amount: integer("amount_paise").notNull(),
    note: text("note"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("disbursements_loan_date_idx").on(table.loanId, table.date)],
);

export const contributions = sqliteTable(
  "contributions",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    amount: integer("amount_paise").notNull(),
    note: text("note"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("contributions_loan_date_idx").on(table.loanId, table.date)],
);

export const rateChanges = sqliteTable(
  "rate_changes",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    effectiveDate: text("effective_date").notNull(),
    annualRatePercent: real("annual_rate_percent").notNull(),
    mode: text("mode", { enum: ["keep-emi", "keep-tenure"] }).notNull(),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("rate_changes_loan_date_idx").on(table.loanId, table.effectiveDate)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    amount: integer("amount_paise").notNull(),
    type: text("type", {
      enum: ["emi", "prepayment", "part-payment", "fee", "other"],
    }).notNull(),
    principalPart: integer("principal_part_paise").notNull(),
    interestPart: integer("interest_part_paise").notNull(),
    status: text("status", { enum: ["scheduled", "paid", "missed"] }).notNull(),
    scheduledPeriod: integer("scheduled_period"),
    prepaymentMode: text("prepayment_mode", {
      enum: ["reduce-tenure", "reduce-emi"],
    }),
    note: text("note"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("payments_loan_date_idx").on(table.loanId, table.date)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    text: text("text").notNull(),
    paymentId: text("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("notes_loan_date_idx").on(table.loanId, table.date)],
);

export const schema = {
  loans,
  propertyCostComponents,
  activityEntries,
  disbursements,
  contributions,
  rateChanges,
  payments,
  notes,
};
