
-- User devices tracking
CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  device_name text,
  browser text,
  os text,
  ip_address text,
  is_approved boolean DEFAULT false,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, device_fingerprint)
);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own devices" ON public.user_devices FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can insert own devices" ON public.user_devices FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own or admin" ON public.user_devices FOR UPDATE USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete devices" ON public.user_devices FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Dropdown options management
CREATE TABLE public.dropdown_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text NOT NULL,
  parent_value text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.dropdown_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read dropdown_options" ON public.dropdown_options FOR SELECT USING (true);
CREATE POLICY "Admins can insert dropdown_options" ON public.dropdown_options FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update dropdown_options" ON public.dropdown_options FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete dropdown_options" ON public.dropdown_options FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed materials
INSERT INTO public.dropdown_options (category, value) VALUES
('material', 'HR'), ('material', 'HR Chq'), ('material', 'HRPO'), ('material', 'CR'),
('material', 'GP'), ('material', 'GPSP'), ('material', 'PPGI'), ('material', 'PPGL'),
('material', 'BGL'), ('material', 'Structure'), ('material', 'Others');

-- Seed makes
INSERT INTO public.dropdown_options (category, value) VALUES
('make', 'AMNS'), ('make', 'JSW'), ('make', 'TATA'), ('make', 'Gaurang'),
('make', 'SAIL'), ('make', 'POSCO'), ('make', 'Indradhanush'), ('make', 'BPSL'),
('make', 'Hitech'), ('make', 'Others');

-- Seed forms
INSERT INTO public.dropdown_options (category, value) VALUES
('form', 'Pack coil'), ('form', 'Packet'), ('form', 'Sheet'),
('form', 'Slit Coil'), ('form', 'Loose Coil');

-- Seed coatings with parent material
INSERT INTO public.dropdown_options (category, value, parent_value) VALUES
('coating', '80gsm', 'GP'), ('coating', '90gsm', 'GP'), ('coating', '100gsm', 'GP'),
('coating', '120gsm', 'GP'), ('coating', '180gsm', 'GP'), ('coating', '275gsm', 'GP'),
('coating', '350gsm', 'GP'), ('coating', 'Other', 'GP'),
('coating', 'AZ70', 'BGL'), ('coating', 'AZ150', 'BGL'),
('coating', '80gsm', 'GPSP'), ('coating', '90gsm', 'GPSP'), ('coating', '100gsm', 'GPSP'),
('coating', '120gsm', 'GPSP'), ('coating', '180gsm', 'GPSP'), ('coating', '275gsm', 'GPSP'),
('coating', '350gsm', 'GPSP'), ('coating', 'Other', 'GPSP'),
('coating', '80gsm', 'PPGI'), ('coating', '90gsm', 'PPGI'), ('coating', '120gsm', 'PPGI'),
('coating', '275gsm', 'PPGI'),
('coating', 'AZ70', 'PPGL'), ('coating', 'AZ150 - RMP', 'PPGL'), ('coating', 'AZ150 - SMP', 'PPGL'),
('coating', 'AZ150 - SDP', 'PPGL'), ('coating', 'AZ200 - PVDF', 'PPGL');

-- Seed grades with parent material
INSERT INTO public.dropdown_options (category, value, parent_value) VALUES
('grade', 'D', 'CR'), ('grade', 'DD', 'CR'), ('grade', 'EDD/IF', 'CR'),
('grade', 'GP250', 'GP'), ('grade', 'GP350', 'GP'), ('grade', 'Tad', 'GP'), ('grade', 'GPH', 'GP'),
('grade', 'IS10748 Gr1', 'HR'), ('grade', 'IS10748 Gr2', 'HR'), ('grade', 'IS1079', 'HR'),
('grade', 'IS2062 E250', 'HR'), ('grade', 'IS2062 E350', 'HR'), ('grade', 'Others', 'HR'),
('grade', '250mpa', 'BGL'), ('grade', '300mpa', 'BGL'), ('grade', '350mpa', 'BGL'), ('grade', '550mpa', 'BGL'),
('grade', 'GP250', 'GPSP'), ('grade', 'GP350', 'GPSP'), ('grade', 'Tad', 'GPSP'),
('grade', 'EDD', 'GPSP'), ('grade', 'IF Normal', 'GPSP'), ('grade', 'IF Oily', 'GPSP'), ('grade', 'IF Chromated', 'GPSP'),
('grade', 'IS10748', 'HRPO'), ('grade', 'IS1079', 'HRPO'),
('grade', 'RAL 5012', 'PPGI'), ('grade', 'RAL 9002 - Soft', 'PPGI'), ('grade', 'RAL 9002 - Hard', 'PPGI'),
('grade', 'RAL 9003 - Soft', 'PPGI'), ('grade', 'RAL 9003 - Hard', 'PPGI'),
('grade', 'RAL 7016', 'PPGI'), ('grade', 'RAL 7024', 'PPGI'), ('grade', 'RAL 7035', 'PPGI'),
('grade', 'RAL 7037', 'PPGI'), ('grade', 'Seco Red', 'PPGI'), ('grade', 'Brick Red', 'PPGI'),
('grade', 'RAL 6002', 'PPGI'), ('grade', 'RAL 6016', 'PPGI'), ('grade', 'RAL 2008 (Orange)', 'PPGI'),
('grade', 'Black', 'PPGI'), ('grade', 'RAL 3020 (Traffic Red)', 'PPGI'),
('grade', 'RAL 5012', 'PPGL'), ('grade', 'RAL 9002', 'PPGL'), ('grade', 'RAL 9003', 'PPGL'),
('grade', 'RAL 7016', 'PPGL'), ('grade', 'RAL 7024', 'PPGL'), ('grade', 'RAL 7035', 'PPGL'),
('grade', 'RAL 7037', 'PPGL'), ('grade', 'Seco Red', 'PPGL'), ('grade', 'Brick Red', 'PPGL'),
('grade', 'RAL 6002', 'PPGL'), ('grade', 'RAL 6016', 'PPGL'), ('grade', 'RAL 2008 (Orange)', 'PPGL'),
('grade', 'RAL 7043', 'PPGL'),
('grade', 'IS 3502', 'HR Chq');
