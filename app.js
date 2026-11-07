// EduProof - Core Application Logic
// shortcut: Lưu trữ dữ liệu qua localStorage giới hạn dung lượng ~5-10MB, khi triển khai thực tế trên diện rộng cần nâng cấp lên Cloudflare R2 hoặc S3 presigned upload.

const DB_KEY_ASSIGNMENTS = "eduproof_assignments";
const DB_KEY_SUBMISSIONS = "eduproof_submissions";
const DB_KEY_USERS = "eduproof_users";
const DB_KEY_AUTH = "eduproof_auth_user";

// ==========================================
// SECURITY: XSS SANITIZATION & SAFE OUTPUT
// ==========================================
function sanitizeText(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const escapeHtml = sanitizeText;

function sanitizeUrl(url) {
  if (!url) return "#";
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return sanitizeText(trimmed);
  }
  return "#";
}

// Lấy mốc thời gian tạo của bài tập để sắp xếp bài mới nhất lên đầu tiên
function getAssignmentTime(asg) {
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
  if (asg.deadline) {
    const t = new Date(asg.deadline).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

const FALLBACK_PHOTO_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='none'%3E%3Crect width='48' height='48' rx='8' fill='%23EEF2FF'/%3E%3Cpath d='M14 18C14 16.8954 14.8954 16 16 16H20L22 13H26L28 16H32C33.1046 16 34 16.8954 34 18V32C34 33.1046 33.1046 34 32 34H16C14.8954 34 14 33.1046 14 32V18Z' stroke='%234F46E5' stroke-width='2.2' stroke-linejoin='round'/%3E%3Ccircle cx='24' cy='25' r='5' stroke='%234F46E5' stroke-width='2.2'/%3E%3C/svg%3E";

function handlePhotoError(imgEl) {
  if (!imgEl) return;
  const backup = imgEl.getAttribute("data-backup");
  if (backup && backup !== "" && backup !== "undefined" && imgEl.src !== backup) {
    imgEl.setAttribute("data-backup", ""); // Tránh lặp vô hạn nếu backup cũng lỗi
    imgEl.src = backup;
    return;
  }
  imgEl.onerror = null;
  imgEl.src = FALLBACK_PHOTO_SVG;
  imgEl.alt = "Ảnh minh chứng";
}

// Chuẩn hóa cấu trúc danh sách ảnh minh chứng (chống mất ảnh khi lưu dạng chuỗi JSON hoặc đối tượng URL)
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
      return { id: "p_" + idx, dataUrl: p, url: p, backupDataUrl: p, rotation: 0 };
    }
    const u = p.dataUrl || p.url || p.src || p.publicUrl || "";
    const backup = p.backupDataUrl || (typeof u === "string" && u.startsWith("data:") ? u : "");
    return { ...p, dataUrl: u, url: u, backupDataUrl: backup };
  });
}

function formatSubjectBadge(subject) {
  const s = (subject || "").trim();
  const lower = s.toLowerCase();
  let icon = "📚";
  if (lower.includes("đoàn") || lower.includes("thanh niên")) icon = "🚩";
  else if (lower.includes("phong trào") || lower.includes("ngoại khóa")) icon = "🎯";
  else if (lower.includes("cuộc thi") || lower.includes("hội thi") || lower.includes("tuyên truyền")) icon = "🏆";
  else if (lower.includes("lao động") || lower.includes("tình nguyện")) icon = "🌱";
  else if (lower.includes("kế hoạch")) icon = "📦";
  else if (lower.includes("toán")) icon = "📐";
  else if (lower.includes("văn")) icon = "📖";
  else if (lower.includes("anh")) icon = "🇬🇧";
  else if (lower.includes("lý") || lower.includes("vật lí")) icon = "⚡";
  else if (lower.includes("hóa")) icon = "🧪";
  else if (lower.includes("sinh")) icon = "🧬";
  else if (lower.includes("sử")) icon = "🏛️";
  else if (lower.includes("địa")) icon = "🌍";
  else if (lower.includes("tin")) icon = "💻";
  return `<span class="badge-subject">${icon} ${sanitizeText(s)}</span>`;
}

// ==========================================
// IN-APP NOTICE / DIALOG POPUP (Thay thế alert trình duyệt)
// ==========================================
function showNoticeModal(message, title = "Thông báo hệ thống", icon = "") {
  const modal = document.getElementById("noticeModal");
  if (!modal) {
    console.log(message);
    return;
  }
  const titleEl = document.getElementById("noticeModalTitle");
  const contentEl = document.getElementById("noticeModalContent");
  const iconEl = document.getElementById("noticeModalIcon");

  const str = String(message || "");
  let displayTitle = title;
  let displayIcon = icon;

  if (!icon) {
    if (str.includes("🎉") || str.toLowerCase().includes("thành công")) {
      displayIcon = "🎉";
      if (displayTitle === "Thông báo hệ thống") displayTitle = "Thành công!";
    } else if (str.includes("⚠️") || str.toLowerCase().includes("lỗi") || str.toLowerCase().includes("sai") || str.toLowerCase().includes("không")) {
      displayIcon = "⚠️";
      if (displayTitle === "Thông báo hệ thống") displayTitle = "Lưu ý";
    } else if (str.includes("📋") || str.toLowerCase().includes("sao chép")) {
      displayIcon = "📋";
      if (displayTitle === "Thông báo hệ thống") displayTitle = "Đã sao chép";
    } else {
      displayIcon = "🔔";
    }
  }

  if (titleEl) titleEl.innerText = displayTitle;
  if (contentEl) contentEl.innerText = str;
  if (iconEl) iconEl.innerText = displayIcon;

  modal.style.display = "flex";
}

function closeNoticeModal() {
  const modal = document.getElementById("noticeModal");
  if (modal) modal.style.display = "none";
}

let confirmModalCallback = null;

function showConfirmModal(message, onConfirm, title = "Xác nhận thao tác", actionText = "Đồng ý", isDanger = true) {
  confirmModalCallback = onConfirm;
  const modal = document.getElementById("confirmModal");
  if (!modal) {
    if (confirm(message)) {
      if (typeof onConfirm === "function") onConfirm();
    }
    return;
  }
  const titleEl = document.getElementById("confirmModalTitle");
  const contentEl = document.getElementById("confirmModalContent");
  const actionBtn = document.getElementById("confirmModalActionBtn");

  if (titleEl) titleEl.innerText = title;
  if (contentEl) contentEl.innerText = message;
  if (actionBtn) {
    actionBtn.innerText = actionText;
    actionBtn.className = isDanger ? "btn btn-danger" : "btn btn-primary";
  }

  modal.style.display = "flex";
}

function closeConfirmModal(accepted) {
  const modal = document.getElementById("confirmModal");
  if (modal) modal.style.display = "none";
  if (accepted && typeof confirmModalCallback === "function") {
    const cb = confirmModalCallback;
    confirmModalCallback = null;
    cb();
  } else {
    confirmModalCallback = null;
  }
}

// Ghi đè hàm alert() của trình duyệt sang popup trong trang web
if (typeof window !== "undefined") {
  window.alert = function(msg) {
    showNoticeModal(msg);
  };
}

// In-Memory State
let users = [];
let currentUser = null;
let assignments = [];
let submissions = [];

let studentFilter = "all";
let teacherActiveTab = "submissions";
let selectedCampaignId = null;
let campaignStudentFilter = "all";
let gradebookSelectedAssignmentId = null;
let gradebookStudentFilter = "all";

// Submission Modal State (Student)
let activeSubmittingAssignmentId = null;
let currentUploadedPhotos = [];
let cameraMediaStream = null;

// Grading Studio State (Teacher)
let activeGradingSubmissionId = null;
let activeGradingPageIndex = 0;
let activeTool = "pen";
let canvasUndoStack = [];
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// ==========================================
// 1. INITIALIZATION & DATA SEEDING
// ==========================================

function createMockHandwrittenPage(title, pageNum, contentLines) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");

  // Paper background (notebook grid style)
  ctx.fillStyle = "#FFFDF9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Red margin line
  ctx.strokeStyle = "#FCA5A5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(140, 0);
  ctx.lineTo(140, canvas.height);
  ctx.stroke();

  // Ruled horizontal lines
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  for (let y = 120; y < canvas.height - 40; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Header Text
  ctx.fillStyle = "#1E3A8A";
  ctx.font = "bold 28px -apple-system, sans-serif";
  ctx.fillText(`HỌC SINH: NGUYỄN VĂN AN - LỚP 12A1`, 170, 75);
  ctx.font = "20px -apple-system, sans-serif";
  ctx.fillText(`BÀI LÀM: ${title.toUpperCase()} (Trang ${pageNum})`, 170, 105);

  // Simulated handwriting lines (blue ink)
  ctx.fillStyle = "#1E40AF";
  ctx.font = "italic 22px 'Segoe UI', cursive, sans-serif";

  let startY = 160;
  contentLines.forEach((line) => {
    ctx.fillText(line, 170, startY);
    startY += 45;
  });

  return canvas.toDataURL("image/jpeg", 0.85);
}

function initData() {
  // 1. Load or Seed Users
  const savedUsers = localStorage.getItem(DB_KEY_USERS);
  if (savedUsers) {
    try {
      users = JSON.parse(savedUsers);
    } catch (e) {
      users = [];
    }
  }

  if (!users || users.length === 0) {
    users = [
      {
        id: "admin_root",
        username: "admin",
        password: "admin123",
        name: "Quản trị viên Hệ thống",
        role: "admin"
      },
      {
        id: "gvcn_ngo_ha",
        username: "gvcn-ngo-ha",
        password: "000000",
        name: "Cô Ngô Hà",
        role: "teacher",
        subject: "GVCN Lớp 12A1"
      },
      {
        id: "gv_nam",
        username: "gv-nam",
        password: "123456",
        name: "Thầy Nam",
        role: "teacher",
        subject: "Tiếng Anh - 12A2"
      },
      {
        id: "hs_an",
        username: "hs_an",
        password: "123456",
        name: "Nguyễn Văn An",
        role: "student",
        class: "12A1",
        teacherId: "gvcn_ngo_ha"
      },
      {
        id: "hs_mai",
        username: "hs_mai",
        password: "123456",
        name: "Trần Thị Mai",
        role: "student",
        class: "12A1",
        teacherId: "gvcn_ngo_ha"
      },
      {
        id: "hs_nam",
        username: "hs_nam",
        password: "123456",
        name: "Lê Hoàng Nam",
        role: "student",
        class: "12A1",
        teacherId: "gvcn_ngo_ha"
      }
    ];
  }

  // Đảm bảo tài khoản admin luôn tồn tại
  if (!users.some((u) => u.username === "admin" || u.role === "admin")) {
    users.unshift({
      id: "admin_root",
      username: "admin",
      password: "admin123",
      name: "Quản trị viên Hệ thống",
      role: "admin"
    });
  }

  // Đảm bảo tài khoản giáo viên gvcn-ngo-ha (mật khẩu 000000) luôn tồn tại
  if (!users.some((u) => u.username === "gvcn-ngo-ha")) {
    users.push({
      id: "gvcn_ngo_ha",
      username: "gvcn-ngo-ha",
      password: "000000",
      name: "Cô Ngô Hà",
      role: "teacher",
      subject: "GVCN Lớp 12A1"
    });
  }

  // Đảm bảo tất cả học sinh đều được gán teacherId
  users.forEach((u) => {
    if (u.role === "student" && !u.teacherId) {
      u.teacherId = "gvcn_ngo_ha";
    }
  });

  localStorage.setItem(DB_KEY_USERS, JSON.stringify(users));

  // 2. Session check: Giữ nguyên trạng thái đăng nhập và vị trí trang khi nhấn F5
  const savedAuth = localStorage.getItem(DB_KEY_AUTH) || sessionStorage.getItem(DB_KEY_AUTH);
  if (savedAuth) {
    try {
      const parsed = JSON.parse(savedAuth);
      currentUser = users.find((u) => u.username === parsed.username) || parsed;
    } catch (e) {
      currentUser = null;
    }
  } else {
    currentUser = null;
  }

  // Khôi phục tab và đợt bài tập đang mở trước khi F5
  const savedTeacherTab = localStorage.getItem("eduproof_teacher_tab");
  if (savedTeacherTab) teacherActiveTab = savedTeacherTab;

  const savedAdminTab = localStorage.getItem("eduproof_admin_tab");
  if (savedAdminTab) adminActiveTab = savedAdminTab;

  const savedStudentFilter = localStorage.getItem("eduproof_student_filter");
  if (savedStudentFilter) studentFilter = savedStudentFilter;

  const savedSelectedCampaign = localStorage.getItem("eduproof_selected_campaign");
  if (savedSelectedCampaign) selectedCampaignId = savedSelectedCampaign;

  const savedGradebookAsg = localStorage.getItem("eduproof_gradebook_asg");
  if (savedGradebookAsg) gradebookSelectedAssignmentId = savedGradebookAsg;

  // 3. Load or Seed Assignments & Submissions
  const savedAssignments = localStorage.getItem(DB_KEY_ASSIGNMENTS);
  const savedSubmissions = localStorage.getItem(DB_KEY_SUBMISSIONS);

  if (savedAssignments && savedSubmissions) {
    try {
      assignments = JSON.parse(savedAssignments);
      submissions = JSON.parse(savedSubmissions);
      if (Array.isArray(submissions)) {
        submissions.forEach((s) => {
          s.photos = normalizePhotos(s.photos);
        });
      }
      assignments.forEach((a) => {
        if (!a.teacherId) a.teacherId = "gvcn_ngo_ha";
      });
      // Sắp xếp bài mới nhất luôn ở hàng đầu tiên
      assignments.sort((a, b) => getAssignmentTime(b) - getAssignmentTime(a));
      if (!selectedCampaignId && assignments.length > 0) {
        selectedCampaignId = assignments[0].id;
      }
      if (!gradebookSelectedAssignmentId && assignments.length > 0) {
        gradebookSelectedAssignmentId = assignments[0].id;
      }
      updateHeaderUserDisplay();
      renderCurrentView();

      // Tự động đồng bộ với Supabase Cloud ngay khi có mạng
      syncCloudData(false);
      return;
    } catch (e) {
      console.warn("Lỗi đọc cache, khởi tạo dữ liệu mẫu...", e);
    }
  }

  const now = new Date();
  const deadlineToday = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();
  const deadlineTomorrow = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const deadlinePast = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();

  assignments = [
    {
      id: "asg_math_12",
      teacherId: "gvcn_ngo_ha",
      title: "Toán 12 - Khảo sát và vẽ đồ thị hàm số phân thức bậc 1 / bậc 1",
      subject: "Toán học",
      deadline: deadlineToday,
      description: "Làm bài tập 1 đến 4 trang 38 SGK. Chụp rõ các bước tìm tập xác định, đạo hàm y', bảng biến thiên và đồ thị trên giấy kẻ ô.",
      minPhotos: 2,
      allowLink: true,
      allowNote: true,
      createdAt: now.toISOString()
    },
    {
      id: "asg_chem_12",
      teacherId: "gvcn_ngo_ha",
      title: "Hóa học 12 - Bài tập Chuỗi phản ứng Hợp chất Amin & Amino Axit",
      subject: "Hóa học",
      deadline: deadlineTomorrow,
      description: "Viết phương trình hóa học hoàn thành sơ đồ chuyển hóa. Ghi rõ điều kiện nhiệt độ và xúc tác.",
      minPhotos: 1,
      allowLink: true,
      allowNote: true,
      createdAt: now.toISOString()
    },
    {
      id: "asg_eng_12",
      teacherId: "gvcn_ngo_ha",
      title: "Tiếng Anh 12 - Unit 4: Essay on Lifelong Learning & Vocabulary",
      subject: "Tiếng Anh",
      deadline: deadlinePast,
      description: "Write an essay of 180 words discussing the benefits of online self-study, then finish reading exercises.",
      minPhotos: 1,
      allowLink: true,
      allowNote: true,
      createdAt: now.toISOString()
    }
  ];

  selectedCampaignId = assignments[0].id;

  const mathPage1 = createMockHandwrittenPage("Khảo sát hàm số y = (2x-1)/(x+1)", 1, [
    "Bài 1: Khảo sát sự biến thiên và vẽ đồ thị hàm số y = (2x - 1) / (x + 1)",
    "1. Tập xác định: D = R \\ {-1}",
    "2. Sự biến thiên:",
    "   * Đạo hàm: y' = (2(x+1) - 1(2x-1)) / (x+1)^2 = (2x + 2 - 2x + 1) / (x+1)^2 = 3 / (x+1)^2",
    "   * Vì 3 > 0 nên y' > 0 với mọi x thuộc D. Hàm số đồng biến trên các khoảng (-∞; -1) và (-1; +∞).",
    "   * Tiệm cận đứng: lim y khi x -> -1+ là -∞, lim y khi x -> -1- là +∞ => TC đứng: x = -1",
    "   * Tiệm cận ngang: lim y khi x -> ±∞ = 2 => TC ngang: y = 2"
  ]);

  const mathPage2 = createMockHandwrittenPage("Khảo sát hàm số y = (2x-1)/(x+1)", 2, [
    "3. Bảng biến thiên:",
    "   x   | -∞         -1          +∞",
    "   y'  |       +    ||     +      ",
    "   y   | 2  ↗  +∞   ||  -∞  ↗   2 ",
    "4. Đồ thị: Đi qua các điểm (0; -1), (1/2; 0). Nhận giao điểm I(-1; 2) làm tâm đối xứng.",
    "[Hình vẽ hai nhánh hypebol cân đối qua tâm I(-1; 2)]"
  ]);

  submissions = [
    {
      id: "sub_an_math",
      assignmentId: "asg_math_12",
      studentId: "hs_an",
      studentName: "Nguyễn Văn An",
      submittedAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      status: "submitted",
      photos: [
        { id: "p1", dataUrl: mathPage1, rotation: 0, sizeKb: 430 },
        { id: "p2", dataUrl: mathPage2, rotation: 0, sizeKb: 410 }
      ],
      linkProof: "https://drive.google.com/file/d/sample-math-12a1",
      studentNote: "Em đã hoàn thành bài 1 và bài 2, đồ thị câu 1 em vẽ thước đo chuẩn.",
      annotations: {},
      grade: null,
      feedback: "",
      resubmitRequested: false
    },
    {
      id: "sub_an_eng",
      assignmentId: "asg_eng_12",
      studentId: "hs_an",
      studentName: "Nguyễn Văn An",
      submittedAt: new Date(now.getTime() - 50 * 3600 * 1000).toISOString(),
      status: "graded",
      photos: [
        {
          id: "p3",
          dataUrl: createMockHandwrittenPage("Unit 4 Essay", 1, [
            "Topic: The merits of lifelong education in the digital age.",
            "In recent years, continuous learning has emerged as an indispensable pursuit...",
            "Firstly, the relentless pace of technological advancement demands adaptability...",
            "In conclusion, committing to knowledge acquisition ensures personal growth."
          ]),
          rotation: 0,
          sizeKb: 380
        }
      ],
      linkProof: "",
      studentNote: "",
      annotations: {},
      grade: 9.0,
      feedback: "Bài viết rất lưu loát, dùng cấu trúc câu phức và từ vựng phong phú. Cần chú ý dấu chấm phẩy ở đoạn 2.",
      resubmitRequested: false
    }
  ];

  persistData();
  updateHeaderUserDisplay();
  renderCurrentView();

  // Khởi động đồng bộ dữ liệu với Supabase Cloud
  syncCloudData(false);
}

function persistData() {
  try {
    localStorage.setItem(DB_KEY_USERS, JSON.stringify(users));
    localStorage.setItem(DB_KEY_ASSIGNMENTS, JSON.stringify(assignments));
    localStorage.setItem(DB_KEY_SUBMISSIONS, JSON.stringify(submissions));
  } catch (err) {
    console.warn("localStorage quota cảnh báo (dữ liệu lớn, tiếp tục dùng Supabase Cloud):", err);
  }

  if (currentUser) {
    localStorage.setItem(DB_KEY_AUTH, JSON.stringify(currentUser));
    sessionStorage.setItem(DB_KEY_AUTH, JSON.stringify(currentUser));
  } else {
    localStorage.removeItem(DB_KEY_AUTH);
    sessionStorage.removeItem(DB_KEY_AUTH);
  }
}

// ==========================================
// SUPABASE CLOUD SYNC LAYER
// ==========================================

function getSupabase() {
  return window.supabaseClient || null;
}

function updateCloudIndicator(status, text) {
  const dot = document.getElementById("cloudStatusDot");
  const label = document.getElementById("cloudStatusText");
  if (!dot || !label) return;

  if (status === "connected") {
    dot.style.background = "#16A34A";
    label.innerText = text || "Supabase Cloud";
  } else if (status === "syncing") {
    dot.style.background = "#EAB308";
    label.innerText = text || "Đang đồng bộ...";
  } else {
    dot.style.background = "#94A3B8";
    label.innerText = text || "Chế độ Cục bộ";
  }
}

async function syncCloudData(notify = false) {
  const sb = getSupabase();
  if (!sb) {
    updateCloudIndicator("offline", "Chế độ Cục bộ");
    if (notify) alert("Chưa cấu hình Supabase Cloud. Đang chạy ở chế độ cục bộ.");
    return;
  }

  updateCloudIndicator("syncing", "Đang kết nối...");

  try {
    const [usersRes, asgRes, subRes] = await Promise.all([
      sb.from("eduproof_users").select("*"),
      sb.from("eduproof_assignments").select("*"),
      sb.from("eduproof_submissions").select("*")
    ]);

    // 1. Sync Users
    let syncedUsers = null;
    if (currentUser && (currentUser.role === "teacher" || currentUser.role === "admin")) {
      try {
        const { data: studentList, error: slErr } = await sb.rpc("get_my_students", {
          p_teacher_id: currentUser.id,
          p_password: currentUser.password
        });
        if (!slErr && Array.isArray(studentList) && studentList.length > 0) {
          syncedUsers = studentList.map((u) => ({
            id: u.id,
            username: u.username,
            password: u.password,
            name: u.name,
            role: u.role,
            class: u.class,
            subject: u.subject,
            teacherId: u.teacherId || u.teacher_id,
            email: u.email || ""
          }));
        }
      } catch (e) {
        console.warn("RPC get_my_students fallback:", e);
      }
    }

    if (!syncedUsers) {
      if (usersRes.data && usersRes.data.length > 0) {
        syncedUsers = usersRes.data.map((u) => ({
          id: u.id,
          username: u.username,
          password: u.password || (currentUser && currentUser.id === u.id ? currentUser.password : ""),
          name: u.name,
          role: u.role,
          class: u.class,
          subject: u.subject,
          teacherId: u.teacher_id,
          email: u.email || ""
        }));
      } else if (users.length > 0) {
        const userPayloads = users.map((u) => ({
          id: u.id,
          username: u.username,
          password: u.password,
          name: u.name,
          role: u.role,
          class: u.class || null,
          subject: u.subject || null,
          teacher_id: u.teacherId || null,
          email: u.email || null
        }));
        await sb.from("eduproof_users").upsert(userPayloads);
      }
    }

    if (syncedUsers && syncedUsers.length > 0) {
      users = syncedUsers;
    }

    // 2. Sync Assignments
    if (asgRes.data) {
      if (asgRes.data.length > 0) {
        assignments = asgRes.data.map((a) => ({
          id: a.id,
          teacherId: a.teacher_id,
          title: a.title,
          subject: a.subject,
          deadline: a.deadline,
          description: a.description,
          minPhotos: a.min_photos,
          allowLink: a.allow_link,
          allowNote: a.allow_note,
          createdAt: a.created_at
        })).sort((a, b) => getAssignmentTime(b) - getAssignmentTime(a));
        localStorage.setItem("eduproof_cloud_bootstrapped", "true");
      } else {
        const hasBootstrapped = localStorage.getItem("eduproof_cloud_bootstrapped");
        if (!hasBootstrapped && assignments.length > 0) {
          const asgPayloads = assignments.map((a) => ({
            id: a.id,
            teacher_id: a.teacherId,
            title: a.title,
            subject: a.subject,
            deadline: a.deadline,
            description: a.description,
            min_photos: a.minPhotos || 1,
            allow_link: a.allowLink !== false,
            allow_note: a.allowNote !== false,
            created_at: a.createdAt || new Date().toISOString()
          }));
          await sb.from("eduproof_assignments").upsert(asgPayloads);
          localStorage.setItem("eduproof_cloud_bootstrapped", "true");
        } else {
          assignments = [];
        }
      }
    }

    // 3. Sync Submissions
    if (subRes.data && subRes.data.length > 0) {
      submissions = subRes.data.map((s) => ({
        id: s.id,
        assignmentId: s.assignment_id,
        studentId: s.student_id,
        studentName: s.student_name,
        submittedAt: s.submitted_at,
        status: s.status,
        photos: normalizePhotos(s.photos),
        linkProof: s.link_proof || "",
        studentNote: s.student_note || "",
        annotations: s.annotations || {},
        grade: s.grade,
        feedback: s.feedback || "",
        resubmitRequested: s.resubmit_requested || false
      }));
    }

    // Refresh active session
    if (currentUser) {
      const refreshedUser = users.find((u) => u.username === currentUser.username);
      if (refreshedUser) currentUser = refreshedUser;
    }

    persistData();
    updateCloudIndicator("connected", "Supabase Cloud");

    if (notify) {
      renderCurrentView();
      alert("✅ Đã kết nối và đồng bộ dữ liệu mới nhất từ Supabase Cloud!");
    }
  } catch (err) {
    console.warn("⚠️ Không thể đồng bộ Supabase Cloud, tiếp tục dùng dữ liệu offline:", err);
    updateCloudIndicator("offline", "Supabase Offline");
    if (notify) {
      alert("Lỗi kết nối Supabase Cloud. Vui lòng kiểm tra lại cấu hình và bảng dữ liệu.");
    }
  }
}

// ==========================================
// 2. AUTHENTICATION & USER MANAGEMENT
// ==========================================

function updateHeaderUserDisplay() {
  if (!currentUser) return;

  const avatar = document.getElementById("userAvatar");
  const nameText = document.getElementById("userNameText");
  const roleText = document.getElementById("userRoleText");

  if (avatar) avatar.innerText = currentUser.name.charAt(0);
  if (nameText) nameText.innerText = currentUser.name;

  if (roleText) {
    if (currentUser.role === "admin") {
      roleText.innerText = "Quản trị viên (Admin)";
    } else if (currentUser.role === "teacher") {
      roleText.innerText = `Giáo viên (${currentUser.subject || "Bộ môn"})`;
    } else {
      roleText.innerText = `Học sinh (${currentUser.class || "12A1"})`;
    }
  }
}

function showLoginScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const appHeader = document.getElementById("appHeader");
  const appMain = document.getElementById("appMain");
  const usernameInput = document.getElementById("loginUsernameInput");
  const passInput = document.getElementById("loginPasswordInput");

  if (loginScreen) loginScreen.style.display = "flex";
  if (appHeader) appHeader.style.display = "none";
  if (appMain) appMain.style.display = "none";
  if (usernameInput) usernameInput.value = "";
  if (passInput) passInput.value = "";
}

function hideLoginScreen() {
  const loginScreen = document.getElementById("loginScreen");
  const appHeader = document.getElementById("appHeader");
  const appMain = document.getElementById("appMain");

  if (loginScreen) loginScreen.style.display = "none";
  if (appHeader) appHeader.style.display = "flex";
  if (appMain) appMain.style.display = "block";
}

function logout() {
  currentUser = null;
  stopChatAutoSync();
  liveChatMessages = [];
  studentActiveTab = "assignments";
  localStorage.removeItem(DB_KEY_AUTH);
  sessionStorage.removeItem(DB_KEY_AUTH);
  localStorage.removeItem("eduproof_teacher_tab");
  localStorage.removeItem("eduproof_admin_tab");
  localStorage.removeItem("eduproof_selected_campaign");
  localStorage.removeItem("eduproof_gradebook_asg");
  localStorage.removeItem("eduproof_student_filter");
  showLoginScreen();
}

async function handleLoginFormSubmit(event) {
  event.preventDefault();
  const username = document.getElementById("loginUsernameInput").value.trim();
  const pass = document.getElementById("loginPasswordInput").value.trim();

  let found = null;
  const sb = getSupabase();

  // 1. Ưu tiên xác thực bảo mật qua RPC login_user trực tiếp trên Supabase
  if (sb) {
    try {
      const { data: rpcUser, error: rpcErr } = await sb.rpc("login_user", {
        p_username: username,
        p_password: pass
      });

      if (!rpcErr && rpcUser) {
        found = {
          id: rpcUser.id,
          username: rpcUser.username,
          password: pass,
          name: rpcUser.name,
          role: rpcUser.role,
          class: rpcUser.class,
          subject: rpcUser.subject,
          teacherId: rpcUser.teacherId || rpcUser.teacher_id
        };
        const existIdx = users.findIndex((u) => u.username === found.username);
        if (existIdx >= 0) users[existIdx] = found;
        else users.push(found);
      }
    } catch (err) {
      console.warn("Lỗi RPC login_user:", err);
    }
  }

  // 2. Fallback: Kiểm tra cache cục bộ (hoặc khi offline)
  if (!found) {
    found = users.find((u) => u.username === username && u.password === pass);
  }

  // 3. Fallback: Kiểm tra qua bảng trực tiếp nếu RPC chưa được cài đặt
  if (!found && sb) {
    try {
      const { data, error } = await sb
        .from("eduproof_users")
        .select("*")
        .eq("username", username)
        .eq("password", pass)
        .maybeSingle();

      if (data && !error) {
        found = {
          id: data.id,
          username: data.username,
          password: data.password,
          name: data.name,
          role: data.role,
          class: data.class,
          subject: data.subject,
          teacherId: data.teacher_id
        };
        users.push(found);
      }
    } catch (err) {
      console.warn("Lỗi kiểm tra đăng nhập online:", err);
    }
  }

  if (found) {
    currentUser = found;
    persistData();
    hideLoginScreen();
    updateHeaderUserDisplay();
    renderCurrentView();
    // Đồng bộ danh sách học sinh theo quyền sau khi đăng nhập thành công
    syncCloudData(false);
  } else {
    alert("Sai tên đăng nhập hoặc mật khẩu! Học sinh vui lòng nhận tài khoản từ giáo viên.");
  }
}

// Teacher Student Management Modals
function openCreateStudentModal() {
  if (!currentUser || currentUser.role !== "teacher") {
    alert("Chỉ giáo viên mới có quyền tạo tài khoản cho học sinh.");
    return;
  }
  document.getElementById("newStudentFullName").value = "";
  document.getElementById("newStudentUsername").value = "";
  document.getElementById("newStudentClass").value = "12A1";
  document.getElementById("newStudentPassword").value = "123456";
  const emailEl = document.getElementById("newStudentEmail");
  if (emailEl) emailEl.value = "";
  document.getElementById("createStudentModal").style.display = "flex";
}

function closeCreateStudentModal() {
  document.getElementById("createStudentModal").style.display = "none";
}

function openEditStudentEmailModal(studentId) {
  const st = users.find((u) => u.id === studentId);
  if (!st) return;

  const idInput = document.getElementById("editEmailStudentId");
  const nameEl = document.getElementById("editEmailStudentName");
  const usernameEl = document.getElementById("editEmailStudentUsername");
  const emailInput = document.getElementById("editEmailInput");

  if (idInput) idInput.value = st.id;
  if (nameEl) nameEl.innerText = st.name;
  if (usernameEl) usernameEl.innerText = ` (${st.username})`;
  if (emailInput) {
    emailInput.value = st.email || "";
    setTimeout(() => emailInput.focus(), 50);
  }

  const modal = document.getElementById("editStudentEmailModal");
  if (modal) modal.style.display = "flex";
}

function closeEditStudentEmailModal() {
  const modal = document.getElementById("editStudentEmailModal");
  if (modal) modal.style.display = "none";
}

function confirmSaveStudentEmail() {
  const idInput = document.getElementById("editEmailStudentId");
  const emailInput = document.getElementById("editEmailInput");
  if (!idInput || !emailInput) return;

  const studentId = idInput.value;
  const newEmail = emailInput.value.trim();

  if (newEmail && (!newEmail.includes("@") || !newEmail.includes("."))) {
    showNoticeModal("Vui lòng nhập địa chỉ email hợp lệ (ví dụ: hocsinh@gmail.com).", "Lưu ý", "⚠️");
    return;
  }

  const st = users.find((u) => u.id === studentId);
  if (!st) return;

  st.email = newEmail;
  persistData();

  const sb = getSupabase();
  if (sb) {
    sb.from("eduproof_users")
      .update({ email: newEmail || null })
      .eq("id", studentId)
      .then(({ error }) => {
        if (error) console.warn("Lỗi cập nhật email lên Supabase:", error);
      });
  }

  closeEditStudentEmailModal();
  renderTeacherView();
  showNoticeModal(`✅ Đã cập nhật email cho học sinh ${st.name} thành công!`, "Cập nhật thành công", "🎉");
}

function autoSuggestUsername(name) {
  if (!name) return;
  // Convert accents: "Phạm Thu Hà" -> "ha"
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
  const parts = clean.split(/\s+/);
  const lastName = parts[parts.length - 1];
  const suggested = `hs_${lastName}`;
  document.getElementById("newStudentUsername").value = suggested;
}

function confirmCreateStudentAccount() {
  const fullName = document.getElementById("newStudentFullName").value.trim();
  const username = document.getElementById("newStudentUsername").value.trim();
  const studentClass = document.getElementById("newStudentClass").value.trim() || "12A1";
  const password = document.getElementById("newStudentPassword").value.trim() || "123456";
  const emailInput = document.getElementById("newStudentEmail");
  const email = emailInput ? emailInput.value.trim() : "";

  if (!fullName || !username) {
    showNoticeModal("Vui lòng nhập đầy đủ họ tên và tên đăng nhập.", "Thiếu thông tin", "⚠️");
    return;
  }

  // Check unique username
  if (users.some((u) => u.username === username)) {
    showNoticeModal("Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác (ví dụ thêm số phía sau).", "Trùng tên đăng nhập", "⚠️");
    return;
  }

  const newStudent = {
    id: "hs_" + Date.now(),
    username: username,
    password: password,
    name: fullName,
    role: "student",
    class: studentClass,
    teacherId: currentUser.id,
    email: email || ""
  };

  users.push(newStudent);
  persistData();

  const sb = getSupabase();
  if (sb) {
    sb.from("eduproof_users").insert([{
      id: newStudent.id,
      username: newStudent.username,
      password: newStudent.password,
      name: newStudent.name,
      role: newStudent.role,
      class: newStudent.class,
      teacher_id: newStudent.teacherId,
      email: newStudent.email || null
    }]).then();
  }

  closeCreateStudentModal();
  renderTeacherView();

  // Generate message to copy for student / parents
  const shareMsg = `Chào em ${fullName}! Thầy gửi tài khoản EduProof để nộp bài tập về nhà:\n- Tên đăng nhập: ${username}\n- Mật khẩu: ${password}\n- Lớp: ${studentClass}\n👉 Em đăng nhập để nộp bài tập đúng hạn nhé!`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareMsg).catch(() => {});
    showNoticeModal(`Đã tạo tài khoản cho học sinh ${fullName} thành công!\n\n📋 ĐÃ TỰ ĐỘNG SAO CHÉP THÔNG TIN TÀI KHOẢN VÀO BỘ NHỚ TẠM:\n"${shareMsg}"\n\nThầy có thể dán (Ctrl+V) gửi ngay qua Zalo/tin nhắn cho học sinh.`, "Tạo tài khoản thành công", "🎉");
  } else {
    showNoticeModal(`Đã tạo tài khoản thành công!\nTên đăng nhập: ${username} | Mật khẩu: ${password}`, "Tạo tài khoản thành công", "🎉");
  }
}

function deleteStudentAccount(studentId) {
  const student = users.find((u) => u.id === studentId);
  if (!student) return;

  showConfirmModal(
    `Bạn có chắc chắn muốn xóa tài khoản của học sinh "${student.name}" (${student.username})?`,
    () => {
      users = users.filter((u) => u.id !== studentId);
      // remove their submissions
      submissions = submissions.filter((s) => s.studentId !== studentId);
      persistData();

      const sb = getSupabase();
      if (sb) {
        sb.from("eduproof_users").delete().eq("id", studentId).then();
        sb.from("eduproof_submissions").delete().eq("student_id", studentId).then();
      }

      if (currentUser && currentUser.role === "admin") {
        renderAdminView();
      } else {
        renderTeacherView();
      }
      showNoticeModal("Đã xóa tài khoản học sinh thành công.", "Đã xóa", "🗑️");
    },
    "Xác nhận xóa tài khoản",
    "Xóa học sinh",
    true
  );
}

function copyAccountInfo(username) {
  const student = users.find((u) => u.username === username);
  if (!student) return;

  const msg = `Tài khoản nộp bài tập EduProof:\nHọc sinh: ${student.name}\n- Tên đăng nhập: ${student.username}\n- Mật khẩu: ${student.password}\n- Lớp: ${student.class || "12A1"}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).catch(() => {});
    showNoticeModal(`Đã sao chép thông tin tài khoản của ${student.name}!\n\n${msg}\n\nThầy có thể dán vào Zalo gửi cho học sinh.`, "Đã sao chép tài khoản", "📋");
  } else {
    showNoticeModal(msg, "Thông tin tài khoản", "📋");
  }
}

// ==========================================
// 2A. BATCH IMPORT STUDENTS FROM EXCEL
// ==========================================

let pendingParsedStudents = [];

function openExcelImportModal() {
  if (!currentUser || currentUser.role !== "teacher") {
    showNoticeModal("Chỉ giáo viên mới có quyền nhập danh sách học sinh.", "Phân quyền", "⚠️");
    return;
  }
  resetExcelImport();
  document.getElementById("excelImportModal").style.display = "flex";
  setupExcelDropzone();
}

function closeExcelImportModal() {
  document.getElementById("excelImportModal").style.display = "none";
}

function resetExcelImport() {
  pendingParsedStudents = [];
  const fileInput = document.getElementById("excelStudentFileInput");
  if (fileInput) fileInput.value = "";
  const previewSection = document.getElementById("excelPreviewSection");
  if (previewSection) previewSection.style.display = "none";
  const dropzone = document.getElementById("excelDropzone");
  if (dropzone) dropzone.style.display = "block";
  const btnConfirm = document.getElementById("btnConfirmBatchCreate");
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerText = "✅ Tạo tài khoản hàng loạt";
  }
}

function setupExcelDropzone() {
  const dropzone = document.getElementById("excelDropzone");
  if (!dropzone || dropzone.dataset.initialized) return;
  dropzone.dataset.initialized = "true";

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleExcelFile(e.dataTransfer.files[0]);
    }
  });
}

function handleExcelFileInput(event) {
  const file = event.target.files && event.target.files[0];
  if (file) {
    handleExcelFile(file);
  }
}

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

function generateCleanUsername(name, existingUsernames) {
  const clean = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
  const parts = clean.split(/\s+/);
  const lastName = parts[parts.length - 1] || "hs";
  let base = `hs_${lastName}`;
  let candidate = base;
  let counter = 1;
  while (existingUsernames.has(candidate) || users.some((u) => u.username === candidate)) {
    counter++;
    candidate = `${base}${counter}`;
  }
  return candidate;
}

function handleExcelFile(file) {
  if (typeof XLSX === "undefined") {
    showNoticeModal("Thư viện đọc Excel (SheetJS) chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng!", "Thông báo", "⚠️");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!rows || rows.length === 0) {
        showNoticeModal("File Excel không có dữ liệu học sinh!", "Lưu ý", "⚠️");
        return;
      }

      const defaultClass = currentUser.class || "12A1";
      const existingUsernames = new Set(users.map((u) => u.username));
      const myStudents = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
      const parsedList = [];

      rows.forEach((row, index) => {
        let nameVal = "";
        let emailVal = "";
        let usernameVal = "";
        let classVal = "";
        let passwordVal = "";

        Object.keys(row).forEach((col) => {
          const norm = normalizeHeaderKey(col);
          const rawVal = row[col] !== undefined && row[col] !== null ? row[col].toString().trim() : "";

          if (norm.includes("email") || norm.includes("mail") || norm.includes("thudientu") || norm.includes("hopthu") || (rawVal.includes("@") && rawVal.includes("."))) {
            if (!emailVal) emailVal = rawVal;
          } else if (norm.includes("tendangnhap") || norm.includes("dangnhap") || norm.includes("taikhoan") || norm.includes("username") || norm === "user" || norm.includes("mahs") || norm.includes("mssv")) {
            if (!usernameVal) usernameVal = rawVal;
          } else if (norm.includes("ten") || norm.includes("hoten") || norm.includes("hovaten") || norm.includes("fullname") || norm === "name" || norm.includes("hocsinh")) {
            if (!nameVal) nameVal = rawVal;
          } else if (norm.includes("lop") || norm.includes("class") || norm.includes("grade")) {
            if (!classVal) classVal = rawVal;
          } else if (norm.includes("matkhau") || norm.includes("password") || norm.includes("pass") || norm === "mk") {
            if (!passwordVal) passwordVal = rawVal;
          }
        });

        if (!nameVal) return;

        // Khớp học sinh theo họ và tên trên web của giáo viên này
        const matched = myStudents.find(
          (s) => s.name.trim().toLowerCase() === nameVal.trim().toLowerCase()
        );

        if (matched) {
          // Cập nhật thông tin / email cho học sinh đã có trên web
          parsedList.push({
            id: matched.id,
            name: matched.name,
            username: matched.username,
            class: classVal || matched.class || defaultClass,
            password: passwordVal || matched.password || "123456",
            email: emailVal || matched.email || "",
            role: "student",
            teacherId: currentUser.id,
            isUpdate: true
          });
        } else {
          // Học sinh mới chưa có trong hệ thống
          if (!usernameVal) {
            usernameVal = generateCleanUsername(nameVal, existingUsernames);
          }
          if (!passwordVal) {
            passwordVal = "123456";
          }
          if (!classVal) {
            classVal = defaultClass;
          }
          existingUsernames.add(usernameVal);

          parsedList.push({
            id: "hs_" + Date.now() + "_" + index,
            name: nameVal,
            username: usernameVal,
            class: classVal,
            password: passwordVal,
            email: emailVal,
            role: "student",
            teacherId: currentUser.id,
            isUpdate: false
          });
        }
      });

      if (parsedList.length === 0) {
        showNoticeModal("Không tìm thấy thông tin học sinh hợp lệ. Vui lòng tải file mẫu để xem định dạng chuẩn.", "Lưu ý", "⚠️");
        return;
      }

      pendingParsedStudents = parsedList;
      displayExcelPreview(parsedList);
    } catch (err) {
      console.error("Lỗi đọc file Excel:", err);
      showNoticeModal("Không thể đọc file Excel này: " + err.message, "Lỗi", "⚠️");
    }
  };

  reader.readAsArrayBuffer(file);
}

function displayExcelPreview(list) {
  const previewSection = document.getElementById("excelPreviewSection");
  const countText = document.getElementById("excelParsedCountText");
  const tbody = document.getElementById("excelPreviewTableBody");
  const btnConfirm = document.getElementById("btnConfirmBatchCreate");

  const updateCount = list.filter((s) => s.isUpdate).length;
  const newCount = list.filter((s) => !s.isUpdate).length;

  countText.innerHTML = `✅ Nhận diện <strong>${list.length}</strong> học sinh: <strong>${updateCount}</strong> học sinh cập nhật Email • <strong>${newCount}</strong> tài khoản tạo mới`;

  tbody.innerHTML = list
    .map(
      (s, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${sanitizeText(s.name)}</strong></td>
        <td><span style="color: ${s.email ? '#059669' : '#94A3B8'}; font-size: 0.78rem; font-weight: ${s.email ? '600' : 'normal'};">${s.email ? sanitizeText(s.email) : '— Chưa có —'}</span></td>
        <td><code>${sanitizeText(s.username)}</code></td>
        <td>${sanitizeText(s.class)}</td>
        <td>
          ${s.isUpdate
            ? '<span class="badge-status status-submitted" style="font-size: 0.72rem;">🔄 Cập nhật Email</span>'
            : '<span class="badge-status status-graded" style="font-size: 0.72rem;">✨ Tài khoản mới</span>'}
        </td>
      </tr>
    `
    )
    .join("");

  previewSection.style.display = "block";
  btnConfirm.disabled = false;
  btnConfirm.innerText = `✅ Xác nhận lưu thông tin (${list.length} học sinh)`;
}

async function confirmBatchCreateStudents() {
  if (!pendingParsedStudents || pendingParsedStudents.length === 0) {
    showNoticeModal("Không có danh sách học sinh để xử lý.", "Thông báo", "⚠️");
    return;
  }

  const btnConfirm = document.getElementById("btnConfirmBatchCreate");
  btnConfirm.disabled = true;
  btnConfirm.innerText = "⏳ Đang lưu dữ liệu...";

  const updateCount = pendingParsedStudents.filter((s) => s.isUpdate).length;
  const newCount = pendingParsedStudents.filter((s) => !s.isUpdate).length;

  pendingParsedStudents.forEach((newS) => {
    const existingIdx = users.findIndex((u) => u.id === newS.id || u.username === newS.username);
    if (existingIdx >= 0) {
      users[existingIdx] = {
        ...users[existingIdx],
        ...newS,
        email: newS.email || users[existingIdx].email || ""
      };
    } else {
      users.push(newS);
    }
  });

  persistData();

  const sb = getSupabase();
  if (sb) {
    try {
      const payloads = pendingParsedStudents.map((s) => ({
        id: s.id,
        username: s.username,
        password: s.password,
        name: s.name,
        role: "student",
        class: s.class,
        teacher_id: currentUser.id,
        email: s.email || null
      }));

      await sb.from("eduproof_users").upsert(payloads);
    } catch (err) {
      console.warn("Lỗi kết nối Supabase:", err);
    }
  }

  // Tự động tạo tin nhắn chia sẻ tài khoản mới (nếu có)
  const newStudents = pendingParsedStudents.filter((s) => !s.isUpdate);
  if (newStudents.length > 0 && navigator.clipboard && navigator.clipboard.writeText) {
    const shareLines = newStudents.map(
      (s, idx) => `${idx + 1}. ${s.name} (Lớp ${s.class}): TK: ${s.username} | MK: ${s.password}${s.email ? ` | Email: ${s.email}` : ""}`
    );
    const shareMsg = `📋 DANH SÁCH TÀI KHOẢN HỌC SINH NỘP BÀI TẬP EDUPROOF:\n${shareLines.join("\n")}\n\n👉 Các em học sinh đăng nhập vào hệ thống để nộp bài tập về nhà đúng hạn nhé!`;
    navigator.clipboard.writeText(shareMsg).catch(() => {});
  }

  closeExcelImportModal();
  renderTeacherView();

  let msg = `🎉 XỬ LÝ FILE EXCEL THÀNH CÔNG!\n\n`;
  if (updateCount > 0) {
    msg += `• Đã cập nhật Email cho ${updateCount} học sinh hiện có trong danh sách.\n`;
  }
  if (newCount > 0) {
    msg += `• Đã tạo mới ${newCount} tài khoản học sinh (Thông tin đăng nhập đã được sao chép vào bộ nhớ tạm để gửi Zalo).\n`;
  }
  showNoticeModal(msg, "Hoàn thành xử lý", "🎉");
}

