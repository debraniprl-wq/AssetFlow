-- ============================================================
-- AssetFlow — Complete Database Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fast ilike/search

-- ── Enums ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role        AS ENUM ('admin', 'asset_manager', 'department_head', 'employee');
  CREATE TYPE asset_status     AS ENUM ('available', 'allocated', 'maintenance', 'retired', 'lost');
  CREATE TYPE asset_condition  AS ENUM ('excellent', 'good', 'fair', 'poor', 'damaged');
  CREATE TYPE allocation_status AS ENUM ('active', 'returned', 'overdue', 'transferred');
  CREATE TYPE booking_status   AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'completed');
  CREATE TYPE maint_status     AS ENUM ('pending', 'approved', 'in_progress', 'completed', 'rejected');
  CREATE TYPE maint_priority   AS ENUM ('low', 'medium', 'high', 'critical');
  CREATE TYPE notif_type       AS ENUM ('info', 'success', 'warning', 'error');
  CREATE TYPE audit_action     AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'approve', 'reject', 'allocate', 'return', 'transfer');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Departments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  head_id     UUID,  -- references profiles(id), set after profiles exist
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Profiles ──────────────────────────────────────────────────
-- Extends auth.users — created automatically by trigger
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT NOT NULL DEFAULT '',
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'employee',
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  employee_id   TEXT UNIQUE,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Now we can add the foreign key back-reference on departments
ALTER TABLE public.departments
  DROP CONSTRAINT IF EXISTS departments_head_id_fkey;
ALTER TABLE public.departments
  ADD CONSTRAINT departments_head_id_fkey
  FOREIGN KEY (head_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── Asset Categories ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Assets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_tag       TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  category_id     UUID REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  description     TEXT,
  serial_number   TEXT,
  manufacturer    TEXT,
  model           TEXT,
  purchase_date   DATE,
  purchase_cost   NUMERIC(12,2),
  warranty_expiry DATE,
  department_id   UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  location        TEXT,
  assigned_to     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          asset_status NOT NULL DEFAULT 'available',
  condition       asset_condition NOT NULL DEFAULT 'good',
  is_bookable     BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  image_url       TEXT,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Allocations ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.allocations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id        UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  assigned_to     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id   UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  allocation_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_return TIMESTAMPTZ,
  actual_return   TIMESTAMPTZ,
  status          allocation_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  return_notes    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only one active allocation per asset at a time
  CONSTRAINT unique_active_allocation EXCLUDE USING gist (
    asset_id WITH =
  ) WHERE (status = 'active')
);

-- ── Resources (bookable rooms/equipment) ─────────────────────
CREATE TABLE IF NOT EXISTS public.resources (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,  -- e.g. 'room', 'vehicle', 'equipment'
  description       TEXT,
  location          TEXT,
  capacity          INTEGER,
  department_id     UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  image_url         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Bookings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bookings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id      UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  booked_by        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id    UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  purpose          TEXT,
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ NOT NULL,
  status           booking_status NOT NULL DEFAULT 'pending',
  approved_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_time_check CHECK (end_time > start_time)
);

-- ── Maintenance Requests ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id         UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  reported_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_to      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  issue_category   TEXT NOT NULL DEFAULT 'general',
  priority         maint_priority NOT NULL DEFAULT 'medium',
  status           maint_status NOT NULL DEFAULT 'pending',
  scheduled_date   DATE,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  work_performed   TEXT,
  maintenance_cost NUMERIC(12,2),
  approved_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        notif_type NOT NULL DEFAULT 'info',
  entity_type TEXT,
  entity_id   UUID,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Audit Logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      audit_action NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  description TEXT NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── System Settings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('org_name',                    'AssetFlow',    'Organisation display name'),
  ('asset_tag_prefix',            'AST',          'Prefix for auto-generated asset tags'),
  ('overdue_threshold_days',      '7',            'Days past expected return before overdue'),
  ('booking_requires_approval',   'true',         'Whether bookings need manual approval'),
  ('maintenance_requires_approval','true',        'Whether maintenance requests need approval'),
  ('default_currency',            'USD',          'Default currency for reports')
