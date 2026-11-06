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

function sanitizeUrl(url) {
  if (!url) return "#";
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return sanitizeText(trimmed);
  }
  return "#";
}

function formatSubjectBadge(subject) {
  const s = (subject || "").trim();
  const lower = s.toLowerCase();
  let icon = "📚";
  if (lower.includes("toán")) icon = "📐";
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

// In-Memory State
let users = [];
let currentUser = null;
let assignments = [];
let submissions = [];

let studentFilter = "all";
let teacherActiveTab = "submissions";
let selectedCampaignId = null;

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

  // 3. Load or Seed Assignments & Submissions
  const savedAssignments = localStorage.getItem(DB_KEY_ASSIGNMENTS);
  const savedSubmissions = localStorage.getItem(DB_KEY_SUBMISSIONS);

  if (savedAssignments && savedSubmissions) {
    try {
      assignments = JSON.parse(savedAssignments);
      submissions = JSON.parse(savedSubmissions);
      assignments.forEach((a) => {
        if (!a.teacherId) a.teacherId = "gvcn_ngo_ha";
      });
      if (!selectedCampaignId && assignments.length > 0) {
        selectedCampaignId = assignments[0].id;
      }
      updateHeaderUserDisplay();
      renderCurrentView();

      // Tự động đồng bộ với Supabase Cloud ngay khi có mạng
      syncCloudData(false);
      setupRealtimeListener();
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
  setupRealtimeListener();
}

function persistData() {
  localStorage.setItem(DB_KEY_USERS, JSON.stringify(users));
  localStorage.setItem(DB_KEY_ASSIGNMENTS, JSON.stringify(assignments));
  localStorage.setItem(DB_KEY_SUBMISSIONS, JSON.stringify(submissions));
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
            teacherId: u.teacherId || u.teacher_id
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
          teacherId: u.teacher_id
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
          teacher_id: u.teacherId || null
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
        }));
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
        photos: s.photos || [],
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
    renderCurrentView();

    if (notify) {
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

let realtimeSubscribed = false;
let realtimeDebounceTimer = null;

function setupRealtimeListener() {
  if (realtimeSubscribed) return;
  const sb = getSupabase();
  if (!sb || !sb.channel) return;
  try {
    const triggerDebouncedSync = () => {
      clearTimeout(realtimeDebounceTimer);
      realtimeDebounceTimer = setTimeout(() => {
        syncCloudData(false);
      }, 350);
    };

    sb.channel("eduproof_live_sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "eduproof_assignments" }, triggerDebouncedSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "eduproof_submissions" }, triggerDebouncedSync)
      .on("postgres_changes", { event: "*", schema: "public", table: "eduproof_users" }, triggerDebouncedSync)
      .subscribe();

    realtimeSubscribed = true;
  } catch (e) {
    console.warn("Realtime listener không khả dụng:", e);
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
  localStorage.removeItem(DB_KEY_AUTH);
  sessionStorage.removeItem(DB_KEY_AUTH);
  localStorage.removeItem("eduproof_teacher_tab");
  localStorage.removeItem("eduproof_admin_tab");
  localStorage.removeItem("eduproof_selected_campaign");
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
  document.getElementById("createStudentModal").style.display = "flex";
}

function closeCreateStudentModal() {
  document.getElementById("createStudentModal").style.display = "none";
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

  if (!fullName || !username) {
    alert("Vui lòng nhập đầy đủ họ tên và tên đăng nhập.");
    return;
  }

  // Check unique username
  if (users.some((u) => u.username === username)) {
    alert("Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác (ví dụ thêm số phía sau).");
    return;
  }

  const newStudent = {
    id: "hs_" + Date.now(),
    username: username,
    password: password,
    name: fullName,
    role: "student",
    class: studentClass,
    teacherId: currentUser.id
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
      teacher_id: newStudent.teacherId
    }]).then();
  }

  closeCreateStudentModal();
  renderTeacherView();

  // Generate message to copy for student / parents
  const shareMsg = `Chào em ${fullName}! Thầy gửi tài khoản EduProof để nộp bài tập về nhà:\n- Tên đăng nhập: ${username}\n- Mật khẩu: ${password}\n- Lớp: ${studentClass}\n👉 Em đăng nhập để nộp bài tập đúng hạn nhé!`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareMsg);
    alert(`Đã tạo tài khoản cho học sinh ${fullName} thành công!\n\n📋 ĐÃ TỰ ĐỘNG SAO CHÉP THÔNG TIN TÀI KHOẢN VÀO BỘ NHỚ TẠM:\n"${shareMsg}"\n\nThầy có thể dán (Ctrl+V) gửi ngay qua Zalo/tin nhắn cho học sinh.`);
  } else {
    alert(`Đã tạo tài khoản thành công!\nTên đăng nhập: ${username} | Mật khẩu: ${password}`);
  }
}

