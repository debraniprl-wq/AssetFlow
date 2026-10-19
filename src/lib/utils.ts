import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, isAfter } from 'date-fns';
import type {
  AssetStatus, AssetCondition, AllocationStatus,
  BookingStatus, MaintenanceStatus, MaintenancePriority, UserRole
} from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date?: string | null): string {
  if (!date) return '—';
  try { return format(new Date(date), 'MMM d, yyyy'); } catch { return '—'; }
}

export function formatDateTime(date?: string | null): string {
  if (!date) return '—';
  try { return format(new Date(date), 'MMM d, yyyy h:mm a'); } catch { return '—'; }
}

export function formatRelative(date?: string | null): string {
  if (!date) return '—';
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }); } catch { return '—'; }
}

export function isOverdue(date?: string | null): boolean {
  if (!date) return false;
  try { return !isAfter(new Date(date), new Date()); } catch { return false; }
}

export function formatCurrency(amount?: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function getAssetStatusBadge(status: AssetStatus): string {
  const map: Record<AssetStatus, string> = {
    available: 'badge-success',
    allocated: 'badge-info',
    maintenance: 'badge-warning',
    retired: 'badge-gray',
    lost: 'badge-danger',
  };
  return map[status] ?? 'badge-gray';
}

export function getConditionBadge(condition: AssetCondition): string {
  const map: Record<AssetCondition, string> = {
    excellent: 'badge-success',
    good: 'badge-info',
    fair: 'badge-warning',
    poor: 'badge-danger',
    damaged: 'badge-danger',
  };
  return map[condition] ?? 'badge-gray';
}

export function getAllocationStatusBadge(status: AllocationStatus): string {
  const map: Record<AllocationStatus, string> = {
    active: 'badge-info',
    returned: 'badge-success',
    overdue: 'badge-danger',
    transferred: 'badge-purple',
  };
  return map[status] ?? 'badge-gray';
}

export function getBookingStatusBadge(status: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    pending: 'badge-warning',
    approved: 'badge-success',
    rejected: 'badge-danger',
    cancelled: 'badge-gray',
    completed: 'badge-info',
  };
  return map[status] ?? 'badge-gray';
}

export function getMaintenanceStatusBadge(status: MaintenanceStatus): string {
  const map: Record<MaintenanceStatus, string> = {
    pending: 'badge-warning',
    approved: 'badge-info',
    in_progress: 'badge-purple',
    completed: 'badge-success',
    rejected: 'badge-danger',
  };
  return map[status] ?? 'badge-gray';
}

export function getPriorityBadge(priority: MaintenancePriority): string {
  const map: Record<MaintenancePriority, string> = {
    low: 'badge-info',
    medium: 'badge-warning',
    high: 'badge-danger',
    critical: 'badge-danger',
  };
  return map[priority] ?? 'badge-gray';
}

export function getRoleBadge(role: UserRole): string {
  const map: Record<UserRole, string> = {
    admin: 'badge-danger',
    asset_manager: 'badge-purple',
    department_head: 'badge-info',
    employee: 'badge-gray',
  };
  return map[role] ?? 'badge-gray';
}

export function getRoleLabel(role: UserRole): string {
  const map: Record<UserRole, string> = {
    admin: 'Admin',
    asset_manager: 'Asset Manager',
    department_head: 'Department Head',
    employee: 'Employee',
  };
  return map[role] ?? role;
}

export function getStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function extractErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'An unexpected error occurred';
}

export function generateAssetTag(): string {
  const prefix = 'AST';
  const num = Math.floor(Math.random() * 900000) + 100000;
  return `${prefix}-${num}`;
}

export function downloadCSV(
  data: Record<string, unknown>[],
  filename: string
): { rowCount: number; filename: string; sizeKB: string } | null {
  if (!data.length) return null;
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');

  // \uFEFF = UTF-8 BOM — tells Windows this is a text file, prevents
  // Acrobat / wrong apps from intercepting the download.
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  // Must be in the DOM for Firefox + Edge to trigger the download properly
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up after a short delay so the browser has time to start the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);

  return {
    rowCount: data.length,
    filename: `${filename}.csv`,
    sizeKB: (blob.size / 1024).toFixed(1),
  };
}

