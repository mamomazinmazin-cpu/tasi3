import React, { useState, useEffect } from 'react';
import { Exam, Submission, QuestionType, GradedAnswer } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import {
  BookOpen, Users, Calendar, Award, TrendingUp, ChevronLeft, Trash2, Copy, Check,
  Share2, ArrowUpDown, Filter, BarChart as ChartIcon, FileText, CheckCircle2, XCircle, Clock, AlertTriangle, LogOut,
  Star, Download, Printer, Bell, Megaphone
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface TeacherDashboardProps {
  onLogout: () => void;
  onCreateExamClick: () => void;
}

export default function TeacherDashboard({ onLogout, onCreateExamClick }: TeacherDashboardProps) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  
  // Sorting state for submissions
  const [sortBy, setSortBy] = useState<'name' | 'score' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Manual grading inputs
  const [manualMarks, setManualMarks] = useState<Record<string, number>>({});
  const [manualFeedback, setManualFeedback] = useState<Record<string, string>>({});
  const [savingGrade, setSavingGrade] = useState(false);

  // Real-time alerts state
  const [alertText, setAlertText] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);
  const [alertSuccess, setAlertSuccess] = useState(false);

  // Custom confirmation states to replace window.confirm inside iframe
  const [examToDelete, setExamToDelete] = useState<string | null>(null);
  const [alertToDelete, setAlertToDelete] = useState<string | null>(null);

  const teacher = auth.currentUser;

  // Retrieve current web app url, mapping dev origin to public pre-production origin so shared links are accessible to students on other devices
  const getPublicAppUrl = () => {
    let origin = window.location.origin;
    // Replace '-dev-' with '-pre-' for sharing in AI Studio environments
    if (origin.includes('-dev-')) {
      origin = origin.replace('-dev-', '-pre-');
    }
    // Remove trailing slash if present in pathname, and combine
    const pathname = window.location.pathname;
    return origin + pathname;
  };
  const appUrl = getPublicAppUrl();

  useEffect(() => {
    if (!teacher) return;

    // Load Exams
    const examsRef = collection(db, 'exams');
    const qExams = query(examsRef, where('createdBy', '==', teacher.uid));
    
    const unsubscribeExams = onSnapshot(
      qExams,
      (snapshot) => {
        const examsList: Exam[] = [];
        snapshot.forEach((doc) => {
          examsList.push({ id: doc.id, ...doc.data() } as Exam);
        });
        setExams(examsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'exams');
        setLoading(false);
      }
    );

    return () => unsubscribeExams();
  }, [teacher]);

  // Load Submissions when an exam is selected
  useEffect(() => {
    if (!selectedExam) {
      setSubmissions([]);
      return;
    }

    const subsRef = collection(db, 'exams', selectedExam.id, 'submissions');
    const unsubscribeSubs = onSnapshot(
      subsRef,
      (snapshot) => {
        const subsList: Submission[] = [];
        snapshot.forEach((doc) => {
          subsList.push({ id: doc.id, ...doc.data() } as Submission);
        });
        setSubmissions(subsList);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `exams/${selectedExam.id}/submissions`);
      }
    );

    return () => unsubscribeSubs();
  }, [selectedExam]);

  // Statistics calculation
  const totalExamsCreated = exams.length;
  const overallApplicantsCount = submissions.length;

  const currentExamStats = (() => {
    if (submissions.length === 0) return {
      count: 0,
      average: 0,
      highest: 0,
      lowest: 0,
      successRate: 0,
    };

    const submittedOnly = submissions.filter(s => s.status === 'submitted');
    if (submittedOnly.length === 0) return {
      count: submissions.length,
      average: 0,
      highest: 0,
      lowest: 0,
      successRate: 0,
    };

    const scores = submittedOnly.map((s) => s.score);
    const sum = scores.reduce((a, b) => a + b, 0);
    const count = submittedOnly.length;
    
    const average = Math.round((sum / count) * 10) / 10;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    
    // Passing criteria: Score is >= 50% of the exam's totalMarks
    const totalPoints = selectedExam?.totalMarks || 100;
    const successfulCount = submittedOnly.filter((s) => s.score >= totalPoints / 2).length;
    const successRate = Math.round((successfulCount / count) * 100);

    return {
      count: submissions.length,
      average,
      highest,
      lowest,
      successRate,
    };
  })();

  // Render analytics data for Recharts
  const barChartData = (() => {
    if (submissions.length === 0 || !selectedExam) return [];
    
    const totalPoints = selectedExam.totalMarks;
    // Bins: Excellent (90%+), V.Good (75-89%), Good (60-74%), Pass (50-59%), Fail (0-49%)
    const bins = [
      { name: 'ممتاز (90%+)', count: 0 },
      { name: 'جيد جداً (75-89%)', count: 0 },
      { name: 'جيد (60-74%)', count: 0 },
      { name: 'مقبول (50-59%)', count: 0 },
      { name: 'راسب (<50%)', count: 0 },
    ];

    submissions.filter(s => s.status === 'submitted').forEach((sub) => {
      const pct = (sub.score / totalPoints) * 100;
      if (pct >= 90) bins[0].count++;
      else if (pct >= 75) bins[1].count++;
      else if (pct >= 60) bins[2].count++;
      else if (pct >= 50) bins[3].count++;
      else bins[4].count++;
    });

    return bins;
  })();

  const pieChartData = [
    { name: 'ناجح (>=50%)', value: currentExamStats.successRate },
    { name: 'غير مجتاز (<50%)', value: Math.max(0, 100 - currentExamStats.successRate) },
  ];

  const PIE_COLORS = ['#10b981', '#f43f5e'];

  const handleDeleteExam = (examId: string) => {
    setExamToDelete(examId);
  };

  const confirmDeleteExam = async () => {
    if (!examToDelete) return;

    try {
      await deleteDoc(doc(db, 'exams', examToDelete));
      if (selectedExam?.id === examToDelete) {
        setSelectedExam(null);
      }
      setExamToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `exams/${examToDelete}`);
    }
  };

  const handleCopyLink = (code: string) => {
    const link = `${appUrl}?code=${code}`;
    const showSuccess = () => {
      setCopySuccess(code);
      setTimeout(() => setCopySuccess(null), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link)
        .then(showSuccess)
        .catch((err) => {
          console.warn('Clipboard API failed, trying fallback:', err);
          fallbackCopyText(link, showSuccess);
        });
    } else {
      fallbackCopyText(link, showSuccess);
    }
  };

  const fallbackCopyText = (text: string, onSuccess: () => void) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        onSuccess();
      } else {
        prompt("يرجى نسخ الرابط التالي يدوياً:", text);
      }
    } catch (err) {
      console.error('Fallback copy method failed:', err);
      prompt("يرجى نسخ الرابط التالي يدوياً:", text);
    }
  };

  const handleToggleFavorite = async (examId: string, currentStatus?: boolean) => {
    try {
      const examRef = doc(db, 'exams', examId);
      await updateDoc(examRef, {
        isFavorite: !currentStatus
      });
      if (selectedExam?.id === examId) {
        setSelectedExam({ ...selectedExam, isFavorite: !currentStatus });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `exams/${examId}`);
    }
  };

  const handleSendAlert = async () => {
    if (!selectedExam || !alertText.trim()) return;
    setSendingAlert(true);
    setAlertSuccess(false);

    try {
      const freshAlert = {
        id: 'alert_' + Date.now(),
        message: alertText.trim(),
        timestamp: new Date().toISOString()
      };

      const examRef = doc(db, 'exams', selectedExam.id);
      const currentAlerts = selectedExam.alerts || [];
      const updatedAlerts = [...currentAlerts, freshAlert];

      await updateDoc(examRef, {
        alerts: updatedAlerts
      });

      setSelectedExam({
        ...selectedExam,
        alerts: updatedAlerts
      });

      setAlertText('');
      setAlertSuccess(true);
      setTimeout(() => setAlertSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      // Quiet fail to avoid iframe popup blockage
    } finally {
      setSendingAlert(false);
    }
  };

  const handleDeleteAlert = (alertId: string) => {
    setAlertToDelete(alertId);
  };

  const confirmDeleteAlert = async () => {
    if (!alertToDelete || !selectedExam) return;

    try {
      const examRef = doc(db, 'exams', selectedExam.id);
      const updatedAlerts = (selectedExam.alerts || []).filter((a: any) => a.id !== alertToDelete);

      await updateDoc(examRef, {
        alerts: updatedAlerts
      });

      setSelectedExam({
        ...selectedExam,
        alerts: updatedAlerts
      });
      setAlertToDelete(null);
    } catch (err) {
      console.error("فشل في حذف التنبيه:", err);
    }
  };

  const handleExportCSV = () => {
    if (!selectedExam || submissions.length === 0) return;
    
    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "اسم الطالب,الحالة,تاريخ التسليم,الدرجة المحصلة,الدرجة النهائية,النسبة المئوية\n";
    
    submissions.forEach((sub) => {
      const formattedDate = sub.submittedAt 
        ? new Date(sub.submittedAt).toLocaleString('ar-EG').replace(/,/g, ' ') 
        : new Date(sub.startedAt).toLocaleString('ar-EG').replace(/,/g, ' ');
      const statusText = sub.status === 'submitted' ? 'تم التسليم' : 'جاري الحل';
      const pct = Math.round((sub.score / selectedExam.totalMarks) * 100);
      const escapedName = `"${sub.studentName.replace(/"/g, '""')}"`;
      
      csvContent += `${escapedName},${statusText},${formattedDate},${sub.score},${selectedExam.totalMarks},%${pct}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `نتائج_اختبار_${selectedExam.subject}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  // Sort Student Submissions
  const handleSort = (field: 'name' | 'score' | 'date') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const sortedSubmissions = [...submissions].sort((a, b) => {
    let valueA: any = a.studentName;
    let valueB: any = b.studentName;

    if (sortBy === 'score') {
      valueA = a.score;
      valueB = b.score;
    } else if (sortBy === 'date') {
      valueA = new Date(a.submittedAt || a.startedAt).getTime();
      valueB = new Date(b.submittedAt || b.startedAt).getTime();
    }

    if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
    if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Bento-Grid Calculations
  const topStudents = [...submissions]
    .filter(s => s.status === 'submitted')
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const questionDistribution = (() => {
    if (!selectedExam) return { mcq: 0, tf: 0, other: 0, mcqCount: 0, tfCount: 0, otherCount: 0 };
    let mcq = 0, tf = 0, other = 0;
    selectedExam.questions.forEach((q) => {
      if (q.type === QuestionType.MULTIPLE_CHOICE) mcq++;
      else if (q.type === QuestionType.TRUE_FALSE) tf++;
      else other++;
    });
    const total = selectedExam.questions.length || 1;
    return {
      mcq: Math.round((mcq / total) * 105) / 105 * 100, // percentage support
      tf: Math.round((tf / total) * 105) / 105 * 100,
      other: Math.round((other / total) * 105) / 105 * 100,
      mcqCount: mcq,
      tfCount: tf,
      otherCount: other,
    };
  })();

  const completionPercentage = (() => {
    if (submissions.length === 0) return 0;
    const submittedAndGraded = submissions.filter(s => s.status === 'submitted');
    return Math.round((submittedAndGraded.length / submissions.length) * 100);
  })();

  const handleOpenSubmissionDetail = (sub: Submission) => {
    setSelectedSubmission(sub);
    
    // Pre-populate manual grading state with current values
    const marks: Record<string, number> = {};
    const feedback: Record<string, string> = {};
    
    selectedExam?.questions.forEach((q) => {
      const grad = sub.gradedAnswers[q.id];
      marks[q.id] = grad ? grad.score : 0;
      feedback[q.id] = grad?.feedback || '';
    });

    setManualMarks(marks);
    setManualFeedback(feedback);
  };

  const handleApplyGrading = async () => {
    if (!selectedExam || !selectedSubmission) return;
    setSavingGrade(true);

    try {
      // Calculate overall score
      let newTotalScore = 0;
      const updatedGradedAnswers: Record<string, GradedAnswer> = {};

      selectedExam.questions.forEach((q) => {
        const isObjective = q.type === QuestionType.MULTIPLE_CHOICE || 
                            q.type === QuestionType.TRUE_FALSE || 
                            q.type === QuestionType.SHORT_ANSWER ||
                            q.type === QuestionType.ORDER_ELEMENTS;

        if (isObjective) {
          // Keep automatic grading unchanged for objective
          updatedGradedAnswers[q.id] = selectedSubmission.gradedAnswers[q.id] || {
            isCorrect: false,
            score: 0
          };
          newTotalScore += updatedGradedAnswers[q.id].score;
        } else {
          // Manual marks for subjective questions
          const score = Number(manualMarks[q.id] || 0);
          const feedback = manualFeedback[q.id] || '';
          
          updatedGradedAnswers[q.id] = {
            isCorrect: score >= q.marks / 2,
            score,
            feedback
          };
          newTotalScore += score;
        }
      });

      const submissionDocRef = doc(db, 'exams', selectedExam.id, 'submissions', selectedSubmission.id);
      
      await updateDoc(submissionDocRef, {
        score: newTotalScore,
        gradedAnswers: updatedGradedAnswers
      });

      // Update local state to reflect change immediately
      setSelectedSubmission({
        ...selectedSubmission,
        score: newTotalScore,
        gradedAnswers: updatedGradedAnswers
      });

      alert('تم اعتماد وحفظ تصحيح إجابات الطالب بنجاح! تم تحديث العلامة في لوحة البيانات حياً.');
    } catch (err) {
      console.error(err);
      alert('عذراً، فشل في تعديل العلامات، يرجى التحقق من اتصالك بالإنترنت والعد لأقل من دقيقة.');
    } finally {
      setSavingGrade(false);
    }
  };

  return (
    <div id="teacher-dashboard" className="max-w-7xl mx-auto px-4 py-8 print:hidden" dir="rtl">
      {/* Top Banner / Teacher Welcome */}
      <div className="relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-indigo-900 text-white p-8 rounded-3xl border-none shadow-xl">
        <div className="flex items-center gap-4 z-10">
          <div className="bg-white/10 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-lg border border-white/10">
            {teacher?.email?.slice(0, 1).toUpperCase() || 'م'}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white leading-none">
              أهلاً بك، {teacher?.displayName || 'المعلم الفاضل'}
            </h1>
            <p className="text-xs text-indigo-200 mt-2 font-medium">البريد الإلكتروني: {teacher?.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 z-10">
          <button
            onClick={onCreateExamClick}
            className="px-6 py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-900/30 transition-all active:scale-95 cursor-pointer"
          >
            + إنشاء اختبار جديد
          </button>
          <button
            onClick={onLogout}
            className="px-4 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-indigo-100 border border-white/5 transition-all flex items-center justify-center gap-2 cursor-pointer"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4 text-white" />
            <span className="text-xs font-bold leading-none">تسجيل الخروج</span>
          </button>
        </div>
        <div className="absolute -left-12 -top-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl"></div>
      </div>

      {loading ? (
        <div className="text-center py-20 bg-white rounded-3xl p-12 border border-slate-100 shadow-xs">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent mx-auto pb-6"></div>
          <p className="text-slate-500 text-sm mt-4 font-semibold">جاري تحميل قائمة بيانات الاختبارات الفعالة...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Right Column: Exams List */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center justify-between">
              <span>الاختبارات المتوفرة لديك ({exams.length})</span>
            </h2>

            {/* Quick Access Favorite Section */}
            {exams.some(e => e.isFavorite) && (
              <div className="bg-slate-50 border border-slate-150/80 rounded-2xl p-4 space-y-2.5 shadow-xs">
                <h3 className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                  <span>الوصول السريع للمفضلة</span>
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {exams.filter(e => e.isFavorite).map((e) => {
                    const isSelected = selectedExam?.id === e.id;
                    return (
                      <div
                        key={`fav-${e.id}`}
                        onClick={() => {
                          setSelectedExam(e);
                          setSelectedSubmission(null);
                        }}
                        className={`cursor-pointer p-2.5 rounded-xl text-right transition-all border text-xs flex flex-col justify-between h-[80px] ${
                          isSelected
                            ? 'bg-teal-50/30 border-teal-500 shadow-xs'
                            : 'bg-white border-slate-150 hover:border-indigo-200'
                        }`}
                      >
                        <div className="font-bold text-slate-700 truncate leading-tight mt-0.5">{e.subject}</div>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400 font-bold">
                          <span className="font-mono bg-slate-100/80 px-1.5 py-0.2 rounded text-slate-600 uppercase font-semibold">{e.code}</span>
                          <span className="text-teal-600 font-bold">{e.questions.length} أسئلة</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {exams.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-500">
                <BookOpen className="text-slate-350 w-10 h-10 mx-auto mb-2" />
                <p className="font-semibold text-sm">ليس لديك أي اختبارات منشورة حالياً.</p>
                <p className="text-xs text-slate-400 mt-1">ابدأ بإنشاء أول اختبار لك بالضغط على الزر أعلاه.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[750px] overflow-y-auto pr-1">
                {exams.map((exam) => {
                  const isSelected = selectedExam?.id === exam.id;
                  return (
                    <div
                      key={exam.id}
                      onClick={() => {
                        setSelectedExam(exam);
                        setSelectedSubmission(null);
                      }}
                      className={`cursor-pointer p-4 rounded-xl border transition-all relative ${
                        isSelected
                          ? 'bg-teal-50/20 border-teal-500 shadow-sm'
                          : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-slate-800 leading-tight">{exam.subject}</h3>
                          <div className="flex items-center gap-1 text-xs text-slate-400 mt-1 font-mono">
                            <span>الرمز:</span>
                            <span className="font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded uppercase font-mono">
                              {exam.code}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleFavorite(exam.id, exam.isFavorite)}
                            className={`p-1 px-1.5 rounded-lg border transition-all ${
                              exam.isFavorite
                                ? 'bg-amber-50 border-amber-200 text-amber-500 hover:bg-amber-100'
                                : 'bg-slate-50 border-slate-100 text-slate-400 hover:text-amber-500 hover:bg-amber-50/40'
                            }`}
                            title={exam.isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                          >
                            <Star className={`w-3.5 h-3.5 ${exam.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleDeleteExam(exam.id)}
                            className="p-1 px-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 rounded-lg transition-all"
                            title="حذف الاختبار"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-50 mt-3 pt-2 text-xs text-slate-500 font-semibold gap-2">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                          {exam.questions.length} أسئلة
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {exam.duration} دقيقة
                        </span>
                        <span className="text-teal-650 bg-teal-50/50 px-2 py-0.5 rounded font-mono">
                          {exam.totalMarks} درجات
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Left / Middle: Selected Exam Insight, Submissions and Analytics */}
          <div className="lg:col-span-2">
            {!selectedExam ? (
              <div className="bg-slate-50 border border-slate-150 rounded-2xl h-[400px] flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <FileText className="w-12 h-12 text-slate-350 stroke-[1.5] mb-2" />
                <h3 className="font-bold text-slate-700">لم يتم اختيار اختبار للرصد</h3>
                <p className="text-sm mt-1 max-w-sm text-slate-400 leading-relaxed">
                  الرجاء تحديد أحد الاختبارات المتوفرة من القائمة الجانبية لعرض إحصائيات الطلاب، وجدول رصد الدرجات التفصيلي.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Selected Exam Meta and sharing links */}
                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-xs">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">التحليل النهائي والنتائج الدراسية</p>
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">{selectedExam.subject}</h2>
                        <button
                          onClick={() => handleToggleFavorite(selectedExam.id, selectedExam.isFavorite)}
                          className={`p-1 px-1.5 rounded-lg border transition-all ${
                            selectedExam.isFavorite
                              ? 'bg-amber-50 border-amber-200 text-amber-500'
                              : 'bg-slate-50 border-slate-150 text-slate-400 hover:text-amber-500 hover:bg-amber-50/40'
                          }`}
                          title={selectedExam.isFavorite ? 'إزالة من المفضلة' : 'حفظ في المفضلة'}
                        >
                          <Star className={`w-4 h-4 ${selectedExam.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 font-semibold">كود العبور الموحد: <span className="font-bold underline text-slate-600 font-mono">{selectedExam.code}</span></p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleCopyLink(selectedExam.code)}
                        className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                      >
                        {copySuccess === selectedExam.code ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        {copySuccess === selectedExam.code ? 'تم نسخ الرابط!' : 'نسخ رابط الاختبار للطلاب'}
                      </button>
                    </div>
                  </div>

                  {/* Device Testing & Sharing Widget (QR Code & Quick Instructions) */}
                  <div className="mt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-5 pt-5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/60">
                    <div className="bg-white p-2 rounded-xl border border-slate-150 shadow-xs flex-shrink-0">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`${appUrl}?code=${selectedExam.code}`)}`}
                        alt="QR Code"
                        className="w-[100px] h-[100px]"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="space-y-2 flex-grow text-center sm:text-right w-full sm:w-auto">
                      <h4 className="text-xs font-bold text-indigo-700 flex items-center justify-center sm:justify-start gap-1">
                        <Share2 className="w-3.5 h-3.5" />
                        <span>رابط ومسح الكود للاختبار العام (QR-Code)</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        امسح الكود بكاميرا الجوال، أو شارك الرابط للبدء فوراً. <span className="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded">💡 تم تحويل رابط المشاركة تلقائياً للرابط العام للمنصة (بدلاً من الرابط الداخلي للمطور) لكي يعمل لجميع الطلاب على أي جهاز أو بريد إلكتروني خارجي ومن أي شبكة دون قيود أو شروط دخول!</span>
                      </p>
                      <div className="bg-white border border-slate-150 p-1.5 px-3 rounded-xl text-left font-mono text-[10px] text-slate-500 break-all flex items-center justify-between gap-4 mt-1 border-dashed">
                        <span className="truncate pr-1">{`${appUrl}?code=${selectedExam.code}`}</span>
                        <button
                          onClick={() => handleCopyLink(selectedExam.code)}
                          className="hover:bg-slate-50 px-2 py-0.5 rounded transition text-indigo-600 font-bold shrink-0 text-[9px] border border-slate-150 cursor-pointer"
                        >
                          نسخ الرابط
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Real-time Alerts Panel */}
                <div className="bg-white rounded-3xl border border-rose-100 p-6 shadow-xs flex flex-col md:flex-row items-stretch gap-6">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 text-rose-700">
                      <Megaphone className="w-5 h-5 shrink-0 animate-pulse text-rose-500" />
                      <h3 className="font-extrabold text-sm md:text-md">إرسال تنبيهات سريعة ونشطة للطلاب</h3>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                      اكتب رسالة سريعة ليتم بثها فوراً وتظهر كشريط إشعارات منبثق ومتحرك لدى جميع الطلاب الذين يحلون هذا الاختبار حالياً في نفس اللحظة (مثل تذكير بقرب موعد الانتهاء أو إضافة توجيهات هامة).
                    </p>
                    
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="مثال: يتبقى 10 دقائق على نهاية الوقت، يرجى مراجعة الحلول وتأكيد التسليم!"
                        value={alertText}
                        onChange={(e) => setAlertText(e.target.value)}
                        disabled={sendingAlert}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSendAlert();
                          }
                        }}
                        className="flex-1 text-xs px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-1 focus:ring-rose-500 bg-slate-50"
                      />
                      <button
                        onClick={handleSendAlert}
                        disabled={sendingAlert || !alertText.trim()}
                        className={`px-5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                          !alertText.trim()
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            : 'bg-rose-650 hover:bg-rose-700 text-white shadow-md shadow-rose-100 active:scale-95'
                        }`}
                      >
                        {sendingAlert ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Bell className="w-4 h-4" />
                        )}
                        <span>بث التنبيه للطلاب</span>
                      </button>
                    </div>

                    {alertSuccess && (
                      <p className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-pulse">
                        <Check className="w-3.5 h-3.5" />
                        <span>تم بث التنبيه لجميع الطلاب الفعالين بنجاح!</span>
                      </p>
                    )}
                  </div>

                  {/* Past alerts log */}
                  <div className="md:w-1/3 bg-slate-50 p-4 rounded-2xl border border-rose-50/50 flex flex-col justify-between max-h-[160px] overflow-y-auto">
                    <div className="w-full">
                      <h4 className="text-[11px] font-bold text-slate-500 mb-2">سجل التنبيهات المنشورة:</h4>
                      {(!selectedExam.alerts || selectedExam.alerts.length === 0) ? (
                        <p className="text-[10px] text-slate-400 italic font-semibold">لم يتم إرسال أي تنبيه للاختبار الحالي بعد.</p>
                      ) : (
                        <div className="space-y-1.5 w-full">
                          {selectedExam.alerts.map((alert: any) => (
                            <div key={alert.id} className="flex justify-between items-start gap-2 bg-white p-2 rounded-lg border border-slate-150 shadow-inner w-full">
                              <p className="text-[10px] font-semibold text-slate-700 leading-normal flex-1">{alert.message}</p>
                              <button
                                onClick={() => handleDeleteAlert(alert.id)}
                                className="text-rose-500 hover:text-rose-700 p-0.5"
                                title="حذف التنبيه"
                              >
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Styled Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  
                  {/* Cell 1: Performance Overview */}
                  <div className="col-span-1 md:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between min-h-[140px]">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-slate-500 text-xs">نظرة عامة على الأداء والتقييم</h3>
                      {currentExamStats.count > 0 && (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded-full">تحديث فوري</span>
                      )}
                    </div>
                    <div className="flex items-end justify-between gap-4 mt-4">
                      <div className="text-center flex-1">
                        <p className="text-3xl font-black text-slate-800 font-mono leading-none">{currentExamStats.successRate}%</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-2">نسبة النجاح والاجتياز</p>
                      </div>
                      <div className="text-center flex-1 border-r border-slate-100">
                        <p className="text-3xl font-black text-slate-800 font-mono leading-none">{currentExamStats.count}</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-2">عدد المتقدمين</p>
                      </div>
                      <div className="text-center flex-1 border-r border-slate-100">
                        <p className="text-3xl font-black text-slate-800 font-mono leading-none">{currentExamStats.average}</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-2">متوسط الدرجات</p>
                      </div>
                    </div>
                  </div>

                  {/* Cell 2: Active Exam Code with glassmorphism/deep shadow */}
                  <div className="col-span-1 bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100/50 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                    <div className="relative z-10">
                      <h3 className="text-indigo-100 text-xs font-semibold mb-2">رمز ومشاركة الاختبار</h3>
                      <div className="text-2xl font-mono font-bold tracking-widest bg-white/20 p-2.5 rounded-2xl text-center backdrop-blur-md select-all uppercase">
                        {selectedExam.code}
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-indigo-100 opacity-80 leading-normal font-medium z-10">قنوات مشاركة فورية مفعلة</p>
                    <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                  </div>

                  {/* Cell 3: Question Distribution */}
                  <div className="col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between min-h-[140px]">
                    <h3 className="font-bold text-slate-500 text-xs">توزيع وأنواع الأسئلة</h3>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden flex">
                        <div className="h-full bg-indigo-500" style={{ width: `${questionDistribution.mcq}%` }}></div>
                        <div className="h-full bg-emerald-500" style={{ width: `${questionDistribution.tf}%` }}></div>
                        <div className="h-full bg-amber-500" style={{ width: `${questionDistribution.other}%` }}></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-4 text-[9px] font-bold text-slate-400">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span>
                        موضوعي ({questionDistribution.mcqCount})
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                        صح/خطأ ({questionDistribution.tfCount})
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                        مقالي ({questionDistribution.otherCount})
                      </div>
                    </div>
                  </div>

                  {/* Cell 4: Top Students */}
                  <div className="col-span-1 md:row-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm mb-4">أوائل الطلاب والمتميزين</h3>
                      {topStudents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center text-slate-350 py-12">
                          <Users className="w-8 h-8 opacity-30 mb-2" />
                          <p className="text-[10px] font-bold">بانتظار تسليم الطلاب</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {topStudents.map((stud, idx) => (
                            <div key={stud.id} className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                idx === 0 ? 'bg-amber-50 border border-amber-400 text-amber-600' :
                                idx === 1 ? 'bg-slate-50 border border-slate-300 text-slate-500' :
                                idx === 2 ? 'bg-orange-50 border border-orange-300 text-orange-600' :
                                'bg-slate-50 text-slate-500'
                              }`}>
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-700 truncate leading-none">{stud.studentName}</p>
                                <p className="text-[9px] text-slate-400 font-bold font-mono mt-1">{stud.score} / {selectedExam.totalMarks} درجة</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cell 5: Scores Distribution Graph */}
                  <div className="col-span-1 md:col-span-2 md:row-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between min-h-[220px]">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">تسلسل وتدفق درجات الطلاب المتقدمين</h3>
                      <p className="text-[10px] text-slate-400 font-semibold mt-1">يصنف المقياس درجات تسليم الأوراق أوتوماتيكياً تلو بعض</p>
                    </div>
                    {currentExamStats.count === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-350 py-12">
                        <p className="text-[10px] font-bold">لا تتوفر درجات كافية للرسم البياني</p>
                      </div>
                    ) : (
                      <div className="h-40 mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 8, fontWeight: 'bold', fill: '#94a3b8' }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 8, fill: '#94a3b8' }} />
                            <Tooltip formatter={(value) => [`${value} طلاب`, 'العدد']} />
                            <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Cell 6: Completion Metrics */}
                  <div className="col-span-1 bg-emerald-500 rounded-3xl p-6 text-white shadow-xl shadow-emerald-100 flex flex-col justify-center items-center text-center gap-1 relative overflow-hidden min-h-[140px]">
                    <div className="text-3xl font-black font-mono tracking-tight leading-none">{completionPercentage}%</div>
                    <p className="text-[11px] font-bold text-emerald-100 mt-1">درجة إنجاز رصد وتصحيح الطلاب</p>
                    <div className="text-[9px] bg-white/20 px-2.5 py-1 rounded-full font-bold mt-2">
                      {submissions.filter(s => s.status === 'submitted').length} من {submissions.length} ورقة مصححة
                    </div>
                  </div>

                </div>

                {/* Submissions Table / Student List & Results */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
                  <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">بيانات رصد الطلاب والمتقدمين</h3>
                      <p className="text-xs text-slate-400 mt-1">توضح هذه القائمة أسماء وعلامات الطلاب مع إتاحة التصحيح والفلترة.</p>
                    </div>

                    {/* Actions and Sorting Area */}
                    <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
                      {/* Export buttons */}
                      {submissions.length > 0 && (
                        <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl border border-slate-150 shadow-xs">
                          <button
                            onClick={handleExportCSV}
                            className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg border border-slate-200 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer hover:border-emerald-200"
                            title="تصدير النتائج إلى ملف CSV"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-600" />
                            <span>ملف CSV</span>
                          </button>
                          <button
                            onClick={handlePrintPDF}
                            className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-800 text-xs font-bold rounded-lg border border-slate-200 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer hover:border-indigo-200"
                            title="تصدير كتقرير PDF أو طباعته"
                          >
                            <Printer className="w-3.5 h-3.5 text-indigo-600" />
                            <span>تقرير PDF / طباعة</span>
                          </button>
                        </div>
                      )}

                      {/* Sorting Controls */}
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <span className="text-slate-400">ترتيب حَسَب:</span>
                        <button
                          onClick={() => handleSort('date')}
                          className={`px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                            sortBy === 'date' ? 'bg-slate-150 text-slate-800 font-bold border-slate-300' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          التاريخ والوقت <ArrowUpDown className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleSort('score')}
                          className={`px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                            sortBy === 'score' ? 'bg-slate-150 text-slate-800 font-bold border-slate-300' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          الدرجات المحصَّلة <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {submissions.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                      <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-sm">لم يتقدم أي طالب للاختبار حتى الآن.</p>
                      <p className="text-xs text-slate-400 mt-0.5">شارك رابط الاختبار مع طلابك للبدء.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-3.5">الاسم الثلاثي للطالب</th>
                            <th className="px-6 py-3.5">تاريخ وبداية التقديم</th>
                            <th className="px-6 py-3.5">الدرجة النهائية</th>
                            <th className="px-6 py-3.5">نسبة الإجابات</th>
                            <th className="px-6 py-3.5">حالة التقديم</th>
                            <th className="px-6 py-3.5 text-center">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedSubmissions.map((sub) => {
                            const pct = Math.round((sub.score / selectedExam.totalMarks) * 100);
                            const isPassing = sub.score >= selectedExam.totalMarks / 2;
                            return (
                              <tr key={sub.id} className="hover:bg-slate-50/55 transition-all">
                                <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">
                                  {sub.studentName}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400 font-medium font-mono">
                                  {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('ar-EG') : new Date(sub.startedAt).toLocaleString('ar-EG')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`font-mono font-bold text-sm ${isPassing ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {sub.score}
                                  </span>
                                  <span className="text-xs text-slate-400 font-mono"> / {selectedExam.totalMarks}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${isPassing ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        style={{ width: `${Math.min(100, pct)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-mono font-bold text-slate-500">%{pct}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {sub.status === 'submitted' ? (
                                    <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> تم التسليم
                                    </span>
                                  ) : (
                                    <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit">
                                      <Clock className="w-3.5 h-3.5" /> جاري الحل
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  <button
                                    onClick={() => handleOpenSubmissionDetail(sub)}
                                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-all"
                                  >
                                    معاينة ورصد العلامات
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Grading and Review Modal */}
      <AnimatePresence>
        {selectedSubmission && selectedExam && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 flex items-center justify-center p-4" dir="rtl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-100"
            >
              {/* Modal Header */}
              <div className="p-6 bg-gradient-to-r from-teal-650 to-indigo-750 text-white flex items-center justify-between">
                <div>
                  <span className="text-xs text-teal-100 font-bold">معاينة ورقة إجابة الطالب وتصحيحها</span>
                  <h3 className="text-lg font-bold mt-1">الطالب: {selectedSubmission.studentName}</h3>
                  <p className="text-xs text-indigo-100 mt-0.5">
                    المادة: {selectedExam.subject} | العلامة الإجمالية الحالية: {selectedSubmission.score} من {selectedExam.totalMarks}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition-all"
                >
                  إغلاق النافذة
                </button>
              </div>

              {/* Modal Body / Exam Paper Review */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">ملاحظة التصحيح والتقييم:</span>
                    <span className="block mt-0.5 leading-relaxed">
                      الأسئلة المقالية والإنشائية (مثل: اشرح، علل، فسر، عدد، مقال) تحتاج إلى رصد العلامات يدوياً من قبلك كمعلم هنا. الإجابات النموذجية الموضوعية (مثل الاختياري والترتيب والصح والخطأ) يتم تصحيحها تلقائياً بالكامل من قبل النظام، ولكن يمكنك تعديل علاماتها يدوياً أيضاً إذا أردت تقدير محاولات الطلاب.
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {selectedExam.questions.map((q, idx) => {
                    const studentAns = selectedSubmission.answers[q.id];
                    const grad = selectedSubmission.gradedAnswers[q.id];
                    const isObjective = q.type === QuestionType.MULTIPLE_CHOICE || 
                                        q.type === QuestionType.TRUE_FALSE || 
                                        q.type === QuestionType.SHORT_ANSWER ||
                                        q.type === QuestionType.ORDER_ELEMENTS;

                    return (
                      <div key={q.id} className="py-6 first:pt-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span className="text-xs font-semibold text-slate-400">سؤال {idx + 1} ({q.marks} درجات)</span>
                            <h4 className="font-bold text-slate-800 text-md mt-1">{q.text}</h4>
                          </div>
                          
                          {/* Grade marker */}
                          <div className="bg-slate-50 border border-slate-200 px-3 py-1 bg-teal-50/20 rounded-xl flex items-center gap-1">
                            <span className="text-xs text-slate-500 font-bold">العلامة الحالية:</span>
                            <span className="text-sm font-bold text-teal-700 font-mono">{grad ? grad.score : 0}</span>
                            <span className="text-xs text-slate-400 font-bold">/ {q.marks}</span>
                          </div>
                        </div>

                        {/* Student Answer Presentation */}
                        <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100/70 text-sm">
                          <span className="block text-xs font-bold text-slate-400 mb-2">إجابة الطالب:</span>
                          
                          {studentAns === undefined || studentAns === '' ? (
                            <span className="text-rose-500 font-bold italic block">لم يحل هذا السؤال (سَطَرَ فارغاً)</span>
                          ) : q.type === QuestionType.ORDER_ELEMENTS ? (
                            <div className="flex flex-wrap gap-2">
                              {Array.isArray(studentAns) && studentAns.map((item, id) => (
                                <span key={id} className="bg-slate-200/60 border border-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold font-mono">
                                  {id + 1}. {item}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-800 font-medium block leading-relaxed break-words">{String(studentAns)}</span>
                          )}

                          {/* Reference answer for helper */}
                          {q.correctAnswer && (
                            <div className="mt-3 pt-3 border-t border-slate-200/60 text-xs flex items-center gap-2">
                              <span className="font-bold text-slate-400 shrink-0">الإجابة الصحيحة أو النموذجية:</span>
                              <span className="bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.5 rounded">{q.correctAnswer}</span>
                            </div>
                          )}

                          {q.correctOrder && (
                            <div className="mt-3 pt-3 border-t border-slate-200/60 text-xs flex items-center gap-2">
                              <span className="font-bold text-slate-400 shrink-0">الترتيب الصحيح:</span>
                              <span className="bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.5 rounded">{q.correctOrder.join(' ← ')}</span>
                            </div>
                          )}
                        </div>

                        {/* Grading Action Area */}
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-2xl border-2 border-dashed border-slate-100 bg-white">
                          <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 mb-1">الرصد والدرجة:</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={q.marks}
                                value={manualMarks[q.id] !== undefined ? manualMarks[q.id] : (grad ? grad.score : 0)}
                                onChange={(e) => {
                                  const val = Math.min(q.marks, Math.max(0, parseFloat(e.target.value) || 0));
                                  setManualMarks({ ...manualMarks, [q.id]: val });
                                }}
                                className="w-full px-3 py-1.5 border border-slate-255 focus:ring-1 focus:ring-teal-500 rounded-lg text-center font-mono font-bold font-sm text-slate-800 bg-slate-50"
                              />
                              <span className="text-xs text-slate-400 font-bold">من {q.marks}</span>
                            </div>
                          </div>
                          <div className="md:col-span-3">
                            <label className="block text-xs font-bold text-slate-500 mb-1">ملاحظات مصححة أو توجيه للطالب:</label>
                            <input
                              type="text"
                              placeholder="مثال: إجابة ممتازة ومكتملة، ممتاز جداً"
                              value={manualFeedback[q.id] !== undefined ? manualFeedback[q.id] : (grad?.feedback || '')}
                              onChange={(e) => setManualFeedback({ ...manualFeedback, [q.id]: e.target.value })}
                              className="w-full px-3 py-1.5 border border-slate-255 focus:ring-1 focus:ring-teal-500 rounded-lg text-sm text-slate-800 bg-slate-50"
                            />
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(null)}
                  className="px-6 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-semibold transition-all"
                >
                  إلغاء التعديل
                </button>
                <button
                  type="button"
                  disabled={savingGrade}
                  onClick={handleApplyGrading}
                  className="px-8 py-2 bg-gradient-to-r from-teal-650 to-teal-800 hover:from-teal-700 hover:to-teal-900 text-white rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingGrade ? 'جاري الرصد والاعتماد...' : 'حفظ ورصد علامات الطالب الآن'}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Hidden print-only reporting element */}
      {selectedExam && (
        <div className="hidden print:block text-right p-8 text-black bg-white min-h-screen" dir="rtl">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
            <div>
              <h1 className="text-2xl font-black">تقرير رصد درجات الطلاب والمتقدمين</h1>
              <h2 className="text-lg font-bold mt-1">المادة: {selectedExam.subject}</h2>
              <p className="text-xs text-slate-500 mt-1">رمز الاختبار: {selectedExam.code} | إجمالي العلامات: {selectedExam.totalMarks}</p>
            </div>
            <div className="text-left font-semibold text-xs space-y-1">
              <p>منصة الاختبارات الذكية</p>
              <p>المعلم الفاضل: {selectedExam.teacherName}</p>
              <p>تاريخ التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
              <p>إجمالي الطلاب: {submissions.length} طالب وطالبة</p>
            </div>
          </div>

          <table className="w-full text-right border-collapse border border-slate-400">
            <thead>
              <tr className="bg-slate-100 text-sm font-bold border-b border-slate-400">
                <th className="border border-slate-400 p-2">اسم الطالب</th>
                <th className="border border-slate-400 p-2">البداية</th>
                <th className="border border-slate-400 p-2">التسليم</th>
                <th className="border border-slate-400 p-2">حالة الورقة</th>
                <th className="border border-slate-400 p-2">الدرجة النهائية</th>
                <th className="border border-slate-400 p-2">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {sortedSubmissions.map((sub) => {
                const pct = Math.round((sub.score / selectedExam.totalMarks) * 100);
                return (
                  <tr key={`print-${sub.id}`} className="text-xs border-b border-slate-300">
                    <td className="border border-slate-300 p-2 font-bold">{sub.studentName}</td>
                    <td className="border border-slate-300 p-2">{new Date(sub.startedAt).toLocaleString('ar-EG')}</td>
                    <td className="border border-slate-300 p-2">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('ar-EG') : 'جاري الحل'}</td>
                    <td className="border border-slate-300 p-2">{sub.status === 'submitted' ? 'تم التسليم' : 'غير مكتمل'}</td>
                    <td className="border border-slate-300 p-2 font-bold">{sub.score} / {selectedExam.totalMarks}</td>
                    <td className="border border-slate-300 p-2 font-bold">%{pct}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-12 flex justify-between text-xs font-bold pt-8 border-t border-dashed border-slate-300">
            <div>
              <p>توقيع معلم المادة:</p>
              <p className="mt-8">__________________</p>
            </div>
            <div>
              <p>توقيع قائد المدرسة:</p>
              <p className="mt-8">__________________</p>
            </div>
          </div>
        </div>
      )}
      {/* Custom Exam Delete Confirmation Modal */}
      <AnimatePresence>
        {examToDelete && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl border border-slate-150 text-right space-y-5"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5.5 h-5.5 stroke-[2]" />
                </div>
                <div>
                  <h3 className="text-md font-bold text-slate-800">حذف الاختبار نهائياً؟</h3>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed font-semibold">
                    هل أنت متأكد من رغبتك في حذف هذا الاختبار؟ سيتم حذف نتائج وتقييمات الطلاب المرتبطة به نهائياً وبلا رجعة.
                  </p>
                </div>
              </div>

              {exams.find(e => e.id === examToDelete) && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-150">
                  <span className="block text-[10px] text-slate-400 font-bold mb-1">الاختبار المختار:</span>
                  <span className="text-xs font-bold text-slate-700 block">
                    {exams.find(e => e.id === examToDelete)?.subject}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-400 block mt-0.5">
                    الرمز: {exams.find(e => e.id === examToDelete)?.code}
                  </span>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => setExamToDelete(null)}
                  className="flex-1 py-2 hover:bg-slate-100 text-slate-500 text-xs font-bold rounded-xl transition cursor-pointer border border-slate-200"
                >
                  إلغاء
                </button>
                <button
                  onClick={confirmDeleteExam}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تأكيد الحذف</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Alert Delete Confirmation Modal */}
      <AnimatePresence>
        {alertToDelete && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-150 text-right space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">حذف تنبيه من الطلاب؟</h3>
                  <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed font-semibold">
                    هل تريد الاستغناء عن بث هذا الإشعار للطلاب الفعالين الآن؟
                  </p>
                </div>
              </div>

              {selectedExam?.alerts?.find((a: any) => a.id === alertToDelete) && (
                <div className="p-3 bg-rose-50/40 rounded-xl border border-rose-100/50">
                  <p className="text-[11px] font-semibold text-rose-700 leading-normal italic">
                    "{selectedExam.alerts.find((a: any) => a.id === alertToDelete).message}"
                  </p>
                </div>
              )}

              <div className="flex gap-2.5 justify-end">
                <button
                  onClick={() => setAlertToDelete(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onClick={confirmDeleteAlert}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  نعم، احذف
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