function deleteStudentAccount(studentId) {
  const student = users.find((u) => u.id === studentId);
  if (!student) return;

  if (confirm(`Bạn có chắc chắn muốn xóa tài khoản của học sinh "${student.name}" (${student.username})?`)) {
    users = users.filter((u) => u.id !== studentId);
    // remove their submissions
    submissions = submissions.filter((s) => s.studentId !== studentId);
    persistData();

    const sb = getSupabase();
    if (sb) {
      sb.from("eduproof_users").delete().eq("id", studentId).then();
      sb.from("eduproof_submissions").delete().eq("student_id", studentId).then();
    }

    renderTeacherView();
    alert("Đã xóa tài khoản học sinh thành công.");
  }
}

function copyAccountInfo(username) {
  const student = users.find((u) => u.username === username);
  if (!student) return;

  const msg = `Tài khoản nộp bài tập EduProof:\nHọc sinh: ${student.name}\n- Tên đăng nhập: ${student.username}\n- Mật khẩu: ${student.password}\n- Lớp: ${student.class || "12A1"}`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg);
    alert(`Đã sao chép thông tin tài khoản của ${student.name}!\n\n${msg}\n\nThầy có thể dán vào Zalo gửi cho học sinh.`);
  } else {
    alert(msg);
  }
}

// ==========================================
// 2A. BATCH IMPORT STUDENTS FROM EXCEL
// ==========================================

let pendingParsedStudents = [];