function downloadStudentTemplateExcel() {
  if (typeof XLSX === "undefined") {
    showNoticeModal("Thư viện Excel đang tải, vui lòng kiểm tra kết nối mạng và thử lại sau.", "Thông báo", "⚠️");
    return;
  }

  const sampleData = [
    { "Họ và tên": "Nguyễn Văn An", "Email": "vanan.nguyen@gmail.com", "Tên đăng nhập": "hs_an", "Lớp": "12A1", "Mật khẩu": "123456" },
    { "Họ và tên": "Trần Thị Mai", "Email": "thimai.tran@gmail.com", "Tên đăng nhập": "hs_mai", "Lớp": "12A1", "Mật khẩu": "123456" },
    { "Họ và tên": "Lê Hoàng Nam", "Email": "hoangnam.le@gmail.com", "Tên đăng nhập": "hs_nam", "Lớp": "12A1", "Mật khẩu": "123456" },
    { "Họ và tên": "Phạm Thu Hà", "Email": "thuha.pham@gmail.com", "Tên đăng nhập": "hs_ha", "Lớp": "12A1", "Mật khẩu": "123456" },
    { "Họ và tên": "Đỗ Quang Minh", "Email": "quangminh.do@gmail.com", "Tên đăng nhập": "hs_minh", "Lớp": "12A1", "Mật khẩu": "123456" }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws["!cols"] = [{ wch: 22 }, { wch: 26 }, { wch: 18 }, { wch: 10 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DanhSachHocSinh");
  XLSX.writeFile(wb, "Mau_Danh_Sach_Hoc_Sinh_EduProof.xlsx");
}

function copyAllStudentAccounts() {
  const myStudents = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  if (myStudents.length === 0) {
    showNoticeModal("Chưa có tài khoản học sinh nào trong danh sách.", "Thông báo", "⚠️");
    return;
  }

  const lines = myStudents.map(
    (s, idx) => `${idx + 1}. ${s.name} - Lớp ${s.class || ""}\n   👉 Tên đăng nhập: ${s.username} | Mật khẩu: ${s.password}${s.email ? ` | Email: ${s.email}` : ""}`
  );
  const text = `📋 DANH SÁCH TÀI KHOẢN NỘP BÀI TẬP EDUPROOF (${currentUser.name}):\n\n${lines.join("\n\n")}\n\n👉 Các em học sinh đăng nhập vào hệ thống để nhận đề và nộp bài đúng hạn nhé!`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    showNoticeModal(`Đã sao chép danh sách ${myStudents.length} tài khoản học sinh!\n\nThầy/Cô có thể nhấn Ctrl+V dán ngay vào nhóm Zalo lớp.`, "Đã sao chép danh sách", "📋");
  } else {
    showNoticeModal(text, "Danh sách tài khoản học sinh", "📋");
  }
}

// ==========================================
// 2B. ADMIN VIEW LOGIC (QUẢN LÝ GIÁO VIÊN & HỌC SINH TOÀN TRƯỜNG)
// ==========================================

let adminActiveTab = "teachers";
let adminSelectedTeacherId = "all";

function switchAdminTab(tab, btnElement) {
  adminActiveTab = tab;
  localStorage.setItem("eduproof_admin_tab", tab);
  document.querySelectorAll("#adminView .filter-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
  if (btnElement) {
    btnElement.classList.add("active");
  } else {
    const btn = document.querySelector(`#adminView .filter-tabs .tab-btn[onclick*="'${tab}'"]`);
    if (btn) btn.classList.add("active");
  }

  const teaTab = document.getElementById("adminTeachersTab");
  const treeTab = document.getElementById("adminStudentsTreeTab");
  if (teaTab) teaTab.style.display = tab === "teachers" ? "block" : "none";
  if (treeTab) treeTab.style.display = tab === "studentsTree" ? "block" : "none";

  renderAdminView();
}

function openCreateTeacherModal() {
  document.getElementById("newTeacherFullName").value = "";
  document.getElementById("newTeacherUsername").value = "";
  document.getElementById("newTeacherSubject").value = "";
  document.getElementById("newTeacherPassword").value = "123456";
  document.getElementById("createTeacherModal").style.display = "flex";
}

function closeCreateTeacherModal() {
  document.getElementById("createTeacherModal").style.display = "none";
}

function confirmCreateTeacherAccount() {
  const name = document.getElementById("newTeacherFullName").value.trim();
  const username = document.getElementById("newTeacherUsername").value.trim();
  const subject = document.getElementById("newTeacherSubject").value.trim() || "Bộ môn";
  const password = document.getElementById("newTeacherPassword").value.trim() || "123456";

  if (!name || !username) {
    alert("Vui lòng nhập họ tên và tên đăng nhập giáo viên.");
    return;
  }

  if (users.some((u) => u.username === username)) {
    alert("Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.");
    return;
  }

  const newTeacher = {
    id: "gv_" + Date.now(),
    username: username,
    password: password,
    name: name,
    role: "teacher",
    subject: subject
  };

  users.push(newTeacher);
  persistData();

  const sb = getSupabase();
  if (sb) {
    sb.from("eduproof_users").insert([{
      id: newTeacher.id,
      username: newTeacher.username,
      password: newTeacher.password,
      name: newTeacher.name,
      role: newTeacher.role,
      subject: newTeacher.subject
    }]).then();
  }

  closeCreateTeacherModal();
  renderAdminView();

  const msg = `Kính gửi ${name}! Ban Giám hiệu cấp tài khoản Giáo viên trên hệ thống EduProof:\n- Tên đăng nhập: ${username}\n- Mật khẩu: ${password}\n- Nhiệm vụ: ${subject}\n👉 Thầy/Cô đăng nhập để tự tạo bài tập và cấp tài khoản cho học sinh lớp mình.`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg);
    alert(`Đã tạo tài khoản Giáo viên thành công!\n\n📋 ĐÃ TỰ ĐỘNG SAO CHÉP THÔNG TIN VÀO BỘ NHỚ TẠM:\n"${msg}"`);
  } else {
    alert(`Đã tạo tài khoản Giáo viên: ${username} | Mật khẩu: ${password}`);
  }
}

function deleteTeacherAccount(teacherId) {
  const teacher = users.find((u) => u.id === teacherId);
  if (!teacher) return;

  const countStudents = users.filter((u) => u.role === "student" && u.teacherId === teacherId).length;
  const countAssignments = assignments.filter((a) => a.teacherId === teacherId).length;

  showConfirmModal(
    `Bạn có chắc chắn muốn xóa tài khoản Giáo viên "${teacher.name}"?\n\n⚠️ CẢNH BÁO: Toàn bộ ${countStudents} học sinh trực thuộc và ${countAssignments} bài tập của giáo viên này cũng sẽ bị xóa bỏ!`,
    () => {
      users = users.filter((u) => u.id !== teacherId && u.teacherId !== teacherId);
      const teacherAsgIds = new Set(assignments.filter((a) => a.teacherId === teacherId).map((a) => a.id));
      assignments = assignments.filter((a) => a.teacherId !== teacherId);
      submissions = submissions.filter((s) => !teacherAsgIds.has(s.assignmentId));

      persistData();

      const sb = getSupabase();
      if (sb) {
        sb.from("eduproof_users").delete().eq("id", teacherId).then();
        sb.from("eduproof_users").delete().eq("teacher_id", teacherId).then();
        sb.from("eduproof_assignments").delete().eq("teacher_id", teacherId).then();
        if (teacherAsgIds.size > 0) {
          sb.from("eduproof_submissions").delete().in("assignment_id", Array.from(teacherAsgIds)).then();
        }
      }

      renderAdminView();
      alert("Đã xóa giáo viên và toàn bộ dữ liệu trực thuộc thành công.");
    },
    "Xác nhận xóa Giáo viên",
    "Xóa giáo viên",
    true
  );
}

function openAdminEditUserModal(userId) {
  const u = users.find((x) => x.id === userId);
  if (!u) {
    alert("Không tìm thấy thông tin tài khoản người dùng!");
    return;
  }

  const modal = document.getElementById("adminEditUserModal");
  const modalTitle = document.getElementById("adminEditUserModalTitle");
  const idInput = document.getElementById("adminEditUserId");
  const roleInput = document.getElementById("adminEditUserRole");
  const nameInput = document.getElementById("adminEditUserName");
  const usernameInput = document.getElementById("adminEditUserUsername");
  const passwordInput = document.getElementById("adminEditUserPassword");
  const emailInput = document.getElementById("adminEditUserEmail");

  const studentFields = document.getElementById("adminEditStudentFields");
  const teacherFields = document.getElementById("adminEditTeacherFields");
  const studentClassInput = document.getElementById("adminEditStudentClass");
  const studentTeacherSelect = document.getElementById("adminEditStudentTeacher");
  const teacherSubjectInput = document.getElementById("adminEditTeacherSubject");
  const teacherClassInput = document.getElementById("adminEditTeacherClass");

  if (!modal) return;

  idInput.value = u.id;
  roleInput.value = u.role;
  nameInput.value = u.name || "";
  usernameInput.value = u.username || "";
  passwordInput.value = u.password || "";
  emailInput.value = u.email || "";

  if (u.role === "student") {
    modalTitle.textContent = `Chỉnh sửa Học sinh: ${u.name}`;
    if (studentFields) studentFields.style.display = "block";
    if (teacherFields) teacherFields.style.display = "none";

    if (studentClassInput) studentClassInput.value = u.class || "12A1";
    if (studentTeacherSelect) {
      const teachers = users.filter((t) => t.role === "teacher");
      studentTeacherSelect.innerHTML = teachers
        .map((t) => `<option value="${t.id}" ${t.id === u.teacherId ? "selected" : ""}>${t.name} (${t.username} - ${t.subject || "GV"})</option>`)
        .join("");
      if (!teachers.some((t) => t.id === u.teacherId) && teachers.length > 0) {
        studentTeacherSelect.value = teachers[0].id;
      }
    }
  } else if (u.role === "teacher") {
    modalTitle.textContent = `Chỉnh sửa Giáo viên: ${u.name}`;
    if (studentFields) studentFields.style.display = "none";
    if (teacherFields) teacherFields.style.display = "block";

    if (teacherSubjectInput) teacherSubjectInput.value = u.subject || "";
    if (teacherClassInput) teacherClassInput.value = u.class || "";
  } else {
    modalTitle.textContent = `Chỉnh sửa Tài khoản: ${u.name}`;
    if (studentFields) studentFields.style.display = "none";
    if (teacherFields) teacherFields.style.display = "none";
  }

  modal.style.display = "flex";
}

function closeAdminEditUserModal() {
  const modal = document.getElementById("adminEditUserModal");
  if (modal) modal.style.display = "none";
}

function handleAdminEditUserSubmit(e) {
  if (e) e.preventDefault();

  const id = document.getElementById("adminEditUserId").value;
  const role = document.getElementById("adminEditUserRole").value;
  const name = document.getElementById("adminEditUserName").value.trim();
  const username = document.getElementById("adminEditUserUsername").value.trim();
  const password = document.getElementById("adminEditUserPassword").value.trim();
  const email = document.getElementById("adminEditUserEmail").value.trim();

  if (!name || !username || !password) {
    alert("Vui lòng điền đầy đủ Họ tên, Tên đăng nhập và Mật khẩu.");
    return;
  }

  const user = users.find((u) => u.id === id);
  if (!user) {
    alert("Không tìm thấy tài khoản cần cập nhật.");
    return;
  }

  // Check username collision with other users
  const isDuplicate = users.some((u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase());
  if (isDuplicate) {
    alert(`Tên đăng nhập "${username}" đã tồn tại trên hệ thống. Vui lòng chọn tên đăng nhập khác.`);
    return;
  }

  // Update memory
  user.name = name;
  user.username = username;
  user.password = password;
  user.email = email;

  const updatePayload = {
    name: name,
    username: username,
    password: password,
    email: email || null
  };

  if (role === "student") {
    const studentClass = (document.getElementById("adminEditStudentClass").value || "").trim() || "12A1";
    const teacherId = document.getElementById("adminEditStudentTeacher").value;

    user.class = studentClass;
    user.teacherId = teacherId;

    updatePayload.class = studentClass;
    updatePayload.teacher_id = teacherId;

    // Synchronize student name and class in memory submissions
    submissions.forEach((s) => {
      if (s.studentId === id) {
        s.studentName = name;
        s.className = studentClass;
      }
    });
  } else if (role === "teacher") {
    const subject = (document.getElementById("adminEditTeacherSubject").value || "").trim() || "Bộ môn";
    const teacherClass = (document.getElementById("adminEditTeacherClass").value || "").trim() || "";

    user.subject = subject;
    user.class = teacherClass;

    updatePayload.subject = subject;
    updatePayload.class = teacherClass || null;
  }

  // Đồng bộ phiên làm việc nếu Admin chỉnh sửa chính tài khoản đang đăng nhập
  if (currentUser && currentUser.id === id) {
    currentUser = { ...user };
    localStorage.setItem("eduproof_user", JSON.stringify(currentUser));
  }

  persistData();

  // Sync to Supabase Cloud
  const sb = getSupabase();
  if (sb) {
    sb.from("eduproof_users")
      .update(updatePayload)
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          console.error("Lỗi cập nhật người dùng trên Supabase:", error);
        }
      });

    if (role === "student") {
      sb.from("eduproof_submissions")
        .update({ student_name: name })
        .eq("student_id", id)
        .then();
    }
  }

  closeAdminEditUserModal();
  renderCurrentView();
  showNoticeModal(`Đã cập nhật thông tin tài khoản "${name}" thành công!`, "Thành công", "✅");
}

function renderAdminView() {
  const teacherUsers = users.filter((u) => u.role === "teacher");
  const studentUsers = users.filter((u) => u.role === "student");

  document.getElementById("adminTotalTeachersCount").innerText = teacherUsers.length;
  document.getElementById("adminTotalStudentsCount").innerText = studentUsers.length;
  document.getElementById("adminTotalAssignmentsCount").innerText = assignments.length;
  document.getElementById("adminTotalSubmissionsCount").innerText = submissions.length;

  const teaTab = document.getElementById("adminTeachersTab");
  const treeTab = document.getElementById("adminStudentsTreeTab");
  if (teaTab) teaTab.style.display = adminActiveTab === "teachers" ? "block" : "none";
  if (treeTab) treeTab.style.display = adminActiveTab === "studentsTree" ? "block" : "none";

  document.querySelectorAll("#adminView .filter-tabs .tab-btn").forEach((b) => {
    const isMatch = b.getAttribute("onclick") && b.getAttribute("onclick").includes(`'${adminActiveTab}'`);
    b.classList.toggle("active", Boolean(isMatch));
  });

  if (adminActiveTab === "teachers") {
    renderAdminTeachersTable();
  } else {
    renderAdminStudentsTree(adminSelectedTeacherId);
  }
}

function renderAdminTeachersTable() {
  const table = document.getElementById("adminTeachersTable");
  const cardsContainer = document.getElementById("adminTeachersCards");
  const teacherUsers = users.filter((u) => u.role === "teacher");

  if (table) {
    table.innerHTML = `
      <thead>
        <tr>
          <th>Họ và tên Giáo viên</th>
          <th>Tên đăng nhập</th>
          <th>Mật khẩu</th>
          <th>Bộ môn / Lớp</th>
          <th>Số HS trực thuộc</th>
          <th>Bài tập đã giao</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        ${teacherUsers.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Chưa có giáo viên nào.</td></tr>` : ""}
        ${teacherUsers
          .map((t) => {
            const stCount = users.filter((u) => u.role === "student" && u.teacherId === t.id).length;
            const asgCount = assignments.filter((a) => a.teacherId === t.id).length;
            return `
              <tr>
                <td><strong>${sanitizeText(t.name)}</strong></td>
                <td><code>${sanitizeText(t.username)}</code></td>
                <td><code>${sanitizeText(t.password)}</code></td>
                <td>${sanitizeText(t.subject || "Bộ môn")}</td>
                <td><span class="badge-status status-submitted">${stCount} học sinh</span></td>
                <td><strong>${asgCount} bài</strong></td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="filterAdminTreeForTeacher('${sanitizeText(t.id)}')">
                    👥 Xem học sinh
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="openAdminEditUserModal('${sanitizeText(t.id)}')">
                    ✏️ Sửa
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="copyTeacherInfo('${sanitizeText(t.username)}')">
                    📋 Sao chép
                  </button>
                  <button class="btn btn-danger btn-sm" onclick="deleteTeacherAccount('${sanitizeText(t.id)}')">
                    🗑️ Xóa
                  </button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    `;
  }

  if (cardsContainer) {
    cardsContainer.innerHTML = teacherUsers.length === 0
      ? `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">Chưa có giáo viên nào.</div>`
      : teacherUsers.map((t) => {
          const stCount = users.filter((u) => u.role === "student" && u.teacherId === t.id).length;
          const asgCount = assignments.filter((a) => a.teacherId === t.id).length;
          return `
            <div class="campaign-student-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
                <div>
                  <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${sanitizeText(t.name)}</div>
                  <div style="font-size: 0.74rem; color: var(--text-muted);">${sanitizeText(t.subject || "Bộ môn")}</div>
                </div>
                <span class="badge-status status-submitted">${stCount} học sinh</span>
              </div>
              <div style="background: #F8FAFC; padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.78rem; margin-bottom: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center; border: 1px solid #F1F5F9;">
                <span>TK: <code>${sanitizeText(t.username)}</code></span>
                <span>MK: <code>${sanitizeText(t.password)}</code></span>
                <span>Đã giao: <strong>${asgCount} bài</strong></span>
              </div>
              <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-sm" style="flex: 1; min-width: 110px; justify-content: center; padding: 0.45rem;" onclick="filterAdminTreeForTeacher('${sanitizeText(t.id)}')">
                  👥 Xem học sinh
                </button>
                <button class="btn btn-secondary btn-sm" style="padding: 0.45rem 0.65rem;" onclick="openAdminEditUserModal('${sanitizeText(t.id)}')">
                  ✏️ Sửa
                </button>
                <button class="btn btn-secondary btn-sm" style="padding: 0.45rem 0.65rem;" onclick="copyTeacherInfo('${sanitizeText(t.username)}')">
                  📋 Sao chép
                </button>
                <button class="btn btn-danger btn-sm" style="padding: 0.45rem 0.65rem;" onclick="deleteTeacherAccount('${sanitizeText(t.id)}')">
                  🗑️ Xóa
                </button>
              </div>
            </div>
          `;
        }).join("");
  }
}

function filterAdminTreeForTeacher(teacherId) {
  adminSelectedTeacherId = teacherId;
  switchAdminTab("studentsTree");
}

function copyTeacherInfo(username) {
  const t = users.find((u) => u.username === username);
  if (!t) return;
  const msg = `Tài khoản Giáo viên EduProof:\n- Họ tên: ${t.name}\n- Tên đăng nhập: ${t.username}\n- Mật khẩu: ${t.password}\n- Nhiệm vụ: ${t.subject || "Giáo viên"}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg);
    alert(`Đã sao chép thông tin tài khoản của ${t.name}!\n\n${msg}`);
  } else {
    alert(msg);
  }
}

function renderAdminStudentsTree(selectedTeacherId) {
  adminSelectedTeacherId = selectedTeacherId || adminSelectedTeacherId;
  const selectBox = document.getElementById("adminTeacherFilterSelect");
  const teacherUsers = users.filter((u) => u.role === "teacher");

  selectBox.innerHTML = `
    <option value="all" ${adminSelectedTeacherId === "all" ? "selected" : ""}>Tất cả Giáo viên (${teacherUsers.length})</option>
    ${teacherUsers
      .map((t) => `<option value="${t.id}" ${adminSelectedTeacherId === t.id ? "selected" : ""}>${t.name} (${t.username})</option>`)
      .join("")}
  `;

  let studentUsers = users.filter((u) => u.role === "student");
  if (adminSelectedTeacherId !== "all") {
    studentUsers = studentUsers.filter((u) => u.teacherId === adminSelectedTeacherId);
  }

  const table = document.getElementById("adminStudentsTreeTable");
  const cardsContainer = document.getElementById("adminStudentsTreeCards");

  if (table) {
    table.innerHTML = `
      <thead>
        <tr>
          <th>Họ tên Học sinh</th>
          <th>Tên đăng nhập</th>
          <th>Mật khẩu</th>
          <th>Lớp</th>
          <th>Giáo viên Quản lý trực tiếp</th>
          <th>Số bài đã nộp</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        ${studentUsers.length === 0 ? `<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 1.5rem;">Chưa có học sinh nào thuộc giáo viên này.</td></tr>` : ""}
        ${studentUsers
          .map((s) => {
            const teacher = users.find((u) => u.id === s.teacherId);
            const teacherName = teacher ? `${sanitizeText(teacher.name)} (${sanitizeText(teacher.username)})` : `<span style="color:red">Chưa gán</span>`;
            const subCount = submissions.filter((sub) => sub.studentId === s.id).length;
            return `
              <tr>
                <td><strong>${sanitizeText(s.name)}</strong></td>
                <td><code>${sanitizeText(s.username)}</code></td>
                <td><code>${sanitizeText(s.password)}</code></td>
                <td>${sanitizeText(s.class || "12A1")}</td>
                <td><span class="badge-status status-graded">${teacherName}</span></td>
                <td><strong>${subCount} bài</strong></td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="openAdminEditUserModal('${sanitizeText(s.id)}')">
                    ✏️ Sửa
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="copyAccountInfo('${sanitizeText(s.username)}')">
                    📋 Chép
                  </button>
                  <button class="btn btn-danger btn-sm" onclick="deleteStudentAccount('${sanitizeText(s.id)}')">
                    🗑️ Xóa
                  </button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    `;
  }

  if (cardsContainer) {
    cardsContainer.innerHTML = studentUsers.length === 0
      ? `<div style="text-align:center; color: var(--text-muted); padding: 1.5rem;">Chưa có học sinh nào thuộc giáo viên này.</div>`
      : studentUsers.map((s) => {
          const teacher = users.find((u) => u.id === s.teacherId);
          const teacherName = teacher ? `${sanitizeText(teacher.name)} (${sanitizeText(teacher.username)})` : `<span style="color:red">Chưa gán</span>`;
          const subCount = submissions.filter((sub) => sub.studentId === s.id).length;
          return `
            <div class="campaign-student-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
                <div>
                  <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${sanitizeText(s.name)}</div>
                  <div style="font-size: 0.74rem; color: var(--text-muted);">Lớp ${sanitizeText(s.class || "12A1")} • Đã nộp ${subCount} bài</div>
                </div>
              </div>
              <div style="background: #F8FAFC; padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.78rem; margin-bottom: 0.4rem; display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center; border: 1px solid #F1F5F9;">
                <span>TK: <code>${sanitizeText(s.username)}</code></span>
                <span>MK: <code>${sanitizeText(s.password)}</code></span>
              </div>
              <div style="font-size: 0.75rem; color: var(--primary); font-weight: 600; margin-bottom: 0.5rem;">
                GV quản lý: ${teacherName}
              </div>
              <div style="display: flex; gap: 0.4rem;">
                <button class="btn btn-secondary btn-sm" style="flex: 1; justify-content: center; padding: 0.45rem;" onclick="openAdminEditUserModal('${sanitizeText(s.id)}')">
                  ✏️ Sửa
                </button>
                <button class="btn btn-secondary btn-sm" style="padding: 0.45rem 0.65rem;" onclick="copyAccountInfo('${sanitizeText(s.username)}')">
                  📋 Chép
                </button>
                <button class="btn btn-danger btn-sm" style="padding: 0.45rem 0.65rem;" onclick="deleteStudentAccount('${sanitizeText(s.id)}')">
                  🗑️ Xóa
                </button>
              </div>
            </div>
          `;
        }).join("");
  }
}

// ==========================================
// 3. VIEW ROUTING & RENDERING
// ==========================================

function renderCurrentView() {
  if (!currentUser) {
    showLoginScreen();
    return;
  }

  hideLoginScreen();
  updateHeaderUserDisplay();

  const isAdmin = currentUser.role === "admin";
  const isTeacher = currentUser.role === "teacher";
  const isStudent = currentUser.role === "student";

  const adminEl = document.getElementById("adminView");
  const teacherEl = document.getElementById("teacherView");
  const studentEl = document.getElementById("studentView");

  if (adminEl) adminEl.style.display = isAdmin ? "block" : "none";
  if (teacherEl) teacherEl.style.display = isTeacher ? "block" : "none";
  if (studentEl) studentEl.style.display = isStudent ? "block" : "none";

  if (isAdmin) {
    renderAdminView();
  } else if (isTeacher) {
    renderTeacherView();
  } else {
    switchStudentTab(studentActiveTab || "assignments");
  }
}

// ==========================================
// 4. STUDENT VIEW LOGIC & NAVIGATION TABS
// ==========================================

let studentActiveTab = "assignments";
let liveChatMessages = []; // Lưu trong bộ nhớ RAM - Tuyệt đối không dùng localStorage
let chatSyncTimer = null;
let currentChatRecipient = null; // null = Chat chung cả lớp; { id, name } = Nhắn tin riêng 1-1

function switchStudentTab(tab, btnElement) {
  studentActiveTab = tab || "assignments";

  const tabBtns = document.querySelectorAll("#studentTabBtnAssignments, #studentTabBtnChat, #studentTabBtnClassmates");
  tabBtns.forEach((b) => b.classList.remove("active"));

  if (btnElement) {
    btnElement.classList.add("active");
  } else {
    const targetId = studentActiveTab === "chat" ? "studentTabBtnChat" : (studentActiveTab === "classmates" ? "studentTabBtnClassmates" : "studentTabBtnAssignments");
    const targetBtn = document.getElementById(targetId);
    if (targetBtn) targetBtn.classList.add("active");
  }

  const asgTab = document.getElementById("studentAssignmentsTab");
  const chatTab = document.getElementById("studentChatTab");
  const clsTab = document.getElementById("studentClassmatesTab");

  if (asgTab) asgTab.style.display = studentActiveTab === "assignments" ? "block" : "none";
  if (chatTab) chatTab.style.display = studentActiveTab === "chat" ? "block" : "none";
  if (clsTab) clsTab.style.display = studentActiveTab === "classmates" ? "block" : "none";

  const titleEl = document.getElementById("studentViewTitle");
  const descEl = document.getElementById("studentViewDesc");

  if (studentActiveTab === "assignments") {
    if (titleEl) titleEl.innerText = "Bài tập của tôi";
    if (descEl) descEl.innerText = "Chụp ảnh vở bài làm hoặc đính kèm minh chứng để nộp đúng hạn.";
    stopChatAutoSync();
    renderStudentView();
  } else if (studentActiveTab === "chat") {
    if (titleEl) titleEl.innerText = "Phòng chat học sinh";
    if (descEl) descEl.innerText = "Trao đổi, thảo luận học tập trực tiếp cùng các bạn trong trường lớp.";
    updateChatHeaderInfo();
    loadChatMessages();
    startChatAutoSync();
  } else if (studentActiveTab === "classmates") {
    if (titleEl) titleEl.innerText = "Danh sách bạn cùng lớp";
    if (descEl) descEl.innerText = "Chỉ hiển thị họ và tên học sinh, bảo mật tuyệt đối tài khoản & mật khẩu.";
    stopChatAutoSync();
    renderStudentClassmates();
  }
}

// ------------------------------------------
// 4A. BẠN CÙNG LỚP (BẢO MẬT USERNAME & MẬT KHẨU)
// ------------------------------------------
function renderStudentClassmates(searchQuery = "") {
  const grid = document.getElementById("studentClassmatesGrid");
  if (!grid) return;

  const q = (searchQuery || "").trim().toLowerCase();
  const myTeacherId = currentUser ? currentUser.teacherId : null;
  const myClass = currentUser ? currentUser.class : null;

  // Lọc danh sách học sinh: hiển thị các học sinh dưới quyền của cùng giáo viên hiện tại (hoặc cùng lớp)
  let peerStudents = users.filter((u) => {
    if (u.role !== "student") return false;
    if (myTeacherId && u.teacherId && u.teacherId === myTeacherId) return true;
    if (myClass && u.class && u.class === myClass) return true;
    if (!myTeacherId && !myClass) return true;
    return false;
  });

  // Fallback an toàn: nếu danh sách lọc theo GV/lớp trống (do cache hoặc dữ liệu cũ chưa map teacherId), hiển thị toàn bộ học sinh
  if (peerStudents.length === 0) {
    peerStudents = users.filter((u) => u.role === "student");
  }

  // Áp dụng tìm kiếm theo tên
  if (q) {
    peerStudents = peerStudents.filter((u) => (u.name || "").toLowerCase().includes(q));
  }

  peerStudents.sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));

  if (peerStudents.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
        <p style="font-size: 1.05rem; font-weight: 600; margin-bottom: 0.25rem;">🔍 Không tìm thấy bạn học sinh nào phù hợp</p>
        <span style="font-size: 0.8rem;">Hãy thử tìm kiếm với họ tên khác</span>
      </div>
    `;
    return;
  }

  // BẢO MẬT TUYỆT ĐỐI: CHỈ XUẤT HỌ TÊN VÀ LỚP.
  // TUYỆT ĐỐI KHÔNG render username hay password ra bất kỳ thẻ HTML hay dataset nào!
  grid.innerHTML = peerStudents.map((st) => {
    const isMe = currentUser && st.id === currentUser.id;
    const nameParts = (st.name || "Học sinh").trim().split(" ");
    const initial = nameParts[nameParts.length - 1][0].toUpperCase();
    const className = st.class ? `Lớp ${sanitizeText(st.class)}` : "Chưa xếp lớp";

    return `
      <div class="classmate-card">
        <div class="classmate-avatar">${initial}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 0.4rem; justify-content: space-between;">
            <span style="font-weight: 700; color: var(--text-main); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${sanitizeText(st.name || "Học sinh")}
            </span>
            ${isMe ? '<span class="badge" style="background: #e0e7ff; color: #3730a3; font-size: 0.68rem; padding: 0.1rem 0.4rem; border-radius: 999px; font-weight: 700;">Bạn</span>' : ''}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 0.4rem; align-items: center; margin-top: 0.25rem;">
            <span class="badge" style="background: #f1f5f9; color: #475569; font-size: 0.72rem; padding: 0.12rem 0.45rem; border-radius: 4px; font-weight: 600;">${className}</span>
            <span>• Học sinh</span>
          </div>
        </div>
        ${!isMe ? `
          <button class="btn btn-primary btn-sm" onclick="startDirectChat('${st.id}', '${sanitizeText(st.name)}')" style="white-space: nowrap; padding: 0.4rem 0.75rem; font-size: 0.78rem; display: flex; align-items: center; gap: 0.35rem;" title="Nhắn tin riêng 1-1 với bạn này">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Nhắn tin</span>
          </button>
        ` : ''}
      </div>
    `;
  }).join("");
}

function handleClassmateSearch(val) {
  renderStudentClassmates(val);
}

// ------------------------------------------
// 4B. PHÒNG CHAT HỌC SINH (CLOUD SYNC - ZERO LOCALSTORAGE - NHẮN RIÊNG 1-1)
// ------------------------------------------
function startDirectChat(studentId, studentName) {
  currentChatRecipient = { id: studentId, name: studentName };
  switchStudentTab("chat");
  updateChatHeaderInfo();
  loadChatMessages(false);
}

function switchToGroupChat() {
  currentChatRecipient = null;
  updateChatHeaderInfo();
  loadChatMessages(false);
}

function handleChatRecipientChange(recipientVal) {
  if (!recipientVal || recipientVal === "all") {
    currentChatRecipient = null;
  } else {
    const targetUser = users.find((u) => u.id === recipientVal);
    if (targetUser) {
      currentChatRecipient = { id: targetUser.id, name: targetUser.name };
    }
  }
  updateChatHeaderInfo();
  loadChatMessages(false);
}

function updateChatHeaderInfo() {
  const iconEl = document.getElementById("chatHeaderIcon");
  const titleEl = document.getElementById("chatHeaderTitle");
  const descEl = document.getElementById("chatHeaderDesc");
  const inputEl = document.getElementById("chatMessageInput");
  const selectEl = document.getElementById("chatRecipientSelect");

  if (selectEl) {
    const myTeacherId = currentUser ? currentUser.teacherId : null;
    const myClass = currentUser ? currentUser.class : null;
    let peers = users.filter((u) => u.role === "student" && u.id !== (currentUser ? currentUser.id : ""));
    if (myTeacherId) {
      const filtered = peers.filter((u) => u.teacherId === myTeacherId || u.class === myClass);
      if (filtered.length > 0) peers = filtered;
    }
    peers.sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));

    let optionsHtml = `<option value="all">📢 Chat chung cả lớp</option>`;
    optionsHtml += peers.map((p) => {
      const isSel = currentChatRecipient && currentChatRecipient.id === p.id ? "selected" : "";
      return `<option value="${p.id}" ${isSel}>💬 ${sanitizeText(p.name)} (${p.class ? 'Lớp ' + sanitizeText(p.class) : 'HS'})</option>`;
    }).join("");
    selectEl.innerHTML = optionsHtml;
    selectEl.value = currentChatRecipient ? currentChatRecipient.id : "all";
  }

  if (currentChatRecipient) {
    if (iconEl) iconEl.innerText = "🔒";
    if (titleEl) titleEl.innerHTML = `Nhắn tin riêng: <span style="color: #4F46E5;">${sanitizeText(currentChatRecipient.name)}</span>`;
    if (descEl) descEl.innerText = "Chỉ 2 bạn nhìn thấy tin nhắn này • Bảo mật riêng tư đám mây";
    if (inputEl) inputEl.placeholder = `Nhắn tin riêng tới ${currentChatRecipient.name}...`;
  } else {
    if (iconEl) iconEl.innerText = "💬";
    if (titleEl) titleEl.innerText = "Phòng chat chung của các bạn học sinh";
    if (descEl) descEl.innerText = "Đồng bộ đám mây trực tiếp Cloud • Toàn bộ thành viên đều xem và nhắn tin được";
    if (inputEl) inputEl.placeholder = "Nhập tin nhắn gửi tới cả lớp...";
  }
}

function startChatAutoSync() {
  stopChatAutoSync();
  chatSyncTimer = setInterval(() => {
    if (studentActiveTab === "chat" && currentUser) {
      loadChatMessages(false);
    }
  }, 4000);
}

function stopChatAutoSync() {
  if (chatSyncTimer) {
    clearInterval(chatSyncTimer);
    chatSyncTimer = null;
  }
}

async function loadChatMessages(isManualRefresh = false) {
  const box = document.getElementById("chatMessagesBox");
  if (!box) return;

  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("eduproof_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(300);

      if (!error && Array.isArray(data)) {
        // Hợp nhất dữ liệu Cloud với các tin nhắn vừa gửi gần đây để không bị mất khi insert đang chạy
        const cloudIds = new Set(data.map((m) => m.id));
        const pendingLocal = (liveChatMessages || []).filter(
          (m) => !cloudIds.has(m.id) && (Date.now() - new Date(m.created_at).getTime() < 30000)
        );
        liveChatMessages = [...data, ...pendingLocal];
      }
    } catch (e) {
      console.warn("Lỗi đồng bộ tin nhắn Cloud:", e);
    }
  }

  updateChatHeaderInfo();
  renderChatMessagesList();
  if (isManualRefresh && window.showToastNotification) {
    showToastNotification("💬 Đã cập nhật tin nhắn mới nhất");
  }
}

function renderChatMessagesList() {
  const box = document.getElementById("chatMessagesBox");
  if (!box) return;

  // Lọc luồng tin nhắn: Chat riêng 1-1 hay Chat chung cả lớp
  let chatThread = [];
  if (currentChatRecipient) {
    chatThread = (liveChatMessages || []).filter((msg) => {
      const fromMeToPeer = currentUser && msg.sender_id === currentUser.id && msg.recipient_id === currentChatRecipient.id;
      const fromPeerToMe = currentUser && msg.sender_id === currentChatRecipient.id && msg.recipient_id === currentUser.id;
      return fromMeToPeer || fromPeerToMe;
    });
  } else {
    chatThread = (liveChatMessages || []).filter((msg) => {
      return !msg.recipient_id || msg.recipient_id === "all";
    });
  }

  if (!chatThread || chatThread.length === 0) {
    if (currentChatRecipient) {
      box.innerHTML = `
        <div style="text-align: center; margin: auto; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🔒💬</div>
          <p style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem;">Chưa có tin nhắn riêng với ${sanitizeText(currentChatRecipient.name)}</p>
          <span style="font-size: 0.8rem;">Hãy gửi tin nhắn đầu tiên để cùng trao đổi riêng nhé!</span>
        </div>
      `;
    } else {
      box.innerHTML = `
        <div style="text-align: center; margin: auto; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">👋💬</div>
          <p style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem;">Chưa có tin nhắn nào trong phòng chat chung</p>
          <span style="font-size: 0.8rem;">Hãy gửi lời chào đầu tiên để cùng thảo luận bài học nhé!</span>
        </div>
      `;
    }
    return;
  }

  const isAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 70;

  box.innerHTML = chatThread.map((msg) => {
    const isSelf = currentUser && msg.sender_id === currentUser.id;
    const nameParts = (msg.sender_name || "Học sinh").trim().split(" ");
    const initial = nameParts[nameParts.length - 1][0].toUpperCase();

    let timeStr = "";
    try {
      const d = new Date(msg.created_at);
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      timeStr = `${hours}:${mins} ${day}/${month}`;
    } catch (e) {
      timeStr = "";
    }

    const classBadge = msg.class ? `<span style="opacity: 0.85; font-size: 0.7rem; font-weight: 600;">[Lớp ${sanitizeText(msg.class)}]</span>` : "";
    const privateBadge = msg.recipient_id && msg.recipient_id !== "all" ? `<span style="font-size: 0.68rem; background: #e0e7ff; color: #3730a3; padding: 0.1rem 0.35rem; border-radius: 4px; font-weight: 600;">🔒 Riêng tư</span>` : "";

    return `
      <div class="chat-bubble-row ${isSelf ? 'self' : 'peer'}">
        ${!isSelf ? `<div class="chat-avatar">${initial}</div>` : ''}
        <div class="chat-bubble-content">
          <div class="chat-sender-meta">
            ${!isSelf ? `<strong>${sanitizeText(msg.sender_name || "Bạn học")}</strong> ${classBadge}` : ''}
            ${privateBadge}
            <span>${timeStr}</span>
          </div>
          <div class="chat-bubble">
            ${sanitizeText(msg.content)}
          </div>
        </div>
      </div>
    `;
  }).join("");

  if (isAtBottom) {
    box.scrollTop = box.scrollHeight;
  }
}

async function handleSendChatMessage(event) {
  if (event) {
    try {
      event.preventDefault();
      event.stopPropagation();
    } catch (e) {}
  }
  const input = document.getElementById("chatMessageInput");
  const sendBtn = document.getElementById("chatSendBtn");
  if (!input) return false;

  const content = input.value.trim();
  if (!content) return false;
  if (!currentUser) {
    alert("Vui lòng đăng nhập để gửi tin nhắn.");
    return false;
  }

  const newMsg = {
    id: "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
    sender_id: currentUser.id,
    sender_name: currentUser.name || "Học sinh",
    sender_role: currentUser.role || "student",
    recipient_id: currentChatRecipient ? currentChatRecipient.id : null,
    recipient_name: currentChatRecipient ? currentChatRecipient.name : null,
    class: currentUser.class || "",
    content: content,
    created_at: new Date().toISOString()
  };

  // Cập nhật giao diện RAM tức thì - TUYỆT ĐỐI KHÔNG DÙNG LOCALSTORAGE
  liveChatMessages.push(newMsg);
  input.value = "";
  renderChatMessagesList();
  const box = document.getElementById("chatMessagesBox");
  if (box) {
    requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight;
    });
  }

  // Đẩy tin nhắn lên Supabase Cloud Database
  const sb = getSupabase();
  if (sb) {
    try {
      if (sendBtn) sendBtn.disabled = true;
      const { error } = await sb.from("eduproof_messages").insert([newMsg]);
      if (error) {
        console.warn("Lỗi gửi tin nhắn Cloud:", error);
      }
    } catch (e) {
      console.warn("Ngoại lệ khi đẩy tin nhắn lên Cloud:", e);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  return false;
}

function filterStudentAssignments(filter, btnElement) {
  studentFilter = filter;
  localStorage.setItem("eduproof_student_filter", filter);
  document.querySelectorAll("#studentAssignmentsTab .tab-btn").forEach((b) => b.classList.remove("active"));
  if (btnElement) {
    btnElement.classList.add("active");
  } else {
    const btn = document.querySelector(`#studentAssignmentsTab .tab-btn[onclick*="'${filter}'"]`);
    if (btn) btn.classList.add("active");
  }
  renderStudentView();
}

function renderStudentView() {
  document.querySelectorAll("#studentAssignmentsTab .tab-btn").forEach((b) => {
    const isMatch = b.getAttribute("onclick") && b.getAttribute("onclick").includes(`'${studentFilter}'`);
    b.classList.toggle("active", Boolean(isMatch));
  });

  const container = document.getElementById("studentAssignmentsList");
  container.innerHTML = "";

  let pendingCount = 0;
  let submittedCount = 0;
  let gradedCount = 0;

  const studentAssignments = assignments
    .filter((a) => a.teacherId === currentUser.teacherId || !a.teacherId)
    .sort((a, b) => getAssignmentTime(b) - getAssignmentTime(a));

  studentAssignments.forEach((asg, idx) => {
    const sub = submissions.find((s) => s.assignmentId === asg.id && s.studentId === currentUser.id);
    let status = "pending";
    if (sub) {
      if (sub.status === "graded") status = "graded";
      else if (sub.status === "resubmit_requested") status = "resubmit";
      else status = "submitted";
    }

    if (status === "pending" || status === "resubmit") pendingCount++;
    else if (status === "submitted") submittedCount++;
    else if (status === "graded") gradedCount++;

    if (studentFilter === "pending" && status !== "pending" && status !== "resubmit") return;
    if (studentFilter === "submitted" && status !== "submitted") return;
    if (studentFilter === "graded" && status !== "graded") return;

    const card = document.createElement("div");
    card.className = "assignment-card";
    const isNewest = idx === 0 && studentAssignments.length > 0;
    if (isNewest) {
      card.style.borderColor = "#6EE7B7";
      card.style.boxShadow = "0 4px 16px rgba(16, 185, 129, 0.12)";
    }

    let statusBadge = "";
    let actionBtn = "";

    const deadlineFormatted = new Date(asg.deadline).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit"
    });

    const isLate = new Date() > new Date(asg.deadline);

    let resubmitReasonAlert = "";
    if (sub && sub.status === "resubmit_requested" && sub.feedback) {
      resubmitReasonAlert = `
        <div style="background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; padding: 0.45rem 0.65rem; border-radius: 8px; font-size: 0.76rem; margin: 0.4rem 0; line-height: 1.4;">
          <strong>⚠️ Cô từ chối ảnh & yêu cầu gửi lại:</strong> "${sanitizeText(sub.feedback)}"
        </div>
      `;
    }

    if (status === "pending") {
      statusBadge = isLate
        ? `<span class="badge-status status-resubmit">⚠️ Đã quá hạn</span>`
        : `<span class="badge-status status-pending">⏳ Cần nộp bài</span>`;
      actionBtn = `<button class="btn btn-primary btn-sm" onclick="openSubmitModal('${asg.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> ${isLate ? "Nộp bài muộn" : "Nộp bài tập"}</button>`;
    } else if (status === "resubmit") {
      statusBadge = `<span class="badge-status status-resubmit">⚠️ Cần nộp lại</span>`;
      actionBtn = `<button class="btn btn-danger btn-sm" onclick="openSubmitModal('${asg.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Chụp nộp lại</button>`;
    } else if (status === "submitted") {
      statusBadge = `<span class="badge-status status-submitted">⏳ Đã nộp</span>`;
      actionBtn = `
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm" onclick="viewSubmissionSummary('${sub.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Xem bài
          </button>
          <button class="btn btn-primary btn-sm" onclick="openSubmitModal('${asg.id}')" title="Chụp/chọn ảnh mới để thay thế bài đã nộp">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Nộp lại bài
          </button>
        </div>
      `;
    } else if (status === "graded") {
      statusBadge = `<span class="badge-status status-graded">✅ Đã làm</span>`;
      actionBtn = `<button class="btn btn-secondary btn-sm" onclick="viewSubmissionSummary('${sub.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Xem bài đã xác nhận</button>`;
    }

    let studentPhotoPreview = "";
    if (sub && sub.photos) {
      sub.photos = normalizePhotos(sub.photos);
      const firstPhotoObj = sub.photos[0];
      const firstPhotoSrc = firstPhotoObj ? (firstPhotoObj.dataUrl || firstPhotoObj.url || "") : "";
      const backupSrc = firstPhotoObj ? (firstPhotoObj.backupDataUrl || (firstPhotoSrc.startsWith("data:") ? firstPhotoSrc : "")) : "";
      if (firstPhotoSrc) {
        studentPhotoPreview = `
          <div style="display: flex; align-items: center; gap: 0.6rem; margin: 0.5rem 0; padding: 0.45rem; background: #EEF2FF; border-radius: 8px; border: 1px solid #C7D2FE; cursor: pointer;" onclick="viewSubmissionSummary('${sub.id}')" title="Bấm để xem lại bài nộp">
            <img src="${firstPhotoSrc}" data-backup="${sanitizeText(backupSrc)}" alt="Ảnh đã nộp" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px; border: 1px solid #A5B4FC; background: #FFF;" onerror="handlePhotoError(this)" />
            <div style="font-size: 0.74rem; color: #4338CA;">
              <strong style="color: #1E1B4B;">Đã gửi ${sub.photos.length} ảnh minh chứng</strong><br>
              <span style="color: #4F46E5;">Nộp: ${new Date(sub.submittedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
            </div>
          </div>
        `;
      }
    }

    card.innerHTML = `
      <div>
        <div class="card-top">
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
            ${formatSubjectBadge(asg.subject)}
            ${isNewest ? '<span class="badge" style="background: linear-gradient(135deg, #10B981, #059669); color: white; font-weight: 700; font-size: 0.7rem; padding: 0.18rem 0.5rem; border-radius: 999px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);">✨ Bài mới nhất</span>' : ''}
          </div>
          ${statusBadge}
        </div>
        <h3 class="card-title">${sanitizeText(asg.title)}</h3>
        <p class="card-instructions">${sanitizeText(asg.description)}</p>
        ${resubmitReasonAlert}
        ${studentPhotoPreview}
        <div class="proof-requirements">
          <span class="proof-tag">📷 Vở ghi (≥${asg.minPhotos} trang)</span>
          ${asg.allowLink ? '<span class="proof-tag">🔗 Kèm link</span>' : ""}
          ${asg.allowNote ? '<span class="proof-tag">✍️ Ghi chú</span>' : ""}
        </div>
      </div>
      <div class="card-footer">
        <span class="deadline-text">Hạn nộp: <strong>${deadlineFormatted}</strong></span>
        ${actionBtn}
      </div>
    `;

    container.appendChild(card);
  });

  document.getElementById("studentStatsBadge").innerText =
    `Cần làm: ${pendingCount} | Chờ chấm: ${submittedCount} | Đã có điểm: ${gradedCount}`;
}

