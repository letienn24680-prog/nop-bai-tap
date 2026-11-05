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

-- Cho phép đọc ghi thông qua Anon Key
ALTER TABLE eduproof_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE eduproof_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE eduproof_submissions DISABLE ROW LEVEL SECURITY;

-- Tạo sẵn tài khoản Admin và Giáo viên mẫu nếu chưa có
INSERT INTO eduproof_users (id, username, password, name, role, class, subject, teacher_id)
VALUES 
  ('admin_root', 'admin', 'admin123', 'Quản trị viên Hệ thống', 'admin', NULL, 'Ban Giám Hiệu', NULL),
  ('gvcn_ngo_ha', 'gvcn-ngo-ha', '000000', 'Cô Ngô Hà', 'teacher', '12A1', 'GVCN Lớp 12A1', NULL)
ON CONFLICT (username) DO NOTHING;

