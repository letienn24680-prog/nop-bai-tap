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
-- KÍCH HOẠT REALTIME CẬP NHẬT TỨC THÌ (Idempotent)
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

-- 2. Bảng eduproof_assignments: Cho phép giáo viên tạo, sửa, xóa bài tập
DROP POLICY IF EXISTS "Public all assignments" ON eduproof_assignments;
DROP POLICY IF EXISTS "Allow all assignments" ON eduproof_assignments;
CREATE POLICY "Allow all assignments" ON eduproof_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. Bảng eduproof_submissions:
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
-- CẤU HÌNH SUPABASE STORAGE CHO ẢNH MINH CHỨNG (BUCKET: proofs)
-- ========================================================
-- Giới hạn dung lượng: 10MB/ảnh, chỉ chấp nhận định dạng ảnh
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proofs',
  'proofs',
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Phân quyền Storage: Cho phép đọc công khai và upload ảnh minh chứng
DROP POLICY IF EXISTS "Public Read Proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow Upload Proofs" ON storage.objects;
DROP POLICY IF EXISTS "Allow Delete Proofs" ON storage.objects;

CREATE POLICY "Public Read Proofs" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'proofs');

CREATE POLICY "Allow Upload Proofs" ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'proofs');

CREATE POLICY "Allow Delete Proofs" ON storage.objects FOR DELETE TO anon, authenticated
USING (bucket_id = 'proofs');

-- ========================================================
-- DATABASE TRIGGER: CHỐNG GIAN LẬN & TOÀN VẸN BÀI NỘP
-- ========================================================
CREATE OR REPLACE FUNCTION protect_submission_integrity()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Nếu bài đã được chấm điểm (graded), không cho phép tự ý xóa điểm
  IF OLD.status = 'graded' AND NEW.status != 'graded' AND (NEW.feedback IS NULL OR NEW.feedback = '') THEN
    RAISE EXCEPTION 'Không thể hủy hoặc xóa điểm của bài nộp đã được giáo viên đánh giá.';
  END IF;

  -- 2. Chống đổi mã học sinh hoặc mã bài tập của bài đã nộp
  IF OLD.student_id != NEW.student_id OR OLD.assignment_id != NEW.assignment_id THEN
    RAISE EXCEPTION 'Không được phép thay đổi mã học sinh hoặc mã bài tập của bài đã nộp.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_submission_integrity ON eduproof_submissions;
CREATE TRIGGER trg_submission_integrity
  BEFORE UPDATE ON eduproof_submissions
  FOR EACH ROW
  EXECUTE FUNCTION protect_submission_integrity();