ON CONFLICT (key) DO NOTHING;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assets_status        ON public.assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_department    ON public.assets(department_id);
CREATE INDEX IF NOT EXISTS idx_assets_category      ON public.assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_to   ON public.assets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_allocations_asset    ON public.allocations(asset_id);
CREATE INDEX IF NOT EXISTS idx_allocations_user     ON public.allocations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_allocations_status   ON public.allocations(status);
CREATE INDEX IF NOT EXISTS idx_bookings_resource    ON public.bookings(resource_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user        ON public.bookings(booked_by);
CREATE INDEX IF NOT EXISTS idx_bookings_time        ON public.bookings(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_maint_asset          ON public.maintenance_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_maint_status         ON public.maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_notif_user           ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read           ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_audit_actor          ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity         ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time           ON public.audit_logs(created_at DESC);

-- ── Updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['departments','profiles','assets','allocations','resources','bookings','maintenance_requests']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ── Helper: current user role ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Auto-create profile on signup ─────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role user_role := 'employee';
BEGIN
  -- The very first user to sign up automatically becomes an admin
  IF (SELECT count(*) FROM public.profiles) = 0 THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    v_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Prevent non-admins from changing sensitive profile fields (privilege escalation prevention) ──
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- If updater is not an admin, keep role and is_active unchanged
  IF (public.current_user_role() != 'admin') THEN
    NEW.role := OLD.role;
    NEW.is_active := OLD.is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ── RPC: allocate_asset (atomic, prevents duplicate active allocations) ──
CREATE OR REPLACE FUNCTION public.allocate_asset(
  p_asset_id        UUID,
  p_assigned_to     UUID,
  p_assigned_by     UUID,
  p_department_id   UUID    DEFAULT NULL,
  p_expected_return TIMESTAMPTZ DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allocation_id UUID;
  v_asset_status  asset_status;
BEGIN
  -- Lock the asset row
  SELECT status INTO v_asset_status FROM public.assets WHERE id = p_asset_id FOR UPDATE;

  IF v_asset_status IS NULL THEN
    RAISE EXCEPTION 'Asset not found';
  END IF;
  IF v_asset_status <> 'available' THEN
    RAISE EXCEPTION 'Asset is not available for allocation (current status: %)', v_asset_status;
  END IF;

  -- Create allocation
  INSERT INTO public.allocations (asset_id, assigned_to, assigned_by, department_id, expected_return, notes, status)
  VALUES (p_asset_id, p_assigned_to, p_assigned_by, p_department_id, p_expected_return, p_notes, 'active')
  RETURNING id INTO v_allocation_id;

  -- Update asset status and assign to user
  UPDATE public.assets
  SET status = 'allocated',
      assigned_to = p_assigned_to,
      department_id = COALESCE(p_department_id, department_id)
  WHERE id = p_asset_id;

  RETURN v_allocation_id;
END;
$$;

-- ── RPC: return_asset (atomic) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.return_asset(
  p_allocation_id UUID,
  p_return_notes  TEXT    DEFAULT NULL,
  p_condition     TEXT    DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asset_id UUID;
BEGIN
  -- Lock and get asset_id
  SELECT asset_id INTO v_asset_id
  FROM public.allocations
  WHERE id = p_allocation_id AND status = 'active'
  FOR UPDATE;

  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Active allocation not found';
  END IF;

  -- Update allocation
  UPDATE public.allocations
  SET status = 'returned', actual_return = now(), return_notes = p_return_notes
  WHERE id = p_allocation_id;

  -- Update asset
  UPDATE public.assets
  SET status = 'available',
      assigned_to = NULL,
      condition = COALESCE(NULLIF(p_condition, '')::asset_condition, condition)
  WHERE id = v_asset_id;
END;
$$;

-- ── RPC: create_booking_safe (prevents time-slot conflicts) ───
CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_resource_id   UUID,
  p_booked_by     UUID,
  p_department_id UUID    DEFAULT NULL,
  p_title         TEXT    DEFAULT '',
  p_purpose       TEXT    DEFAULT NULL,
  p_start_time    TIMESTAMPTZ DEFAULT NULL,
  p_end_time      TIMESTAMPTZ DEFAULT NULL,
  p_notes         TEXT    DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conflict    INTEGER;
  v_booking_id  UUID;
  v_req_appr    BOOLEAN;
  v_init_status booking_status := 'pending';
BEGIN
  -- Check for overlapping approved/pending bookings
  SELECT COUNT(*) INTO v_conflict
  FROM public.bookings
  WHERE resource_id = p_resource_id
    AND status IN ('approved', 'pending')
    AND tstzrange(start_time, end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)');

  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'Resource is already booked for this time slot';
  END IF;

  -- If resource does not require approval, approve immediately
  SELECT requires_approval INTO v_req_appr FROM public.resources WHERE id = p_resource_id;
  IF v_req_appr IS FALSE THEN
    v_init_status := 'approved';
  END IF;

  INSERT INTO public.bookings (resource_id, booked_by, department_id, title, purpose, start_time, end_time, notes, status)
  VALUES (p_resource_id, p_booked_by, p_department_id, p_title, p_purpose, p_start_time, p_end_time, p_notes, v_init_status)
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

-- ── RPC: create_notification ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id     UUID,
  p_title       TEXT,
  p_message     TEXT,
  p_type        TEXT    DEFAULT 'info',
  p_entity_type TEXT    DEFAULT NULL,
  p_entity_id   UUID    DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (p_user_id, p_title, p_message, COALESCE(NULLIF(p_type, '')::notif_type, 'info'), p_entity_type, p_entity_id);
END;
$$;

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings      ENABLE ROW LEVEL SECURITY;

-- ── Profiles policies ─────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL
  USING (public.current_user_role() = 'admin');

-- ── Departments policies ──────────────────────────────────────
DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select" ON public.departments FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "departments_admin_write" ON public.departments;
CREATE POLICY "departments_admin_write" ON public.departments FOR ALL
  USING (public.current_user_role() = 'admin');

-- ── Asset Categories policies ─────────────────────────────────
DROP POLICY IF EXISTS "categories_select" ON public.asset_categories;
CREATE POLICY "categories_select" ON public.asset_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "categories_admin_write" ON public.asset_categories;
CREATE POLICY "categories_admin_write" ON public.asset_categories FOR ALL
  USING (public.current_user_role() IN ('admin', 'asset_manager'));

-- ── Assets policies ───────────────────────────────────────────
DROP POLICY IF EXISTS "assets_select" ON public.assets;
CREATE POLICY "assets_select" ON public.assets FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "assets_write_managers" ON public.assets;
CREATE POLICY "assets_write_managers" ON public.assets FOR ALL
  USING (public.current_user_role() IN ('admin', 'asset_manager'));

-- ── Allocations policies ──────────────────────────────────────
DROP POLICY IF EXISTS "allocations_select" ON public.allocations;
CREATE POLICY "allocations_select" ON public.allocations FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      public.current_user_role() IN ('admin', 'asset_manager') OR
      assigned_to = auth.uid() OR
      assigned_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "allocations_write_managers" ON public.allocations;
CREATE POLICY "allocations_write_managers" ON public.allocations FOR ALL
  USING (public.current_user_role() IN ('admin', 'asset_manager'));

-- ── Resources policies ────────────────────────────────────────
DROP POLICY IF EXISTS "resources_select" ON public.resources;
CREATE POLICY "resources_select" ON public.resources FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "resources_write_managers" ON public.resources;
CREATE POLICY "resources_write_managers" ON public.resources FOR ALL
  USING (public.current_user_role() IN ('admin', 'asset_manager'));

-- ── Bookings policies ─────────────────────────────────────────
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bookings_insert_any_auth" ON public.bookings;
CREATE POLICY "bookings_insert_any_auth" ON public.bookings FOR INSERT
  WITH CHECK (booked_by = auth.uid());

DROP POLICY IF EXISTS "bookings_update_managers" ON public.bookings;
CREATE POLICY "bookings_update_managers" ON public.bookings FOR UPDATE
  USING (
    public.current_user_role() IN ('admin', 'asset_manager', 'department_head') OR
    booked_by = auth.uid()
  );

-- ── Maintenance Requests policies ─────────────────────────────
DROP POLICY IF EXISTS "maint_select" ON public.maintenance_requests;
CREATE POLICY "maint_select" ON public.maintenance_requests FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'asset_manager', 'department_head') OR
    reported_by = auth.uid() OR
    assigned_to = auth.uid()
  );

DROP POLICY IF EXISTS "maint_insert" ON public.maintenance_requests;
CREATE POLICY "maint_insert" ON public.maintenance_requests FOR INSERT
  WITH CHECK (reported_by = auth.uid());

DROP POLICY IF EXISTS "maint_update_managers" ON public.maintenance_requests;
CREATE POLICY "maint_update_managers" ON public.maintenance_requests FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'asset_manager', 'department_head'));