// Student Submission Modal
function openSubmitModal(assignmentId) {
  activeSubmittingAssignmentId = assignmentId;
  const asg = assignments.find((a) => a.id === assignmentId);
  if (!asg) return;

  const existingSub = submissions.find(
    (s) => s.assignmentId === assignmentId && s.studentId === currentUser.id
  );
  if (existingSub && existingSub.status === "graded") {
    showNoticeModal(
      "Giáo viên đã xác nhận bài làm của em rồi, em không thể gửi lại bài này được nữa nhé!",
      "Đã được xác nhận",
      "🔒"
    );
    return;
  }

  const isResubmitting = Boolean(existingSub && (existingSub.status === "submitted" || existingSub.status === "resubmit_requested"));

  document.getElementById("submitModalTitle").innerText = isResubmitting
    ? `Nộp lại bài: ${asg.title}`
    : `Nộp bài: ${asg.title}`;
  document.getElementById("submitModalSubtitle").innerText = isResubmitting
    ? `Môn: ${asg.subject} • 💡 Ảnh chụp mới sẽ thay thế hoàn toàn ảnh đã nộp trước đó.`
    : `Môn: ${asg.subject} • Yêu cầu tối thiểu ${asg.minPhotos} ảnh chụp vở`;

  currentUploadedPhotos = [];
  if (existingSub) {
    document.getElementById("proofLinkInput").value = existingSub.linkProof || "";
    document.getElementById("studentNoteInput").value = existingSub.studentNote || "";
  } else {
    document.getElementById("proofLinkInput").value = "";
    document.getElementById("studentNoteInput").value = "";
  }

  renderPhotoPreviews();
  document.getElementById("submitModal").style.display = "flex";
}

function closeSubmitModal() {
  stopCameraStream();
  document.getElementById("submitModal").style.display = "none";
}

async function startCameraStream() {
  const container = document.getElementById("cameraContainer");
  const video = document.getElementById("cameraVideo");

  // Hỗ trợ MediaDevices API đa trình duyệt (Safari iOS, Chrome, Android, Edge)
  const getUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    ? (constraints) => navigator.mediaDevices.getUserMedia(constraints)
    : (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia)
        ? (constraints) => new Promise((resolve, reject) => {
            (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia).call(navigator, constraints, resolve, reject);
          })
        : null;

  if (!getUserMedia) {
    // Nếu thiết bị không hỗ trợ stream camera web, tự động mở camera native qua input capture
    const directCam = document.getElementById("directCameraInput");
    if (directCam) {
      directCam.click();
      return;
    }
    alert("Trình duyệt không hỗ trợ xem trước camera trực tiếp. Vui lòng bấm 'Chụp ảnh bài làm' hoặc 'Chọn ảnh từ thiết bị'.");
    return;
  }

  try {
    cameraMediaStream = await getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });

    if ("srcObject" in video) {
      video.srcObject = cameraMediaStream;
    } else {
      video.src = window.URL.createObjectURL(cameraMediaStream);
    }

    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    await video.play().catch(() => {});
    container.style.display = "flex";
  } catch (err) {
    console.warn("Không thể mở live video stream, chuyển sang mở camera thiết bị:", err);
    const directCam = document.getElementById("directCameraInput");
    if (directCam) {
      directCam.click();
    } else {
      alert("Không thể truy cập camera. Vui lòng bấm 'Chụp ảnh bài làm' hoặc 'Chọn ảnh từ thiết bị'.");
    }
  }
}

function stopCameraStream() {
  if (cameraMediaStream) {
    cameraMediaStream.getTracks().forEach((track) => track.stop());
    cameraMediaStream = null;
  }
  document.getElementById("cameraContainer").style.display = "none";
}

function captureSnapshot() {
  const video = document.getElementById("cameraVideo");
  if (!video || !cameraMediaStream) return;

  const w = video.videoWidth || video.clientWidth || 1280;
  const h = video.videoHeight || video.clientHeight || 720;
  if (w === 0 || h === 0) {
    alert("Camera đang khởi động, vui lòng chờ 1 giây rồi bấm chụp lại.");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);

  const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const approxSizeKb = Math.round((compressedDataUrl.length * 3) / 4 / 1024);

  currentUploadedPhotos.push({
    id: "photo_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
    dataUrl: compressedDataUrl,
    rotation: 0,
    sizeKb: approxSizeKb
  });

  renderPhotoPreviews();
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  if (!files || files.length === 0) return;

  const maxSizeBytes = 15 * 1024 * 1024; // 15MB limit per file

  for (const file of files) {
    if (currentUploadedPhotos.length >= 10) {
      alert("Hệ thống chỉ cho phép tải tối đa 10 ảnh minh chứng cho một bài nộp.");
      break;
    }

    const isImage = (file.type && file.type.startsWith("image/")) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || "");
    if (!isImage) {
      alert(`Tệp "${sanitizeText(file.name)}" không phải là hình ảnh hợp lệ.`);
      continue;
    }

    if (file.size > maxSizeBytes) {
      alert(`Ảnh "${sanitizeText(file.name)}" vượt quá dung lượng tối đa 15MB.`);
      continue;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      compressImage(e.target.result, 1600, 0.82, (compressedDataUrl, sizeKb) => {
        currentUploadedPhotos.push({
          id: "photo_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
          dataUrl: compressedDataUrl,
          rotation: 0,
          sizeKb: sizeKb
        });
        renderPhotoPreviews();
      });
    };
    reader.readAsDataURL(file);
  }

  event.target.value = "";
}

function compressImage(sourceDataUrl, maxDimension, quality, callback) {
  const img = new Image();
  img.onload = () => {
    let width = img.width;
    let height = img.height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    const compressed = canvas.toDataURL("image/jpeg", quality);
    const sizeKb = Math.round((compressed.length * 3) / 4 / 1024);
    callback(compressed, sizeKb);
  };
  img.onerror = () => {
    console.warn("Lỗi nạp ảnh nén, sử dụng ảnh gốc làm fallback");
    const sizeKb = Math.round((sourceDataUrl.length * 3) / 4 / 1024);
    callback(sourceDataUrl, sizeKb);
  };
  img.src = sourceDataUrl;
}

function rotatePhoto(index) {
  if (!currentUploadedPhotos[index]) return;
  const item = currentUploadedPhotos[index];

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    item.dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    renderPhotoPreviews();
  };
  img.onerror = () => {
    console.warn("Không thể xoay ảnh này");
  };
  img.src = item.dataUrl;
}

function movePhoto(index, delta) {
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= currentUploadedPhotos.length) return;
  const temp = currentUploadedPhotos[index];
  currentUploadedPhotos[index] = currentUploadedPhotos[newIndex];
  currentUploadedPhotos[newIndex] = temp;
  renderPhotoPreviews();
}

function removePhoto(index) {
  currentUploadedPhotos.splice(index, 1);
  renderPhotoPreviews();
}

function renderPhotoPreviews() {
  const grid = document.getElementById("photosPreviewGrid");
  const notice = document.getElementById("photoCountNotice");
  const submitBtn = document.getElementById("confirmSubmitBtn");
  if (grid) grid.innerHTML = "";

  if (currentUploadedPhotos.length === 0) {
    if (notice) {
      notice.innerHTML = `
        <div style="color: #DC2626; font-size: 0.8rem; font-weight: 600; background: #FEF2F2; padding: 0.55rem 0.85rem; border-radius: 8px; border: 1.5px dashed #FCA5A5; display: flex; align-items: center; gap: 0.45rem;">
          <span>⚠️</span>
          <span><strong>Bắt buộc đính kèm ảnh:</strong> Em cần chụp hoặc tải lên ít nhất 1 ảnh bài làm mới gửi bài cho cô được nhé!</span>
        </div>
      `;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = "0.55";
      submitBtn.style.cursor = "not-allowed";
      submitBtn.innerHTML = "📷 Cần đính kèm ảnh để nộp bài";
    }
    return;
  }

  if (notice) {
    notice.innerHTML = `
      <div style="color: #065F46; font-size: 0.8rem; font-weight: 600; background: #ECFDF5; padding: 0.55rem 0.85rem; border-radius: 8px; border: 1px solid #A7F3D0; display: flex; align-items: center; gap: 0.45rem;">
        <span>✅</span>
        <span>Đã đính kèm <strong>${currentUploadedPhotos.length} trang ảnh bài làm</strong>. Em có thể bấm gửi bài cho cô!</span>
      </div>
    `;
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
    submitBtn.style.cursor = "pointer";
    submitBtn.innerHTML = `🚀 Gửi bài cho cô (${currentUploadedPhotos.length} ảnh)`;
  }

  currentUploadedPhotos.forEach((photo, idx) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    card.innerHTML = `
      <div class="photo-thumb-wrap">
        <img src="${photo.dataUrl}" class="photo-thumb" alt="Trang ${idx + 1}" />
      </div>
      <div class="photo-meta">
        <strong>Trang ${idx + 1}</strong>
        <span>${photo.sizeKb} KB</span>
      </div>
      <div class="photo-tools" style="margin-top: 0.35rem; justify-content: space-between;">
        <div style="display: flex; gap: 0.2rem;">
          <button class="tool-icon-btn" title="Chuyển sang trái" onclick="movePhoto(${idx}, -1)" ${idx === 0 ? "disabled" : ""}>◀</button>
          <button class="tool-icon-btn" title="Chuyển sang phải" onclick="movePhoto(${idx}, 1)" ${idx === currentUploadedPhotos.length - 1 ? "disabled" : ""}>▶</button>
          <button class="tool-icon-btn" title="Xoay 90°" onclick="rotatePhoto(${idx})">🔄</button>
        </div>
        <button class="tool-icon-btn" style="color: var(--danger);" title="Xóa ảnh" onclick="removePhoto(${idx})">🗑️</button>
      </div>
    `;
    if (grid) grid.appendChild(card);
  });
}

// Chuyển đổi an toàn Base64 dataURL sang Blob (chống lỗi fetch data: trên Safari iOS & Chrome Android)
function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  try {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    return null;
  }
}

// Tải ảnh lên Supabase Storage bucket 'proofs' (nếu bucket tồn tại) và tự động fallback về Base64
async function uploadPhotoToStorage(sb, dataUrl, filePath) {
  if (!sb || !dataUrl || !dataUrl.startsWith("data:")) return null;
  try {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return null;
    const { data, error } = await sb.storage.from("proofs").upload(filePath, blob, {
      upsert: true,
      contentType: blob.type || "image/jpeg"
    });
    if (error) {
      console.warn("Storage upload (sẽ lưu dưới dạng nén Base64):", error.message);
      return null;
    }
    const { data: pubData } = sb.storage.from("proofs").getPublicUrl(filePath);
    return pubData ? pubData.publicUrl : null;
  } catch (err) {
    console.warn("Storage upload exception (sẽ lưu dưới dạng nén Base64):", err);
    return null;
  }
}

let isSubmitting = false;