function openExcelImportModal() {
  if (!currentUser || currentUser.role !== "teacher") {
    alert("Chỉ giáo viên mới có quyền nhập danh sách học sinh.");
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
    alert("Thư viện đọc Excel (SheetJS) chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng!");
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
        alert("File Excel không có dữ liệu học sinh!");
        return;
      }

      const defaultClass = currentUser.class || "12A1";
      const existingUsernames = new Set(users.map((u) => u.username));
      const parsedList = [];

      rows.forEach((row, index) => {
        let nameVal = "";
        let usernameVal = "";
        let classVal = "";
        let passwordVal = "";

        Object.keys(row).forEach((col) => {
          const norm = normalizeHeaderKey(col);
          const val = (row[col] !== undefined && row[col] !== null) ? row[col].toString().trim() : "";

          if (norm.includes("tendangnhap") || norm.includes("dangnhap") || norm.includes("taikhoan") || norm.includes("username") || norm === "user" || norm.includes("mahs") || norm.includes("mssv")) {
            if (!usernameVal) usernameVal = val;
          } else if (norm.includes("ten") || norm.includes("hoten") || norm.includes("hovaten") || norm.includes("fullname") || norm === "name" || norm.includes("hocsinh")) {
            if (!nameVal) nameVal = val;
          } else if (norm.includes("lop") || norm.includes("class") || norm.includes("grade")) {
            if (!classVal) classVal = val;
          } else if (norm.includes("matkhau") || norm.includes("password") || norm.includes("pass") || norm === "mk") {
            if (!passwordVal) passwordVal = val;
          }
        });

        if (!nameVal) return;

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
          role: "student",
          teacherId: currentUser.id
        });
      });

      if (parsedList.length === 0) {
        alert("Không tìm thấy thông tin học sinh hợp lệ. Vui lòng tải file mẫu để xem định dạng chuẩn.");
        return;
      }

      pendingParsedStudents = parsedList;
      displayExcelPreview(parsedList);
    } catch (err) {
      console.error("Lỗi đọc file Excel:", err);
      alert("Không thể đọc file Excel này: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

function displayExcelPreview(list) {
  const previewSection = document.getElementById("excelPreviewSection");
  const countText = document.getElementById("excelParsedCountText");
  const tbody = document.getElementById("excelPreviewTableBody");
  const btnConfirm = document.getElementById("btnConfirmBatchCreate");

  countText.innerText = `✅ Đã nhận diện ${list.length} học sinh sẵn sàng tạo tài khoản`;

  tbody.innerHTML = list
    .map(
      (s, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${sanitizeText(s.name)}</strong></td>
        <td><code>${sanitizeText(s.username)}</code></td>
        <td>${sanitizeText(s.class)}</td>
        <td><code>${sanitizeText(s.password)}</code></td>
      </tr>
    `
    )
    .join("");

  previewSection.style.display = "block";
  btnConfirm.disabled = false;
  btnConfirm.innerText = `✅ Tạo ${list.length} tài khoản học sinh`;
}

async function confirmBatchCreateStudents() {
  if (!pendingParsedStudents || pendingParsedStudents.length === 0) {
    alert("Không có danh sách học sinh để tạo.");
    return;
  }

  const btnConfirm = document.getElementById("btnConfirmBatchCreate");
  btnConfirm.disabled = true;
  btnConfirm.innerText = "⏳ Đang tạo tài khoản...";

  pendingParsedStudents.forEach((newS) => {
    const existingIdx = users.findIndex((u) => u.username === newS.username);
    if (existingIdx >= 0) {
      users[existingIdx] = newS;
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
        teacher_id: currentUser.id
      }));

      await sb.from("eduproof_users").upsert(payloads);
    } catch (err) {
      console.warn("Lỗi kết nối Supabase:", err);
    }
  }

  const shareLines = pendingParsedStudents.map(
    (s, idx) => `${idx + 1}. ${s.name} (Lớp ${s.class}): TK: ${s.username} | MK: ${s.password}`
  );
  const shareMsg = `📋 DANH SÁCH TÀI KHOẢN HỌC SINH NỘP BÀI TẬP EDUPROOF:\n${shareLines.join("\n")}\n\n👉 Các em học sinh đăng nhập vào hệ thống để nộp bài tập về nhà đúng hạn nhé!`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareMsg);
  }

  const createdCount = pendingParsedStudents.length;
  closeExcelImportModal();
  renderTeacherView();

  alert(
    `🎉 ĐÃ TỰ ĐỘNG TẠO THÀNH CÔNG ${createdCount} TÀI KHOẢN HỌC SINH!\n\n` +
    `📋 Danh sách tài khoản đã được tự động sao chép vào bộ nhớ tạm (Clipboard).\n` +
    `Thầy/Cô có thể nhấn Ctrl+V dán ngay vào nhóm Zalo/Facebook của lớp.`
  );
}

function downloadStudentTemplateExcel() {
  if (typeof XLSX === "undefined") {
    alert("Thư viện Excel đang tải, vui lòng kiểm tra kết nối mạng và thử lại sau.");
    return;
  }

  const sampleData = [
    { "Họ và tên": "Nguyễn Văn An", "Tên đăng nhập": "hs_an", "Lớp": "12A1", "Mật khẩu": "123456" },
    { "Họ và tên": "Trần Thị Mai", "Tên đăng nhập": "hs_mai", "Lớp": "12A1", "Mật khẩu": "123456" },
    { "Họ và tên": "Lê Hoàng Nam", "Tên đăng nhập": "hs_nam", "Lớp": "12A1", "Mật khẩu": "123456" },
    { "Họ và tên": "Phạm Thu Hà", "Tên đăng nhập": "hs_ha", "Lớp": "12A1", "Mật khẩu": "123456" },
    { "Họ và tên": "Đỗ Quang Minh", "Tên đăng nhập": "hs_minh", "Lớp": "12A1", "Mật khẩu": "123456" }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  ws["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 10 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DanhSachHocSinh");
  XLSX.writeFile(wb, "Mau_Danh_Sach_Hoc_Sinh_EduProof.xlsx");
}

function copyAllStudentAccounts() {
  const myStudents = users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  if (myStudents.length === 0) {
    alert("Chưa có tài khoản học sinh nào trong danh sách.");
    return;
  }

  const lines = myStudents.map(
    (s, idx) => `${idx + 1}. ${s.name} - Lớp ${s.class || ""}\n   👉 Tên đăng nhập: ${s.username} | Mật khẩu: ${s.password}`
  );
  const text = `📋 DANH SÁCH TÀI KHOẢN NỘP BÀI TẬP EDUPROOF (${currentUser.name}):\n\n${lines.join("\n\n")}\n\n👉 Các em học sinh đăng nhập vào hệ thống để nhận đề và nộp bài đúng hạn nhé!`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    alert(`Đã sao chép danh sách ${myStudents.length} tài khoản học sinh!\nThầy/Cô có thể dán (Ctrl+V) gửi ngay vào nhóm Zalo lớp.`);
  } else {
    alert(text);
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

  if (
    confirm(
      `Bạn có chắc chắn muốn xóa tài khoản Giáo viên "${teacher.name}"?\n\n` +
      `⚠️ CẢNH BÁO: Toàn bộ ${countStudents} học sinh trực thuộc và ${countAssignments} bài tập của giáo viên này cũng sẽ bị xóa bỏ!`
    )
  ) {
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
    }

    renderAdminView();
    alert("Đã xóa giáo viên và toàn bộ dữ liệu trực thuộc thành công.");
  }
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
  const teacherUsers = users.filter((u) => u.role === "teacher");

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
  table.innerHTML = `
    <thead>
      <tr>
        <th>Họ tên Học sinh</th>
        <th>Tên đăng nhập</th>
        <th>Mật khẩu</th>
        <th>Lớp</th>
        <th>Giáo viên Quản lý trực tiếp</th>
        <th>Số bài đã nộp</th>
      </tr>
    </thead>
    <tbody>
      ${studentUsers.length === 0 ? `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 1.5rem;">Chưa có học sinh nào thuộc giáo viên này.</td></tr>` : ""}
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
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;
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
    renderStudentView();
  }
}

// ==========================================
// 4. STUDENT VIEW LOGIC
// ==========================================

function filterStudentAssignments(filter, btnElement) {
  studentFilter = filter;
  localStorage.setItem("eduproof_student_filter", filter);
  document.querySelectorAll("#studentView .tab-btn").forEach((b) => b.classList.remove("active"));
  if (btnElement) {
    btnElement.classList.add("active");
  } else {
    const btn = document.querySelector(`#studentView .tab-btn[onclick*="'${filter}'"]`);
    if (btn) btn.classList.add("active");
  }
  renderStudentView();
}

function renderStudentView() {
  document.querySelectorAll("#studentView .tab-btn").forEach((b) => {
    const isMatch = b.getAttribute("onclick") && b.getAttribute("onclick").includes(`'${studentFilter}'`);
    b.classList.toggle("active", Boolean(isMatch));
  });

  const container = document.getElementById("studentAssignmentsList");
  container.innerHTML = "";

  let pendingCount = 0;
  let submittedCount = 0;
  let gradedCount = 0;

  const studentAssignments = assignments.filter(
    (a) => a.teacherId === currentUser.teacherId || !a.teacherId
  );

  studentAssignments.forEach((asg) => {
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

    let statusBadge = "";
    let actionBtn = "";

    const deadlineFormatted = new Date(asg.deadline).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit"
    });

    const isLate = new Date() > new Date(asg.deadline);

    if (status === "pending") {
      statusBadge = isLate
        ? `<span class="badge-status status-resubmit">⚠️ Đã quá hạn</span>`
        : `<span class="badge-status status-pending">⏳ Cần nộp bài</span>`;
      actionBtn = `<button class="btn btn-primary btn-sm" onclick="openSubmitModal('${asg.id}')">${isLate ? "📸 Nộp bài muộn" : "📸 Nộp bài tập"}</button>`;
    } else if (status === "resubmit") {
      statusBadge = `<span class="badge-status status-resubmit">⚠️ Yêu cầu chụp lại</span>`;
      actionBtn = `<button class="btn btn-danger btn-sm" onclick="openSubmitModal('${asg.id}')">🔄 Chụp nộp lại</button>`;
    } else if (status === "submitted") {
      statusBadge = `<span class="badge-status status-submitted">✅ Đã nộp (${sub.photos.length} trang)</span>`;
      actionBtn = `<button class="btn btn-secondary btn-sm" onclick="viewSubmissionSummary('${sub.id}')">👀 Xem bài đã gửi</button>`;
    } else if (status === "graded") {
      statusBadge = `<span class="badge-status status-graded">🎯 Điểm: ${sub.grade}/10</span>`;
      actionBtn = `<button class="btn btn-secondary btn-sm" onclick="viewSubmissionSummary('${sub.id}')">📝 Lời phê & Bút đỏ</button>`;
    }

    card.innerHTML = `
      <div>
        <div class="card-top">
          ${formatSubjectBadge(asg.subject)}
          ${statusBadge}
        </div>
        <h3 class="card-title">${sanitizeText(asg.title)}</h3>
        <p class="card-instructions">${sanitizeText(asg.description)}</p>
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

  document.getElementById("submitModalTitle").innerText = `Nộp bài: ${asg.title}`;
  document.getElementById("submitModalSubtitle").innerText =
    `Môn: ${asg.subject} • Yêu cầu tối thiểu ${asg.minPhotos} ảnh chụp vở`;

  const existingSub = submissions.find(
    (s) => s.assignmentId === assignmentId && s.studentId === currentUser.id
  );

  currentUploadedPhotos = [];
  if (existingSub && existingSub.photos) {
    currentUploadedPhotos = JSON.parse(JSON.stringify(existingSub.photos));
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

    if (!file.type.startsWith("image/")) {
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
  grid.innerHTML = "";

  if (currentUploadedPhotos.length === 0) {
    notice.innerText = "Chưa có ảnh nào được thêm. Hãy bấm Bật Camera hoặc Chọn ảnh.";
    return;
  }

  notice.innerText = `Đã sẵn sàng ${currentUploadedPhotos.length} trang ảnh bài làm. Bạn có thể bấm xoay hoặc đổi thứ tự trang.`;

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
    grid.appendChild(card);
  });
}

// Tải ảnh lên Supabase Storage bucket 'proofs' (nếu bucket tồn tại) và tự động fallback về Base64
async function uploadPhotoToStorage(sb, dataUrl, filePath) {
  if (!sb || !dataUrl || !dataUrl.startsWith("data:")) return null;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
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

  if (currentUploadedPhotos.length < (asg.minPhotos || 1)) {
    alert(`Bài tập này yêu cầu tối thiểu ${asg.minPhotos || 1} ảnh chụp vở bài làm. Vui lòng thêm đủ ảnh trước khi nộp.`);
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
              photo.dataUrl = storageUrl;
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
      annotations: subIndex >= 0 ? submissions[subIndex].annotations : {},
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
        const { error: rpcErr } = await sb.rpc("submit_homework", {
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
        }
      } catch (cloudErr) {
        console.warn("Lỗi đồng bộ bài nộp lên cloud:", cloudErr);
      }
    }

    closeSubmitModal();
    renderStudentView();
    alert("🎉 Chúc mừng! Bạn đã nộp bài tập thành công.");
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
  document.getElementById("pendingSubCount").innerText = pendingSubs.length;
  document.getElementById("totalStudentsCount").innerText = myStudents.length;

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
  const list = mySubmissionsList || submissions.filter((s) => myAssignmentIds.has(s.assignmentId));

  if (list.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">Chưa có học sinh nào nộp bài cho lớp của bạn.</p>`;
    return;
  }

  list.forEach((sub) => {
    const asg = assignments.find((a) => a.id === sub.assignmentId);
    const card = document.createElement("div");
    card.className = "assignment-card";

    let statusBadge = "";
    if (sub.status === "submitted") {
      statusBadge = `<span class="badge-status status-submitted">⏳ Chờ chấm</span>`;
    } else if (sub.status === "graded") {
      statusBadge = `<span class="badge-status status-graded">🎯 Đã chấm (${sub.grade}/10)</span>`;
    } else if (sub.status === "resubmit_requested") {
      statusBadge = `<span class="badge-status status-resubmit">⚠️ Đã yêu cầu nộp lại</span>`;
    }

    const submittedDate = new Date(sub.submittedAt).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit"
    });

    card.innerHTML = `
      <div>
        <div class="card-top">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <strong style="font-size: 0.95rem;">${sanitizeText(sub.studentName)}</strong>
            ${asg ? formatSubjectBadge(asg.subject) : ""}
          </div>
          ${statusBadge}
        </div>
        <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">
          ${asg ? sanitizeText(asg.title) : "Bài tập đã xóa"}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
          Nộp lúc: ${submittedDate} • ${sub.photos.length} trang ảnh
        </div>
        ${sub.studentNote ? `<div style="font-size: 0.78rem; background: #F1F5F9; padding: 0.4rem; border-radius: 4px; margin-bottom: 0.5rem;">💬 <em>"${sanitizeText(sub.studentNote)}"</em></div>` : ""}
      </div>
      <div class="card-footer">
        <span style="font-size: 0.75rem; color: var(--text-muted);">Lớp: 12A1</span>
        <button class="btn btn-primary btn-sm" onclick="openGradingStudio('${sanitizeText(sub.id)}', false)">
          ✍️ ${sub.status === "graded" ? "Sửa điểm & Nhận xét" : "Mở chấm bài"}
        </button>
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
  const selectBox = document.getElementById("campaignSelectBox");
  selectBox.innerHTML = "";

  const myAssignments = myAssignmentsList || assignments.filter((a) => a.teacherId === currentUser.id);
  const studentsList = myStudentsList || users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);

  if (myAssignments.length === 0) {
    document.getElementById("campaignDetailContainer").innerHTML =
      `<p style="color: var(--text-muted); padding: 1.5rem; text-align: center;">Bạn chưa giao bài tập nào. Hãy bấm "Tạo bài tập mới".</p>`;
    document.getElementById("campaignDeadlineNotice").innerText = "";
    return;
  }

  myAssignments.forEach((asg) => {
    const opt = document.createElement("option");
    opt.value = asg.id;
    opt.innerText = `[${asg.subject}] ${asg.title}`;
    if (asg.id === selectedCampaignId) opt.selected = true;
    selectBox.appendChild(opt);
  });

  let currentAsg = myAssignments.find((a) => a.id === selectedCampaignId);
  if (!currentAsg) {
    currentAsg = myAssignments[0];
    selectedCampaignId = currentAsg.id;
  }

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

  document.getElementById("campaignDeadlineNotice").innerHTML =
    `Hạn nộp: <strong>${deadlineFormatted}</strong>`;

  const container = document.getElementById("campaignDetailContainer");
  container.innerHTML = `
    <div class="campaign-banner">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
        <div>
          <div style="margin-bottom: 0.5rem;">${formatSubjectBadge(currentAsg.subject)}</div>
          <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.35rem;">
            ${currentAsg.title}
          </h2>
          <p style="font-size: 0.85rem; color: var(--text-muted);">${currentAsg.description}</p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="copyAssignmentShareLink('${currentAsg.id}')">
            🔗 Link nộp bài
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteAssignment('${currentAsg.id}')">
            🗑️ Xóa bài tập
          </button>
        </div>
      </div>

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
          <div class="stat-label">Đã chấm điểm</div>
        </div>
      </div>
    </div>

    <div style="background: white; border-radius: var(--radius-md); border: 1px solid var(--border-color); overflow-x: auto; padding: 1.25rem;">
      <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.75rem;">
        Danh sách học sinh lớp (${studentsList.length} học sinh)
      </h3>

      <table class="data-table">
        <thead>
          <tr>
            <th>Học sinh</th>
            <th>Trạng thái nộp</th>
            <th>Thời gian nộp</th>
            <th>Số trang ảnh</th>
            <th>Điểm số</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${studentsList.length === 0 ? `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Bạn chưa tạo tài khoản học sinh nào. Hãy vào mục "Quản lý tài khoản học sinh" để cấp tài khoản.</td></tr>` : ""}
          ${studentsList
            .map((student) => {
              const sub = asgSubmissions.find((s) => s.studentId === student.id);
              if (sub) {
                let badge = "";
                if (sub.status === "graded") badge = `<span class="badge-status status-graded">🎯 Đã chấm</span>`;
                else if (sub.status === "resubmit_requested") badge = `<span class="badge-status status-resubmit">⚠️ Cần nộp lại</span>`;
                else badge = `<span class="badge-status status-submitted">⏳ Chờ chấm</span>`;

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
                    <td><strong>${sub.grade !== null ? sub.grade + "/10" : "—"}</strong></td>
                    <td>
                      <button class="btn btn-primary btn-sm" onclick="openGradingStudio('${sanitizeText(sub.id)}', false)">
                        ✍️ ${sub.status === "graded" ? "Sửa điểm" : "Chấm bài"}
                      </button>
                    </td>
                  </tr>
                `;
              } else {
                return `
                  <tr>
                    <td><strong>${sanitizeText(student.name)}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">(${sanitizeText(student.username)})</span></td>
                    <td><span class="badge-status status-pending">❌ Chưa nộp bài</span></td>
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
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function remindStudent(studentId, assignmentId) {
  const student = users.find((u) => u.id === studentId);
  const asg = assignments.find((a) => a.id === assignmentId);
  if (!student || !asg) return;

  const msg = `📢 Nhắc nhở học tập: Em ${student.name} ơi, bài tập "${asg.title}" sắp đến hạn nộp. Em nhớ chụp ảnh vở bài làm và nộp lên EduProof nhé!`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg);
    alert(`Đã sao chép tin nhắn nhắc nhở cho học sinh ${student.name}!\n\n"${msg}"\n\nThầy/Cô có thể dán gửi Zalo cho phụ huynh hoặc học sinh.`);
  } else {
    alert(msg);
  }
}

function copyAssignmentShareLink(assignmentId) {
  const asg = assignments.find((a) => a.id === assignmentId);
  if (!asg) return;
  const msg = `📌 BÀI TẬP VỀ NHÀ: ${asg.title}\n- Hạn nộp: ${new Date(asg.deadline).toLocaleString("vi-VN")}\n- Yêu cầu: Chụp ảnh vở bài làm gửi lên EduProof.\n👉 Cả lớp đăng nhập vào nộp bài trước hạn nhé!`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(msg);
    alert(`Đã sao chép link và thông báo bài tập!\n\n"${msg}"\n\nThầy/Cô có thể dán vào nhóm Zalo lớp.`);
  } else {
    alert(msg);
  }
}

// Assignments Management
function renderTeacherAssignments(myAssignmentsList) {
  const container = document.getElementById("teacherAssignmentsList");
  container.innerHTML = "";

  const myAssignments = myAssignmentsList || assignments.filter((a) => a.teacherId === currentUser.id);

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
            📂 Xem đợt nộp này
          </button>
          <button class="btn btn-danger btn-sm" title="Xóa bài tập nếu đăng nhầm" onclick="deleteAssignment('${asg.id}')">
            🗑️ Xóa
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

  if (!confirm(`Bạn có chắc chắn muốn xóa bài tập "${title}"?\n\nLưu ý: Mọi bài nộp của học sinh liên quan đến bài tập này cũng sẽ bị xóa bỏ hoàn toàn trên cả thiết bị và Supabase Cloud.`)) {
    return;
  }

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
      console.log("✅ Đã xóa bài tập trên Supabase Cloud:", assignmentId);
    } catch (err) {
      console.warn("Lỗi xóa bài tập trên Cloud:", err);
    }
  }

  renderTeacherView();
  alert("Đã xóa bài tập thành công.");
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
  const studentUsers = myStudentsList || users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);

  table.innerHTML = `
    <thead>
      <tr>
        <th>Họ và tên</th>
        <th>Tên đăng nhập</th>
        <th>Mật khẩu</th>
        <th>Lớp</th>
        <th>Bài đã nộp</th>
        <th>Thao tác</th>
      </tr>
    </thead>
    <tbody>
      ${studentUsers.length === 0 ? `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Bạn chưa tạo tài khoản học sinh nào. Hãy bấm "Cấp tài khoản mới" ở trên để tạo.</td></tr>` : ""}
      ${studentUsers
        .map((st) => {
          const count = submissions.filter((s) => s.studentId === st.id).length;
          return `
            <tr>
              <td><strong>${sanitizeText(st.name)}</strong></td>
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

function renderTeacherGradebook(myStudentsList, myAssignmentsList) {
  const table = document.getElementById("gradebookTable");
  const studentUsers = myStudentsList || users.filter((u) => u.role === "student" && u.teacherId === currentUser.id);
  const myAssignments = myAssignmentsList || assignments.filter((a) => a.teacherId === currentUser.id);

  table.innerHTML = `
    <thead>
      <tr>
        <th>Họ và tên</th>
        <th>Tên đăng nhập</th>
        <th>Lớp</th>
        <th>Số bài đã nộp</th>
        <th>Điểm TB</th>
        <th>Đánh giá chuyên cần</th>
      </tr>
    </thead>
    <tbody>
      ${studentUsers.length === 0 ? `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Chưa có học sinh nào.</td></tr>` : ""}
      ${studentUsers
        .map((st) => {
          const stSubs = submissions.filter((s) => s.studentId === st.id);
          const gradedSubs = stSubs.filter((s) => s.status === "graded" && s.grade !== null);
          const avgScore =
            gradedSubs.length > 0
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
              <td><strong>${sanitizeText(st.name)}</strong></td>
              <td><code>${sanitizeText(st.username)}</code></td>
              <td>${sanitizeText(st.class || "12A1")}</td>
              <td>${stSubs.length} / ${myAssignments.length} bài</td>
              <td style="font-weight: 700; color: var(--primary);">${avgScore}</td>
              <td>${attendanceBadge}</td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;
}

// ==========================================
// 6. ANNOTATION STUDIO & GRADING LOGIC
// ==========================================

function openGradingStudio(submissionId, isReadOnly = false) {
  activeGradingSubmissionId = submissionId;
  activeGradingPageIndex = 0;
  canvasUndoStack = [];

  const sub = submissions.find((s) => s.id === submissionId);
  if (!sub || !sub.photos || sub.photos.length === 0) {
    alert("Bài nộp này không có ảnh nào để hiển thị.");
    return;
  }

  document.getElementById("gradingStudentName").innerText = `${isReadOnly ? "Xem bài:" : "Chấm bài:"} ${sub.studentName}`;
  document.getElementById("gradingSubmissionTime").innerText = `Nộp lúc: ${new Date(sub.submittedAt).toLocaleTimeString("vi-VN")}`;

  document.getElementById("gradeScoreInput").value = sub.grade !== null ? sub.grade : "";
  document.getElementById("gradeFeedbackInput").value = sub.feedback || "";
  document.getElementById("requestResubmitCheckbox").checked = sub.status === "resubmit_requested";

  const proofsView = document.getElementById("studentAdditionalProofsView");
  const safeUrl = sanitizeUrl(sub.linkProof);
  proofsView.innerHTML = `
    <strong>Minh chứng khác:</strong><br>
    ${sub.linkProof && safeUrl !== "#" ? `🔗 <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); word-break: break-all;">${sanitizeText(sub.linkProof)}</a><br>` : "<em>Không có link đính kèm</em><br>"}
    ${sub.studentNote ? `✍️ <em>Ghi chú: "${sanitizeText(sub.studentNote)}"</em>` : ""}
  `;

  document.getElementById("gradeScoreInput").disabled = isReadOnly;
  document.getElementById("gradeFeedbackInput").disabled = isReadOnly;
  document.getElementById("requestResubmitCheckbox").disabled = isReadOnly;

  document.getElementById("gradingModal").style.display = "flex";
  loadGradingPage(activeGradingPageIndex);
}

function closeGradingStudio() {
  document.getElementById("gradingModal").style.display = "none";
}

function loadGradingPage(pageIndex) {
  const sub = submissions.find((s) => s.id === activeGradingSubmissionId);
  if (!sub || !sub.photos[pageIndex]) return;

  activeGradingPageIndex = pageIndex;
  document.getElementById("pageNavIndicator").innerText =
    `Trang ${pageIndex + 1} / ${sub.photos.length}`;

  const canvas = document.getElementById("annotationCanvas");
  const ctx = canvas.getContext("2d");
  const photo = sub.photos[pageIndex];

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    if (sub.annotations && sub.annotations[pageIndex]) {
      const savedDrawings = new Image();
      savedDrawings.crossOrigin = "anonymous";
      savedDrawings.onload = () => {
        ctx.drawImage(savedDrawings, 0, 0);
        saveCanvasState();
      };
      savedDrawings.src = sub.annotations[pageIndex];
    } else {
      saveCanvasState();
    }
  };
  img.src = photo.dataUrl;

  initCanvasEvents();
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
  sub.annotations[activeGradingPageIndex] = canvas.toDataURL("image/png");
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

  const newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);

  const getCanvasPos = (evt) => {
    const rect = newCanvas.getBoundingClientRect();
    const scaleX = newCanvas.width / rect.width;
    const scaleY = newCanvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY
    };
  };

  newCanvas.addEventListener("mousedown", (e) => {
    const pos = getCanvasPos(e);
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
  });

  newCanvas.addEventListener("mousemove", (e) => {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
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
  });

  newCanvas.addEventListener("mouseup", () => {
    if (isDrawing) {
      isDrawing = false;
      saveCanvasState();
    }
  });
}

function saveCanvasState() {
  const canvas = document.getElementById("annotationCanvas");
  canvasUndoStack.push(canvas.toDataURL("image/png"));
  if (canvasUndoStack.length > 20) canvasUndoStack.shift();
}

function undoAnnotation() {
  if (canvasUndoStack.length <= 1) return;
  canvasUndoStack.pop();
  const prevState = canvasUndoStack[canvasUndoStack.length - 1];

  const canvas = document.getElementById("annotationCanvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = prevState;
}

function clearAnnotations() {
  loadGradingPage(activeGradingPageIndex);
}

function addQuickComment(text) {
  const feedbackInput = document.getElementById("gradeFeedbackInput");
  if (feedbackInput.value.trim().length > 0) {
    feedbackInput.value += " " + text;
  } else {
    feedbackInput.value = text;
  }
}

function saveAndReturnGrade() {
  const sub = submissions.find((s) => s.id === activeGradingSubmissionId);
  if (!sub) return;

  saveCurrentPageAnnotation();

  const scoreVal = document.getElementById("gradeScoreInput").value;
  const feedbackVal = document.getElementById("gradeFeedbackInput").value.trim();
  const requestResubmit = document.getElementById("requestResubmitCheckbox").checked;

  if (!requestResubmit && (scoreVal === "" || isNaN(scoreVal) || scoreVal < 0 || scoreVal > 10)) {
    alert("Vui lòng nhập điểm hợp lệ từ 0 đến 10.");
    return;
  }

  if (requestResubmit) {
    sub.status = "resubmit_requested";
    sub.resubmitRequested = true;
    sub.grade = null;
    sub.feedback = feedbackVal || "Ảnh chụp bị mờ hoặc thiếu trang. Em vui lòng chụp lại bài làm nhé!";
  } else {
    sub.status = "graded";
    sub.resubmitRequested = false;
    sub.grade = parseFloat(scoreVal);
    sub.feedback = feedbackVal;
  }

  persistData();

  // Đồng bộ kết quả chấm bài lên Supabase Cloud
  const sb = getSupabase();
  if (sb) {
    try {
      // Ưu tiên gọi RPC grade_submission để xác thực giáo viên bằng mật khẩu (chống gian lận điểm)
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
          // Fallback lưu trực tiếp qua bảng nếu chưa cài RPC trên database
          sb.from("eduproof_submissions").update({
            status: sub.status,
            resubmit_requested: sub.resubmitRequested,
            grade: sub.grade,
            feedback: sub.feedback,
            annotations: sub.annotations
          }).eq("id", sub.id).then(({ error }) => {
            if (error) console.warn("Lỗi lưu điểm lên Supabase:", error);
          });
        }
      });
    } catch (err) {
      console.warn("Lỗi kết nối Supabase khi chấm bài:", err);
    }
  }

  closeGradingStudio();
  renderCurrentView();
  alert(requestResubmit ? "Đã gửi thông báo yêu cầu học sinh chụp nộp lại!" : "Đã lưu điểm và trả bài thành công!");
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

async function confirmCreateAssignment() {
  const title = document.getElementById("newTitleInput").value.trim();
  const subject = document.getElementById("newSubjectInput").value;
  const deadline = document.getElementById("newDeadlineInput").value;
  const description = document.getElementById("newDescInput").value.trim();
  const allowLink = document.getElementById("reqLinkCheck").checked;
  const allowNote = document.getElementById("reqNoteCheck").checked;

  if (!title) {
    alert("Vui lòng nhập tiêu đề bài tập.");
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
  alert("🎉 Đã tạo bài tập mới và đồng bộ thành công lên hệ thống!");
}

window.addEventListener("DOMContentLoaded", initData);
