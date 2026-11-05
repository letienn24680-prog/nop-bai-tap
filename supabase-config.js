// EduProof - Supabase Cloud Configuration
// Điền thông tin Supabase Project của bạn tại đây (URL và Anon Key)
window.EDUPROOF_CONFIG = {
  supabaseUrl: "https://pyxmhccvfysjtlxkdryr.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5eG1oY2N2ZnlzanRseGtkcnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5OTUwOTAsImV4cCI6MjEwNjU3MTA5MH0.XOKxbICA77S9ATxIa-h_Se_Gh_vF5kg1910PvUWXX7A"
};

// Khởi tạo Supabase Client
if (typeof supabase !== "undefined" && window.EDUPROOF_CONFIG.supabaseUrl) {
  try {
    window.supabaseClient = supabase.createClient(
      window.EDUPROOF_CONFIG.supabaseUrl,
      window.EDUPROOF_CONFIG.supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: true
        }
      }
    );
    console.log("🟢 EduProof: Đã kết nối Supabase Cloud Client thành công.");
  } catch (err) {
    console.warn("⚠️ Không thể khởi tạo Supabase Client:", err);
  }
}

