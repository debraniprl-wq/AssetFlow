import {
  INITIAL_DEPARTMENTS,
  INITIAL_CATEGORIES,
  INITIAL_PROFILES,
  INITIAL_ASSETS,
  INITIAL_ALLOCATIONS,
  INITIAL_RESOURCES,
  INITIAL_BOOKINGS,
  INITIAL_MAINTENANCE,
  INITIAL_AUDIT_LOGS,
  INITIAL_SETTINGS,
  INITIAL_NOTIFICATIONS,
} from './mockData';
import type {
  Department,
  AssetCategory,
  Profile,
  Asset,
  Allocation,
  Resource,
  Booking,
  MaintenanceRequest,
  AuditLog,
  SystemSetting,
  Notification,
} from '../types';

export interface MockDatabase {
  departments: Department[];
  asset_categories: AssetCategory[];
  profiles: Profile[];
  assets: Asset[];
  allocations: Allocation[];
  resources: Resource[];
  bookings: Booking[];
  maintenance_requests: MaintenanceRequest[];
  audit_logs: AuditLog[];
  system_settings: SystemSetting[];
  notifications: Notification[];
}

const STORAGE_KEY = 'assetflow_mock_db_v1';

function getInitialDatabase(): MockDatabase {
  return {
    departments: JSON.parse(JSON.stringify(INITIAL_DEPARTMENTS)),
    asset_categories: JSON.parse(JSON.stringify(INITIAL_CATEGORIES)),
    profiles: JSON.parse(JSON.stringify(INITIAL_PROFILES)),
    assets: JSON.parse(JSON.stringify(INITIAL_ASSETS)),
    allocations: JSON.parse(JSON.stringify(INITIAL_ALLOCATIONS)),
    resources: JSON.parse(JSON.stringify(INITIAL_RESOURCES)),
    bookings: JSON.parse(JSON.stringify(INITIAL_BOOKINGS)),
    maintenance_requests: JSON.parse(JSON.stringify(INITIAL_MAINTENANCE)),
    audit_logs: JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS)),
    system_settings: JSON.parse(JSON.stringify(INITIAL_SETTINGS)),
    notifications: JSON.parse(JSON.stringify(INITIAL_NOTIFICATIONS)),
  };
}

export function loadMockDatabase(): MockDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = getInitialDatabase();
      saveMockDatabase(initial);
      return initial;
    }
    const parsed = JSON.parse(raw);
    // Safety check: ensure essential tables exist
    if (!parsed.assets || !parsed.departments || parsed.assets.length === 0) {
      const initial = getInitialDatabase();
      saveMockDatabase(initial);
      return initial;
    }
    return parsed;
  } catch {
    const initial = getInitialDatabase();
    return initial;
  }
}

export function saveMockDatabase(db: MockDatabase) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    window.dispatchEvent(new Event('assetflow_mock_data_changed'));
  } catch (err) {
    console.error('Failed to save mock database to localStorage:', err);
  }
}

export function resetMockDatabase(): MockDatabase {
  const fresh = getInitialDatabase();
  saveMockDatabase(fresh);
  return fresh;
}

// Helper to join relational data on records dynamically
function hydrateRecord(table: string, record: Record<string, any>, db: MockDatabase) {
  const item = { ...record };
  if (table === 'assets') {
    item.category = db.asset_categories.find(c => c.id === item.category_id);
    item.department = db.departments.find(d => d.id === item.department_id);
    item.assignee = db.profiles.find(p => p.id === item.assigned_to);
  } else if (table === 'allocations') {
    item.asset = db.assets.find(a => a.id === item.asset_id);
    if (item.asset) {
      item.asset.category = db.asset_categories.find(c => c.id === item.asset.category_id);
      item.asset.department = db.departments.find(d => d.id === item.asset.department_id);
    }
    item.assignee = db.profiles.find(p => p.id === item.assigned_to);
    item.assigner = db.profiles.find(p => p.id === item.assigned_by);
    item.department = db.departments.find(d => d.id === item.department_id);
  } else if (table === 'bookings') {
    item.resource = db.resources.find(r => r.id === item.resource_id);
    item.booker = db.profiles.find(p => p.id === item.booked_by);
    item.approver = db.profiles.find(p => p.id === item.approved_by);
  } else if (table === 'maintenance_requests') {
    item.asset = db.assets.find(a => a.id === item.asset_id);
    item.reporter = db.profiles.find(p => p.id === item.reported_by);
    item.assignee = db.profiles.find(p => p.id === item.assigned_to);
    item.approver = db.profiles.find(p => p.id === item.approved_by);
  } else if (table === 'audit_logs') {
    item.actor = db.profiles.find(p => p.id === item.actor_id);
  } else if (table === 'profiles') {
    item.department = db.departments.find(d => d.id === item.department_id);
  }
  return item;
}

