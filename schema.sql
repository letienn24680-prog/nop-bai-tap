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

-- ========================================================
-- KÍCH HOẠT REALTIME CẬP NHẬT TỨC THÌ
-- ========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'eduproof_users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE eduproof_users;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'eduproof_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE eduproof_assignments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'eduproof_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE eduproof_submissions;
  END IF;
END $$;

-- ========================================================
-- PHÂN QUYỀN ROW LEVEL SECURITY (RLS) & BẢO VỆ DỮ LIỆU
-- ========================================================
ALTER TABLE eduproof_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduproof_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE eduproof_submissions ENABLE ROW LEVEL SECURITY;

-- 1. Bảng eduproof_users: Bảo vệ tài khoản Admin không bị xóa
DROP POLICY IF EXISTS "Public all users" ON eduproof_users;
DROP POLICY IF EXISTS "Allow select users" ON eduproof_users;
DROP POLICY IF EXISTS "Allow insert users" ON eduproof_users;
DROP POLICY IF EXISTS "Allow update users" ON eduproof_users;
DROP POLICY IF EXISTS "Allow delete users" ON eduproof_users;

CREATE POLICY "Allow select users" ON eduproof_users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert users" ON eduproof_users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update users" ON eduproof_users FOR UPDATE TO anon, authenticated USING (id != 'admin_root');
CREATE POLICY "Allow delete users" ON eduproof_users FOR DELETE TO anon, authenticated USING (role != 'admin' AND id != 'admin_root');

-- 2. Bảng eduproof_assignments:
DROP POLICY IF EXISTS "Public all assignments" ON eduproof_assignments;
DROP POLICY IF EXISTS "Allow all assignments" ON eduproof_assignments;
CREATE POLICY "Allow all assignments" ON eduproof_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. Bảng eduproof_submissions:
-- Cho phép Học sinh nộp bài (INSERT), xem bài (SELECT), sửa bài nộp hoặc Giáo viên chấm điểm (UPDATE) và xóa khi xóa đợt bài (DELETE).
DROP POLICY IF EXISTS "Public all submissions" ON eduproof_submissions;
DROP POLICY IF EXISTS "Allow select submissions" ON eduproof_submissions;
DROP POLICY IF EXISTS "Allow insert submissions" ON eduproof_submissions;
DROP POLICY IF EXISTS "Allow update submissions" ON eduproof_submissions;
DROP POLICY IF EXISTS "Allow delete submissions" ON eduproof_submissions;

CREATE POLICY "Allow select submissions" ON eduproof_submissions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert submissions" ON eduproof_submissions FOR INSERT TO anon, authenticated WITH CHECK (student_id IS NOT NULL);
CREATE POLICY "Allow update submissions" ON eduproof_submissions FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow delete submissions" ON eduproof_submissions FOR DELETE TO anon, authenticated USING (true);

GRANT ALL ON TABLE eduproof_users TO anon, authenticated;
GRANT ALL ON TABLE eduproof_assignments TO anon, authenticated;
GRANT ALL ON TABLE eduproof_submissions TO anon, authenticated;

-- ========================================================
-- DATABASE TRIGGER: CHỐNG GIAN LẬN ĐIỂM SỐ
-- ========================================================
CREATE OR REPLACE FUNCTION protect_submission_integrity()
RETURNS TRIGGER AS $$
BEGIN
  -- Nếu bài đã được chấm điểm (graded), không cho phép tự ý xóa điểm
  IF OLD.status = 'graded' AND NEW.status != 'graded' AND (NEW.feedback IS NULL OR NEW.feedback = '') THEN
    RAISE EXCEPTION 'Không thể hủy hoặc xóa điểm của bài nộp đã được giáo viên đánh giá.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_submission_integrity ON eduproof_submissions;
CREATE TRIGGER trg_submission_integrity
  BEFORE UPDATE ON eduproof_submissions
  FOR EACH ROW
  EXECUTE FUNCTION protect_submission_integrity();

-- Tạo sẵn tài khoản Admin và Giáo viên mẫu nếu chưa có
INSERT INTO eduproof_users (id, username, password, name, role, class, subject, teacher_id)
VALUES 
  ('admin_root', 'admin', 'admin123', 'Quản trị viên Hệ thống', 'admin', NULL, 'Ban Giám Hiệu', NULL),
  ('gvcn_ngo_ha', 'gvcn-ngo-ha', '000000', 'Cô Ngô Hà', 'teacher', '12A1', 'GVCN Lớp 12A1', NULL)
ON CONFLICT (username) DO NOTHING;