-- ========================================================
-- RPC FUNCTIONS: XÁC THỰC DANH TÍNH BẢO VỆ NỘP BÀI & CHẤM ĐIỂM
-- ========================================================
-- 1. Hàm nộp bài: Bắt buộc xác thực mật khẩu học sinh (chống nộp thay / mạo danh bạn)
CREATE OR REPLACE FUNCTION submit_homework(
  p_student_id TEXT,
  p_password TEXT,
  p_assignment_id TEXT,
  p_photos JSONB,
  p_link_proof TEXT DEFAULT NULL,
  p_student_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student RECORD;
  v_assignment RECORD;
  v_submission_id TEXT;
  v_existing RECORD;
BEGIN
  -- 1. Xác thực học sinh bằng student_id và mật khẩu
  SELECT * INTO v_student FROM eduproof_users 
  WHERE id = p_student_id AND password = p_password AND role = 'student';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Xác thực không thành công: Mã học sinh hoặc mật khẩu không chính xác.';
  END IF;

  -- 2. Kiểm tra bài tập tồn tại
  SELECT * INTO v_assignment FROM eduproof_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bài tập không tồn tại hoặc đã bị giáo viên xóa.';
  END IF;

  -- 3. Kiểm tra xem đã có bài nộp trước đó chưa
  SELECT * INTO v_existing FROM eduproof_submissions 
  WHERE assignment_id = p_assignment_id AND student_id = p_student_id;

  IF FOUND THEN
    IF v_existing.status = 'graded' THEN
      RAISE EXCEPTION 'Bài nộp này đã được giáo viên chấm điểm. Không thể sửa hoặc nộp lại trừ khi có yêu cầu.';
    END IF;
    
    UPDATE eduproof_submissions
    SET 
      submitted_at = NOW(),
      status = 'submitted',
      photos = p_photos,
      link_proof = p_link_proof,
      student_note = p_student_note,
      resubmit_requested = false
    WHERE id = v_existing.id;
    
    v_submission_id := v_existing.id;
  ELSE
    v_submission_id := 'sub_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 6);
    INSERT INTO eduproof_submissions (
      id, assignment_id, student_id, student_name, submitted_at, status, photos, link_proof, student_note, annotations, grade, feedback, resubmit_requested
    ) VALUES (
      v_submission_id, p_assignment_id, p_student_id, v_student.name, NOW(), 'submitted', p_photos, p_link_proof, p_student_note, '{}'::jsonb, NULL, '', false
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'submission_id', v_submission_id);
END;
$$;

-- 2. Hàm chấm điểm: Bắt buộc xác thực mật khẩu giáo viên/admin (chống học sinh tự đổi điểm)
CREATE OR REPLACE FUNCTION grade_submission(
  p_teacher_id TEXT,
  p_password TEXT,
  p_submission_id TEXT,
  p_grade NUMERIC,
  p_feedback TEXT,
  p_annotations JSONB,
  p_resubmit BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher RECORD;
BEGIN
  -- Xác thực giáo viên hoặc admin
  SELECT * INTO v_teacher FROM eduproof_users 
  WHERE id = p_teacher_id AND password = p_password AND role IN ('teacher', 'admin');
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chỉ có giáo viên hoặc quản trị viên mới có quyền chấm điểm.';
  END IF;

  UPDATE eduproof_submissions
  SET 
    status = CASE WHEN p_resubmit THEN 'resubmit_requested' ELSE 'graded' END,
    grade = CASE WHEN p_resubmit THEN NULL ELSE p_grade END,
    feedback = p_feedback,
    annotations = p_annotations,
    resubmit_requested = p_resubmit
  WHERE id = p_submission_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Hàm đăng nhập bảo mật: Xác thực trực tiếp trên database, không trả về mật khẩu người khác
CREATE OR REPLACE FUNCTION login_user(
  p_username TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
BEGIN
  SELECT id, username, name, role, class, subject, teacher_id 
  INTO v_user 
  FROM eduproof_users 
  WHERE username = p_username AND password = p_password;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_user.id,
    'username', v_user.username,
    'password', p_password,
    'name', v_user.name,
    'role', v_user.role,
    'class', v_user.class,
    'subject', v_user.subject,
    'teacherId', v_user.teacher_id
  );
END;
$$;

-- 4. Hàm lấy danh sách tài khoản học sinh bảo vệ mật khẩu cho Giáo viên / Admin
CREATE OR REPLACE FUNCTION get_my_students(
  p_teacher_id TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher RECORD;
  v_students JSONB;
BEGIN
  SELECT * INTO v_teacher FROM eduproof_users 
  WHERE id = p_teacher_id AND password = p_password AND role IN ('teacher', 'admin');
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Xác thực giáo viên không thành công hoặc không có quyền.';
  END IF;

  IF v_teacher.role = 'admin' THEN
    SELECT jsonb_agg(jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'password', u.password,
      'name', u.name,
      'role', u.role,
      'class', u.class,
      'subject', u.subject,
      'teacherId', u.teacher_id
    )) INTO v_students FROM eduproof_users u;
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
      'id', u.id,
      'username', u.username,
      'password', u.password,
      'name', u.name,
      'role', u.role,
      'class', u.class,
      'subject', u.subject,
      'teacherId', u.teacher_id
    )) INTO v_students FROM eduproof_users u 
    WHERE u.teacher_id = p_teacher_id OR u.id = p_teacher_id;
  END IF;

  RETURN COALESCE(v_students, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_homework TO anon, authenticated;
GRANT EXECUTE ON FUNCTION grade_submission TO anon, authenticated;
GRANT EXECUTE ON FUNCTION login_user TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_students TO anon, authenticated;

-- Khởi tạo sẵn tài khoản Admin và Giáo viên mẫu nếu chưa có
INSERT INTO eduproof_users (id, username, password, name, role, class, subject, teacher_id)
VALUES 
  ('admin_root', 'admin', 'admin123', 'Quản trị viên Hệ thống', 'admin', NULL, 'Ban Giám Hiệu', NULL),
  ('gvcn_ngo_ha', 'gvcn-ngo-ha', '000000', 'Cô Ngô Hà', 'teacher', '12A1', 'GVCN Lớp 12A1', NULL)
ON CONFLICT (username) DO NOTHING;