-- ── Notifications policies ────────────────────────────────────
DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
CREATE POLICY "notif_select_own" ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_delete_own" ON public.notifications;
CREATE POLICY "notif_delete_own" ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_insert_auth" ON public.notifications;
CREATE POLICY "notif_insert_auth" ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Audit Logs policies ───────────────────────────────────────
DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_select" ON public.audit_logs;
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'asset_manager', 'department_head') OR
    actor_id = auth.uid()
  );

DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── System Settings policies ──────────────────────────────────
DROP POLICY IF EXISTS "settings_select_admin" ON public.system_settings;
DROP POLICY IF EXISTS "settings_select" ON public.system_settings;
CREATE POLICY "settings_select" ON public.system_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "settings_write_admin" ON public.system_settings;
CREATE POLICY "settings_write_admin" ON public.system_settings FOR ALL
  USING (public.current_user_role() = 'admin');

-- ── Enable Realtime for notifications ─────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- Seed Data (remove or modify for production)
-- ============================================================

-- Asset Categories
INSERT INTO public.asset_categories (name, description) VALUES
  ('Laptop',          'Portable computing devices'),
  ('Desktop',         'Stationary desktop computers'),
  ('Monitor',         'Display screens'),
  ('Printer',         'Printing equipment'),
  ('Server',          'Rack and tower servers'),
  ('Networking',      'Switches, routers, access points'),
  ('Mobile Device',   'Smartphones and tablets'),
  ('Furniture',       'Office furniture'),
  ('Vehicle',         'Company vehicles'),
  ('Software License','Software licenses and subscriptions')