async function confirmSubmitAssignment() {
  if (isSubmitting) return;

  const asg = assignments.find((a) => a.id === activeSubmittingAssignmentId);
  if (!asg) return;

  if (!currentUploadedPhotos || currentUploadedPhotos.length === 0) {
    alert("⚠️ Em bắt buộc phải đính kèm ít nhất 1 ảnh chụp bài làm mới gửi bài cho cô được nhé!\n\nHãy bấm 'Chụp ảnh bài làm' hoặc 'Chọn ảnh từ thiết bị'.");
    return;
  }

  const minRequired = asg.minPhotos && asg.minPhotos > 1 ? asg.minPhotos : 1;
  if (currentUploadedPhotos.length < minRequired) {
    alert(`Bài tập này yêu cầu tối thiểu ${minRequired} ảnh chụp bài làm. Hiện tại em mới có ${currentUploadedPhotos.length} ảnh, vui lòng đính kèm thêm trước khi gửi nhé!`);
    return;
  }

  isSubmitting = true;
  const submitBtn = document.querySelector("#submitModal .btn-primary");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ Đang gửi bài...";
  }

  try {
    const sb = getSupabase();

    // 1. Tải ảnh lên Supabase Storage bucket 'proofs' song song (parallel) để tăng tốc nộp bài
    if (sb) {
      await Promise.all(
        currentUploadedPhotos.map(async (photo, i) => {
          if (photo.dataUrl && photo.dataUrl.startsWith("data:")) {
            const path = `submissions/${asg.id}/${currentUser.id}/${photo.id || "page_" + i}.jpg`;
            const storageUrl = await uploadPhotoToStorage(sb, photo.dataUrl, path);
            if (storageUrl) {
              photo.url = storageUrl;
              photo.storageUrl = storageUrl;
              photo.backupDataUrl = photo.dataUrl;
            }
          }
        })
      );
    }

    const linkProof = document.getElementById("proofLinkInput").value.trim();
    const studentNote = document.getElementById("studentNoteInput").value.trim();

    let subIndex = submissions.findIndex(
      (s) => s.assignmentId === asg.id && s.studentId === currentUser.id
    );

    if (subIndex >= 0 && submissions[subIndex].status === "graded") {
      showNoticeModal(
        "Giáo viên đã xác nhận bài làm của em rồi, em không thể gửi lại bài này được nữa nhé!",
        "Đã được xác nhận",
        "🔒"
      );
      return;
    }

    const isResubmitting = subIndex >= 0;

    const newSubData = {
      id: subIndex >= 0 ? submissions[subIndex].id : "sub_" + Date.now(),
      assignmentId: asg.id,
      studentId: currentUser.id,
      studentName: currentUser.name,
      submittedAt: new Date().toISOString(),
      status: "submitted",
      photos: currentUploadedPhotos,
      linkProof: linkProof,
      studentNote: studentNote,
      annotations: {},
      grade: null,
      feedback: "",
      resubmitRequested: false
    };

    if (subIndex >= 0) {
      submissions[subIndex] = newSubData;
    } else {
      submissions.push(newSubData);
    }

    persistData();

    if (sb) {
      // 2. Xác thực nộp bài qua RPC submit_homework bằng mật khẩu học sinh (chống nộp thay & mạo danh)
      try {
        const { data: rpcData, error: rpcErr } = await sb.rpc("submit_homework", {
          p_student_id: currentUser.id,
          p_password: currentUser.password,
          p_assignment_id: asg.id,
          p_photos: newSubData.photos,
          p_link_proof: newSubData.linkProof,
          p_student_note: newSubData.studentNote
        });

        if (rpcErr) {
          // Fallback lưu trực tiếp qua bảng nếu chưa tạo RPC trên database
          console.warn("RPC submit_homework fallback sang table:", rpcErr.message);
          await sb.from("eduproof_submissions").upsert([{
            id: newSubData.id,
            assignment_id: newSubData.assignmentId,
            student_id: newSubData.studentId,
            student_name: newSubData.studentName,
            submitted_at: newSubData.submittedAt,
            status: newSubData.status,
            photos: newSubData.photos,
            link_proof: newSubData.linkProof,
            student_note: newSubData.studentNote,
            annotations: newSubData.annotations,
            grade: newSubData.grade,
            feedback: newSubData.feedback,
            resubmit_requested: newSubData.resubmitRequested
          }]);
        } else if (rpcData && rpcData.submission_id) {
          newSubData.id = rpcData.submission_id;
          if (subIndex >= 0) {
            submissions[subIndex].id = rpcData.submission_id;
          }
          persistData();
        }
      } catch (cloudErr) {
        console.warn("Lỗi đồng bộ bài nộp lên cloud:", cloudErr);
      }
    }

    closeSubmitModal();
    renderStudentView();
    alert(isResubmitting ? "🎉 Chúc mừng! Bạn đã nộp lại bài tập thành công (Ảnh mới đã thay thế ảnh cũ)." : "🎉 Chúc mừng! Bạn đã nộp bài tập thành công.");
    syncCloudData(false);
  } finally {
    isSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "🚀 Xác nhận nộp bài";
    }
  }
}

function viewSubmissionSummary(submissionId) {
  openGradingStudio(submissionId, true);
}

// ==========================================
// 5. TEACHER VIEW & CAMPAIGN (THEO ĐỢT)
// ==========================================

function switchTeacherTab(tab, btnElement) {
  teacherActiveTab = tab;
  localStorage.setItem("eduproof_teacher_tab", tab);
  document.querySelectorAll("#teacherView .filter-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
  if (btnElement) {
    btnElement.classList.add("active");
  } else {
    const btn = document.querySelector(`#teacherView .filter-tabs .tab-btn[onclick*="'${tab}'"]`);
    if (btn) btn.classList.add("active");
  }

  const subTab = document.getElementById("teacherSubmissionsTab");
  const camTab = document.getElementById("teacherCampaignTab");
  const asgTab = document.getElementById("teacherAssignmentsTab");
  const stuTab = document.getElementById("teacherStudentsTab");
  const graTab = document.getElementById("teacherGradebookTab");

  if (subTab) subTab.style.display = tab === "submissions" ? "block" : "none";
  if (camTab) camTab.style.display = tab === "campaigns" ? "block" : "none";
  if (asgTab) asgTab.style.display = tab === "assignments" ? "block" : "none";
  if (stuTab) stuTab.style.display = tab === "students" ? "block" : "none";
  if (graTab) graTab.style.display = tab === "gradebook" ? "block" : "none";

  renderTeacherView();
}

function renderTeacherView() {
  const myStudents = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  const myAssignments = assignments.filter((a) => a.teacherId === currentUser.id);
  const myAssignmentIds = new Set(myAssignments.map((a) => a.id));
  const mySubmissions = submissions.filter((s) => myAssignmentIds.has(s.assignmentId));

  const pendingSubs = mySubmissions.filter((s) => s.status === "submitted");
  const elPending = document.getElementById("pendingSubCount");
  if (elPending) elPending.innerText = pendingSubs.length;
  const elPendingShort = document.getElementById("pendingSubCountShort");
  if (elPendingShort) elPendingShort.innerText = pendingSubs.length;

  const elStudents = document.getElementById("totalStudentsCount");
  if (elStudents) elStudents.innerText = myStudents.length;
  const elStudentsShort = document.getElementById("totalStudentsCountShort");
  if (elStudentsShort) elStudentsShort.innerText = myStudents.length;

  const subTab = document.getElementById("teacherSubmissionsTab");
  const camTab = document.getElementById("teacherCampaignTab");
  const asgTab = document.getElementById("teacherAssignmentsTab");
  const stuTab = document.getElementById("teacherStudentsTab");
  const graTab = document.getElementById("teacherGradebookTab");

  if (subTab) subTab.style.display = teacherActiveTab === "submissions" ? "block" : "none";
  if (camTab) camTab.style.display = teacherActiveTab === "campaigns" ? "block" : "none";
  if (asgTab) asgTab.style.display = teacherActiveTab === "assignments" ? "block" : "none";
  if (stuTab) stuTab.style.display = teacherActiveTab === "students" ? "block" : "none";
  if (graTab) graTab.style.display = teacherActiveTab === "gradebook" ? "block" : "none";

  document.querySelectorAll("#teacherView .filter-tabs .tab-btn").forEach((b) => {
    const isMatch = b.getAttribute("onclick") && b.getAttribute("onclick").includes(`'${teacherActiveTab}'`);
    b.classList.toggle("active", Boolean(isMatch));
  });

  if (teacherActiveTab === "submissions") {
    renderTeacherSubmissions(mySubmissions);
  } else if (teacherActiveTab === "campaigns") {
    renderTeacherCampaignView(myAssignments, myStudents);
  } else if (teacherActiveTab === "assignments") {
    renderTeacherAssignments(myAssignments);
  } else if (teacherActiveTab === "students") {
    renderTeacherStudents(myStudents);
  } else if (teacherActiveTab === "gradebook") {
    renderTeacherGradebook(myStudents, myAssignments);
  }
}

function renderTeacherSubmissions(mySubmissionsList) {
  const container = document.getElementById("teacherSubmissionsList");
  container.innerHTML = "";

  const myAssignments = assignments.filter((a) => a.teacherId === currentUser.id);
  const myAssignmentIds = new Set(myAssignments.map((a) => a.id));
  const baseList = mySubmissionsList || submissions.filter((s) => myAssignmentIds.has(s.assignmentId));
  // Hàng chờ bài nộp chỉ hiển thị các bài đang chờ giáo viên kiểm tra (status === 'submitted')
  // Bài đã từ chối ảnh (resubmit_requested) hoặc đã kiểm tra (graded) sẽ tự động rời khỏi hàng chờ
  const list = baseList.filter((s) => s.status === "submitted");

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; background: #FFFFFF; border-radius: 16px; border: 1.5px dashed #CBD5E1; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
        <div style="font-size: 2.4rem; margin-bottom: 0.5rem;">🎉</div>
        <h4 style="font-size: 1.05rem; font-weight: 700; color: #1E293B; margin-bottom: 0.3rem;">Hàng chờ bài nộp trống!</h4>
        <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 460px; margin: 0 auto; line-height: 1.5;">
          Không có bài nộp nào đang chờ bạn kiểm tra. Các bài đã từ chối ảnh sẽ chờ học sinh chụp nộp lại và tự động xuất hiện tại đây khi em gửi bài mới.
        </p>
      </div>`;
    return;
  }

  list.forEach((sub) => {
    const asg = assignments.find((a) => a.id === sub.assignmentId);
    const card = document.createElement("div");
    card.className = "assignment-card";

    let statusBadge = "";
    if (sub.status === "submitted") {
      statusBadge = `<span class="badge-status status-submitted">⏳ Đã nộp</span>`;
    } else if (sub.status === "graded") {
      statusBadge = `<span class="badge-status status-graded">✅ Đã kiểm tra</span>`;
    } else if (sub.status === "resubmit_requested") {
      statusBadge = `<span class="badge-status status-resubmit">⚠️ Yêu cầu nộp lại</span>`;
    }

    const submittedDate = new Date(sub.submittedAt).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit"
    });

    const studentUser = users.find((u) => u.id === sub.studentId || u.name === sub.studentName);
    const studentClass = studentUser && studentUser.class ? studentUser.class : (currentUser.class || "12A1");

    sub.photos = normalizePhotos(sub.photos);
    const firstPhotoObj = sub.photos && sub.photos[0] ? sub.photos[0] : null;
    const firstPhotoSrc = firstPhotoObj ? (firstPhotoObj.dataUrl || firstPhotoObj.url || "") : "";
    const backupSrc = firstPhotoObj ? (firstPhotoObj.backupDataUrl || (firstPhotoSrc.startsWith("data:") ? firstPhotoSrc : "")) : "";

    card.innerHTML = `
      <div>
        <div class="card-top" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.65rem;">
          <div style="display: flex; align-items: center; gap: 0.45rem; min-width: 0; flex: 1; flex-wrap: wrap;">
            <strong style="font-size: 0.95rem; color: var(--text-main);">${sanitizeText(sub.studentName)}</strong>
            ${asg ? formatSubjectBadge(asg.subject) : ""}
          </div>
          <div style="flex-shrink: 0;">
            ${statusBadge}
          </div>
        </div>
        <div style="display: flex; gap: 0.75rem; align-items: flex-start; margin: 0.5rem 0;">
          ${firstPhotoSrc ? `
            <div style="position: relative; width: 68px; height: 68px; flex-shrink: 0; cursor: pointer; border-radius: 8px; overflow: hidden; border: 1.5px solid #C7D2FE; box-shadow: 0 2px 5px rgba(0,0,0,0.08); background: #EEF2FF;" onclick="openGradingStudio('${sanitizeText(sub.id)}', false)" title="Bấm để chấm bài trên ảnh">
              <img src="${firstPhotoSrc}" data-backup="${sanitizeText(backupSrc)}" alt="Ảnh vở bài làm" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="handlePhotoError(this)" />
              <span style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(15,23,42,0.75); color: #FFF; font-size: 0.62rem; text-align: center; font-weight: 600; padding: 1px 0;">${sub.photos.length} trang</span>
            </div>
          ` : ""}
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.2rem;">
              ${asg ? sanitizeText(asg.title) : "Bài tập đã xóa"}
            </div>
            <div style="font-size: 0.74rem; color: var(--text-muted);">
              Nộp lúc: ${submittedDate}
            </div>
            ${sub.studentNote ? `<div style="font-size: 0.75rem; background: #F8FAFC; padding: 0.3rem 0.5rem; border-radius: 4px; margin-top: 0.35rem; color: #475569;">💬 <em>"${sanitizeText(sub.studentNote)}"</em></div>` : ""}
          </div>
        </div>
      </div>
      <div class="card-footer" style="gap: 0.4rem; flex-wrap: wrap;">
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Lớp: ${sanitizeText(studentClass)}</span>
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
          <button class="btn btn-primary btn-sm" onclick="openGradingStudio('${sanitizeText(sub.id)}', false)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            ${sub.status === "graded" ? "Xem lại bài" : ((sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Xem bài đã từ chối" : "Kiểm tra bài làm")}
          </button>
          <button class="btn btn-danger-outline btn-sm" onclick="openRejectPhotoModal('${sanitizeText(sub.id)}')" title="Từ chối ảnh bài làm và gửi email thông báo cho học sinh">
            🚫 Từ chối ảnh
          </button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// Campaign (Đợt nộp bài tập) View
function viewAssignmentCampaign(assignmentId) {
  selectedCampaignId = assignmentId;
  localStorage.setItem("eduproof_selected_campaign", assignmentId);
  switchTeacherTab("campaigns");
}

function handleCampaignSelectChange(assignmentId) {
  selectedCampaignId = assignmentId;
  localStorage.setItem("eduproof_selected_campaign", assignmentId);
  renderTeacherCampaignView();
}

function renderTeacherCampaignView(myAssignmentsList, myStudentsList) {
  const container = document.getElementById("campaignDetailContainer");
  if (!container) return;

  const myAssignments = (myAssignmentsList || assignments.filter((a) => a.teacherId === currentUser.id)).slice().sort((a, b) => getAssignmentTime(b) - getAssignmentTime(a));
  const studentsList = myStudentsList || users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);

  if (myAssignments.length === 0) {
    container.innerHTML = `
      <div style="background: white; border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 2rem; text-align: center;">
        <p style="color: var(--text-muted); margin-bottom: 1rem;">Bạn chưa giao bài tập nào. Hãy bấm "Tạo bài tập mới" để bắt đầu.</p>
        <button class="btn btn-primary btn-sm" onclick="openCreateAssignmentModal()">➕ Tạo bài tập mới</button>
      </div>`;
    return;
  }

  let currentAsg = myAssignments.find((a) => a.id === selectedCampaignId);
  if (!currentAsg) {
    currentAsg = myAssignments[0];
    selectedCampaignId = currentAsg.id;
  }

  const selectOptionsHtml = myAssignments.map((asg) => {
    const isSelected = asg.id === selectedCampaignId ? "selected" : "";
    const deadlineStr = new Date(asg.deadline).toLocaleDateString("vi-VN");
    return `<option value="${asg.id}" ${isSelected}>📖 [${sanitizeText(asg.subject)}] ${sanitizeText(asg.title)} (Hạn: ${deadlineStr})</option>`;
  }).join("");

  const asgSubmissions = submissions.filter((s) => s.assignmentId === currentAsg.id);

  const submittedCount = asgSubmissions.length;
  const gradedCount = asgSubmissions.filter((s) => s.status === "graded").length;
  const notSubmittedCount = Math.max(0, studentsList.length - submittedCount);

  const deadlineFormatted = new Date(currentAsg.deadline).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  container.innerHTML = `
    <div class="campaign-banner">
      <!-- 1. Hàng chọn đợt bài tập & Hạn nộp gọn gàng -->
      <div class="campaign-header-row">
        <div class="campaign-select-wrap">
          <label class="campaign-select-label" for="campaignSelectBox">
            📂 Chọn đợt bài:
          </label>
          <select id="campaignSelectBox" class="form-select campaign-select" onchange="handleCampaignSelectChange(this.value)">
            ${selectOptionsHtml}
          </select>
        </div>
        <div class="campaign-deadline-pill">
          ⏰ Hạn nộp: <strong>${deadlineFormatted}</strong>
        </div>
      </div>

      <!-- 2. Thông tin chi tiết đợt bài -->
      <div class="campaign-info-row">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; flex-wrap: wrap;">
          ${formatSubjectBadge(currentAsg.subject)}
          <h2 class="campaign-title" style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin: 0;">
            ${sanitizeText(currentAsg.title)}
          </h2>
        </div>
        ${currentAsg.description ? `<p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.25rem 0 0 0; line-height: 1.4;">${sanitizeText(currentAsg.description)}</p>` : ""}
      </div>

      <!-- 3. Cụm nút thao tác nhanh (Cân đối 2x2 trên mobile, 1 hàng trên desktop) -->
      <div class="campaign-actions-bar">
        <button class="btn btn-secondary btn-sm campaign-action-btn" onclick="copyAssignmentShareLink('${currentAsg.id}')">
          🔗 Link nộp bài
        </button>
        <button class="btn btn-secondary btn-sm campaign-action-btn" onclick="copyUnsubmittedStudents('${currentAsg.id}')" title="Sao chép danh sách học sinh chưa nộp để gửi vào nhóm Zalo">
          📋 Nhắc Zalo (${notSubmittedCount})
        </button>
        <button class="btn btn-secondary btn-sm campaign-action-btn" onclick="exportCampaignReport('${currentAsg.id}')" title="Xuất file Excel báo cáo tiến độ nộp minh chứng cho Đoàn trường / BGH">
          📊 Xuất Excel
        </button>
        <button class="btn btn-danger-outline btn-sm campaign-action-btn" onclick="deleteAssignment('${currentAsg.id}')" title="Xóa đợt bài tập này và toàn bộ bài nộp liên quan">
          🗑️ Xóa đợt này
        </button>
      </div>

      <!-- 4. Lưới thống kê 4 ô nhỏ gọn -->
      <div class="campaign-stats-grid">
        <div class="stat-box">
          <div class="stat-num">${studentsList.length}</div>
          <div class="stat-label">Học sinh của bạn</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color: var(--primary);">${submittedCount}</div>
          <div class="stat-label">Đã gửi bài nộp</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color: var(--danger);">${notSubmittedCount}</div>
          <div class="stat-label">Chưa nộp bài</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color: var(--success);">${gradedCount}</div>
          <div class="stat-label">Đã kiểm tra (Đã làm)</div>
        </div>
      </div>
    </div>

    <div class="campaign-list-container" style="background: white; border-radius: var(--radius-md); border: 1px solid var(--border-color); overflow-x: auto; padding: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.85rem;">
        <h3 style="font-size: 1.05rem; font-weight: 700;">
          Danh sách học sinh (${studentsList.length} học sinh)
        </h3>
        <div class="filter-tabs" style="margin-bottom: 0; padding-bottom: 0;">
          <button class="tab-btn ${campaignStudentFilter === 'all' ? 'active' : ''}" onclick="filterCampaignStudents('all')">
            Tất cả (${studentsList.length})
          </button>
          <button class="tab-btn ${campaignStudentFilter === 'submitted' ? 'active' : ''}" onclick="filterCampaignStudents('submitted')">
            ✅ Đã nộp (${submittedCount})
          </button>
          <button class="tab-btn ${campaignStudentFilter === 'unsubmitted' ? 'active' : ''}" onclick="filterCampaignStudents('unsubmitted')">
            ❌ Chưa nộp (${notSubmittedCount})
          </button>
        </div>
      </div>

      ${(() => {
        let displayed = studentsList;
        if (campaignStudentFilter === "submitted") {
          displayed = studentsList.filter((st) => asgSubmissions.some((s) => s.studentId === st.id));
        } else if (campaignStudentFilter === "unsubmitted") {
          displayed = studentsList.filter((st) => !asgSubmissions.some((s) => s.studentId === st.id));
        }

        if (displayed.length === 0) {
          return `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">Không có học sinh nào thỏa mãn bộ lọc hiện tại.</div>`;
        }

        const tableRowsHtml = displayed.map((student) => {
          const sub = asgSubmissions.find((s) => s.studentId === student.id);
          if (sub) {
            sub.photos = normalizePhotos(sub.photos);
            let badge = "";
            if (sub.status === "graded") badge = `<span class="badge-status status-graded">✅ Đã làm</span>`;
            else if (sub.status === "resubmit_requested") badge = `<span class="badge-status status-resubmit">⚠️ Cần nộp lại</span>`;
            else badge = `<span class="badge-status status-submitted">⏳ Chờ xem</span>`;

            const timeStr = new Date(sub.submittedAt).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit"
            });

            return `
              <tr>
                <td><strong>${sanitizeText(student.name)}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">(${sanitizeText(student.username)})</span></td>
                <td>${badge}</td>
                <td>${timeStr}</td>
                <td>📷 ${sub.photos.length} trang</td>
                <td>${sub.status === "graded" ? `<strong style="color: #059669;">✅ Đã làm</strong>` : ((sub.status === "resubmit_requested" || sub.resubmitRequested) ? `<strong style="color: #DC2626;">⚠️ Đã từ chối ảnh</strong>` : `<strong style="color: #4338CA;">⏳ Chờ xem</strong>`)}</td>
                <td>
                  <div style="display: flex; gap: 0.35rem; align-items: center;">
                    <button class="btn btn-primary btn-sm" onclick="openGradingStudio('${sanitizeText(sub.id)}', false)">
                      ✍️ ${sub.status === "graded" ? "Xem lại" : ((sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Xem bài đã từ chối" : "Kiểm tra")}
                    </button>
                    ${(sub.status === "submitted" && !sub.resubmitRequested) ? `
                      <button class="btn btn-danger-outline btn-sm" onclick="openRejectPhotoModal('${sanitizeText(sub.id)}')" title="Từ chối ảnh bài làm và gửi email thông báo cho học sinh">
                        🚫 Từ chối ảnh
                      </button>
                    ` : ""}
                  </div>
                </td>
              </tr>
            `;
          } else {
            return `
              <tr>
                <td><strong>${sanitizeText(student.name)}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">(${sanitizeText(student.username)})</span></td>
                <td><span class="badge-status status-resubmit">❌ Chưa nộp bài</span></td>
                <td style="color: var(--text-muted);">—</td>
                <td style="color: var(--text-muted);">0 trang</td>
                <td style="color: var(--text-muted);">—</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="remindStudent('${student.id}', '${currentAsg.id}')">
                    📢 Nhắc nộp bài
                  </button>
                </td>
              </tr>
            `;
          }
        }).join("");

        const mobileCardsHtml = displayed.map((student) => {
          const sub = asgSubmissions.find((s) => s.studentId === student.id);
          if (sub) {
            sub.photos = normalizePhotos(sub.photos);
            let badge = "";
            if (sub.status === "graded") badge = `<span class="badge-status status-graded">✅ Đã làm</span>`;
            else if (sub.status === "resubmit_requested") badge = `<span class="badge-status status-resubmit">⚠️ Cần nộp lại</span>`;
            else badge = `<span class="badge-status status-submitted">⏳ Chờ xem</span>`;

            const timeStr = new Date(sub.submittedAt).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit"
            });

            return `
              <div class="campaign-student-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.45rem;">
                  <div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${sanitizeText(student.name)}</div>
                    <div style="font-size: 0.74rem; color: var(--text-muted);">${sanitizeText(student.username)}</div>
                  </div>
                  <div>${badge}</div>
                </div>

                <div style="display: flex; flex-wrap: wrap; gap: 0.55rem; font-size: 0.76rem; color: #475569; background: #F8FAFC; padding: 0.4rem 0.6rem; border-radius: 8px; margin-bottom: 0.5rem; align-items: center; border: 1px solid #F1F5F9;">
                  <span>🕒 ${timeStr}</span>
                  <span>📷 ${sub.photos.length} trang ảnh</span>
                  <span>Trạng thái: <strong style="color: ${sub.status === 'graded' ? '#059669' : ((sub.status === 'resubmit_requested' || sub.resubmitRequested) ? '#DC2626' : '#4338CA')};">${sub.status === "graded" ? "Đã làm" : ((sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Cần nộp lại" : "Chờ xem")}</strong></span>
                </div>

                ${(sub.status === "resubmit_requested" || sub.resubmitRequested) && sub.feedback ? `
                  <div style="font-size: 0.74rem; color: #DC2626; margin-bottom: 0.45rem; background: #FEF2F2; padding: 0.35rem 0.55rem; border-radius: 6px; border: 1px solid #FECACA;">
                    🚫 <strong>Lý do từ chối:</strong> "${sanitizeText(sub.feedback)}"
                  </div>
                ` : ""}

                <div style="display: flex; gap: 0.35rem; margin-top: 0.45rem;">
                  <button class="btn btn-primary btn-sm" style="flex: 1; justify-content: center; padding: 0.45rem;" onclick="openGradingStudio('${sanitizeText(sub.id)}', false)">
                    ✍️ ${sub.status === "graded" ? "Xem lại bài" : ((sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Xem bài đã từ chối" : "Kiểm tra bài làm")}
                  </button>
                  ${(sub.status === "submitted" && !sub.resubmitRequested) ? `
                    <button class="btn btn-danger-outline btn-sm" style="justify-content: center; padding: 0.45rem 0.6rem;" onclick="openRejectPhotoModal('${sanitizeText(sub.id)}')" title="Từ chối ảnh & Báo gửi lại qua Email">
                      🚫 Từ chối ảnh
                    </button>
                  ` : ""}
                </div>
              </div>
            `;
          } else {
            return `
              <div class="campaign-student-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.45rem;">
                  <div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${sanitizeText(student.name)}</div>
                    <div style="font-size: 0.74rem; color: var(--text-muted);">${sanitizeText(student.username)}</div>
                  </div>
                  <div><span class="badge-status status-resubmit">❌ Chưa nộp bài</span></div>
                </div>

                <div style="display: flex; gap: 0.6rem; font-size: 0.76rem; color: #64748B; background: #FFF1F2; padding: 0.4rem 0.6rem; border-radius: 8px; margin-bottom: 0.5rem; align-items: center; border: 1px solid #FFE4E6;">
                  <span style="color: #E11D48; font-weight: 600;">⚠️ Chưa nộp bài tập</span>
                  <span>• 0 trang ảnh</span>
                </div>

                <button class="btn btn-secondary btn-sm" style="width: 100%; justify-content: center; padding: 0.45rem;" onclick="remindStudent('${student.id}', '${currentAsg.id}')">
                  📢 Nhắc nộp bài
                </button>
              </div>
            `;
          }
        }).join("");

        return `
          <!-- 1. Bảng trên màn hình máy tính -->
          <div class="campaign-desktop-view">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Học sinh</th>
                  <th>Trạng thái nộp</th>
                  <th>Thời gian nộp</th>
                  <th>Số trang ảnh</th>
                  <th>Trạng thái bài làm</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- 2. Danh sách dạng thẻ tối ưu 100% cho màn hình điện thoại (Không cần kéo ngang) -->
          <div class="campaign-mobile-view">
            ${mobileCardsHtml}
          </div>
        `;
      })()}
    </div>
  `;
}

function filterCampaignStudents(mode) {
  campaignStudentFilter = mode;
  renderTeacherCampaignView();
}

function exportCampaignReport(assignmentId) {
  const asg = assignments.find((a) => a.id === assignmentId);
  if (!asg) return;

  const studentsList = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  const asgSubmissions = submissions.filter((s) => s.assignmentId === asg.id);

  const rows = studentsList.map((st, idx) => {
    const sub = asgSubmissions.find((s) => s.studentId === st.id);
    let statusText = "Chưa nộp minh chứng";
    let submitTime = "—";
    let photoCount = 0;
    let scoreText = "—";
    let linkProof = "—";
    let note = "—";

    if (sub) {
      sub.photos = normalizePhotos(sub.photos);
      if (sub.status === "graded") {
        statusText = sub.grade !== null && sub.grade !== undefined ? `Đã kiểm tra (${sub.grade}đ)` : "Đã kiểm tra (Đã làm)";
        scoreText = sub.grade !== null && sub.grade !== undefined ? sub.grade : "Đã hoàn thành";
      } else if (sub.status === "resubmit_requested" || sub.resubmitRequested) {
        statusText = "Cần nộp lại ảnh";
        scoreText = "Từ chối ảnh (Cần chụp lại)";
      } else {
        statusText = "Đã nộp (Chờ xem)";
        scoreText = "Chờ giáo viên xem";
      }
      submitTime = new Date(sub.submittedAt).toLocaleString("vi-VN");
      photoCount = sub.photos.length;
      linkProof = sub.linkProof || "—";
      note = sub.studentNote || sub.feedback || "—";
    }

    return {
      "STT": idx + 1,
      "Họ và tên": st.name,
      "Tên đăng nhập": st.username,
      "Lớp": st.class || "12A1",
      "Trạng thái": statusText,
      "Thời gian nộp": submitTime,
      "Số ảnh minh chứng": photoCount,
      "Điểm số / Đánh giá": scoreText,
      "Link đính kèm": linkProof,
      "Ghi chú của học sinh": note
    };
  });

  if (typeof XLSX !== "undefined") {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Báo cáo nộp minh chứng");
    const safeTitle = asg.title.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, "_");
    XLSX.writeFile(wb, `Bao_Cao_${safeTitle}.xlsx`);
  } else {
    alert("Đang chuẩn bị dữ liệu xuất Excel...");
  }
}

function copyUnsubmittedStudents(assignmentId) {
  const asg = assignments.find((a) => a.id === assignmentId);
  if (!asg) return;

  const studentsList = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  const asgSubmissions = submissions.filter((s) => s.assignmentId === asg.id);
  const submittedIds = new Set(asgSubmissions.map((s) => s.studentId));

  const unsubmitted = studentsList.filter((s) => !submittedIds.has(s.id));

  if (unsubmitted.length === 0) {
    alert("🎉 Tuyệt vời! 100% học sinh đã hoàn thành nộp bài/minh chứng.");
    return;
  }

  const deadlineFormatted = new Date(asg.deadline).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  });

  let message = `📢 [THÔNG BÁO NHẮC NHỞ HOÀN THÀNH HOẠT ĐỘNG / BÀI TẬP]\n`;
  message += `📌 Hoạt động / Môn: ${asg.subject} - ${asg.title}\n`;
  message += `⏰ Hạn chót: ${deadlineFormatted}\n`;
  message += `📊 Tiến độ: Còn ${unsubmitted.length}/${studentsList.length} học sinh chưa nộp minh chứng:\n\n`;

  unsubmitted.forEach((st, idx) => {
    message += `${idx + 1}. ${st.name} (${st.class || "12A1"})\n`;
  });

  message += `\n👉 Các em khẩn trương hoàn thành bài làm và chụp ảnh nộp minh chứng lên hệ thống EduProof đúng hạn!`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(message).catch(() => {});
    showNoticeModal(`📋 Đã sao chép danh sách ${unsubmitted.length} học sinh chưa nộp vào Clipboard!\n\nThầy/Cô có thể nhấn Ctrl+V dán ngay vào nhóm Zalo lớp để nhắc nhở.`, "Đã sao chép danh sách nhắc nhở", "📋");
  } else {
    showNoticeModal(message, "Danh sách nhắc nhở nộp bài", "📢");
  }
}

function remindStudent(studentId, assignmentId) {
  const student = users.find((u) => u.id === studentId);
  const asg = assignments.find((a) => a.id === assignmentId);
  if (!student || !asg) return;

  const msg = `📢 Nhắc nhở học tập: Em ${student.name} ơi, bài tập "${asg.title}" sắp đến hạn nộp. Em nhớ chụp ảnh vở bài làm và nộp lên EduProof nhé!`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).catch(() => {});
    showNoticeModal(`Đã sao chép tin nhắn nhắc nhở cho học sinh ${student.name}!\n\n"${msg}"\n\nThầy/Cô có thể dán gửi Zalo cho phụ huynh hoặc học sinh.`, "Đã sao chép tin nhắc nhở", "💬");
  } else {
    showNoticeModal(msg, "Tin nhắn nhắc nhở học sinh", "💬");
  }
}

function copyAssignmentShareLink(assignmentId) {
  const asg = assignments.find((a) => a.id === assignmentId);
  if (!asg) return;
  const appUrl = window.location.origin + window.location.pathname;
  const deadlineStr = new Date(asg.deadline).toLocaleString("vi-VN");
  const msg = `📌 BÀI TẬP VỀ NHÀ: ${asg.title}\n- Hạn nộp: ${deadlineStr}\n- Yêu cầu: Chụp ảnh vở bài làm gửi lên EduProof.\n👉 Cả lớp đăng nhập vào nộp bài trước hạn nhé!\n${appUrl}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).catch(() => {});
  }
  showNoticeModal(`Đã sao chép link và thông báo bài tập!\n\n"${msg}"\n\nThầy/Cô có thể dán vào nhóm Zalo lớp.`, "Đã sao chép thông báo bài tập", "📋");
}

