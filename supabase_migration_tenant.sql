-- 智排云多租户改造 SQL 脚本
-- 在 Supabase SQL Editor 中执行

-- 1. 新增 admin_tenants 表
CREATE TABLE IF NOT EXISTS admin_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL UNIQUE,
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- 给 anon 角色授权
GRANT ALL ON admin_tenants TO anon;
GRANT ALL ON admin_tenants TO authenticated;

-- 关闭 RLS（与其他表保持一致）
ALTER TABLE admin_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_all ON admin_tenants FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY auth_all ON admin_tenants FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. 给 7 张表加 tenant_id 字段（默认值 'gege'，保护哥哥现有数据）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'gege';
ALTER TABLE order_progress ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'gege';
ALTER TABLE process_transfers ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'gege';
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'gege';
ALTER TABLE material_batches ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'gege';
ALTER TABLE material_allocations ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'gege';
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT 'gege';

-- 3. 为 demo 租户复制工人账号（PIN 重置为 0000 的 bcrypt hash）
INSERT INTO worker_profiles (worker_no, display_name, role_type, pin_hash, pin_changed, is_active, tenant_id)
SELECT worker_no, display_name, role_type, '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', false, is_active, 'demo'
FROM worker_profiles WHERE tenant_id = 'gege'
ON CONFLICT DO NOTHING;

-- 注意：上面的 bcrypt hash 是 '0000' 的哈希值
-- 如果 ON CONFLICT 报错（没有唯一约束），可以先检查是否已有 demo 数据：
-- SELECT count(*) FROM worker_profiles WHERE tenant_id = 'demo';

-- 4. 创建索引加速 tenant_id 查询
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_progress_tenant ON order_progress(tenant_id);
CREATE INDEX IF NOT EXISTS idx_process_transfers_tenant ON process_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_tenant ON worker_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_material_batches_tenant ON material_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_material_allocations_tenant ON material_allocations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_tenant ON anomalies(tenant_id);

-- 5. 完成后，需要在 Supabase Dashboard → Authentication 中手动创建两个用户：
--    929868431@qq.com（哥哥）
--    2924152744@qq.com（郭宸宇）
-- 然后获取他们的 user_id，执行：
-- INSERT INTO admin_tenants (user_id, tenant_id, display_name) VALUES
--   ('<哥哥的user_id>', 'gege', '新鄞工缝纫机科技'),
--   ('<郭宸宇的user_id>', 'demo', '演示环境');