ON CONFLICT (name) DO NOTHING;

-- Sample Departments
INSERT INTO public.departments (name, code, description) VALUES
  ('Engineering',        'ENG',  'Software and hardware engineering'),
  ('Operations',         'OPS',  'Operations and logistics'),
  ('Human Resources',    'HR',   'People and culture'),
  ('Finance',            'FIN',  'Finance and accounting'),
  ('IT Infrastructure',  'IT',   'IT support and infrastructure'),
  ('Sales',              'SAL',  'Sales and business development')
ON CONFLICT (code) DO NOTHING;

-- Sample Bookable Resources
INSERT INTO public.resources (name, type, description, location, capacity, requires_approval) VALUES
  ('Conference Room A',  'room',      'Large conference room, 20 seats',   'Floor 3, Room 301', 20, true),
  ('Conference Room B',  'room',      'Medium conference room, 10 seats',  'Floor 2, Room 201', 10, true),
  ('Training Lab',       'room',      'Computer training lab, 30 seats',   'Floor 1, Room 101', 30, true),
  ('Company Van',        'vehicle',   '7-seater company van',               'Parking Level B1',   7, true),
  ('Portable Projector', 'equipment', 'Epson portable projector with HDMI', 'IT Storage Room',    1, false),
  ('Video Camera Kit',   'equipment', 'Sony video camera with tripod',      'Media Room',         1, true)
ON CONFLICT DO NOTHING;

-- ── Stored Procedures & Business Logic RPCs ───────────────────

CREATE OR REPLACE FUNCTION public.allocate_asset(
  p_asset_id UUID,
  p_assigned_to UUID,
  p_assigned_by UUID,
  p_department_id UUID DEFAULT NULL,
  p_expected_return TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alloc_id UUID;
BEGIN
  INSERT INTO public.allocations (
    asset_id, assigned_to, assigned_by, department_id, expected_return, notes, status
  ) VALUES (
    p_asset_id, p_assigned_to, p_assigned_by, p_department_id, p_expected_return, p_notes, 'active'
  ) RETURNING id INTO v_alloc_id;

  UPDATE public.assets
  SET status = 'allocated',
      assigned_to = p_assigned_to,
      department_id = COALESCE(p_department_id, department_id),
      updated_at = now()
  WHERE id = p_asset_id;

  RETURN v_alloc_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_asset(
  p_allocation_id UUID,
  p_return_notes TEXT DEFAULT NULL,
  p_condition asset_condition DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_id UUID;
BEGIN
  UPDATE public.allocations
  SET status = 'returned',
      actual_return = now(),
      return_notes = p_return_notes,
      updated_at = now()
  WHERE id = p_allocation_id
  RETURNING asset_id INTO v_asset_id;

  UPDATE public.assets
  SET status = 'available',
      assigned_to = NULL,
      condition = COALESCE(p_condition, condition),
      updated_at = now()
  WHERE id = v_asset_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_resource_id UUID,
  p_booked_by UUID,
  p_department_id UUID DEFAULT NULL,
  p_title TEXT,
  p_purpose TEXT DEFAULT NULL,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id UUID;
  v_conflict_count INT;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.bookings
  WHERE resource_id = p_resource_id
    AND status IN ('pending', 'approved')
    AND start_time < p_end_time
    AND end_time > p_start_time;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'Resource is already booked during this time interval';
  END IF;

  INSERT INTO public.bookings (
    resource_id, booked_by, department_id, title, purpose, start_time, end_time, notes, status
  ) VALUES (
    p_resource_id, p_booked_by, p_department_id, p_title, p_purpose, p_start_time, p_end_time, p_notes, 'pending'
  ) RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type notif_type DEFAULT 'info',
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notif_id UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id, title, message, type, entity_type, entity_id, is_read
  ) VALUES (
    p_user_id, p_title, p_message, p_type, p_entity_type, p_entity_id, false
  ) RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

-- ============================================================
-- DONE — Run the above SQL in the Supabase SQL Editor.
-- Then set these environment variables in your .env.local:
--   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
--   VITE_SUPABASE_ANON_KEY=<your-anon-key>
-- ============================================================

