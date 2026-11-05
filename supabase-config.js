// EduProof - Supabase Cloud Configuration
window.EDUPROOF_CONFIG = {
  supabaseUrl: "https://icxyuraelwhkbfkkeoyj.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljeHl1cmFlbHdoa2Jma2tlb3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4Nzg5MjQsImV4cCI6MjEwOTQ1NDkyNH0.f7pdqBqrpmB1RZmufKm-ai4bMem7REQ7ByEJEJu3h8o"
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
