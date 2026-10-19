// Types for AssetFlow — all database entities

export type UserRole = 'admin' | 'asset_manager' | 'department_head' | 'employee';
export type AssetStatus = 'available' | 'allocated' | 'maintenance' | 'retired' | 'lost';
export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
export type AllocationStatus = 'active' | 'returned' | 'overdue' | 'transferred';
export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export type MaintenanceStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'rejected';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'approve' | 'reject' | 'allocate' | 'return' | 'transfer';

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  head_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  department_id?: string;
  employee_id?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface AssetCategory {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  category_id?: string;
  description?: string;
  serial_number?: string;
  manufacturer?: string;
  model?: string;
  purchase_date?: string;
  purchase_cost?: number;
  warranty_expiry?: string;
  department_id?: string;
  location?: string;
  assigned_to?: string;
  status: AssetStatus;
  condition: AssetCondition;
  is_bookable: boolean;
  notes?: string;
  image_url?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined
  category?: AssetCategory;
  department?: Department;
  assignee?: Profile;
  creator?: Profile;
}

export interface Allocation {
  id: string;
  asset_id: string;
  assigned_to: string;
  assigned_by: string;
  department_id?: string;
  allocation_date: string;
  expected_return?: string;
  actual_return?: string;
  status: AllocationStatus;
  notes?: string;
  return_notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  asset?: Asset;
  assignee?: Profile;
  assigner?: Profile;
  department?: Department;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  description?: string;
  location?: string;
  capacity?: number;
  department_id?: string;
  is_active: boolean;
  requires_approval: boolean;
  image_url?: string;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface Booking {
  id: string;
  resource_id: string;
  booked_by: string;
  department_id?: string;
  title: string;
  purpose?: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  resource?: Resource;
  booker?: Profile;
  approver?: Profile;
}

export interface MaintenanceRequest {
  id: string;
  asset_id: string;
  reported_by: string;
  assigned_to?: string;
  title: string;
  description: string;
  issue_category: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  scheduled_date?: string;
  started_at?: string;
  completed_at?: string;
  work_performed?: string;
  maintenance_cost?: number;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  asset?: Asset;
  reporter?: Profile;
  assignee?: Profile;
  approver?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  entity_type?: string;
  entity_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_email?: string;
  action: AuditAction;
  entity_type: string;
  entity_id?: string;
  description: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
  actor?: Profile;
}

export interface SystemSetting {
  key: string;
  value: string;
  description?: string;
  updated_by?: string;
  updated_at: string;
}

export interface DashboardStats {
  totalAssets: number;
  availableAssets: number;
  allocatedAssets: number;
  maintenanceAssets: number;
  pendingRequests: number;
  activeBookings: number;
  overdueAllocations: number;
  recentActivity: AuditLog[];
}

export interface AssetFilters {
  search?: string;
  status?: AssetStatus | '';
  department_id?: string;
  category_id?: string;
  condition?: AssetCondition | '';
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}
