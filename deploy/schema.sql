CREATE TABLE IF NOT EXISTS public.hanzha_repair_records (
  id uuid PRIMARY KEY,
  component_id text NOT NULL CHECK (
    component_id IN ('GATE-01', 'HOIST-01', 'PIER-L', 'PIER-R', 'CHAMBER-01', 'BRIDGE-01')
  ),
  inspected_at date NOT NULL CHECK (inspected_at BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  inspector varchar(40) NOT NULL CHECK (char_length(btrim(inspector)) BETWEEN 1 AND 40),
  issue text NOT NULL CHECK (char_length(btrim(issue)) BETWEEN 2 AND 600),
  action text NOT NULL CHECK (char_length(btrim(action)) BETWEEN 2 AND 600),
  status text NOT NULL CHECK (status IN ('正常', '待处理', '已处理')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hanzha_records_created_at_idx
  ON public.hanzha_repair_records (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS hanzha_records_component_created_at_idx
  ON public.hanzha_repair_records (component_id, created_at DESC, id DESC);
