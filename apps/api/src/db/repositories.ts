import { and, eq, getTableColumns, isNotNull, isNull } from "drizzle-orm";
import {
  type SQLiteColumn,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import {
  activityEntries,
  contributions,
  disbursements,
  loans,
  notes,
  payments,
  propertyCostComponents,
  propertyDetails,
  rateChanges,
  schema,
} from "./schema.js";

export interface EntityRepository<TRecord, TCreate, TUpdate> {
  list(): TRecord[];
  listDeleted(): TRecord[];
  getDeletedById(id: string): TRecord | undefined;
  getById(id: string): TRecord | undefined;
  create(value: TCreate): TRecord;
  update(id: string, value: TUpdate): TRecord | undefined;
  softDelete(id: string, deletedAt: string): boolean;
  restore(id: string): boolean;
  hardDelete(id: string): boolean;
}

export interface LoanScopedRepository<TRecord, TCreate, TUpdate>
  extends EntityRepository<TRecord, TCreate, TUpdate> {
  listByLoan(loanId: string): TRecord[];
}

export interface LoanRepository
  extends EntityRepository<
    typeof loans.$inferSelect,
    typeof loans.$inferInsert,
    Partial<typeof loans.$inferInsert>
  > {
  listActive(): (typeof loans.$inferSelect)[];
}

export interface LoanChildrenRepository {
  activityEntries: LoanScopedRepository<
    typeof activityEntries.$inferSelect,
    typeof activityEntries.$inferInsert,
    Partial<typeof activityEntries.$inferInsert>
  >;
  disbursements: LoanScopedRepository<
    typeof disbursements.$inferSelect,
    typeof disbursements.$inferInsert,
    Partial<typeof disbursements.$inferInsert>
  >;
  contributions: LoanScopedRepository<
    typeof contributions.$inferSelect,
    typeof contributions.$inferInsert,
    Partial<typeof contributions.$inferInsert>
  >;
  rateChanges: LoanScopedRepository<
    typeof rateChanges.$inferSelect,
    typeof rateChanges.$inferInsert,
    Partial<typeof rateChanges.$inferInsert>
  >;
  payments: LoanScopedRepository<
    typeof payments.$inferSelect,
    typeof payments.$inferInsert,
    Partial<typeof payments.$inferInsert>
  >;
  notes: LoanScopedRepository<
    typeof notes.$inferSelect,
    typeof notes.$inferInsert,
    Partial<typeof notes.$inferInsert>
  >;
  propertyCosts: {
    listByLoan(loanId: string): (typeof propertyCostComponents.$inferSelect)[];
    upsertMany(values: (typeof propertyCostComponents.$inferInsert)[]): void;
    deleteByLoan(loanId: string): void;
    deleteById(id: string): void;
  };
  propertyDetails: {
    getByLoan(loanId: string): (typeof propertyDetails.$inferSelect) | undefined;
    upsert(value: typeof propertyDetails.$inferInsert): void;
  };
}

export interface RepositorySet {
  loans: LoanRepository;
  children: LoanChildrenRepository;
  transaction<T>(work: () => T): T;
}

type TableWithSoftDelete = SQLiteTable & {
  id: SQLiteColumn;
  deletedAt: SQLiteColumn;
};

function createEntityRepository<TTable extends TableWithSoftDelete>(
  db: BetterSQLite3Database<typeof schema>,
  table: TTable,
): EntityRepository<
  InferSelectModel<TTable>,
  InferInsertModel<TTable>,
  Partial<InferInsertModel<TTable>>
> {
  const columns = getTableColumns(table);
  return {
    list: () =>
      db
        .select()
        .from(table)
        .where(isNull(columns.deletedAt))
        .all() as InferSelectModel<TTable>[],
    listDeleted: () =>
      db
        .select()
        .from(table)
        .where(isNotNull(columns.deletedAt))
        .all() as InferSelectModel<TTable>[],
    getDeletedById: (id) =>
      db
        .select()
        .from(table)
        .where(and(eq(columns.id, id), isNotNull(columns.deletedAt)))
        .get() as InferSelectModel<TTable> | undefined,
    getById: (id) =>
      db
        .select()
        .from(table)
        .where(and(eq(columns.id, id), isNull(columns.deletedAt)))
        .get() as InferSelectModel<TTable> | undefined,
    create: (value) =>
      db.insert(table).values(value).returning().get() as InferSelectModel<TTable>,
    update: (id, value) => {
      const updated = db
        .update(table)
        .set({ ...value, updatedAt: new Date().toISOString() })
        .where(and(eq(columns.id, id), isNull(columns.deletedAt)))
        .returning()
        .get();
      return updated as InferSelectModel<TTable> | undefined;
    },
    softDelete: (id, deletedAt) =>
      db
        .update(table)
        .set({ deletedAt, updatedAt: deletedAt } as Partial<InferInsertModel<TTable>>)
        .where(and(eq(columns.id, id), isNull(columns.deletedAt)))
        .run().changes > 0,
    restore: (id) =>
      db
        .update(table)
        .set(
          { deletedAt: null, updatedAt: new Date().toISOString() } as Partial<
            InferInsertModel<TTable>
          >,
        )
        .where(eq(columns.id, id))
        .run().changes > 0,
    hardDelete: (id) => db.delete(table).where(eq(columns.id, id)).run().changes > 0,
  };
}

function createLoanScopedRepository<TTable extends TableWithSoftDelete>(
  db: BetterSQLite3Database<typeof schema>,
  table: TTable,
): LoanScopedRepository<
  InferSelectModel<TTable>,
  InferInsertModel<TTable>,
  Partial<InferInsertModel<TTable>>
> {
  const repository = createEntityRepository(db, table);
  const columns = getTableColumns(table) as unknown as Record<string, SQLiteColumn>;
  const loanIdColumn = columns.loanId;
  if (loanIdColumn === undefined) {
    throw new Error("Loan-scoped repository table must include loanId");
  }
  return {
    ...repository,
    listByLoan: (loanId) =>
      db
        .select()
        .from(table)
        .where(and(eq(loanIdColumn, loanId), isNull(columns.deletedAt)))
        .all() as InferSelectModel<TTable>[],
  };
}

export function createSqliteRepositories(client: Database.Database): RepositorySet {
  const db = drizzle(client, { schema });
  const loanEntities = createEntityRepository(db, loans);
  return {
    loans: {
      ...loanEntities,
      listActive: () =>
        db
          .select()
          .from(loans)
          .where(and(isNull(loans.deletedAt), isNull(loans.archivedAt)))
          .all(),
    },
    children: {
      activityEntries: createLoanScopedRepository(db, activityEntries),
      disbursements: createLoanScopedRepository(db, disbursements),
      contributions: createLoanScopedRepository(db, contributions),
      rateChanges: createLoanScopedRepository(db, rateChanges),
      payments: createLoanScopedRepository(db, payments),
      notes: createLoanScopedRepository(db, notes),
      propertyCosts: {
        listByLoan: (loanId) =>
          db
            .select()
            .from(propertyCostComponents)
            .where(eq(propertyCostComponents.loanId, loanId))
            .all(),
        upsertMany: (values) => {
          for (const value of values) {
            db.insert(propertyCostComponents)
              .values(value)
              .onConflictDoUpdate({
                target: propertyCostComponents.id,
                set: {
                  loanId: value.loanId,
                  name: value.name,
                  group: value.group,
                  kind: value.kind,
                  amount: value.amount,
                  note: value.note,
                  updatedAt: value.updatedAt,
                },
              })
              .run();
          }
        },
        deleteByLoan: (loanId) => {
          db.delete(propertyCostComponents)
            .where(eq(propertyCostComponents.loanId, loanId))
            .run();
        },
        deleteById: (id) => {
          db.delete(propertyCostComponents)
            .where(eq(propertyCostComponents.id, id))
            .run();
        },
      },
      propertyDetails: {
        getByLoan: (loanId) => db.select().from(propertyDetails).where(eq(propertyDetails.loanId, loanId)).get(),
        upsert: (value) => {
          db.insert(propertyDetails).values(value).onConflictDoUpdate({
            target: propertyDetails.loanId,
            set: {
              unitLabel: value.unitLabel,
              superBuiltUpSft: value.superBuiltUpSft,
              carpetSft: value.carpetSft,
              ratePerSft: value.ratePerSft,
              parkingSlots: value.parkingSlots,
              parkingCharges: value.parkingCharges,
              notedGrandTotal: value.notedGrandTotal,
              notedTotalBeforeCash: value.notedTotalBeforeCash,
              notedFinalCost: value.notedFinalCost,
              updatedAt: value.updatedAt,
            },
          }).run();
        },
      },
    },
    transaction: (work) => client.transaction(work)(),
  };
}