// Assignments Management
function renderTeacherAssignments(myAssignmentsList) {
  const container = document.getElementById("teacherAssignmentsList");
  container.innerHTML = "";

  const myAssignments = (myAssignmentsList || assignments.filter((a) => a.teacherId === currentUser.id)).slice().sort((a, b) => getAssignmentTime(b) - getAssignmentTime(a));

  if (myAssignments.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">Bạn chưa tạo bài tập nào. Hãy bấm "Tạo bài tập mới" ở góc trên.</p>`;
    return;
  }

  myAssignments.forEach((asg) => {
    const card = document.createElement("div");
    card.className = "assignment-card";

    const subsForAsg = submissions.filter((s) => s.assignmentId === asg.id);
    const gradedCount = subsForAsg.filter((s) => s.status === "graded").length;

    card.innerHTML = `
      <div>
        <div class="card-top">
          ${formatSubjectBadge(asg.subject)}
          <span style="font-size: 0.75rem; color: var(--text-muted);">Đã nộp: ${subsForAsg.length}</span>
        </div>
        <h3 class="card-title">${sanitizeText(asg.title)}</h3>
        <p class="card-instructions">${sanitizeText(asg.description)}</p>
        <div style="font-size: 0.78rem; color: var(--primary); font-weight: 600;">
          Tiến độ chấm: ${gradedCount}/${subsForAsg.length} bài
        </div>
      </div>
      <div class="card-footer">
        <span class="deadline-text">Hạn nộp: <strong>${new Date(asg.deadline).toLocaleDateString("vi-VN")}</strong></span>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary btn-sm" onclick="viewAssignmentCampaign('${asg.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Xem đợt nộp này
          </button>
          <button class="btn btn-danger btn-sm" title="Xóa bài tập nếu đăng nhầm" onclick="deleteAssignment('${asg.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Xóa
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function deleteAssignment(assignmentId) {
  if (!assignmentId) return;
  const asg = assignments.find((a) => a.id === assignmentId);
  const title = asg ? asg.title : "này";

  showConfirmModal(
    `Bạn có chắc chắn muốn xóa bài tập "${title}"?\n\nLưu ý: Mọi bài nộp của học sinh liên quan đến bài tập này cũng sẽ bị xóa bỏ hoàn toàn trên cả thiết bị và Supabase Cloud.`,
    async () => {
      assignments = assignments.filter((a) => a.id !== assignmentId);
      submissions = submissions.filter((s) => s.assignmentId !== assignmentId);

      if (selectedCampaignId === assignmentId) {
        selectedCampaignId = assignments.length > 0 ? assignments[0].id : null;
        localStorage.setItem("eduproof_selected_campaign", selectedCampaignId || "");
      }

      persistData();

      // Xóa trực tiếp trên Supabase Cloud ngay lập tức
      const sb = getSupabase();
      if (sb) {
        try {
          await Promise.all([
            sb.from("eduproof_assignments").delete().eq("id", assignmentId),
            sb.from("eduproof_submissions").delete().eq("assignment_id", assignmentId)
          ]);

          // Dọn dẹp tệp ảnh lưu trong bucket Storage 'proofs' để chống tệp mồ côi
          try {
            const { data: files } = await sb.storage.from("proofs").list(`submissions/${assignmentId}`);
            if (files && files.length > 0) {
              const filePaths = [];
              for (const item of files) {
                const { data: subFiles } = await sb.storage.from("proofs").list(`submissions/${assignmentId}/${item.name}`);
                if (subFiles && subFiles.length > 0) {
                  subFiles.forEach((f) => filePaths.push(`submissions/${assignmentId}/${item.name}/${f.name}`));
                } else {
                  filePaths.push(`submissions/${assignmentId}/${item.name}`);
                }
              }
              if (filePaths.length > 0) {
                await sb.storage.from("proofs").remove(filePaths);
              }
            }
          } catch (storageErr) {
            console.warn("Dọn dẹp Storage thông báo:", storageErr);
          }

          console.log("✅ Đã xóa bài tập trên Supabase Cloud:", assignmentId);
        } catch (err) {
          console.warn("Lỗi xóa bài tập trên Cloud:", err);
        }
      }

      if (currentUser && currentUser.role === "admin") {
        renderAdminView();
      } else {
        renderTeacherView();
      }
      alert("Đã xóa bài tập thành công.");
    },
    "Xác nhận xóa bài tập",
    "Xóa bài tập",
    true
  );
}

// Student Accounts Management & Instant Search
function handleTeacherStudentSearch(query) {
  const q = (query || "").trim().toLowerCase();
  const myStudents = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  if (!q) {
    renderTeacherStudents(myStudents);
    return;
  }
  const filtered = myStudents.filter((s) =>
    (s.name && s.name.toLowerCase().includes(q)) ||
    (s.username && s.username.toLowerCase().includes(q)) ||
    (s.class && s.class.toLowerCase().includes(q))
  );
  renderTeacherStudents(filtered);
}

function renderTeacherStudents(myStudentsList) {
  const table = document.getElementById("studentAccountsTable");
  const cardsContainer = document.getElementById("studentAccountsCards");
  const studentUsers = myStudentsList || users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);

  if (table) {
    table.innerHTML = `
      <thead>
        <tr>
          <th>Họ và tên</th>
          <th>Email nhận thông báo</th>
          <th>Tên đăng nhập</th>
          <th>Mật khẩu</th>
          <th>Lớp</th>
          <th>Bài đã nộp</th>
          <th>Thao tác</th>
        </tr>
      </thead>
      <tbody>
        ${studentUsers.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Bạn chưa tạo tài khoản học sinh nào. Hãy bấm "Cấp tài khoản mới" ở trên để tạo.</td></tr>` : ""}
        ${studentUsers
          .map((st) => {
            const count = submissions.filter((s) => s.studentId === st.id).length;
            return `
              <tr>
                <td><strong>${sanitizeText(st.name)}</strong></td>
                <td>
                  ${st.email ? `
                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                      <span style="color: #4338CA; font-weight: 600; font-size: 0.82rem;">${sanitizeText(st.email)}</span>
                      <button class="tool-icon-btn" style="font-size: 0.72rem; padding: 2px 4px;" title="Sửa email" onclick="openEditStudentEmailModal('${sanitizeText(st.id)}')">✏️</button>
                    </div>
                  ` : `
                    <button class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; color: #64748B;" onclick="openEditStudentEmailModal('${sanitizeText(st.id)}')">
                      ✉️ + Thêm Email
                    </button>
                  `}
                </td>
                <td><code>${sanitizeText(st.username)}</code></td>
                <td><code>${sanitizeText(st.password)}</code></td>
                <td>${sanitizeText(st.class || "12A1")}</td>
                <td><strong>${count} bài</strong></td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="copyAccountInfo('${sanitizeText(st.username)}')">
                    📋 Sao chép gửi HS
                  </button>
                  <button class="btn btn-danger btn-sm" onclick="deleteStudentAccount('${sanitizeText(st.id)}')">
                    🗑️ Xóa
                  </button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    `;
  }

  if (cardsContainer) {
    cardsContainer.innerHTML = studentUsers.length === 0
      ? `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">Bạn chưa tạo tài khoản học sinh nào. Hãy bấm "Cấp tài khoản mới" ở trên để tạo.</div>`
      : studentUsers.map((st) => {
          const count = submissions.filter((s) => s.studentId === st.id).length;
          return `
            <div class="campaign-student-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
                <div>
                  <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${sanitizeText(st.name)}</div>
                  <div style="font-size: 0.74rem; color: var(--text-muted);">Lớp: ${sanitizeText(st.class || "12A1")} • Đã nộp ${count} bài</div>
                </div>
                <button class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;" onclick="openEditStudentEmailModal('${sanitizeText(st.id)}')">
                  ${st.email ? "✏️ Sửa Email" : "✉️ Thêm Email"}
                </button>
              </div>
              <div style="background: #F8FAFC; padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.78rem; margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; border: 1px solid #F1F5F9;">
                <div style="display: flex; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
                  <span>TK: <code>${sanitizeText(st.username)}</code></span>
                  <span>MK: <code>${sanitizeText(st.password)}</code></span>
                </div>
                <div style="font-size: 0.75rem; color: #4338CA;">
                  📧 Email: ${st.email ? `<strong>${sanitizeText(st.email)}</strong>` : `<em style="color: var(--text-muted);">Chưa cài đặt</em>`}
                </div>
              </div>
              <div style="display: flex; gap: 0.4rem;">
                <button class="btn btn-secondary btn-sm" style="flex: 1; justify-content: center; padding: 0.45rem;" onclick="copyAccountInfo('${sanitizeText(st.username)}')">
                  📋 Sao chép gửi HS
                </button>
                <button class="btn btn-danger btn-sm" style="padding: 0.45rem 0.75rem;" onclick="deleteStudentAccount('${sanitizeText(st.id)}')">
                  🗑️ Xóa
                </button>
              </div>
            </div>
          `;
        }).join("");
  }
}

function handleGradebookAssignmentChange(assignmentId) {
  gradebookSelectedAssignmentId = assignmentId;
  localStorage.setItem("eduproof_gradebook_asg", assignmentId);
  renderTeacherGradebook();
}

function filterGradebookStudents(mode) {
  gradebookStudentFilter = mode;
  renderTeacherGradebook();
}

function exportAllGradebookReport() {
  const myAssignments = assignments.filter((a) => a.teacherId === currentUser.id);
  const myStudents = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);

  const rows = myStudents.map((st, idx) => {
    const stSubs = submissions.filter((s) => s.studentId === st.id);
    const gradedSubs = stSubs.filter((s) => s.status === "graded" && s.grade !== null);
    const avgScore = gradedSubs.length > 0
      ? (gradedSubs.reduce((acc, curr) => acc + curr.grade, 0) / gradedSubs.length).toFixed(1)
      : "—";

    return {
      "STT": idx + 1,
      "Họ và tên": st.name,
      "Tên đăng nhập": st.username,
      "Lớp": st.class || "12A1",
      "Số bài đã nộp": `${stSubs.length} / ${myAssignments.length}`,
      "Điểm trung bình": avgScore,
      "Tỷ lệ hoàn thành": myAssignments.length > 0 ? `${Math.round((stSubs.length / myAssignments.length) * 100)}%` : "0%"
    };
  });

  if (typeof XLSX !== "undefined") {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "So_Diem_Tong_Hop");
    XLSX.writeFile(wb, `So_Diem_Tong_Hop_${new Date().toLocaleDateString("vi-VN").replace(/\//g, "-")}.xlsx`);
  } else {
    alert("Thư viện Excel chưa sẵn sàng. Vui lòng thử lại sau 1 giây.");
  }
}