// Fluent Mock Query Builder simulating Supabase PostgREST queries
export class MockQueryBuilder {
  private tableName: string;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private operationPayload: any = null;
  public selectedColumns: string = '*';
  private exactCount: boolean = false;
  private headOnly: boolean = false;
  private filters: Array<(row: any) => boolean> = [];
  private sortFn: ((a: any, b: any) => number) | null = null;
  private rangeFrom: number = 0;
  private rangeTo: number | null = null;
  private limitCount: number | null = null;
  private isSingle: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns: string = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.selectedColumns = columns;
    if (options?.count === 'exact') this.exactCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  insert(values: any | any[]) {
    this.operation = 'insert';
    this.operationPayload = values;
    return this;
  }

  update(values: any) {
    this.operation = 'update';
    this.operationPayload = values;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  upsert(values: any | any[], _options?: { onConflict?: string }) {
    this.operation = 'upsert';
    this.operationPayload = values;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push(row => row[column] !== value);
    return this;
  }

  in(column: string, values: any[]) {
    const set = new Set(values);
    this.filters.push(row => set.has(row[column]));
    return this;
  }

  is(column: string, value: any) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  not(column: string, operator: string, value: any) {
    if (operator === 'eq' || operator === 'is') {
      this.filters.push(row => row[column] !== value);
    }
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push(row => {
      const v = row[column];
      return v !== undefined && v !== null && v < value;
    });
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push(row => {
      const v = row[column];
      return v !== undefined && v !== null && v > value;
    });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push(row => {
      const v = row[column];
      return v !== undefined && v !== null && v <= value;
    });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push(row => {
      const v = row[column];
      return v !== undefined && v !== null && v >= value;
    });
    return this;
  }

  or(conditionsString: string) {
    // Parse conditions like "name.ilike.%foo%,asset_tag.ilike.%foo%"
    const parts = conditionsString.split(',').map(s => s.trim());
    this.filters.push(row => {
      return parts.some(part => {
        if (part.includes('.ilike.')) {
          const [col, rawPattern] = part.split('.ilike.');
          const cleanPattern = (rawPattern || '').replace(/%/g, '').toLowerCase();
          const val = String(row[col.trim()] ?? '').toLowerCase();
          return val.includes(cleanPattern);
        }
        if (part.includes('.in.')) {
          const [col, inList] = part.split('.in.');
          const cleanList = inList.replace(/[()]/g, '').split(',').map(x => x.trim());
          return cleanList.includes(String(row[col.trim()] ?? ''));
        }
        return false;
      });
    });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const asc = options?.ascending !== false;
    this.sortFn = (a, b) => {
      const valA = a[column];
      const valB = b[column];
      if (valA === valB) return 0;
      if (valA === undefined || valA === null) return asc ? -1 : 1;
      if (valB === undefined || valB === null) return asc ? 1 : -1;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return asc ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    };
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  execute(): { data: any; count: number | null; error: any } {
    const db = loadMockDatabase();
    const tableData = ((db as any)[this.tableName] as any[]) || [];

    if (this.operation === 'insert') {
      const itemsToInsert = Array.isArray(this.operationPayload) ? this.operationPayload : [this.operationPayload];
      const inserted: any[] = [];
      for (const item of itemsToInsert) {
        const newRow = {
          id: item.id || `${this.tableName.slice(0, 3)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...item,
        };
        tableData.unshift(newRow);
        inserted.push(hydrateRecord(this.tableName, newRow, db));
      }
      (db as any)[this.tableName] = tableData;
      saveMockDatabase(db);
      return {
        data: this.isSingle || !Array.isArray(this.operationPayload) ? inserted[0] : inserted,
        count: inserted.length,
        error: null,
      };
    }

    if (this.operation === 'update') {
      let updatedCount = 0;
      const updatedRows: any[] = [];
      const newTableData = tableData.map(row => {
        if (this.filters.every(f => f(row))) {
          updatedCount++;
          const updated = {
            ...row,
            ...this.operationPayload,
            updated_at: new Date().toISOString(),
          };
          updatedRows.push(hydrateRecord(this.tableName, updated, db));
          return updated;
        }
        return row;
      });
      (db as any)[this.tableName] = newTableData;
      saveMockDatabase(db);
      return {
        data: this.isSingle ? (updatedRows[0] || null) : updatedRows,
        count: updatedCount,
        error: null,
      };
    }

    if (this.operation === 'delete') {
      const remaining = tableData.filter(row => !this.filters.every(f => f(row)));
      const deletedCount = tableData.length - remaining.length;
      (db as any)[this.tableName] = remaining;
      saveMockDatabase(db);
      return {
        data: null,
        count: deletedCount,
        error: null,
      };
    }

    if (this.operation === 'upsert') {
      const items = Array.isArray(this.operationPayload) ? this.operationPayload : [this.operationPayload];
      const upsertedRows: any[] = [];
      for (const item of items) {
        const matchIndex = tableData.findIndex(r => {
          if (item.id && r.id === item.id) return true;
          if (item.key && r.key === item.key) return true;
          if (item.name && r.name === item.name) return true;
          return false;
        });
        if (matchIndex >= 0) {
          tableData[matchIndex] = {
            ...tableData[matchIndex],
            ...item,
            updated_at: new Date().toISOString(),
          };
          upsertedRows.push(hydrateRecord(this.tableName, tableData[matchIndex], db));
        } else {
          const newRow = {
            id: item.id || `${this.tableName.slice(0, 3)}-${Date.now()}`,
            created_at: item.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...item,
          };
          tableData.unshift(newRow);
          upsertedRows.push(hydrateRecord(this.tableName, newRow, db));
        }
      }
      (db as any)[this.tableName] = tableData;
      saveMockDatabase(db);
      return {
        data: this.isSingle || !Array.isArray(this.operationPayload) ? upsertedRows[0] : upsertedRows,
        count: upsertedRows.length,
        error: null,
      };
    }

    // Default: 'select'
    let filtered = tableData.filter(row => this.filters.every(f => f(row)));
    const totalCount = filtered.length;

    // Sort
    if (this.sortFn) {
      filtered = [...filtered].sort(this.sortFn);
    }

    // Slice
    let sliced = filtered;
    if (this.rangeTo !== null) {
      sliced = sliced.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.limitCount !== null) {
      sliced = sliced.slice(this.rangeFrom, this.rangeFrom + this.limitCount);
    }

    // Hydrate joined entities
    const hydrated = sliced.map(row => hydrateRecord(this.tableName, row, db));

    if (this.headOnly) {
      return { data: null, count: totalCount, error: null };
    }

    if (this.isSingle) {
      const item = hydrated[0] || null;
      if (!item) {
        return { data: null, count: 0, error: { message: 'Row not found', code: 'PGRST116' } };
      }
      return { data: item, count: 1, error: null };
    }

    return {
      data: hydrated,
      count: this.exactCount ? totalCount : hydrated.length,
      error: null,
    };
  }

  // Promise-like then for async await support
  then(resolve: (res: { data: any; count: number | null; error: any }) => void, reject?: (err: any) => void) {
    try {
      const result = this.execute();
      resolve(result);
    } catch (err) {
      if (reject) reject(err);
      else resolve({ data: null, count: 0, error: err });
    }
  }
}

// Mock RPC function executor
export function executeMockRpc(fnName: string, args: Record<string, any> = {}): Promise<{ data: any; error: any }> {
  return new Promise(resolve => {
    try {
      const db = loadMockDatabase();

      if (fnName === 'allocate_asset') {
        const { p_asset_id, p_assigned_to, p_assigned_by, p_department_id, p_expected_return, p_notes } = args;
        const allocId = `alloc-${Date.now()}`;
        const newAlloc: Allocation = {
          id: allocId,
          asset_id: p_asset_id,
          assigned_to: p_assigned_to,
          assigned_by: p_assigned_by,
          department_id: p_department_id || undefined,
          allocation_date: new Date().toISOString(),
          expected_return: p_expected_return || undefined,
          actual_return: undefined,
          status: 'active',
          notes: p_notes || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.allocations.unshift(newAlloc);

        // Update asset
        const assetIndex = db.assets.findIndex(a => a.id === p_asset_id);
        if (assetIndex >= 0) {
          db.assets[assetIndex] = {
            ...db.assets[assetIndex],
            status: 'allocated',
            assigned_to: p_assigned_to,
            department_id: p_department_id || db.assets[assetIndex].department_id,
            updated_at: new Date().toISOString(),
          };
        }
        saveMockDatabase(db);
        resolve({ data: allocId, error: null });
        return;
      }

      if (fnName === 'return_asset') {
        const { p_allocation_id, p_return_notes, p_condition } = args;
        const allocIndex = db.allocations.findIndex(a => a.id === p_allocation_id);
        if (allocIndex >= 0) {
          const alloc = db.allocations[allocIndex];
          db.allocations[allocIndex] = {
            ...alloc,
            status: 'returned',
            actual_return: new Date().toISOString(),
            return_notes: p_return_notes || undefined,
            updated_at: new Date().toISOString(),
          };

          const assetIndex = db.assets.findIndex(a => a.id === alloc.asset_id);
          if (assetIndex >= 0) {
            db.assets[assetIndex] = {
              ...db.assets[assetIndex],
              status: 'available',
              assigned_to: undefined,
              condition: p_condition || db.assets[assetIndex].condition,
              updated_at: new Date().toISOString(),
            };
          }
        }
        saveMockDatabase(db);
        resolve({ data: null, error: null });
        return;
      }

      if (fnName === 'create_booking_safe') {
        const { p_resource_id, p_booked_by, p_department_id, p_title, p_purpose, p_start_time, p_end_time, p_notes } = args;
        const bookingId = `book-${Date.now()}`;
        const newBooking: Booking = {
          id: bookingId,
          resource_id: p_resource_id,
          booked_by: p_booked_by,
          department_id: p_department_id || undefined,
          title: p_title,
          purpose: p_purpose || undefined,
          start_time: p_start_time,
          end_time: p_end_time,
          status: 'pending',
          notes: p_notes || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.bookings.unshift(newBooking);
        saveMockDatabase(db);
        resolve({ data: bookingId, error: null });
        return;
      }

      if (fnName === 'create_notification') {
        const { p_user_id, p_title, p_message, p_type, p_entity_type, p_entity_id } = args;
        const notifId = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newNotif: Notification = {
          id: notifId,
          user_id: p_user_id,
          title: p_title,
          message: p_message,
          type: p_type || 'info',
          entity_type: p_entity_type || undefined,
          entity_id: p_entity_id || undefined,
          is_read: false,
          created_at: new Date().toISOString(),
        };
        db.notifications.unshift(newNotif);
        saveMockDatabase(db);
        resolve({ data: notifId, error: null });
        return;
      }

      resolve({ data: null, error: null });
    } catch (err) {
      resolve({ data: null, error: err });
    }
  });
}
