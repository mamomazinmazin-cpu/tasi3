import React, { useState, useEffect, useRef } from 'react';
import { Exam, Submission, Question, QuestionType, GradedAnswer } from '../types';
import { db, auth } from '../firebase';
import { collection, doc, setDoc, getDocs, getDoc, query, where, updateDoc, onSnapshot } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import {
  Sparkles, FileText, User, HelpCircle, Clock, CheckCircle2, ChevronUp, ChevronDown,
  Info, AlertTriangle, ShieldCheck, ListOrdered, ClipboardCheck, Maximize, Minimize2,
  Megaphone, Bell, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StudentPortalProps {
  initialExamCode?: string;
  onBackToMain: () => void;
}

export default function StudentPortal({ initialExamCode = '', onBackToMain }: StudentPortalProps) {
  // Gatekeeper states
  const [studentName, setStudentName] = useState('');
  const [examCode, setExamCode] = useState(initialExamCode.toUpperCase());
  const [verifying, setVerifying] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [examReady, setExamReady] = useState<Exam | null>(null);

  // Active exam states
  const [hasStarted, setHasStarted] = useState(false);
  const [submissionId, setSubmissionId] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [timeLeft, setTimeLeft] = useState(0); // in seconds
  const [savingStatus, setSavingStatus] = useState<'saved' | 'saving' | 'offline'>('saved');

  // Real-time alert notifications
  const [latestAlert, setLatestAlert] = useState<any | null>(null);
  const [showAlertToast, setShowAlertToast] = useState(false);
  const sessionStartTimeRef = useRef<number>(Date.now());

  // Finish exam states
  const [completedSubmission, setCompletedSubmission] = useState<Submission | null>(null);

  // Focus and Confirmation states
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Monitor Fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!(document as any).webkitFullscreenElement || !!(document as any).mozFullScreenElement || !!(document as any).msFullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, []);

  const enterFullscreen = () => {
    try {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(err => console.warn('Fullscreen entry rejected:', err));
      } else if ((docEl as any).webkitRequestFullscreen) {
        (docEl as any).webkitRequestFullscreen();
      } else if ((docEl as any).mozRequestFullScreen) {
        (docEl as any).mozRequestFullScreen();
      } else if ((docEl as any).msRequestFullscreen) {
        (docEl as any).msRequestFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen execution error:', e);
    }
  };

  const exitFullscreen = () => {
    try {
      if (document.exitFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(err => console.warn('Fullscreen exit rejected:', err));
        }
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen exit execution error:', e);
    }
  };

  // Timers and Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number>(0);

  // Parse code from URL on load if any
  useEffect(() => {
    if (initialExamCode) {
      setExamCode(initialExamCode.toUpperCase());
    }
  }, [initialExamCode]);

  const handleResetPortal = () => {
    setStudentName('');
    setExamCode('');
    setGateError(null);
    setExamReady(null);
    setHasStarted(false);
    setSubmissionId('');
    setAnswers({});
    setTimeLeft(0);
    setCompletedSubmission(null);
    setShowSubmitConfirm(false);
    exitFullscreen();
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  // Ensure anonymous authentication on mount
  useEffect(() => {
    const ensureAuth = async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
          console.log("Student anonymously authenticated successfully");
        }
      } catch (err) {
        console.error("Failed anonymous sign-in on mount:", err);
      }
    };
    ensureAuth();
  }, []);

  // Handle countdown ticking
  useEffect(() => {
    if (!hasStarted || timeLeft <= 0) return;

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        // Automatically submit when time is up
        handleAutoSubmit();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasStarted, timeLeft]);

  // Listen to real-time teacher alerts once the exam is started
  useEffect(() => {
    if (!hasStarted || !examReady) return;

    const examDocRef = doc(db, 'exams', examReady.id);
    const unsubscribe = onSnapshot(examDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.alerts && Array.isArray(data.alerts)) {
          // Filter alerts that were published after student session started
          const freshAlerts = data.alerts.filter((alert: any) => {
            const alertTime = new Date(alert.timestamp).getTime();
            return alertTime > sessionStartTimeRef.current;
          });

          if (freshAlerts.length > 0) {
            // Get the most recent one
            const sortedFresh = freshAlerts.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            const latest = sortedFresh[0];

            setLatestAlert((prev: any) => {
              if (!prev || prev.id !== latest.id) {
                setShowAlertToast(true);
                
                // Vibrate if supported
                try {
                  if (typeof navigator.vibrate === 'function') {
                    navigator.vibrate([100, 50, 100]);
                  }
                } catch (e) {}

                return latest;
              }
              return prev;
            });
          }
        }
      }
    }, (error) => {
      console.warn("Real-time alerts snapshot listener failed:", error);
    });

    return () => unsubscribe();
  }, [hasStarted, examReady]);

  // Check and Verify Exam Entrance Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);

    const formattedName = studentName.trim();
    const formattedCode = examCode.trim().toUpperCase();

    if (!formattedName) {
      setGateError('يرجى كتابة اسمك الثلاثي');
      return;
    }
    if (formattedName.split(/\s+/).length < 2) {
      setGateError('يرجى كتابة الاسم الثلاثي كاملاً للتحقق من الهوية الدراسية');
      return;
    }
    if (formattedCode.length !== 6) {
      setGateError('رمز الاختبار يتكون من 6 خانات وحروف');
      return;
    }

    setVerifying(true);

    try {
      // 1. Query exams by code
      const examsRef = collection(db, 'exams');
      const q = query(examsRef, where('code', '==', formattedCode));
      const querySnap = await getDocs(q);

      if (querySnap.empty) {
        setGateError('رمز الاختبار غير متطابق مع أي اختبار منشور حالياً. يرجى التحقق من الرمز.');
        setVerifying(false);
        return;
      }

      const examDoc = querySnap.docs[0];
      const examData = { id: examDoc.id, ...examDoc.data() } as Exam;

      // 1.5. Validate Deadline
      if (examData.deadline) {
        const now = new Date();
        const deadlineDate = new Date(examData.deadline);
        if (now > deadlineDate) {
          setGateError('انتهت المهلة الزمنية المحددة لفتح هذا الاختبار. لم يعد بإمكانك التقدم له الآن.');
          setVerifying(false);
          return;
        }
      }

      // 2. Query if this name already has a submission
      try {
        const subsRef = collection(db, 'exams', examData.id, 'submissions');
        const qSub = query(subsRef, where('studentName', '==', formattedName), where('status', '==', 'submitted'));
        const subSnap = await getDocs(qSub);

        if (!subSnap.empty) {
          setGateError('تبين أنك قمت بتقديم هذا الاختبار سابقاً بهذا الاسم الكريم. لا يسمح النظام بتكرار تقديم الاختبار.');
          setVerifying(false);
          return;
        }
      } catch (subErr) {
        console.warn('Gracefully bypassed duplicate name check:', subErr);
      }

      setExamReady(examData);
    } catch (err) {
      console.error(err);
      setGateError('فشل الدخول: الرجاء التحقق من اتصالك بالشبكة والعد مجدداً.');
    } finally {
      setVerifying(false);
    }
  };

  // Start exam officially
  const handleStartExam = async () => {
    if (!examReady) return;

    // Double check deadline before start
    if (examReady.deadline) {
      const now = new Date();
      const deadlineDate = new Date(examReady.deadline);
      if (now > deadlineDate) {
        setGateError('عذراً، انقضى الوقت النهائي المحدد لبدء الاختبار (Deadline). لا يمكنك الدخول الآن.');
        setExamReady(null);
        return;
      }
    }

    setVerifying(true);

    try {
      // 1. Authenticate student anonymously if they are not already logged in
      let studentUid = auth.currentUser?.uid;
      if (!studentUid) {
        const userCred = await signInAnonymously(auth);
        studentUid = userCred.user.uid;
      }

      const newSubmissionId = 'sub_' + studentUid + '_' + Date.now();
      const startTime = new Date().toISOString();
      endTimeRef.current = Date.now() + examReady.duration * 60 * 1000;

      // Initial answers template
      const initialAnswers: Record<string, string | string[]> = {};
      examReady.questions.forEach((q) => {
        if (q.type === QuestionType.ORDER_ELEMENTS) {
          // Store original shuffled list of items as the starting order
          initialAnswers[q.id] = q.options ? [...q.options] : [];
        } else {
          initialAnswers[q.id] = '';
        }
      });

      // 2. Write initial started submission to Firestore
      const subDocRef = doc(db, 'exams', examReady.id, 'submissions', newSubmissionId);
      const subData: Submission = {
        id: newSubmissionId,
        studentName: studentName.trim(),
        startedAt: startTime,
        submittedAt: '',
        answers: initialAnswers,
        score: 0,
        totalScorePossible: examReady.totalMarks,
        gradedAnswers: {},
        status: 'started',
        uid: studentUid,
      };

      await setDoc(subDocRef, subData);

      setSubmissionId(newSubmissionId);
      setAnswers(initialAnswers);
      setTimeLeft(examReady.duration * 60);
      setSubmissionId(newSubmissionId);
      sessionStartTimeRef.current = Date.now();
      setHasStarted(true);

      // Trigger automatic full-screen mode for security and absolute focus
      enterFullscreen();

      // Save to localStorage as a local safety backup
      localStorage.setItem(`exam_temp_${examReady.id}`, JSON.stringify({
        id: newSubmissionId,
        answers: initialAnswers,
        endTime: endTimeRef.current,
        studentName: studentName.trim()
      }));

    } catch (err) {
      console.error(err);
      alert('فشل في تهيئة جلسة الاختبار. يرجى تفعيل تسجيل الدخول المجهول (Anonymous Auth) في إعدادات لوحة التحكم لـ Firebase.');
    } finally {
      setVerifying(false);
    }
  };

  // Auto-Save background updates
  const handleAnswerChange = (questionId: string, value: string | string[]) => {
    if (hasStarted && timeLeft <= 0) {
      console.warn('Cannot change answers after exam duration has expired!');
      return;
    }
    const updatedAnswers = { ...answers, [questionId]: value };
    setAnswers(updatedAnswers);
    setSavingStatus('saving');

    // Save locally
    if (examReady) {
      localStorage.setItem(`exam_temp_${examReady.id}`, JSON.stringify({
        id: submissionId,
        answers: updatedAnswers,
        endTime: endTimeRef.current,
        studentName
      }));
    }

    // Debounce state to Firestore
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!examReady || !submissionId) return;

      try {
        const subDocRef = doc(db, 'exams', examReady.id, 'submissions', submissionId);
        await updateDoc(subDocRef, { answers: updatedAnswers });
        setSavingStatus('saved');
      } catch (error) {
        console.error('Autosave failed:', error);
        setSavingStatus('offline');
      }
    }, 1500);
  };

  // Draggable Ordering actions
  const handleOrderShift = (questionId: string, itemIndex: number, direction: 'up' | 'down') => {
    if (hasStarted && timeLeft <= 0) return;
    const currentOrder = [...(answers[questionId] as string[])];
    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;

    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;

    // Swap
    const temp = currentOrder[itemIndex];
    currentOrder[itemIndex] = currentOrder[targetIndex];
    currentOrder[targetIndex] = temp;

    handleAnswerChange(questionId, currentOrder);
  };

  // Calculate grading details for objective items
  const gradeSubmission = (exam: Exam, studentAns: Record<string, string | string[]>): { score: number; graded: Record<string, GradedAnswer> } => {
    let finalScore = 0;
    const graded: Record<string, GradedAnswer> = {};

    exam.questions.forEach((q) => {
      const studentValue = studentAns[q.id];

      if (q.type === QuestionType.MULTIPLE_CHOICE) {
        const isCorrect = studentValue === q.correctAnswer;
        const pts = isCorrect ? q.marks : 0;
        finalScore += pts;
        graded[q.id] = { isCorrect, score: pts, feedback: isCorrect ? 'إجابة صحيحة تلقائياً' : 'إجابة خاطئة تلقائياً' };
      } else if (q.type === QuestionType.TRUE_FALSE) {
        const isCorrect = studentValue === q.correctAnswer;
        const pts = isCorrect ? q.marks : 0;
        finalScore += pts;
        graded[q.id] = { isCorrect, score: pts, feedback: isCorrect ? 'حل صح!' : 'حل غير دقيق' };
      } else if (q.type === QuestionType.SHORT_ANSWER) {
        // String cleanup for short answer
        const cleanStudentAns = String(studentValue || '').trim().toLowerCase();
        const cleanCorrectAns = String(q.correctAnswer || '').trim().toLowerCase();
        const isCorrect = cleanStudentAns === cleanCorrectAns;
        const pts = isCorrect ? q.marks : 0;
        finalScore += pts;
        graded[q.id] = { isCorrect, score: pts, feedback: isCorrect ? 'إجابة نموذجية مطابقة' : 'إجابة نموذجية غير متطابقة' };
      } else if (q.type === QuestionType.ORDER_ELEMENTS) {
        // Evaluate ordering: if the student answers list order array matches options in the exam in sequential order (or correctAnswer if coded)
        const studentArray = Array.isArray(studentValue) ? studentValue : [];
        const correctSequence = q.options ? [...q.options] : []; // Predefined correct sequence
        
        let matches = true;
        for (let i = 0; i < correctSequence.length; i++) {
          if (studentArray[i] !== correctSequence[i]) {
            matches = false;
            break;
          }
        }
        
        const pts = matches ? q.marks : 0;
        finalScore += pts;
        graded[q.id] = { isCorrect: matches, score: pts, feedback: matches ? 'ترتيب سليم مائة بالمائة' : 'الترتيب غير مكتمل وصحيح' };
      } else {
        // Subjective: wait for teacher review. Initialized with 0 score
        graded[q.id] = {
          isCorrect: false,
          score: 0,
          feedback: 'بانتظار تصحيح ورصد الدرجات من قبل معلّمك.'
        };
      }
    });

    return { score: finalScore, graded };
  };

  // Core submission trigger
  const performFinalSubmit = async (finalAnswers: Record<string, string | string[]>) => {
    if (!examReady || !submissionId) return;

    try {
      // 1. Grade objective questions on client side
      const { score, graded } = gradeSubmission(examReady, finalAnswers);
      const submitTime = new Date().toISOString();

      // 2. Save submission to Firestore with 'submitted' status
      const subDocRef = doc(db, 'exams', examReady.id, 'submissions', submissionId);
      const updatedSubmission: Submission = {
        id: submissionId,
        studentName,
        startedAt: new Date(endTimeRef.current - examReady.duration * 60 * 1000).toISOString(),
        submittedAt: submitTime,
        answers: finalAnswers,
        score,
        totalScorePossible: examReady.totalMarks,
        gradedAnswers: graded,
        status: 'submitted',
        uid: auth.currentUser?.uid || '',
      };

      await setDoc(subDocRef, updatedSubmission);

      // Clear timers
      if (timerRef.current) clearInterval(timerRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      // Evict local storage backup
      localStorage.removeItem(`exam_temp_${examReady.id}`);

      setCompletedSubmission(updatedSubmission);
    } catch (err) {
      console.error(err);
      alert('عذراً فشل الاتصال بالخادم لإتمام لإرسال الإجابات. لا تقلق، إجاباتك محفوظة تلقائياً ومخزنة في المتصفح. تواصل مع المعلم.');
    }
  };

  const handleManualSubmit = () => {
    if (timeLeft <= 0) {
      alert('انتهى الوقت المحدد للاختبار ولا تتوفر إمكانية الإرسال اليدوي مجدداً. تم تقديم إجابتك تلقائياً.');
      return;
    }
    setShowSubmitConfirm(true);
  };

  const handleAutoSubmit = () => {
    // Automatically submit when time is up without blocking browser prompts
    performFinalSubmit(answers);
  };

  // Render Time String
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  const isTimeLow = timeLeft < 180 && timeLeft > 0; // Less than 3 minutes

  // Completed Screen View
  if (completedSubmission && examReady) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center" dir="rtl">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-6"
        >
          <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <ClipboardCheck className="w-10 h-10 stroke-[2]" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-800">نشكر التزامك الدراسي، تم تسليم الاختبار!</h1>
            <p className="text-slate-500 text-sm mt-2">
              عزيزي <span className="font-bold text-slate-700">{studentName}</span>، تم حفظ وتسليم ورقتك الامتحانية بنجاح على قاعدة البيانات.
            </p>
          </div>

          {/* Result Card summary */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center text-sm border-b border-slate-200/50 pb-3">
              <span className="text-slate-500 font-semibold">اسم المادة:</span>
              <span className="font-bold text-slate-800">{examReady.subject}</span>
            </div>

            <div className="flex justify-between items-center text-sm border-b border-slate-200/50 pb-3">
              <span className="text-slate-500 font-semibold">المعلم الفاضل:</span>
              <span className="font-bold text-slate-800">{examReady.teacherName}</span>
            </div>

            <div className="flex justify-between items-center text-sm border-b border-slate-200/50 pb-3">
              <span className="text-slate-500 font-semibold">تاريخ ووقت التسليم:</span>
              <span className="font-bold text-slate-800 font-mono text-xs">
                {new Date(completedSubmission.submittedAt).toLocaleString('ar-EG')}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-semibold">رصد الدرجة التلقائية (الأسئلة الموضوعية):</span>
              <span className="font-bold text-indigo-650 font-mono text-md">
                {completedSubmission.score} <span className="text-xs text-slate-400">/ {examReady.totalMarks} (درجة مرصودة)</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 justify-center bg-slate-50 rounded-xl p-3">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              الأسئلة المقالية (سرد، عدد، تفسير، إلخ) يعكف معلمك على قراءتها وتصحيحها الآن. سيتم كشف النتيجة النهائية فور اعتمادها من قبل المدرسة.
            </span>
          </div>

          <button
            onClick={handleResetPortal}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-755 text-white rounded-xl text-sm font-bold shadow-md transition-all active:scale-95 cursor-pointer"
          >
            الانتقال لتقديم اختبار آخر أو تسجيل خروج
          </button>
        </motion.div>
      </div>
    );
  }

  // Active Exam view
  if (hasStarted && examReady) {
    const totalQuestions = examReady.questions.length;
    const answeredCount = examReady.questions.filter(q => {
      const ans = answers[q.id];
      if (ans === undefined || ans === '') return false;
      if (Array.isArray(ans) && ans.length === 0) return false;
      return true;
    }).length;
    const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

    return (
      <div id="exam-workspace" className="max-w-4xl mx-auto px-4 py-8 relative" dir="rtl">
        
        {/* Real-time Teacher Alert Toast */}
        <AnimatePresence>
          {showAlertToast && latestAlert && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-6 left-4 right-4 md:left-auto md:right-6 md:w-[400px] z-[9999] bg-gradient-to-r from-rose-600 to-red-700 text-white rounded-2xl shadow-2xl p-5 border border-rose-500/30 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-rose-200 shrink-0 animate-bounce" />
                  <span className="font-extrabold text-sm">تنبيه فوري من معلّمك!</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAlertToast(false)}
                  className="text-white/80 hover:text-white bg-white/10 p-1 rounded-lg transition"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
              
              <div className="bg-white/10 rounded-xl p-3 text-xs font-semibold leading-relaxed text-right border border-white/10 whitespace-pre-wrap">
                {latestAlert.message}
              </div>

              <div className="flex items-center justify-between text-[10px] text-rose-250 mt-1">
                <span>تاريخ التنبيه: {new Date(latestAlert.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="bg-white/20 px-2.5 py-0.5 rounded-full font-bold">بث حي مباشر</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fullscreen Guard Alert Banner */}
        {!isFullscreen && (
          <div className="bg-rose-55 border border-rose-200 text-rose-800 p-4 rounded-2xl mb-6 text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>تنبيه هام: تم الخروج من وضع ملء الشاشة! يرجى إعادة تفعيله فوراً للتركيز على الامتحان ومنع أي مقاطعة.</span>
            </div>
            <button
              type="button"
              onClick={enterFullscreen}
              className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Maximize className="w-4 h-4" />
              <span>إعادة ملء الشاشة</span>
            </button>
          </div>
        )}

        {/* Floating Timer & Status & Progress */}
        <div className={`sticky top-0 z-45 bg-white/95 backdrop-blur-md rounded-2xl shadow-md border ${
          timeLeft <= 0 ? 'border-rose-200 bg-rose-50/95' : isTimeLow ? 'border-amber-200 bg-amber-55/95' : 'border-slate-100'
        } p-4 mb-6 flex flex-col gap-3 transition-all duration-305`}>
          <div className="flex items-center justify-between w-full">
            <div>
              <h2 className="font-extrabold text-slate-800 text-sm md:text-md leading-tight">{examReady.subject}</h2>
              <p className="text-xs text-slate-400 mt-0.5 font-semibold">الطالب المتقدم: {studentName}</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Status indicators */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  timeLeft <= 0 ? 'bg-rose-500' : savingStatus === 'saved' ? 'bg-emerald-500' : savingStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
                }`} />
                <span className="text-slate-400">
                  {timeLeft <= 0 ? 'انتهت مهلة الاختبار' : savingStatus === 'saved' ? 'تم حفظ إجاباتك حياً بالخادم' : 'جاري حفظ الإجابات تلقائياً...'}
                </span>
              </div>

              {/* Countdown timer */}
              <div className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold font-mono transition-all duration-300 ${
                timeLeft <= 0 ? 'bg-rose-650 text-white border border-rose-700' : isTimeLow ? 'bg-rose-100 text-rose-700 animate-pulse border border-rose-200' : 'bg-slate-100 text-slate-700'
              }`}>
                <Clock className="w-4 h-4 text-current" />
                <span>{formatTime(timeLeft)}</span>
              </div>
            </div>
          </div>

          {/* Real-time answers progress indicator */}
          <div className="border-t border-slate-100 pt-2 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs font-bold text-slate-500">
              <span className="flex items-center gap-1">
                <span>إنجاز الأسئلة:</span>
                <span className="text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-md font-mono">{answeredCount} من {totalQuestions} أسئلة</span>
              </span>
              <span className="font-mono text-indigo-700">%{progressPercent} مكتمل</span>
            </div>
            
            {/* Smooth bar indicator */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-indigo-600 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-700"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        </div>

        {/* Warning Toast about near Timeup or Timeout block */}
        {timeLeft <= 0 ? (
          <div className="bg-rose-100 border border-rose-350 text-rose-900 p-4 rounded-xl mb-6 text-xs flex items-center gap-2.5 animate-pulse">
            <Clock className="w-5 h-5 shrink-0 text-rose-750" />
            <div className="text-right">
              <span className="font-black block text-sm">تنبيه حرج بالانتهاء: انتهى الوقت الكلي للاختبار!</span>
              <span className="font-medium mt-0.5 block text-slate-700">لقد أغلق النظام إمكانية تغيير أو إضافة إجابات جديدة وتم حفظ كراستك وإرسالها تلقائياً للمعلم.</span>
            </div>
          </div>
        ) : isTimeLow ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl mb-6 text-xs flex items-center gap-2 animate-bounce">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span className="font-semibold">تنبيه: اقترب الوقت المحدد للاختبار على الانتهاء! يرجى سرعة استكمال الإجابات والنقر على زر تسليم.</span>
          </div>
        ) : null}

        {/* Exam Cards Questions list */}
        <div className="space-y-6">
          {examReady.questions.map((q, index) => {
            const currentAns = answers[q.id];

            return (
              <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
                <div className="flex items-start gap-2.5">
                  <span className="bg-teal-50 text-teal-700 w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center pt-0.5 shrink-0 select-none">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-800 text-md leading-relaxed">{q.text}</h3>
                    <span className="text-xs text-slate-400 font-bold mt-1 block">درجة السؤال: {q.marks} درجات</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-50/50">
                  {/* MULTIPLE CHOICE layout */}
                  {q.type === QuestionType.MULTIPLE_CHOICE && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {q.options?.map((opt, oIdx) => (
                        <button
                          key={oIdx}
                          type="button"
                          disabled={timeLeft <= 0}
                          onClick={() => handleAnswerChange(q.id, opt)}
                          className={`w-full p-3 rounded-xl text-right text-sm font-bold border transition-all ${
                            currentAns === opt
                              ? 'bg-teal-50/20 border-teal-500 text-teal-850 shadow-xs'
                              : timeLeft <= 0
                                ? 'bg-slate-150 border-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                                : 'bg-slate-50/50 hover:bg-slate-50 border-slate-150 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <span className="font-mono text-slate-350 ml-1.5">{['أ', 'ب', 'ج', 'د', 'هـ'][oIdx]}.</span>
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* TRUE FALSE layout */}
                  {q.type === QuestionType.TRUE_FALSE && (
                    <div className="flex gap-3">
                      {['صح', 'خطأ'].map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={timeLeft <= 0}
                          onClick={() => handleAnswerChange(q.id, val)}
                          className={`flex-1 py-12 rounded-2xl text-center text-lg font-bold border-2 transition-all ${
                            currentAns === val
                              ? 'bg-emerald-50/10 border-emerald-500 text-emerald-800 shadow-sm'
                              : timeLeft <= 0
                                ? 'bg-slate-150 border-slate-200 text-slate-450 cursor-not-allowed opacity-50'
                                : 'bg-slate-50/50 hover:bg-slate-50 border-slate-150 text-slate-500 hover:border-slate-200'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ORDER ELEMENTS layout (custom sorting logic) */}
                  {q.type === QuestionType.ORDER_ELEMENTS && (
                    <div className="space-y-2">
                      <span className="block text-xs font-semibold text-slate-400 mb-2">استخدم أزرار الأسهم لإعادة ترتيب العناصر ترتيباً سليماً:</span>
                      {Array.isArray(currentAns) && currentAns.map((item, itemIdx) => (
                        <div
                          key={itemIdx}
                          className="flex items-center justify-between p-3 bg-slate-50 border border-slate-150 rounded-xl"
                        >
                          <div className="flex items-center gap-3">
                            <span className="bg-emerald-50 text-emerald-700 w-5 h-5 rounded font-bold text-xs flex items-center justify-center font-mono">
                              {itemIdx + 1}
                            </span>
                            <span className="text-sm font-bold text-slate-800">{item}</span>
                          </div>

                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleOrderShift(q.id, itemIdx, 'up')}
                              disabled={itemIdx === 0 || timeLeft <= 0}
                              className="p-1 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-20 rounded-md transition-all text-xs cursor-pointer"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOrderShift(q.id, itemIdx, 'down')}
                              disabled={itemIdx === currentAns.length - 1 || timeLeft <= 0}
                              className="p-1 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-20 rounded-md transition-all text-xs cursor-pointer"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SHORT TEXT layout */}
                  {q.type === QuestionType.SHORT_ANSWER && (
                    <input
                      type="text"
                      disabled={timeLeft <= 0}
                      placeholder={timeLeft <= 0 ? 'انتهت المهلة، لا يمكنك تعديل الإجابة.' : 'اكتب الإجابة القصيرة المناسبة هنا...'}
                      value={(currentAns as string) || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none transition-all text-sm ${
                        timeLeft <= 0
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'border-slate-200 focus:ring-1 focus:ring-teal-500 bg-slate-50/50 text-slate-800'
                      }`}
                    />
                  )}

                  {/* SUBJECTIVE TEXT layouts (explain, interpret, justify, lists, essays) */}
                  {(q.type === QuestionType.EXPLAIN ||
                    q.type === QuestionType.INTERPRET ||
                    q.type === QuestionType.JUSTIFY ||
                    q.type === QuestionType.LIST_ELEMENTS ||
                    q.type === QuestionType.ESSAY) && (
                    <textarea
                      rows={q.type === QuestionType.ESSAY ? 6 : 4}
                      disabled={timeLeft <= 0}
                      placeholder={
                        timeLeft <= 0 ? 'انتهى الوقت المحدد للاختبار ولا تتوفر إمكانية الإضافة.' :
                        q.type === QuestionType.EXPLAIN ? 'اكتب الشرح والتفسير التفصيلي هنا...' :
                        q.type === QuestionType.INTERPRET ? 'اكتب تفسيرك السليم لهذه المعلمات...' :
                        q.type === QuestionType.JUSTIFY ? 'علل، اكتب مسببات وعلة الطرح هنا الدراسية...' :
                        q.type === QuestionType.LIST_ELEMENTS ? 'يرجى كتابة العناصر والعدد بالتفصيل...' :
                        'اكتب إجابتك المقالية الوافية والشاملة لهذا السؤال...'
                      }
                      value={(currentAns as string) || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      className={`w-full p-4 rounded-2xl border focus:outline-none transition-all text-sm leading-relaxed font-medium ${
                        timeLeft <= 0
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'border-slate-200 focus:ring-2 focus:ring-indigo-650/10 focus:border-indigo-600 bg-slate-50/50 text-slate-800'
                      }`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submission CTA bar */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 mt-8 shadow-sm flex-col md:flex-row gap-4">
          <div className="text-center md:text-right">
            <span className="text-xs text-slate-400 font-bold block">تسليم ورقة الاختبار:</span>
            <span className="font-bold text-sm text-slate-700">لقد أنجزت {answeredCount} من {totalQuestions} من الأسئلة. تيقن من جودة حلولك قبل تقديم الإجابة كلياً.</span>
          </div>

          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={timeLeft <= 0}
            className={`w-full md:w-auto px-10 py-3.5 rounded-2xl text-md font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
              timeLeft <= 0
                ? 'bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed opacity-50'
                : 'bg-indigo-600 hover:bg-indigo-750 text-white shadow-indigo-100 active:scale-95 cursor-pointer'
            }`}
          >
            تسليم وإرسال الإجابات كلياً
            <ShieldCheck className="w-5 h-5" />
          </button>
        </div>

        {/* Custom Confirmation Modal */}
        <AnimatePresence>
          {showSubmitConfirm && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 space-y-5 shadow-2xl relative overflow-hidden"
              >
                {/* Accent line */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-600" />

                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                    <AlertTriangle className="w-6 h-6 stroke-[2]" />
                  </div>
                  <h3 className="font-extrabold text-slate-800 text-md">تأكيد تسليم كراسة الإجابة</h3>
                  <p className="text-slate-500 text-xs font-semibold leading-relaxed">
                    يرجى مراجعة حالة الأسئلة المنجزة قبل تأكيد الإرسال النهائي لدرجاتك ورصدها.
                  </p>
                </div>

                {/* Stat summary */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 font-semibold">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">العدد الكلي للأسئلة:</span>
                    <span className="font-bold text-slate-800 font-mono">{totalQuestions} أسئلة</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">الأسئلة التي قمت بحلها:</span>
                    <span className="font-bold text-emerald-600 font-mono">{answeredCount} سؤالاً</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">الأسئلة الفارغة (دون إجابة):</span>
                    <span className={`font-bold font-mono ${
                      totalQuestions - answeredCount > 0 ? 'text-rose-500 animate-pulse font-extrabold' : 'text-emerald-700'
                    }`}>
                      {totalQuestions - answeredCount} أسئلة
                    </span>
                  </div>
                </div>

                {/* Helpful alerts according to solved count */}
                {totalQuestions - answeredCount > 0 ? (
                  <div className="bg-rose-50 border border-rose-105 text-rose-900 p-3 rounded-xl text-[11px] font-semibold leading-relaxed">
                    ⚠️ انتبه! تبقى لديك <strong>{totalQuestions - answeredCount} أسئلة دون إجابة</strong>. ننصحك بإغلاق هذه النافذة وإنهاء حلها قبل الضغط على تأكيد التسليم.
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-105 text-emerald-900 p-3 rounded-xl text-[11px] font-semibold leading-relaxed">
                    🎉 رائع جداً! قمت بالإجابة على كامل الأسئلة. خطوة ممتازة لضمان نيل أعلى الدرجات.
                  </div>
                )}

                <p className="text-center text-[10px] text-slate-400 font-bold leading-normal">
                  بمجرد تأكيد الإرسال لن يسمح لك النظام بالعودة أو فتح هذا الاختبار مجدداً.
                </p>

                {/* Trigger Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(false)}
                    className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                  >
                    إلغاء والرجوع للمراجعة
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSubmitConfirm(false);
                      performFinalSubmit(answers);
                    }}
                    className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-all active:scale-95 cursor-pointer"
                  >
                    نعم، متأكد وأريد التسليم
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    );
  }

  // Gateway screen: student types their full Name and exam Code
  return (
    <div className="max-w-xl mx-auto px-4 py-12" dir="rtl">
      {!examReady ? (
        /* Code authentication screen */
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-6"
        >
          <div className="text-center">
            <span className="bg-indigo-50 text-indigo-700 font-extrabold text-xs px-3 py-1.5 rounded-full uppercase leading-none shadow-sm shadow-indigo-550/5">
              بوابة الطلاب الذكية
            </span>
            <h1 className="text-2xl font-black text-slate-800 mt-3">الدخول لمنصة الاختبارات</h1>
            <p className="text-sm text-slate-500 mt-1.5 font-medium leading-relaxed">
              يرجى إدخال اسمك الثلاثي بالكامل مع الرمز المرفق لبدء تقديم ورقة إجابتك الامتحانية.
            </p>
          </div>

          <form onSubmit={handleVerifyCode} className="space-y-4">
            {gateError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-rose-50 border border-rose-150 text-rose-700 p-3.5 rounded-xl text-xs font-semibold leading-relaxed"
              >
                {gateError}
              </motion.div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">الاسم الثلاثي للطالب</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد عبد الله الغامدي"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 text-sm animate-none"
                />
                <User className="absolute right-3 top-3.5 text-slate-400 w-4.5 h-4.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">رمز الاختبار (Code)</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="مثال: X7Z9W2"
                  value={examCode}
                  onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 text-center font-mono text-lg tracking-widest"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={verifying}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-500/10 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              {verifying ? 'جاري التحقق من كود الاختبار والاسم...' : 'التحقق والدخول للمعلومات'}
            </button>
          </form>

          {/* Strictly restricted student view - No landing access */}
        </motion.div>
      ) : (
        /* Exam readiness and startup summary screen */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm space-y-6"
        >
          <div className="text-center">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-xs font-bold text-slate-400">الاختبار جاهز الآن للبدء</span>
            <h1 className="text-xl font-bold text-slate-800 mt-1">{examReady.subject}</h1>
            <p className="text-xs text-slate-400 mt-0.5">رمز الدخول: <span className="font-mono font-bold uppercase">{examReady.code}</span></p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100/60 space-y-3.5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-semibold">المعلم الفاضل:</span>
              <span className="font-bold text-slate-800">{examReady.teacherName}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-semibold">مدة الامتحان:</span>
              <span className="font-bold text-slate-800 font-mono">{examReady.duration} دقيقة</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-semibold">عدد الأسئلة:</span>
              <span className="font-bold text-slate-800 font-mono">{examReady.questions.length} سؤالاً</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-semibold">إجمالي الدرجات:</span>
              <span className="font-bold text-indigo-600 font-mono">{examReady.totalMarks} درجة</span>
            </div>
            {examReady.deadline && (
              <div className="flex justify-between items-center text-sm border-t border-slate-200/60 pt-3 text-rose-600">
                <span className="font-semibold flex items-center gap-1">
                  <Clock className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>موعد إغلاق الامتحان :</span>
                </span>
                <span className="font-bold">
                  {new Date(examReady.deadline).toLocaleString('ar-EG', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-amber-600" />
            <span>
              يرجى العلم بأنه بمجرد الضغط على زر البدء، سيبدأ المؤقت الزمني في التنازل مباشرة. يجب تسليم الإجابات قبل انتهاء المهلة لعدم فقدان الدرجة.
            </span>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleStartExam}
              disabled={verifying}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-500/10 active:scale-95 transition-all cursor-pointer"
            >
              {verifying ? 'جاري التحضير...' : 'ابدأ تقديم الاختبار الآن'}
            </button>
            <button
              onClick={() => setExamReady(null)}
              className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              تغيير الرمز / الاسم
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