function renderTeacherGradebook(myStudentsList, myAssignmentsList) {
  const selectBox = document.getElementById("gradebookAssignmentSelect");
  const topActions = document.getElementById("gradebookTopActions");
  const detailContainer = document.getElementById("gradebookDetailContainer");

  const studentUsers = myStudentsList || users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  const myAssignments = (myAssignmentsList || assignments.filter((a) => a.teacherId === currentUser.id)).slice().sort((a, b) => getAssignmentTime(b) - getAssignmentTime(a));

  if (myAssignments.length === 0) {
    if (selectBox) selectBox.innerHTML = `<option value="none">Chưa có bài tập nào được tạo</option>`;
    if (topActions) topActions.innerHTML = "";
    if (detailContainer) {
      detailContainer.innerHTML = `
        <div style="background: white; border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 2.5rem 1.5rem; text-align: center; color: var(--text-muted);">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">📖</div>
          <p style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.35rem;">Thầy/Cô chưa tạo bài tập nào.</p>
          <p style="font-size: 0.85rem;">Hãy bấm nút "Tạo bài tập mới" ở góc trên để giao bài và mở sổ theo dõi điểm cho học sinh.</p>
        </div>
      `;
    }
    return;
  }

  // Xác định đề bài được chọn (Luôn chọn đề bài cụ thể độc lập, không gộp chung)
  if (!gradebookSelectedAssignmentId || gradebookSelectedAssignmentId === "all" || !myAssignments.some((a) => a.id === gradebookSelectedAssignmentId)) {
    gradebookSelectedAssignmentId = myAssignments[0].id;
    localStorage.setItem("eduproof_gradebook_asg", gradebookSelectedAssignmentId);
  }

  // 1. Cập nhật danh sách đề bài vào ô chọn
  if (selectBox) {
    const optionsHtml = myAssignments.map((a) => {
      const isSelected = gradebookSelectedAssignmentId === a.id ? "selected" : "";
      const deadlineStr = new Date(a.deadline).toLocaleDateString("vi-VN");
      return `<option value="${a.id}" ${isSelected}>📖 [${sanitizeText(a.subject)}] ${sanitizeText(a.title)} (Hạn: ${deadlineStr})</option>`;
    });

    selectBox.innerHTML = optionsHtml.join("");
  }

  // 2. TRƯỜNG HỢP A: Xem danh sách học sinh & điểm theo TỪNG ĐỀ BÀI RIÊNG BIỆT
  if (gradebookSelectedAssignmentId !== "all") {
    const asg = myAssignments.find((a) => a.id === gradebookSelectedAssignmentId) || myAssignments[0];
    const asgSubmissions = submissions.filter((s) => s.assignmentId === asg.id);
    const submittedStudentIds = new Set(asgSubmissions.map((s) => s.studentId));

    const submittedCount = asgSubmissions.length;
    const notSubmittedCount = Math.max(0, studentUsers.length - submittedCount);
    const gradedSubs = asgSubmissions.filter((s) => s.status === "graded" && s.grade !== null);
    const gradedCount = gradedSubs.length;
    const avgScore = gradedCount > 0 ? (gradedSubs.reduce((acc, c) => acc + c.grade, 0) / gradedCount).toFixed(1) : "—";

    // Cập nhật nút thao tác trên đầu
    if (topActions) {
      topActions.innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="exportCampaignReport('${asg.id}')" title="Xuất file Excel điểm bài tập này">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
          Xuất Excel bài này
        </button>
        <button class="btn btn-secondary btn-sm" onclick="copyUnsubmittedStudents('${asg.id}')" title="Sao chép danh sách học sinh chưa nộp bài này để nhắc Zalo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Nhắc Zalo (${notSubmittedCount})
        </button>
      `;
    }

    // Lọc danh sách học sinh theo tab bộ lọc
    let displayedStudents = studentUsers;
    if (gradebookStudentFilter === "submitted") {
      displayedStudents = studentUsers.filter((st) => submittedStudentIds.has(st.id));
    } else if (gradebookStudentFilter === "graded") {
      displayedStudents = studentUsers.filter((st) => {
        const sub = asgSubmissions.find((s) => s.studentId === st.id);
        return sub && sub.status === "graded";
      });
    } else if (gradebookStudentFilter === "not_submitted") {
      displayedStudents = studentUsers.filter((st) => !submittedStudentIds.has(st.id));
    }

    // Tạo HTML bảng Desktop (PC)
    const tableRowsHtml = displayedStudents.map((st, idx) => {
      const sub = asgSubmissions.find((s) => s.studentId === st.id);
      if (sub) {
        sub.photos = normalizePhotos(sub.photos);
        let badge = "";
        if (sub.status === "graded") badge = `<span class="badge-status status-graded">✅ Đã làm</span>`;
        else if (sub.status === "resubmit_requested") badge = `<span class="badge-status status-resubmit">⚠️ Cần nộp lại</span>`;
        else badge = `<span class="badge-status status-submitted">⏳ Đã nộp</span>`;

        const timeStr = new Date(sub.submittedAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit"
        });

        const scoreDisplay = sub.status === "graded"
          ? `<strong style="color: #059669; font-size: 0.85rem;">✅ Đã hoàn thành</strong>`
          : ((sub.status === "resubmit_requested" || sub.resubmitRequested)
            ? `<strong style="color: #DC2626; font-size: 0.85rem;">⚠️ Cần nộp lại ảnh</strong>`
            : `<span style="color: var(--text-muted); font-size: 0.8rem;">⏳ Chờ xem</span>`);

        return `
          <tr>
            <td style="color: var(--text-muted); font-size: 0.78rem;">${idx + 1}</td>
            <td><strong>${sanitizeText(st.name)}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">(${sanitizeText(st.username)})</span></td>
            <td><span class="badge-subject" style="font-size: 0.72rem;">${sanitizeText(st.class || "12A1")}</span></td>
            <td>${badge}</td>
            <td style="font-size: 0.8rem; color: var(--text-muted);">${timeStr}</td>
            <td><span style="font-size: 0.8rem;">📷 ${sub.photos.length} trang</span></td>
            <td>${scoreDisplay}</td>
            <td style="font-size: 0.78rem; color: #475569; max-width: 180px;">${sub.feedback ? `"${sanitizeText(sub.feedback)}"` : "—"}</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="openGradingStudio('${sanitizeText(sub.id)}', false)">
                ✏️ ${sub.status === "graded" ? "Xem lại bài" : ((sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Xem bài đã từ chối" : "Kiểm tra bài")}
              </button>
            </td>
          </tr>
        `;
      } else {
        return `
          <tr>
            <td style="color: var(--text-muted); font-size: 0.78rem;">${idx + 1}</td>
            <td><strong>${sanitizeText(st.name)}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">(${sanitizeText(st.username)})</span></td>
            <td><span class="badge-subject" style="font-size: 0.72rem;">${sanitizeText(st.class || "12A1")}</span></td>
            <td><span class="badge-status status-resubmit">❌ Chưa nộp bài</span></td>
            <td style="color: var(--text-muted); font-size: 0.8rem;">—</td>
            <td style="color: var(--text-muted); font-size: 0.8rem;">0 trang</td>
            <td style="color: var(--text-muted); font-size: 0.8rem;">—</td>
            <td style="color: var(--text-muted); font-size: 0.8rem;">—</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="remindStudent('${st.id}', '${asg.id}')">
                📢 Nhắc nộp bài
              </button>
            </td>
          </tr>
        `;
      }
    }).join("");

    // Tạo HTML thẻ di động (Mobile Cards)
    const mobileCardsHtml = displayedStudents.map((st) => {
      const sub = asgSubmissions.find((s) => s.studentId === st.id);
      if (sub) {
        sub.photos = normalizePhotos(sub.photos);
        let badge = "";
        if (sub.status === "graded") badge = `<span class="badge-status status-graded">✅ Đã làm</span>`;
        else if (sub.status === "resubmit_requested") badge = `<span class="badge-status status-resubmit">⚠️ Cần nộp lại</span>`;
        else badge = `<span class="badge-status status-submitted">⏳ Đã nộp</span>`;

        const timeStr = new Date(sub.submittedAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit"
        });

        return `
          <div class="campaign-student-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.45rem;">
              <div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${sanitizeText(st.name)}</div>
                <div style="font-size: 0.74rem; color: var(--text-muted);">${sanitizeText(st.username)} • Lớp ${sanitizeText(st.class || "12A1")}</div>
              </div>
              <div>${badge}</div>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 0.55rem; font-size: 0.76rem; color: #475569; background: #F8FAFC; padding: 0.4rem 0.6rem; border-radius: 8px; margin-bottom: 0.5rem; align-items: center; border: 1px solid #F1F5F9;">
              <span>🕒 ${timeStr}</span>
              <span>📷 ${sub.photos.length} trang ảnh</span>
              <span>Trạng thái: <strong style="color: ${sub.status === 'graded' ? '#059669' : ((sub.status === 'resubmit_requested' || sub.resubmitRequested) ? '#DC2626' : '#4338CA')};">${sub.status === "graded" ? "Đã làm" : ((sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Cần nộp lại" : "Chờ xem")}</strong></span>
            </div>

            ${sub.feedback ? `<div style="font-size: 0.74rem; color: ${sub.status === 'resubmit_requested' ? '#DC2626' : '#4F46E5'}; margin-bottom: 0.45rem; font-style: italic;">${sub.status === 'resubmit_requested' ? '🚫 Lý do từ chối: ' : '✍️ Lời phê: '}"${sanitizeText(sub.feedback)}"</div>` : ""}

            <button class="btn btn-primary btn-sm" style="width: 100%; justify-content: center; padding: 0.45rem;" onclick="openGradingStudio('${sanitizeText(sub.id)}', false)">
              ✏️ ${sub.status === "graded" ? "Xem lại bài" : ((sub.status === "resubmit_requested" || sub.resubmitRequested) ? "Xem bài đã từ chối" : "Kiểm tra bài")}
            </button>
          </div>
        `;
      } else {
        return `
          <div class="campaign-student-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.45rem;">
              <div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${sanitizeText(st.name)}</div>
                <div style="font-size: 0.74rem; color: var(--text-muted);">${sanitizeText(st.username)} • Lớp ${sanitizeText(st.class || "12A1")}</div>
              </div>
              <div><span class="badge-status status-resubmit">❌ Chưa nộp bài</span></div>
            </div>

            <div style="display: flex; gap: 0.6rem; font-size: 0.76rem; color: #64748B; background: #FFF1F2; padding: 0.4rem 0.6rem; border-radius: 8px; margin-bottom: 0.5rem; align-items: center; border: 1px solid #FFE4E6;">
              <span style="color: #E11D48; font-weight: 600;">⚠️ Chưa nộp bài tập</span>
              <span>• 0 trang ảnh</span>
            </div>

            <button class="btn btn-secondary btn-sm" style="width: 100%; justify-content: center; padding: 0.45rem;" onclick="remindStudent('${st.id}', '${asg.id}')">
              📢 Nhắc nộp bài
            </button>
          </div>
        `;
      }
    }).join("");

    if (detailContainer) {
      detailContainer.innerHTML = `
        <div class="campaign-banner">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
            <div>
              <div style="margin-bottom: 0.4rem;">${formatSubjectBadge(asg.subject)}</div>
              <h2 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">
                ${sanitizeText(asg.title)}
              </h2>
              <p style="font-size: 0.82rem; color: var(--text-muted);">
                Hạn nộp: <strong>${new Date(asg.deadline).toLocaleString("vi-VN")}</strong>
              </p>
            </div>
          </div>

          <div class="campaign-stats-grid">
            <div class="stat-box">
              <div class="stat-num">${studentUsers.length}</div>
              <div class="stat-label">Học sinh lớp</div>
            </div>
            <div class="stat-box">
              <div class="stat-num" style="color: var(--primary);">${submittedCount}</div>
              <div class="stat-label">Đã gửi bài nộp</div>
            </div>
            <div class="stat-box">
              <div class="stat-num" style="color: var(--danger);">${notSubmittedCount}</div>
              <div class="stat-label">Chưa nộp bài</div>
            </div>
            <div class="stat-box">
              <div class="stat-num" style="color: var(--success);">${gradedCount}</div>
              <div class="stat-label">Đã kiểm tra (Đã làm)</div>
            </div>
          </div>
        </div>

        <div style="background: white; border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.85rem;">
            <h3 style="font-size: 1.05rem; font-weight: 700;">
              Danh sách học sinh (${displayedStudents.length} / ${studentUsers.length} học sinh)
            </h3>
            <div class="filter-tabs" style="margin-bottom: 0; padding-bottom: 0;">
              <button class="tab-btn ${gradebookStudentFilter === 'all' ? 'active' : ''}" onclick="filterGradebookStudents('all')">
                Tất cả (${studentUsers.length})
              </button>
              <button class="tab-btn ${gradebookStudentFilter === 'submitted' ? 'active' : ''}" onclick="filterGradebookStudents('submitted')">
                Đã nộp (${submittedCount})
              </button>
              <button class="tab-btn ${gradebookStudentFilter === 'graded' ? 'active' : ''}" onclick="filterGradebookStudents('graded')">
                Đã làm (${gradedCount})
              </button>
              <button class="tab-btn ${gradebookStudentFilter === 'not_submitted' ? 'active' : ''}" onclick="filterGradebookStudents('not_submitted')">
                Chưa nộp (${notSubmittedCount})
              </button>
            </div>
          </div>

          <div class="campaign-desktop-view">
            <table class="data-table" id="gradebookTable">
              <thead>
                <tr>
                  <th style="width: 40px;">STT</th>
                  <th>Học sinh</th>
                  <th>Lớp</th>
                  <th>Trạng thái nộp</th>
                  <th>Thời gian nộp</th>
                  <th>Số trang ảnh</th>
                  <th>Trạng thái bài làm</th>
                  <th>Lời phê</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${displayedStudents.length === 0 ? `<tr><td colspan="9" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Không có học sinh nào trong mục này.</td></tr>` : tableRowsHtml}
              </tbody>
            </table>
          </div>

          <div class="campaign-mobile-view" id="gradebookCards">
            ${displayedStudents.length === 0 ? `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">Không có học sinh nào trong mục này.</div>` : mobileCardsHtml}
          </div>
        </div>
      `;
    }
    return;
  }

  // 3. TRƯỜNG HỢP B: Bảng tổng hợp chuyên cần & Điểm trung bình toàn khóa (selected === 'all')
  if (topActions) {
    topActions.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="exportAllGradebookReport()" title="Xuất sổ điểm tổng hợp Excel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>
        Xuất sổ điểm tổng hợp Excel
      </button>
    `;
  }

  const allMyAsgIds = new Set(myAssignments.map((a) => a.id));
  const allMySubs = submissions.filter((s) => allMyAsgIds.has(s.assignmentId));
  const allGradedSubs = allMySubs.filter((s) => s.status === "graded" && s.grade !== null);
  const overallAvg = allGradedSubs.length > 0 ? (allGradedSubs.reduce((acc, c) => acc + c.grade, 0) / allGradedSubs.length).toFixed(1) : "—";

  const totalPossible = studentUsers.length * myAssignments.length;
  const overallRate = totalPossible > 0 ? Math.round((allMySubs.length / totalPossible) * 100) : 0;

  const summaryTableRows = studentUsers.map((st, idx) => {
    const stSubs = allMySubs.filter((s) => s.studentId === st.id);
    const gradedSubs = stSubs.filter((s) => s.status === "graded" && s.grade !== null);
    const avgScore = gradedSubs.length > 0
      ? (gradedSubs.reduce((acc, curr) => acc + curr.grade, 0) / gradedSubs.length).toFixed(1)
      : "—";

    let attendanceBadge = "";
    if (stSubs.length === myAssignments.length && myAssignments.length > 0) {
      attendanceBadge = `<span class="badge-status status-graded">100% Đầy đủ</span>`;
    } else if (stSubs.length > 0) {
      attendanceBadge = `<span class="badge-status status-submitted">${stSubs.length}/${myAssignments.length} bài</span>`;
    } else {
      attendanceBadge = `<span class="badge-status status-resubmit">Chưa nộp bài nào</span>`;
    }

    return `
      <tr>
        <td style="color: var(--text-muted); font-size: 0.78rem;">${idx + 1}</td>
        <td><strong>${sanitizeText(st.name)}</strong></td>
        <td><code>${sanitizeText(st.username)}</code></td>
        <td>${sanitizeText(st.class || "12A1")}</td>
        <td><strong>${stSubs.length} / ${myAssignments.length} bài</strong></td>
        <td style="font-weight: 700; color: #059669; font-size: 0.95rem;">${myAssignments.length > 0 ? Math.round((stSubs.length / myAssignments.length) * 100) + "%" : "0%"}</td>
        <td>${attendanceBadge}</td>
      </tr>
    `;
  }).join("");

  const summaryMobileCards = studentUsers.map((st) => {
    const stSubs = allMySubs.filter((s) => s.studentId === st.id);
    const gradedSubs = stSubs.filter((s) => s.status === "graded" && s.grade !== null);
    const avgScore = gradedSubs.length > 0
      ? (gradedSubs.reduce((acc, curr) => acc + curr.grade, 0) / gradedSubs.length).toFixed(1)
      : "—";

    let attendanceBadge = "";
    if (stSubs.length === myAssignments.length && myAssignments.length > 0) {
      attendanceBadge = `<span class="badge-status status-graded">100% Đầy đủ</span>`;
    } else if (stSubs.length > 0) {
      attendanceBadge = `<span class="badge-status status-submitted">${stSubs.length}/${myAssignments.length} bài</span>`;
    } else {
      attendanceBadge = `<span class="badge-status status-resubmit">Chưa nộp</span>`;
    }

    const scoreColor = avgScore !== "—" ? (parseFloat(avgScore) >= 8 ? "#16A34A" : parseFloat(avgScore) >= 5 ? "#2563EB" : "#DC2626") : "var(--text-muted)";

    return `
      <div class="campaign-student-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem;">
          <div>
            <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${sanitizeText(st.name)}</div>
            <div style="font-size: 0.74rem; color: var(--text-muted);">
              <code>${sanitizeText(st.username)}</code> • Lớp ${sanitizeText(st.class || "12A1")}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.68rem; color: var(--text-muted); font-weight: 700;">ĐÃ NỘP</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #4338CA;">${stSubs.length} / ${myAssignments.length}</div>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.4rem; border-top: 1px solid #F1F5F9; font-size: 0.78rem;">
          <span style="color: var(--text-muted);">Tỷ lệ: <strong>${myAssignments.length > 0 ? Math.round((stSubs.length / myAssignments.length) * 100) : 0}%</strong></span>
          <div>${attendanceBadge}</div>
        </div>
      </div>
    `;
  }).join("");

  if (detailContainer) {
    detailContainer.innerHTML = `
      <div class="campaign-banner">
        <h2 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">
          📊 Bảng tổng hợp chuyên cần & Tiến độ nộp bài toàn khóa
        </h2>
        <p style="font-size: 0.82rem; color: var(--text-muted);">
          Thống kê dữ liệu xuyên suốt tất cả ${myAssignments.length} đề bài đã giao
        </p>

        <div class="campaign-stats-grid">
          <div class="stat-box">
            <div class="stat-num">${myAssignments.length}</div>
            <div class="stat-label">Tổng số đề bài đã giao</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${studentUsers.length}</div>
            <div class="stat-label">Học sinh của bạn</div>
          </div>
          <div class="stat-box">
            <div class="stat-num" style="color: var(--primary);">${overallRate}%</div>
            <div class="stat-label">Tỷ lệ nộp bài chung (${allMySubs.length} lượt)</div>
          </div>
          <div class="stat-box">
            <div class="stat-num" style="color: var(--success);">${allGradedSubs.length}</div>
            <div class="stat-label">Đã kiểm tra xác nhận (${allGradedSubs.length} bài)</div>
          </div>
        </div>
      </div>

      <div style="background: white; border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 1.25rem;">
        <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.85rem;">
          Danh sách chuyên cần toàn lớp (${studentUsers.length} học sinh)
        </h3>

        <div class="campaign-desktop-view">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px;">STT</th>
                <th>Họ và tên</th>
                <th>Tên đăng nhập</th>
                <th>Lớp</th>
                <th>Số bài đã nộp</th>
                <th>Tỷ lệ hoàn thành</th>
                <th>Đánh giá chuyên cần</th>
              </tr>
            </thead>
            <tbody>
              ${studentUsers.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Chưa có học sinh nào.</td></tr>` : summaryTableRows}
            </tbody>
          </table>
        </div>

        <div class="campaign-mobile-view">
          ${studentUsers.length === 0 ? `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">Chưa có học sinh nào.</div>` : summaryMobileCards}
        </div>
      </div>
    `;
  }
}

// ==========================================
// 6. ANNOTATION STUDIO & GRADING LOGIC
// ==========================================

function openGradingStudio(submissionId, isReadOnly = false) {
  activeGradingSubmissionId = submissionId;
  activeGradingPageIndex = 0;
  canvasUndoStack = [];

  const sub = submissions.find((s) => s.id === submissionId);
  if (!sub) {
    alert("Không tìm thấy bài nộp.");
    return;
  }

  sub.photos = normalizePhotos(sub.photos);
  if (!sub.photos || sub.photos.length === 0) {
    alert("Bài nộp này chưa có ảnh nào để hiển thị.");
    return;
  }

  const headerPrefix = (sub.status === "resubmit_requested" || sub.resubmitRequested)
    ? "Xem bài đã từ chối ảnh:"
    : (isReadOnly ? "Xem bài làm:" : "Kiểm tra bài làm:");
  document.getElementById("gradingStudentName").innerText = `${headerPrefix} ${sub.studentName}`;
  document.getElementById("gradingSubmissionTime").innerText = `Nộp lúc: ${new Date(sub.submittedAt).toLocaleTimeString("vi-VN")}`;

  const resubmitCb = document.getElementById("requestResubmitCheckbox");
  if (resubmitCb) {
    resubmitCb.checked = sub.status === "resubmit_requested" || Boolean(sub.resubmitRequested);
    resubmitCb.disabled = isReadOnly;
    toggleResubmitCheckbox(resubmitCb.checked);
  }

  const resubmitNote = document.getElementById("resubmitNoteInput");
  if (resubmitNote) {
    resubmitNote.value = ((sub.status === "resubmit_requested" || sub.resubmitRequested) && sub.feedback) ? sub.feedback : "";
    resubmitNote.disabled = isReadOnly;
  }

  const saveBtn = document.getElementById("saveGradeBtn");
  if (saveBtn) {
    saveBtn.style.display = isReadOnly ? "none" : "flex";
  }

  const rejectBtn = document.getElementById("gradingRejectPhotoBtn");
  if (rejectBtn) {
    rejectBtn.style.display = (isReadOnly || sub.status === "resubmit_requested" || sub.resubmitRequested) ? "none" : "flex";
  }

  const proofsView = document.getElementById("studentAdditionalProofsView");
  const safeUrl = sanitizeUrl(sub.linkProof);

  const directPhotoButtons = sub.photos
    .map((p, idx) => {
      const u = p.dataUrl || p.url;
      if (!u) return "";
      return `<a href="${u}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="margin-top: 0.3rem; font-size: 0.72rem; width: 100%; justify-content: flex-start; text-decoration: none;">🖼️ Mở ảnh trang ${idx + 1} (tab mới)</a>`;
    })
    .join("");

  proofsView.innerHTML = `
    <strong>Ảnh minh chứng đã gửi (${sub.photos.length} trang):</strong>
    <div style="margin: 0.35rem 0 0.65rem 0;">${directPhotoButtons}</div>
    <strong>Minh chứng khác:</strong><br>
    ${sub.linkProof && safeUrl !== "#" ? `🔗 <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); word-break: break-all;">${sanitizeText(sub.linkProof)}</a><br>` : "<em>Không có link đính kèm</em><br>"}
    ${sub.studentNote ? `✍️ <em>Ghi chú: "${sanitizeText(sub.studentNote)}"</em>` : ""}
  `;

  document.getElementById("gradingModal").style.display = "flex";
  loadGradingPage(activeGradingPageIndex);
}

function toggleResubmitCheckbox(checked) {
  const noteGroup = document.getElementById("resubmitNoteGroup");
  const saveBtn = document.getElementById("saveGradeBtn");
  if (noteGroup) {
    noteGroup.style.display = checked ? "block" : "none";
  }
  if (saveBtn) {
    if (checked) {
      saveBtn.className = "btn btn-danger";
      saveBtn.innerHTML = "⚠️ Yêu cầu học sinh nộp lại bài";
    } else {
      saveBtn.className = "btn btn-primary";
      saveBtn.innerHTML = "✅ Xác nhận học sinh đã làm bài";
    }
  }
}

function closeGradingStudio() {
  document.getElementById("gradingModal").style.display = "none";
}

function handleGradingImageError(imgEl) {
  if (!imgEl) return;
  const backup = imgEl.getAttribute("data-backup");
  if (backup && backup !== "" && imgEl.src !== backup) {
    console.warn("Chuyển sang ảnh dự phòng Base64 trong Grading Studio...");
    imgEl.setAttribute("data-backup", "");
    imgEl.src = backup;
    return;
  }
  imgEl.onerror = null;
  imgEl.src = FALLBACK_PHOTO_SVG;
}

function loadGradingPage(pageIndex) {
  const sub = submissions.find((s) => s.id === activeGradingSubmissionId);
  if (!sub) return;

  sub.photos = normalizePhotos(sub.photos);
  if (!sub.photos || sub.photos.length === 0) return;

  if (pageIndex < 0) pageIndex = 0;
  if (pageIndex >= sub.photos.length) pageIndex = sub.photos.length - 1;
  activeGradingPageIndex = pageIndex;
  canvasUndoStack = [];

  const navIndicator = document.getElementById("pageNavIndicator");
  if (navIndicator) {
    navIndicator.innerText = `Trang ${pageIndex + 1} / ${sub.photos.length}`;
  }

  const gradingImg = document.getElementById("gradingImage");
  const canvas = document.getElementById("annotationCanvas");
  const loadingNotice = document.getElementById("canvasLoadingNotice");
  if (!canvas) return;

  const photo = sub.photos[pageIndex];
  const photoUrl = photo ? (photo.dataUrl || photo.url || "") : "";
  const photoBackup = photo ? (photo.backupDataUrl || "") : "";

  initCanvasEvents();

  if (gradingImg) {
    if (loadingNotice) loadingNotice.style.display = "block";
    gradingImg.setAttribute("data-backup", photoBackup);

    const applyCanvasSizeAndDrawings = () => {
      if (loadingNotice) loadingNotice.style.display = "none";
      const natW = gradingImg.naturalWidth || gradingImg.clientWidth || 800;
      const natH = gradingImg.naturalHeight || gradingImg.clientHeight || 1000;
      canvas.width = natW;
      canvas.height = natH;

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (sub.annotations && sub.annotations[pageIndex]) {
        const savedDrawings = new Image();
        savedDrawings.onload = () => {
          ctx.drawImage(savedDrawings, 0, 0, canvas.width, canvas.height);
          saveCanvasState();
        };
        savedDrawings.src = sub.annotations[pageIndex];
      } else {
        saveCanvasState();
      }
    };

    gradingImg.onload = applyCanvasSizeAndDrawings;

    if (gradingImg.src === photoUrl && gradingImg.complete && gradingImg.naturalWidth > 0) {
      applyCanvasSizeAndDrawings();
    } else {
      gradingImg.src = photoUrl;
    }
  }
}

function changeGradingPage(delta) {
  const sub = submissions.find((s) => s.id === activeGradingSubmissionId);
  if (!sub) return;

  saveCurrentPageAnnotation();
  const nextIndex = activeGradingPageIndex + delta;
  if (nextIndex >= 0 && nextIndex < sub.photos.length) {
    loadGradingPage(nextIndex);
  }
}

function saveCurrentPageAnnotation() {
  const sub = submissions.find((s) => s.id === activeGradingSubmissionId);
  if (!sub) return;

  const canvas = document.getElementById("annotationCanvas");
  if (!sub.annotations) sub.annotations = {};
  try {
    sub.annotations[activeGradingPageIndex] = canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("Không thể lưu nét vẽ (canvas export restriction):", err);
  }
}

function selectAnnotationTool(tool) {
  activeTool = tool;
  const tools = ["toolPen", "toolHighlight", "toolCheck", "toolCross", "toolText"];
  tools.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  });

  const activeMap = {
    pen: "toolPen",
    highlight: "toolHighlight",
    check: "toolCheck",
    cross: "toolCross",
    text: "toolText"
  };
  if (activeMap[tool]) document.getElementById(activeMap[tool]).classList.add("active");
}

function initCanvasEvents() {
  const canvas = document.getElementById("annotationCanvas");
  if (!canvas || canvas.dataset.eventsBound === "true") return;
  canvas.dataset.eventsBound = "true";

  const newCanvas = canvas;

  const getCanvasPos = (evt) => {
    const rect = newCanvas.getBoundingClientRect();
    const scaleX = newCanvas.width / rect.width;
    const scaleY = newCanvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY
    };
  };

  const getTouchPos = (evt) => {
    if (!evt.touches || evt.touches.length === 0) return { x: lastX, y: lastY };
    const touch = evt.touches[0];
    const rect = newCanvas.getBoundingClientRect();
    const scaleX = newCanvas.width / rect.width;
    const scaleY = newCanvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  };

  const handleDrawStart = (pos) => {
    isDrawing = true;
    lastX = pos.x;
    lastY = pos.y;

    const ctx = newCanvas.getContext("2d");

    if (activeTool === "check") {
      ctx.fillStyle = "#16A34A";
      ctx.font = "bold 48px -apple-system, sans-serif";
      ctx.fillText("✔️", pos.x - 20, pos.y + 15);
      saveCanvasState();
      isDrawing = false;
    } else if (activeTool === "cross") {
      ctx.fillStyle = "#DC2626";
      ctx.font = "bold 48px -apple-system, sans-serif";
      ctx.fillText("❌", pos.x - 20, pos.y + 15);
      saveCanvasState();
      isDrawing = false;
    } else if (activeTool === "text") {
      const comment = prompt("Nhập lời ghi chú lên ảnh:");
      if (comment) {
        ctx.fillStyle = "#DC2626";
        ctx.font = "bold 26px -apple-system, sans-serif";
        ctx.fillText(comment, pos.x, pos.y);
        saveCanvasState();
      }
      isDrawing = false;
    }
  };

  const handleDrawMove = (pos) => {
    if (!isDrawing) return;
    const ctx = newCanvas.getContext("2d");

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);

    if (activeTool === "pen") {
      ctx.strokeStyle = "#DC2626";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    } else if (activeTool === "highlight") {
      ctx.strokeStyle = "rgba(234, 179, 8, 0.4)";
      ctx.lineWidth = 22;
      ctx.lineCap = "square";
      ctx.stroke();
    }

    lastX = pos.x;
    lastY = pos.y;
  };

  const handleDrawEnd = () => {
    if (isDrawing) {
      isDrawing = false;
      saveCanvasState();
    }
  };

  // 1. Chuột cho PC / Laptop
  newCanvas.addEventListener("mousedown", (e) => handleDrawStart(getCanvasPos(e)));
  newCanvas.addEventListener("mousemove", (e) => handleDrawMove(getCanvasPos(e)));
  newCanvas.addEventListener("mouseup", handleDrawEnd);
  newCanvas.addEventListener("mouseleave", handleDrawEnd);

  // 2. Chạm cảm ứng cho Điện thoại & Máy tính bảng (Touch Events)
  newCanvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handleDrawStart(getTouchPos(e));
  }, { passive: false });

  newCanvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    handleDrawMove(getTouchPos(e));
  }, { passive: false });

  newCanvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    handleDrawEnd();
  }, { passive: false });

  newCanvas.addEventListener("touchcancel", handleDrawEnd);
}

function saveCanvasState() {
  const canvas = document.getElementById("annotationCanvas");
  if (!canvas) return;
  try {
    const data = canvas.toDataURL("image/png");
    canvasUndoStack.push(data);
    if (canvasUndoStack.length > 20) canvasUndoStack.shift();
  } catch (err) {
    console.warn("Canvas state save warning (CORS/export):", err);
  }
}

function undoAnnotation() {
  if (canvasUndoStack.length <= 1) {
    clearAnnotations();
    return;
  }
  canvasUndoStack.pop();
  const prevState = canvasUndoStack[canvasUndoStack.length - 1];

  const canvas = document.getElementById("annotationCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = prevState;
}

function clearAnnotations() {
  const canvas = document.getElementById("annotationCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  canvasUndoStack = [];
  saveCanvasState();
}

function addQuickComment(text) {
  const noteInput = document.getElementById("resubmitNoteInput");
  if (!noteInput) return;
  if (noteInput.value.trim().length > 0) {
    noteInput.value += " " + text;
  } else {
    noteInput.value = text;
  }
}

function saveAndReturnGrade() {
  const sub = submissions.find((s) => s.id === activeGradingSubmissionId);
  if (!sub) return;

  saveCurrentPageAnnotation();

  const resubmitCb = document.getElementById("requestResubmitCheckbox");
  const requestResubmit = resubmitCb ? resubmitCb.checked : false;
  const noteInput = document.getElementById("resubmitNoteInput");
  const noteVal = noteInput ? noteInput.value.trim() : "";

  if (requestResubmit) {
    sub.status = "resubmit_requested";
    sub.resubmitRequested = true;
    sub.grade = null;
    sub.feedback = noteVal || "Ảnh chụp bị mờ hoặc thiếu trang. Em vui lòng chụp lại bài làm nhé!";
  } else {
    sub.status = "graded";
    sub.resubmitRequested = false;
    sub.grade = null;
    sub.feedback = noteVal;
  }

  persistData();

  // Đồng bộ kết quả kiểm tra bài lên Supabase Cloud
  const sb = getSupabase();
  if (sb) {
    try {
      sb.rpc("grade_submission", {
        p_teacher_id: currentUser.id,
        p_password: currentUser.password,
        p_submission_id: sub.id,
        p_grade: sub.grade,
        p_feedback: sub.feedback,
        p_annotations: sub.annotations,
        p_resubmit: sub.resubmitRequested
      }).then(({ error: rpcErr }) => {
        if (rpcErr) {
          sb.from("eduproof_submissions").update({
            status: sub.status,
            resubmit_requested: sub.resubmitRequested,
            grade: sub.grade,
            feedback: sub.feedback,
            annotations: sub.annotations
          }).eq("id", sub.id).then(({ error }) => {
            if (error) console.warn("Lỗi lưu trạng thái lên Supabase:", error);
          });
        }
      });
    } catch (err) {
      console.warn("Lỗi kết nối Supabase khi xác nhận bài:", err);
    }
  }

  closeGradingStudio();
  renderCurrentView();
  alert(requestResubmit ? "Đã gửi thông báo yêu cầu học sinh chụp nộp lại!" : "✅ Đã xác nhận học sinh đã hoàn thành bài làm!");
}

// ==========================================
// 6.5 REJECT PHOTO & AUTO NOTIFY EMAIL
// ==========================================

let activeRejectSubmissionId = null;

function openRejectPhotoModal(submissionId) {
  const sub = submissions.find((s) => s.id === submissionId);
  if (!sub) return;

  activeRejectSubmissionId = submissionId;
  const asg = assignments.find((a) => a.id === sub.assignmentId);
  const student = users.find((u) => u.id === sub.studentId) || { name: sub.studentName, email: "", class: "" };

  const modal = document.getElementById("rejectPhotoModal");
  if (!modal) return;

  const idInput = document.getElementById("rejectSubmissionId");
  if (idInput) idInput.value = submissionId;

  const infoBox = document.getElementById("rejectStudentInfoBox");
  if (infoBox) {
    infoBox.innerHTML = `
      <div><strong>Học sinh:</strong> ${sanitizeText(student.name)} ${student.class ? `(Lớp ${sanitizeText(student.class)})` : ""}</div>
      <div><strong>Đề bài:</strong> ${asg ? sanitizeText(asg.title) : "Bài tập"} ${asg ? `(${sanitizeText(asg.subject)})` : ""}</div>
      <div style="margin-top: 0.25rem;">
        ${student.email && student.email.includes("@") ? `📧 <strong>Email học sinh:</strong> <span style="color: #059669; font-weight: 700;">${sanitizeText(student.email)}</span>` : `⚠️ <span style="color: #DC2626; font-style: italic;">Học sinh chưa có địa chỉ Email nhận thông báo</span>`}
      </div>
    `;
  }

  const reasonInput = document.getElementById("rejectPhotoReasonInput");
  if (reasonInput) {
    const studioNote = document.getElementById("resubmitNoteInput");
    reasonInput.value = (studioNote && studioNote.value.trim()) ? studioNote.value.trim() : "Ảnh chụp bị mờ hoặc thiếu trang. Em vui lòng chụp lại bài làm nhé!";
  }

  const hintBox = document.getElementById("rejectEmailNotifyHint");
  if (hintBox) {
    if (student.email && student.email.includes("@")) {
      hintBox.innerHTML = `✉️ <strong>Hệ thống tự động gửi Email:</strong> Khi xác nhận, hệ thống sẽ tự động kích hoạt gửi thư thông báo tới <strong>${sanitizeText(student.email)}</strong> kèm lý do và link nộp lại. Thầy/Cô không cần gửi thủ công.`;
      hintBox.style.display = "block";
    } else {
      hintBox.innerHTML = `💡 Học sinh này chưa cài đặt Email. Khi từ chối, hệ thống sẽ hiện thông báo <strong>"⚠️ Cần nộp lại"</strong> trực tiếp trên tài khoản học sinh khi em vào web.`;
      hintBox.style.display = "block";
    }
  }

  modal.style.display = "flex";
}

function closeRejectPhotoModal() {
  const modal = document.getElementById("rejectPhotoModal");
  if (modal) modal.style.display = "none";
  activeRejectSubmissionId = null;
}

function setQuickRejectReason(reasonText) {
  const reasonInput = document.getElementById("rejectPhotoReasonInput");
  if (reasonInput) {
    reasonInput.value = reasonText;
    reasonInput.focus();
  }
}

function confirmRejectPhotoAndNotify() {
  const subId = activeRejectSubmissionId || (document.getElementById("rejectSubmissionId") ? document.getElementById("rejectSubmissionId").value : null);
  const sub = submissions.find((s) => s.id === subId);
  if (!sub) return;

  const reasonInput = document.getElementById("rejectPhotoReasonInput");
  const reason = reasonInput ? reasonInput.value.trim() : "Ảnh chụp bị mờ hoặc thiếu trang. Em vui lòng chụp lại bài làm nhé!";

  const asg = assignments.find((a) => a.id === sub.assignmentId) || { title: "Bài tập", subject: "Môn học" };
  const student = users.find((u) => u.id === sub.studentId) || { name: sub.studentName, email: "" };

  sub.status = "resubmit_requested";
  sub.resubmitRequested = true;
  sub.grade = null;
  sub.feedback = reason;

  persistData();

  const sb = getSupabase();
  if (sb) {
    try {
      sb.rpc("grade_submission", {
        p_teacher_id: currentUser.id,
        p_password: currentUser.password,
        p_submission_id: sub.id,
        p_grade: null,
        p_feedback: sub.feedback,
        p_annotations: sub.annotations || {},
        p_resubmit: true
      }).then(({ error: rpcErr }) => {
        if (rpcErr) {
          sb.from("eduproof_submissions").update({
            status: "resubmit_requested",
            resubmit_requested: true,
            grade: null,
            feedback: sub.feedback,
            annotations: sub.annotations || {}
          }).eq("id", sub.id).then(({ error }) => {
            if (error) console.warn("Lỗi lưu trạng thái từ chối ảnh lên Supabase:", error);
          });
        }
      });
    } catch (err) {
      console.warn("Lỗi kết nối Supabase khi từ chối ảnh:", err);
    }
  }

  let emailSent = false;
  let sentGmailUrl = "";
  if (student.email && student.email.includes("@") && student.email.includes(".")) {
    const appUrl = window.location.origin + window.location.pathname;
    const emailSubject = `[EduProof] Yêu cầu nộp lại ảnh bài làm - Môn ${asg.subject}: ${asg.title}`;
    const emailBody = `Chào em ${student.name},\n\nThầy/Cô ${currentUser.name} đã kiểm tra ảnh bài làm của em cho bài tập "${asg.title}" (Môn ${asg.subject}).\n\n🚫 LÝ DO TỪ CHỐI ẢNH: "${reason}"\n\n👉 Em hãy đăng nhập vào hệ thống EduProof để chụp lại ảnh bài làm rõ nét hơn và gửi lại cho thầy/cô nhé:\n${appUrl}\n\nChúc em học tốt!\nThân ái,\n${currentUser.name}`;

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(student.email)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    const mailtoUrl = `mailto:${encodeURIComponent(student.email)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    sentGmailUrl = gmailUrl;

    // Tự động gửi ngầm qua mail ảo/mail hệ thống EduProof để không làm lộ email cá nhân của giáo viên
    try {
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: student.email,
          subject: emailSubject,
          text: emailBody,
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 18px; border: 1px solid #FECACA; border-radius: 12px; background: #FFF;">
            <div style="background: #EF4444; color: white; padding: 12px; border-radius: 8px; text-align: center; font-weight: bold;">
              EduProof • Yêu Cầu Chụp Lại Ảnh Bài Làm
            </div>
            <div style="padding: 16px 4px; color: #1E293B; line-height: 1.6;">
              <p>Chào em <strong>${escapeHtml(student.name)}</strong>,</p>
              <p>Thầy/Cô <strong>${escapeHtml(currentUser.name)}</strong> yêu cầu em chụp nộp lại bài làm môn <strong>${escapeHtml(asg.subject)}</strong>:</p>
              <blockquote style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 10px 14px; margin: 12px 0; color: #991B1B;">
                <strong>Lý do từ chối:</strong> "${escapeHtml(reason)}"
              </blockquote>
              <p><a href="${appUrl}" style="background: #4F46E5; color: #FFF; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">👉 Đăng nhập nộp lại ảnh</a></p>
            </div>
          </div>`,
          teacherName: currentUser.name,
          assignmentTitle: asg.title
        })
      }).catch((err) => console.log("Background email dispatch:", err));
    } catch (e) {}

    emailSent = true;
  }

  closeRejectPhotoModal();
  closeGradingStudio();
  renderCurrentView();

  if (emailSent) {
    showNoticeModal(
      `Đã từ chối ảnh bài làm và hệ thống đã tự động gửi thông báo qua mail ảo hệ thống (EduProof System Mail) tới học sinh <strong>${sanitizeText(student.name)}</strong> (${sanitizeText(student.email)})!<br><br><span style="font-size:0.8rem; color:#4F46E5;">🔒 Email của thầy/cô được bảo mật tuyệt đối, học sinh chỉ thấy người gửi là Hệ thống EduProof (thongbao@eduproof.vn).</span><div style="margin-top:0.4rem;"><a href="${sentGmailUrl}" target="_blank" rel="noopener noreferrer" style="display:none;">Bấm vào đây nếu trình duyệt chặn tự mở Gmail</a></div>`,
      "Từ chối & Gửi Email thành công",
      "📧"
    );
  } else {
    showNoticeModal(
      `Đã từ chối ảnh bài làm của học sinh <strong>${sanitizeText(student.name)}</strong> và chuyển sang trạng thái "Cần nộp lại".\n\n💡 Học sinh chưa cài email nên thông báo hiển thị trực tiếp khi em đăng nhập web.`,
      "Đã từ chối ảnh",
      "⚠️"
    );
  }
}

// ==========================================
// 7. CREATE ASSIGNMENT MODAL (TEACHER)
// ==========================================

function openCreateAssignmentModal() {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const formatted = tomorrow.toISOString().slice(0, 16);
  document.getElementById("newDeadlineInput").value = formatted;
  document.getElementById("createAssignmentModal").style.display = "flex";
}

function closeCreateAssignmentModal() {
  document.getElementById("createAssignmentModal").style.display = "none";
}

function handleSubjectSelectChange(val) {
  const customInput = document.getElementById("newCustomSubjectInput");
  if (customInput) {
    customInput.style.display = val === "custom" ? "block" : "none";
    if (val === "custom") customInput.focus();
  }
}

let currentBatchEmailData = null;

async function autoDispatchAssignmentEmail(assignment, recipientStudents) {
  if (!recipientStudents || recipientStudents.length === 0) return;
  const emailsList = recipientStudents.map((s) => s.email.trim());
  const deadlineStr = new Date(assignment.deadline).toLocaleString("vi-VN");
  const appUrl = window.location.origin + window.location.pathname;

  const emailSubject = `[EduProof] Bài tập mới: ${assignment.title} - Môn ${assignment.subject}`;
  const emailBody = `Chào các em học sinh,\n\nThầy/Cô ${currentUser.name} vừa giao bài tập mới trên hệ thống EduProof:\n\n📌 Tiêu đề bài tập: ${assignment.title}\n📚 Môn học: ${assignment.subject}\n⏰ Hạn nộp: ${deadlineStr}\n📝 Hướng dẫn: ${assignment.description || "Làm bài tập đầy đủ và chụp ảnh vở bài làm nộp lên EduProof."}\n\n👉 Các em hãy đăng nhập vào hệ thống để nộp bài đúng hạn nhé:\n${appUrl}\n\nChúc các em làm bài tốt!\nThân ái,\n${currentUser.name}`;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 18px; border: 1px solid #E2E8F0; border-radius: 12px; background: #FFFFFF;">
      <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 16px; border-radius: 8px; color: #FFF; text-align: center;">
        <h2 style="margin: 0; font-size: 1.25rem;">EduProof • Thông Báo Bài Tập Mới</h2>
      </div>
      <div style="padding: 16px 4px; color: #1E293B; line-height: 1.6;">
        <p>Chào các em học sinh,</p>
        <p>Thầy/Cô <strong>${escapeHtml(currentUser.name)}</strong> vừa giao bài tập mới:</p>
        <div style="background: #F8FAFC; border-left: 4px solid #4F46E5; padding: 10px 14px; margin: 12px 0; border-radius: 0 8px 8px 0;">
          <p style="margin: 3px 0;">📌 <strong>Đề bài:</strong> ${escapeHtml(assignment.title)}</p>
          <p style="margin: 3px 0;">📚 <strong>Môn học:</strong> ${escapeHtml(assignment.subject)}</p>
          <p style="margin: 3px 0;">⏰ <strong>Hạn nộp:</strong> <span style="color: #DC2626; font-weight: 700;">${deadlineStr}</span></p>
          <p style="margin: 3px 0;">📝 <strong>Yêu cầu:</strong> ${escapeHtml(assignment.description || "Làm bài tập và chụp ảnh vở nộp lên web.")}</p>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${appUrl}" style="background: #4F46E5; color: #FFF; padding: 10px 22px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">👉 Đăng nhập nộp bài</a>
        </div>
      </div>
    </div>
  `;

  try {
    fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bcc: emailsList,
        subject: emailSubject,
        text: emailBody,
        html: emailHtml,
        assignmentTitle: assignment.title,
        teacherName: currentUser.name,
        studentCount: emailsList.length
      })
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("✅ [EduProof Auto Email] Đã tự động gửi email thành công:", data);
      })
      .catch((err) => {
        console.log("ℹ️ [EduProof Auto Email] Background dispatch:", err);
      });
  } catch (err) {
    console.warn("Lỗi gửi email tự động:", err);
  }
}

function openBatchEmailModal(assignment, recipientStudents) {
  currentBatchEmailData = { assignment, recipientStudents };
  const modal = document.getElementById("batchEmailModal");
  if (!modal) return;

  const modalTitle = document.getElementById("batchEmailModalTitle");
  const summaryBox = document.getElementById("batchEmailSummaryBox");
  const chipsContainer = document.getElementById("batchEmailRecipientChips");
  const bodyPreview = document.getElementById("batchEmailBodyPreview");
  const gmailBtn = document.getElementById("batchEmailGmailBtn");
  const clientBtn = document.getElementById("batchEmailClientBtn");

  const count = recipientStudents.length;
  const deadlineStr = new Date(assignment.deadline).toLocaleString("vi-VN");
  const appUrl = window.location.origin + window.location.pathname;

  if (modalTitle) {
    modalTitle.innerText = `Thông báo Email: ${assignment.title}`;
  }

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div><strong>Đề bài:</strong> ${sanitizeText(assignment.title)} (${sanitizeText(assignment.subject)})</div>
      <div style="margin-top: 0.2rem; color: #4F46E5;">
        📢 Đã tìm thấy <strong>${count}</strong> học sinh trong lớp có địa chỉ Email nhận thông báo.
      </div>
      <div style="font-size: 0.74rem; color: #64748B; margin-top: 0.25rem;">
        Hệ thống tự động đưa toàn bộ email vào trường <strong>BCC (Blind Carbon Copy)</strong> để bảo mật thông tin cá nhân của các học sinh.
      </div>
    `;
  }

  const emailsList = recipientStudents.map((s) => s.email.trim());
  const bccString = emailsList.join(",");

  if (chipsContainer) {
    chipsContainer.innerHTML = recipientStudents
      .map(
        (s) => `
        <span style="display: inline-flex; align-items: center; background: #EEF2FF; color: #3730A3; padding: 2px 8px; border-radius: 9999px; margin: 2px; font-weight: 500; border: 1px solid #C7D2FE;">
          ${sanitizeText(s.name)} &lt;${sanitizeText(s.email)}&gt;
        </span>
      `
      )
      .join("");
  }

  const emailSubject = `[EduProof] Bài tập mới: ${assignment.title} - Môn ${assignment.subject}`;
  const emailBody = `Chào các em học sinh,\n\nThầy/Cô ${currentUser.name} vừa giao bài tập mới trên hệ thống EduProof:\n\n📌 Tiêu đề bài tập: ${assignment.title}\n📚 Môn học: ${assignment.subject}\n⏰ Hạn nộp: ${deadlineStr}\n📝 Hướng dẫn: ${assignment.description || "Làm bài tập đầy đủ và chụp ảnh vở bài làm nộp lên EduProof."}\n\n👉 Các em hãy đăng nhập vào hệ thống để nộp bài đúng hạn nhé:\n${appUrl}\n\nChúc các em làm bài tốt!\nThân ái,\n${currentUser.name}`;

  if (bodyPreview) {
    bodyPreview.value = emailBody;
  }

  // Cấu hình link mở Gmail Web trực tiếp
  if (gmailBtn) {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${encodeURIComponent(bccString)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    gmailBtn.href = gmailUrl;
  }

  // Cấu hình link mở Mail Client mặc định (Outlook, Apple Mail, Thunderbird,...)
  if (clientBtn) {
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccString)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    clientBtn.href = mailtoUrl;
  }

  modal.style.display = "flex";
}

function closeBatchEmailModal() {
  const modal = document.getElementById("batchEmailModal");
  if (modal) modal.style.display = "none";
}

function copyBatchEmailList() {
  if (!currentBatchEmailData || !currentBatchEmailData.recipientStudents) return;
  const emails = currentBatchEmailData.recipientStudents.map((s) => s.email.trim()).join(", ");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(emails).then(() => {
      showNoticeModal(`Đã sao chép danh sách ${currentBatchEmailData.recipientStudents.length} email học sinh vào bộ nhớ tạm!`, "Đã sao chép Email", "📋");
    });
  }
}

function copyBatchEmailContent() {
  const preview = document.getElementById("batchEmailBodyPreview");
  if (!preview) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(preview.value).then(() => {
      showNoticeModal("Đã sao chép toàn bộ nội dung thư thông báo bài tập vào bộ nhớ tạm!", "Đã sao chép thư", "📋");
    });
  }
}

async function confirmCreateAssignment() {
  const title = document.getElementById("newTitleInput").value.trim();
  let subject = document.getElementById("newSubjectInput").value;
  if (subject === "custom") {
    subject = (document.getElementById("newCustomSubjectInput").value || "").trim() || "Hoạt động Đoàn trường";
  }
  const deadline = document.getElementById("newDeadlineInput").value;
  const description = document.getElementById("newDescInput").value.trim();
  const allowLink = document.getElementById("reqLinkCheck").checked;
  const allowNote = document.getElementById("reqNoteCheck").checked;
  const notifyEmail = document.getElementById("notifyEmailCheck") ? document.getElementById("notifyEmailCheck").checked : false;
  const notifyZalo = document.getElementById("notifyZaloCheck") ? document.getElementById("notifyZaloCheck").checked : false;

  if (!title) {
    showNoticeModal("Vui lòng nhập tiêu đề bài tập hoặc tên hoạt động Đoàn trường.", "Lưu ý", "⚠️");
    return;
  }

  const newAsg = {
    id: "asg_" + Date.now(),
    teacherId: currentUser.id,
    title: title,
    subject: subject,
    deadline: deadline || new Date().toISOString(),
    description: description || "Làm bài đầy đủ vào vở và chụp ảnh nộp đúng hạn.",
    minPhotos: 1,
    allowLink: allowLink,
    allowNote: allowNote,
    createdAt: new Date().toISOString()
  };

  assignments.unshift(newAsg);
  assignments.sort((a, b) => getAssignmentTime(b) - getAssignmentTime(a));
  selectedCampaignId = newAsg.id;
  localStorage.setItem("eduproof_selected_campaign", newAsg.id);
  persistData();

  // Đẩy trực tiếp lên Supabase Cloud để tài khoản Học sinh nhận được ngay lập tức
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb.from("eduproof_assignments").insert([{
        id: newAsg.id,
        teacher_id: newAsg.teacherId,
        title: newAsg.title,
        subject: newAsg.subject,
        deadline: newAsg.deadline,
        description: newAsg.description,
        min_photos: newAsg.minPhotos,
        allow_link: newAsg.allowLink,
        allow_note: newAsg.allowNote,
        created_at: newAsg.createdAt
      }]);
      if (error) {
        console.warn("Lỗi lưu bài tập lên Supabase:", error);
      } else {
        console.log("✅ Đã lưu bài tập mới lên Supabase Cloud thành công:", newAsg.id);
      }
    } catch (err) {
      console.warn("Lỗi kết nối Supabase khi tạo bài tập:", err);
    }
  }

  closeCreateAssignmentModal();
  renderCurrentView();

  const myStudents = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  const emailStudents = myStudents.filter((s) => s.email && s.email.includes("@") && s.email.includes("."));

  if (notifyZalo) {
    const deadlineStr = new Date(newAsg.deadline).toLocaleString("vi-VN");
    const zaloMsg = `📌 BÀI TẬP VỀ NHÀ: ${newAsg.title}\n- Hạn nộp: ${deadlineStr}\n- Yêu cầu: Chụp ảnh vở bài làm gửi lên EduProof.\n👉 Cả lớp đăng nhập vào nộp bài trước hạn nhé!\n${window.location.origin + window.location.pathname}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(zaloMsg).catch(() => {});
    }
  }

  if (notifyEmail && emailStudents.length > 0) {
    autoDispatchAssignmentEmail(newAsg, emailStudents);
  }

  let successNote = `🎉 Đã tạo bài tập "${newAsg.title}" và đồng bộ thành công lên hệ thống!`;
  if (notifyEmail && emailStudents.length > 0) {
    successNote += `\n\n📧 Hệ thống đã tự động gửi email thông báo bài tập mới đến ${emailStudents.length} học sinh trong lớp (Thầy/Cô không cần thao tác thủ công).`;
  } else if (notifyEmail && emailStudents.length === 0) {
    successNote += `\n\n💡 Lưu ý: Lớp chưa có học sinh nào cài địa chỉ Email. Thầy/Cô có thể cập nhật email ở mục "Quản lý học sinh" hoặc nhập file Excel để tự động gửi email.`;
  }
  if (notifyZalo) {
    successNote += `\n\n📋 Nội dung thông báo bài tập đã được tự động sao chép vào bộ nhớ tạm (Thầy/Cô có thể dán ngay vào nhóm Zalo lớp).`;
  }
  showNoticeModal(successNote, "Tạo bài tập thành công", "🎉");
}

