import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  GraduationCap, ClipboardList, BookOpen, Users, LogIn, LogOut, CheckCircle,
  HelpCircle, Sparkles, ShieldAlert, ArrowLeft, ArrowRight, BookMarked
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CreateExam from './components/CreateExam';
import TeacherDashboard from './components/TeacherDashboard';
import StudentPortal from './components/StudentPortal';

type AppView = 'landing' | 'teacher' | 'student';

export default function App() {
  const [view, setView] = useState<AppView>('landing');
  const [isCreateExamOpen, setIsCreateExamOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [urlCode, setUrlCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Extract ?code=XXXXXX query parameter from shared teacher link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setUrlCode(code.toUpperCase());
      setView('student');
    }
  }, []);

  // Sync Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    // Allow select account dialog
    provider.setCustomParameters({ prompt: 'select_account' });
    setAuthError(null);
    try {
      await signInWithPopup(auth, provider);
      setView('teacher');
    } catch (err: any) {
      console.error(err);
      if (err && (err.code === 'auth/popup-blocked' || err.message?.includes('popup-blocked') || err.message?.includes('popup'))) {
        setAuthError('popup-blocked');
      } else {
        setAuthError(err?.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('landing');
      setIsCreateExamOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleBackToMain = () => {
    // Clean URL search param if student leaves
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setView('landing');
    setUrlCode('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900" dir="rtl">
      
      {/* Universal Head Navigation Bar */}
      {view !== 'student' && (
        <header className="bg-white border-b border-slate-100 sticky top-0 z-50 shadow-sm px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            
            <div 
              className={`flex items-center gap-2.5 ${view !== 'student' ? 'cursor-pointer' : ''}`} 
              onClick={view !== 'student' ? handleBackToMain : undefined}
            >
              <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md">
                <GraduationCap className="w-6 h-6 shrink-0" />
              </div>
              <div>
                <span className="text-md font-black text-slate-900 block leading-none">منصة الاختبارات الذكية</span>
                <span className="text-[10px] text-indigo-600 font-bold block mt-1 tracking-wider">SMART EXAMS GATEWAY</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {view !== 'landing' && view !== 'student' && (
                <button
                  onClick={handleBackToMain}
                  className="px-4 py-2 hover:bg-slate-100 text-indigo-700 hover:text-indigo-900 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  الصفحة الرئيسية <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                </button>
              )}

              {view === 'landing' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setView('teacher')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    لوحة المعلم
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>
      )}

      {/* Main Content Router */}
      <main className="flex-1">
        {authLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent pb-3" />
            <p className="text-slate-500 text-xs font-semibold mt-4">جاري تهيئة جلسة العمل السحابية بأمان...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            
            {/* 1. LANDING PORTAL VIEW */}
            {view === 'landing' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-7xl mx-auto px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center"
              >
                
                {/* Left Side: Copy and call-out */}
                <div className="lg:col-span-7 space-y-6 text-center lg:text-right">
                  <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full text-xs font-bold shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                    <span>الجيل الجديد من التقييم الإلكتروني المدرسي</span>
                  </div>
                  
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-tight">
                    صمم اختبارات مادتك <br />
                    <span className="bg-gradient-to-l from-indigo-500 to-indigo-805 bg-clip-text text-transparent">
                      بذكاء متناهٍ وبساطة مطلقة
                    </span>
                  </h1>

                  <p className="text-slate-500 text-md font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
                    منصة عربية متكاملة للمعلمين والمدارس تتيح صياغة الأسئلة بمختلف الأنواع، ومشاركة الروابط فورياً مع الطلاب، وتصحيح الإجابات ورصد التحليلات في ثوانٍ معدودة.
                  </p>

                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-4 animate-fade-in">
                    <button
                      onClick={() => setView('teacher')}
                      className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-md shadow-indigo-500/10 active:scale-95 transition-all cursor-pointer"
                    >
                      دخول بوابة المعلمين والمعلمات
                    </button>
                  </div>
                </div>

                {/* Right Side: Bento access grids */}
                <div className="lg:col-span-5 grid grid-cols-1 gap-4">
                  
                  {/* Option Card: Teacher */}
                  <motion.div
                    whileHover={{ y: -4 }}
                    onClick={() => setView('teacher')}
                    className="cursor-pointer bg-white border border-slate-100 hover:border-indigo-400 p-6 rounded-3xl shadow-sm group hover:shadow-md transition-all relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-700 transition-all opacity-0 group-hover:opacity-100" />
                    <div className="flex items-start gap-4">
                      <div className="bg-indigo-50/50 text-indigo-700 p-3.5 rounded-2xl shrink-0">
                        <ClipboardList className="w-6 h-6 stroke-[2]" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-lg text-slate-800 flex items-center gap-1.5 group-hover:text-indigo-700 transition-all duration-300">
                          لوحة إحصائيات المعلمين والمدارس
                          <ArrowRight className="w-4 h-4 text-indigo-600 rotate-180 translate-x-1 group-hover:translate-x-0 transition-all" />
                        </h3>
                        <p className="text-xs font-semibold text-slate-400 mt-1 leading-relaxed">
                          أنشئ اختباراتك الإلكترونية، واطلع على نسب النجاح، ورتب المتقدمين حسب العلامات مع إتاحة التصحيح المقالي اليدوي.
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Informational Card for Students (No manual login option) */}
                  <div className="bg-slate-100/70 border border-slate-200/50 p-6 rounded-3xl text-right space-y-2">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <GraduationCap className="w-5 h-5 shrink-0" />
                      <h4 className="font-bold text-xs text-slate-800">تنويه هام لأبنائنا الطلاب وبناتنا الطالبات:</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                      لتقديم أي اختبار أو رصد درجاتك، يرجى الاستعانة <strong>برابط الدخول المباشر المخصص لك</strong> والذي يتم توليده عبر معلم المادة حصرياً. حرصاً على الخصوصية، لا تتوفر بوابة دخول عامة عشوائية للطلاب في الصفحة الرئيسية لضمان عدم تشابه الأسماء أو تكرار التسجيل.
                    </p>
                  </div>

                </div>

              </motion.div>
            )}

            {/* 2. TEACHER PORTAL VIEW */}
            {view === 'teacher' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {!user ? (
                  /* Login Prompt */
                  <div className="max-w-md mx-auto px-4 py-16 text-center">
                    <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-md space-y-6">
                      <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                        <ClipboardList className="w-8 h-8 stroke-[2]" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">تسجيل دخول المعلمين والمعلمات</h2>
                        <p className="text-xs text-slate-400 font-semibold mt-1">
                          يتطلب إنشاء الاختبارات ورصد نتائج الطلاب الدخول بحسابك التعليمي بأمان.
                        </p>
                      </div>

                      <button
                        onClick={handleGoogleLogin}
                        className="w-full py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-205 rounded-xl shadow-xs hover:shadow-sm active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer"
                      >
                        {/* Custom Google logo or simple SVG */}
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.13-4.53z"
                          />
                        </svg>
                        الدخول بواسطة حساب Google
                      </button>

                      {authError && (
                        <div className="bg-rose-950/20 text-rose-300 p-4 rounded-2xl border border-rose-500/10 text-xs text-right leading-relaxed font-semibold space-y-2">
                          <div className="flex items-center gap-2 text-rose-400">
                            <ShieldAlert className="w-5 h-5 shrink-0" />
                            <span>تنبيه بخصوص تسجيل الدخول:</span>
                          </div>
                          {authError === 'popup-blocked' ? (
                            <div className="space-y-1.5 text-slate-300 font-normal">
                              <p className="font-bold text-rose-400">تم حظر فتح نافذة تسجيل الدخول المنبثقة من قبل متصفحكم الكريم.</p>
                              <p>لتخطي هذه المشكلة والربط بنجاح مع قاعدة البيانات:</p>
                              <ol className="list-decimal list-inside space-y-1 pr-1 text-[11px] text-slate-400">
                                <li>اضغط على زر <strong>"افتح في علامة تبويب جديدة" (Open in new tab)</strong> في أعلى يمين/يسار المعاينة لتبويب مستقل تماماً.</li>
                                <li>أو يرجى تفعيل السماح بالنوافذ المنبثقة (Popups) من شريط العنوان وإعادة المحاولة.</li>
                              </ol>
                            </div>
                          ) : (
                            <p className="text-slate-300 font-normal">
                              {authError}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="bg-amber-50 text-amber-800 p-4 rounded-2xl border border-amber-100 text-xs text-right leading-relaxed font-semibold">
                        💡 تذكير قبل البدء:
                        <p className="text-[11px] text-slate-500 font-normal mt-1 leading-normal">
                          يرجى التأكد من تشغيل وتفعيل "Google Sign-In" في قسم Authentication بقيمة مشروعك في Firebase Console لضمان عمل الخدمة بشكل سليم.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Logged-In Teacher View */
                  <React.Fragment>
                    {isCreateExamOpen ? (
                      <CreateExam
                        onExamCreated={(exam) => {
                          setIsCreateExamOpen(false);
                        }}
                        onCancel={() => setIsCreateExamOpen(false)}
                      />
                    ) : (
                      <TeacherDashboard
                        onLogout={handleLogout}
                        onCreateExamClick={() => setIsCreateExamOpen(true)}
                      />
                    )}
                  </React.Fragment>
                )}
              </motion.div>
            )}

            {/* 3. STUDENT PORTAL VIEW */}
            {view === 'student' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <StudentPortal
                  initialExamCode={urlCode}
                  onBackToMain={handleBackToMain}
                />
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </main>

      {/* Universal footer */}
      {view !== 'student' && (
        <footer className="bg-white border-t border-slate-150 py-8 px-6 text-center text-xs text-slate-400 font-semibold mt-auto">
          <div className="max-w-7xl mx-auto space-y-2">
            <p>© 2026 منصة الاختبارات الذكية - كافة الحقوق محفوظة للمدارس والمعلمين.</p>
            <p className="text-slate-350">مصمم لتلبية أعلى معايير أمان التقييم والسرعة في رصد الدرجات لطلابنا وبناتنا الطالبات.</p>
          </div>
        </footer>
      )}

    </div>
  );
}
