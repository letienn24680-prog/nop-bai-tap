-- ========================================================
-- EDUPROOF DATABASE SCHEMA (Chạy trên Supabase SQL Editor)
-- ========================================================

-- 1. Bảng tài khoản: Admin, Giáo viên, Học sinh
CREATE TABLE IF NOT EXISTS eduproof_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'admin' | 'teacher' | 'student'
  class TEXT,
  subject TEXT,
  teacher_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng bài tập
CREATE TABLE IF NOT EXISTS eduproof_assignments (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  description TEXT,
  min_photos INT DEFAULT 1,
  allow_link BOOLEAN DEFAULT TRUE,
  allow_note BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bảng bài nộp & minh chứng
CREATE TABLE IF NOT EXISTS eduproof_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL, -- 'submitted' | 'graded' | 'resubmit_requested'
  photos JSONB DEFAULT '[]'::jsonb,
  link_proof TEXT,
  student_note TEXT,
  annotations JSONB DEFAULT '{}'::jsonb,
  grade NUMERIC,
  feedback TEXT,
  resubmit_requested BOOLEAN DEFAULT FALSE
);

-- Cho phép đọc ghi đầy đủ thông qua Anon Key
ALTER TABLE eduproof_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduproof_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduproof_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public all users" ON eduproof_users;
CREATE POLICY "Public all users" ON eduproof_users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public all assignments" ON eduproof_assignments;
CREATE POLICY "Public all assignments" ON eduproof_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public all submissions" ON eduproof_submissions;
CREATE POLICY "Public all submissions" ON eduproof_submissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE eduproof_users TO anon, authenticated;
GRANT ALL ON TABLE eduproof_assignments TO anon, authenticated;
GRANT ALL ON TABLE eduproof_submissions TO anon, authenticated;

-- Tạo sẵn tài khoản Admin và Giáo viên mẫu nếu chưa có
INSERT INTO eduproof_users (id, username, password, name, role, class, subject, teacher_id)
VALUES 
  ('admin_root', 'admin', 'admin123', 'Quản trị viên Hệ thống', 'admin', NULL, 'Ban Giám Hiệu', NULL),
  ('gvcn_ngo_ha', 'gvcn-ngo-ha', '000000', 'Cô Ngô Hà', 'teacher', '12A1', 'GVCN Lớp 12A1', NULL)
ON CONFLICT (username) DO NOTHING;