// ==========================================
// 8. GALAXY STARS DYNAMIC MOTION & DEVICE SHAKE / TILT PARALLAX
// ==========================================
function initGalaxyMotion() {
  const canvas = document.getElementById("galaxyStarsCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  function resizeCanvas() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas, { passive: true });

  const starCount = Math.min(130, Math.max(60, Math.floor((width * height) / 8500)));
  const stars = [];
  const starColors = ["#FFFFFF", "#E0E7FF", "#C7D2FE", "#DDD6FE", "#FDE047", "#F472B6"];

  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      size: Math.random() * 2.2 + 0.6,
      color: starColors[Math.floor(Math.random() * starColors.length)],
      alpha: Math.random() * 0.7 + 0.3,
      baseAlpha: Math.random() * 0.6 + 0.3,
      twinkleSpeed: Math.random() * 0.04 + 0.015,
      twinklePhase: Math.random() * Math.PI * 2,
      layer: Math.random() * 1.8 + 0.6 // Tầng chiều sâu thị sai (Parallax depth: 0.6 đến 2.4)
    });
  }

  let tiltX = 0, tiltY = 0;
  let targetTiltX = 0, targetTiltY = 0;
  let shakeVelocityX = 0, shakeVelocityY = 0;
  let lastAccX = 0, lastAccY = 0, lastAccZ = 0;
  let lastMotionTime = 0;

  // 1. Cảm biến con quay hồi chuyển khi nghiêng hoặc lắc điện thoại (DeviceOrientation & DeviceMotion)
  function handleOrientation(e) {
    if (e.gamma !== null && e.beta !== null) {
      // gamma: nghiêng trái / phải (-90 đến +90)
      // beta: nghiêng trước / sau
      targetTiltX = Math.max(-45, Math.min(45, e.gamma)) * 1.6;
      targetTiltY = Math.max(-45, Math.min(45, e.beta - 45)) * 1.6;
    }
  }

  function handleMotion(e) {
    const acc = e.accelerationIncludingGravity || e.acceleration;
    if (!acc) return;
    const now = Date.now();
    if (now - lastMotionTime > 70) {
      const dx = (acc.x || 0) - lastAccX;
      const dy = (acc.y || 0) - lastAccY;
      const dz = (acc.z || 0) - lastAccZ;
      const shakeForce = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // Khi lắc điện thoại (lực shake > 11), các vì sao giật và trôi dạt mạnh theo gia tốc lắc
      if (shakeForce > 11) {
        shakeVelocityX = dx * 3.8;
        shakeVelocityY = dy * 3.8;
      }
      lastAccX = acc.x || 0;
      lastAccY = acc.y || 0;
      lastAccZ = acc.z || 0;
      lastMotionTime = now;
    }
  }

  window.addEventListener("deviceorientation", handleOrientation, true);
  window.addEventListener("devicemotion", handleMotion, true);

  // Fallback xin cấp quyền cảm biến con quay trên iOS (Safari 13+)
  function requestGyroPermission() {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then((resp) => {
          if (resp === "granted") {
            window.addEventListener("deviceorientation", handleOrientation, true);
            window.addEventListener("devicemotion", handleMotion, true);
          }
        })
        .catch(() => {});
    }
  }
  window.addEventListener("touchstart", requestGyroPermission, { once: true, passive: true });
  window.addEventListener("click", requestGyroPermission, { once: true, passive: true });

  // 2. Fallback trỏ chuột máy tính (Mouse Parallax)
  window.addEventListener("mousemove", (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    targetTiltX = ((e.clientX - cx) / cx) * 32;
    targetTiltY = ((e.clientY - cy) / cy) * 32;
  }, { passive: true });

  const nebulaEl = document.querySelector(".galaxy-nebula");

  // 3. Vòng lặp chuyển động 60FPS mượt mà của các vì sao
  function renderGalaxy() {
    ctx.clearRect(0, 0, width, height);

    // Damping chuyển động mượt mà (lerp)
    tiltX += (targetTiltX - tiltX) * 0.08;
    tiltY += (targetTiltY - tiltY) * 0.08;

    // Giảm dần quán tính lực xóc khi lắc điện thoại
    shakeVelocityX *= 0.92;
    shakeVelocityY *= 0.92;

    // Dịch chuyển nhẹ tinh vân vũ trụ theo góc nghiêng
    if (nebulaEl) {
      nebulaEl.style.transform = `translate3d(${tiltX * 0.15}px, ${tiltY * 0.15}px, 0)`;
    }

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];

      // Di chuyển tự nhiên + lực gia tốc khi lắc
      s.x += s.vx + shakeVelocityX * (s.layer * 0.15);
      s.y += s.vy + shakeVelocityY * (s.layer * 0.15);

      // Quấn vòng màn hình
      if (s.x < 0) s.x = width;
      else if (s.x > width) s.x = 0;
      if (s.y < 0) s.y = height;
      else if (s.y > height) s.y = 0;

      // Nhấp nháy độ sáng
      s.twinklePhase += s.twinkleSpeed;
      s.alpha = s.baseAlpha + Math.sin(s.twinklePhase) * 0.35;
      if (s.alpha < 0.1) s.alpha = 0.1;
      if (s.alpha > 1) s.alpha = 1;

      // Vị trí vẽ có tính độ sâu thị sai (Parallax) theo góc nghiêng
      const drawX = s.x + tiltX * s.layer;
      const drawY = s.y + tiltY * s.layer;

      ctx.beginPath();
      ctx.arc(drawX, drawY, s.size, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.alpha;
      ctx.fill();

      // Hào quang lấp lánh cho các vì sao to
      if (s.size > 1.8) {
        ctx.beginPath();
        ctx.arc(drawX, drawY, s.size * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha * 0.25;
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(renderGalaxy);
  }

  requestAnimationFrame(renderGalaxy);
}

window.addEventListener("DOMContentLoaded", () => {
  initData();
  initGalaxyMotion();
});
