import React, { useState } from 'react';
import { Question, QuestionType, Exam } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { Plus, Trash2, ArrowUp, ArrowDown, Sparkles, Check, Info, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CreateExamProps {
  onExamCreated: (exam: Exam) => void;
  onCancel: () => void;
}

const generateRandomCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export default function CreateExam({ onExamCreated, onCancel }: CreateExamProps) {
  const [teacherName, setTeacherName] = useState('');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState(30);
  const [code, setCode] = useState(generateRandomCode());
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deadline, setDeadline] = useState('');

  // Stats
  const totalPoints = questions.reduce((sum, q) => sum + (q.marks || 0), 0);

  const handleAddQuestion = (type: QuestionType) => {
    const newQuestion: Question = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      text: '',
      type,
      marks: 5,
    };

    if (type === QuestionType.MULTIPLE_CHOICE) {
      newQuestion.options = ['', '', '', ''];
      newQuestion.correctAnswer = '';
    } else if (type === QuestionType.TRUE_FALSE) {
      newQuestion.correctAnswer = 'صح';
    } else if (type === QuestionType.ORDER_ELEMENTS) {
      newQuestion.options = ['', '', ''];
      newQuestion.correctOrder = [];
    } else {
      newQuestion.correctAnswer = '';
    }

    setQuestions([...questions, newQuestion]);
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const updated = [...questions];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setQuestions(updated);
  };

  const handleQuestionFieldChange = (id: string, field: keyof Question, value: any) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === id) {
          return { ...q, [field]: value };
        }
        return q;
      })
    );
  };

  const handleMCQOptionChange = (questionId: string, optionIndex: number, text: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.options) {
          const updatedOptions = [...q.options];
          updatedOptions[optionIndex] = text;
          return { ...q, options: updatedOptions };
        }
        return q;
      })
    );
  };

  const handleMCQAddOption = (questionId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.options) {
          return { ...q, options: [...q.options, ''] };
        }
        return q;
      })
    );
  };

  const handleMCQRemoveOption = (questionId: string, optionIndex: number) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.options) {
          const updatedOptions = q.options.filter((_, idx) => idx !== optionIndex);
          let updatedCorrectAnswer = q.correctAnswer;
          // Clean correct answer if removed
          if (q.correctAnswer === q.options[optionIndex]) {
            updatedCorrectAnswer = '';
          }
          return { ...q, options: updatedOptions, correctAnswer: updatedCorrectAnswer };
        }
        return q;
      })
    );
  };

  const handleOrderOptionChange = (questionId: string, optionIndex: number, text: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.options) {
          const updatedOptions = [...q.options];
          updatedOptions[optionIndex] = text;
          return { ...q, options: updatedOptions };
        }
        return q;
      })
    );
  };

  const handleOrderAddOption = (questionId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.options) {
          return { ...q, options: [...q.options, ''] };
        }
        return q;
      })
    );
  };

  const handleOrderRemoveOption = (questionId: string, optionIndex: number) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.options) {
          return { ...q, options: q.options.filter((_, idx) => idx !== optionIndex) };
        }
        return q;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    if (!teacherName.trim()) {
      setErrorMessage('يرجى إدخال اسم المعلم');
      return;
    }
    if (!subject.trim()) {
      setErrorMessage('يرجى إدخال اسم المادة');
      return;
    }
    if (questions.length === 0) {
      setErrorMessage('يرجى إضافة سؤال واحد على الأقل للاختبار');
      return;
    }

    // Validate questions fields
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) {
        setErrorMessage(`يرجى تحديد نص السؤال في السؤال رقم ${i + 1}`);
        return;
      }
      if (q.type === QuestionType.MULTIPLE_CHOICE) {
        if (!q.options || q.options.some((opt) => !opt.trim())) {
          setErrorMessage(`يرجى كتابة كافة الخيارات المتاحة للسؤال المتعدد رقم ${i + 1}`);
          return;
        }
        if (!q.correctAnswer) {
          setErrorMessage(`يرجى تحديد الإجابة الصحيحة للسؤال رقم ${i + 1}`);
          return;
        }
      }
      if (q.type === QuestionType.ORDER_ELEMENTS) {
        if (!q.options || q.options.some((opt) => !opt.trim())) {
          setErrorMessage(`يرجى ملء جميع العناصر للترتيب للسؤال رقم ${i + 1}`);
          return;
        }
        if (q.options.length < 2) {
          setErrorMessage(`يتطلب سؤال الترتيب عنصرين على الأقل للترتيب في السؤال رقم ${i + 1}`);
          return;
        }
      }
      if (q.marks <= 0) {
        setErrorMessage(`درجة السؤال يجب أن تكون أكبر من الصفر للسؤال رقم ${i + 1}`);
        return;
      }
    }

    setLoading(true);

    try {
      const teacherUid = auth.currentUser?.uid;
      if (!teacherUid) {
        setErrorMessage('حدث خطأ: يجب تسجيل الدخول لإنشاء اختبار');
        setLoading(false);
        return;
      }

      // Check if code already exists
      const examsRef = collection(db, 'exams');
      const q = query(examsRef, where('code', '==', code.toUpperCase()));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        setCode(generateRandomCode());
        setErrorMessage('رمز الاختبار مستخدم مسبقاً، تم توليد رمز جديد تلقائياً. يرجى الضغط على زر الحفظ مجدداً.');
        setLoading(false);
        return;
      }

      const examId = 'exam_' + Date.now();
      const examData: Exam = {
        id: examId,
        teacherName,
        subject,
        duration: Number(duration),
        totalMarks: totalPoints,
        code: code.toUpperCase(),
        createdAt: new Date().toISOString(),
        createdBy: teacherUid,
        questions,
        ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
      };

      await setDoc(doc(db, 'exams', examId), examData);
      onExamCreated(examData);
    } catch (err) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'exams');
      } catch (formattedError: any) {
        setErrorMessage(`فشل في حفظ الاختبار: ${formattedError.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="create-exam-container" className="max-w-4xl mx-auto px-4 py-8" dir="rtl">
      {/* Header Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-teal-500 to-indigo-500" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="text-teal-500 w-6 h-6 animate-pulse" />
              إنشاء اختبار إلكتروني جديد
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              قم بصياغة أسئلة اختبارك التفاعلي مع حساب تلقائي ومميزات متطورة للطلاب.
            </p>
          </div>
          <div className="bg-teal-50/50 text-teal-700 px-4 py-2 rounded-xl text-sm border border-teal-100 flex items-center gap-2 self-start md:self-center">
            <span className="font-semibold text-teal-800">مجموع درجات الاختبار:</span>
            <span className="font-mono font-bold text-lg">{totalPoints}</span>
            <span>درجة</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm"
          >
            {errorMessage}
          </motion.div>
        )}

        {/* Section 1: Basic Information */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">
            المعلومات الأساسية للاختبار
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">اسم المعلم / المعلمة</label>
              <input
                type="text"
                required
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="مثال: أ. محمد أحمد"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-850"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">اسم المادة الدراسية</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="مثال: الرياضيات، العلوم، اللغة العربية"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-850"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">مدة الاختبار (بالدقائق)</label>
              <input
                type="number"
                min="1"
                max="1440"
                required
                value={duration}
                onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all font-mono text-slate-850 text-right"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">رمز الاختبار (Code)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="6 رموز"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-850 font-mono tracking-widest text-center text-lg"
                />
                <button
                  type="button"
                  onClick={() => setCode(generateRandomCode())}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 transition-all text-sm font-medium whitespace-nowrap"
                >
                  توليد عشوائي
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-50">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                <span>تحديد وقت نهائي للدخول (Deadline)</span>
                <span className="text-xs text-slate-400 font-normal">(اختياري)</span>
              </label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-800"
              />
              <p className="text-[11px] text-slate-400 mt-1 font-semibold leading-normal">
                لن يتمكن الطلاب من فتح رابط الاختبار أو بدء الإجابة بعد هذا التاريخ والوقت. اتركه فارغاً ليبقى متاحاً دون قيد زمني.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Questions Builder */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">أسئلة الاختبار</h2>
            <p className="text-slate-500 text-sm">عدد الأسئلة: {questions.length}</p>
          </div>

          {questions.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl py-12 px-6 text-center">
              <Info className="mx-auto text-slate-400 w-12 h-12 mb-3" />
              <p className="text-slate-600 font-medium">لم يتم إضافة أي أسئلة حتى الآن.</p>
              <p className="text-slate-400 text-xs mt-1">
                الرجاء استخدام الأزرار أدناه لإضافة أنواع الأسئلة المفضلة لديك.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {questions.map((q, index) => (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 relative"
                  >
                    {/* Control Bar */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-800 w-7 h-7 rounded-full flex items-center justify-center font-bold font-mono text-sm">
                          {index + 1}
                        </span>
                        <span className="bg-teal-50 text-teal-700 px-3 py-1 rounded-lg text-xs font-semibold">
                          {q.type === QuestionType.MULTIPLE_CHOICE && 'اختيار من متعدد'}
                          {q.type === QuestionType.TRUE_FALSE && 'صح أم خطأ'}
                          {q.type === QuestionType.EXPLAIN && 'اشرح'}
                          {q.type === QuestionType.INTERPRET && 'فسر'}
                          {q.type === QuestionType.JUSTIFY && 'علل'}
                          {q.type === QuestionType.LIST_ELEMENTS && 'عدد'}
                          {q.type === QuestionType.ORDER_ELEMENTS && 'ترتيب زمني/منطقي'}
                          {q.type === QuestionType.SHORT_ANSWER && 'إجابة نصية قصيرة'}
                          {q.type === QuestionType.ESSAY && 'سؤال مقالي تفصيلي'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(index, 'up')}
                          disabled={index === 0}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg disabled:opacity-30 transition-all"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveQuestion(index, 'down')}
                          disabled={index === questions.length - 1}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg disabled:opacity-30 transition-all"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(q.id)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Question Content */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                          <label className="block text-xs font-semibold text-slate-500 mb-1">نص السؤال</label>
                          <input
                            type="text"
                            required
                            placeholder="اكتب نص السؤال هنا..."
                            value={q.text}
                            onChange={(e) => handleQuestionFieldChange(q.id, 'text', e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">الدرجة</label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={q.marks}
                            onChange={(e) =>
                              handleQuestionFieldChange(q.id, 'marks', Math.max(1, parseInt(e.target.value) || 0))
                            }
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all font-mono text-center text-slate-800"
                          />
                        </div>
                      </div>

                      {/* Question Specific Fields */}
                      {q.type === QuestionType.MULTIPLE_CHOICE && (
                        <div className="space-y-3 pt-2 border-t border-slate-50">
                          <span className="block text-xs font-semibold text-slate-500">إعداد الخيارات (وضع علامة عند الإجابة الصحيحة)</span>
                          <div className="space-y-2">
                            {q.options?.map((option, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleQuestionFieldChange(q.id, 'correctAnswer', option)}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                                    q.correctAnswer === option && option !== ''
                                      ? 'border-emerald-500 bg-emerald-50 text-emerald-500'
                                      : 'border-slate-200 hover:border-slate-350 bg-white text-transparent'
                                  }`}
                                  disabled={!option.trim()}
                                  title="تحديد كإجابة صحيحة"
                                >
                                  <Check className="w-4 h-4 text-emerald-600 stroke-[3px]" />
                                </button>
                                <input
                                  type="text"
                                  required
                                  placeholder={`الخيار رقم ${idx + 1}`}
                                  value={option}
                                  onChange={(e) => handleMCQOptionChange(q.id, idx, e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-sm text-slate-800 bg-slate-50/50"
                                />
                                {q.options && q.options.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => handleMCQRemoveOption(q.id, idx)}
                                    className="p-1 px-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-sm transition-all"
                                  >
                                    حذف
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleMCQAddOption(q.id)}
                            className="text-xs text-teal-600 hover:text-teal-700 font-bold flex items-center gap-1 mt-2 pr-1"
                          >
                            <Plus className="w-3.5 h-3.5" /> إضافة خيار آخر
                          </button>
                        </div>
                      )}

                      {q.type === QuestionType.TRUE_FALSE && (
                        <div className="pt-2 border-t border-slate-50 flex items-center gap-4">
                          <span className="block text-xs font-semibold text-slate-500">الإجابة الصحيحة:</span>
                          <div className="flex gap-2">
                            {['صح', 'خطأ'].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => handleQuestionFieldChange(q.id, 'correctAnswer', val)}
                                className={`px-4 py-1.5 rounded-xl border text-sm font-semibold transition-all ${
                                  q.correctAnswer === val
                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {q.type === QuestionType.ORDER_ELEMENTS && (
                        <div className="space-y-3 pt-2 border-t border-slate-50">
                          <span className="block text-xs font-semibold text-slate-500">العناصر المراد ترتيبها (اكتبها بالترتيب التنازلي أو التاريخي الصحيح من الأقدم للأحدث):</span>
                          <div className="space-y-2">
                            {q.options?.map((option, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="bg-emerald-50 text-emerald-700 w-6 h-6 rounded font-bold text-xs flex items-center justify-center font-mono border border-emerald-100">
                                  {idx + 1}
                                </span>
                                <input
                                  type="text"
                                  required
                                  placeholder={`العنصر رقم ${idx + 1}`}
                                  value={option}
                                  onChange={(e) => handleOrderOptionChange(q.id, idx, e.target.value)}
                                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm text-slate-800 bg-emerald-50/20"
                                />
                                {q.options && q.options.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => handleOrderRemoveOption(q.id, idx)}
                                    className="p-1 px-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-sm transition-all"
                                  >
                                    حذف
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOrderAddOption(q.id)}
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 mt-2 pr-1"
                          >
                            <Plus className="w-3.5 h-3.5" /> إضافة عنصر آخر
                          </button>
                        </div>
                      )}

                      {q.type === QuestionType.SHORT_ANSWER && (
                        <div className="pt-2 border-t border-slate-50 space-y-1">
                          <label className="block text-xs font-semibold text-slate-500">الإجابة المرجعية النموذجية (الموضوعية للاحتساب التلقائي):</label>
                          <input
                            type="text"
                            required
                            placeholder="اكتب الإجابة القصيرة المتوقعة بالضبط"
                            value={q.correctAnswer || ''}
                            onChange={(e) => handleQuestionFieldChange(q.id, 'correctAnswer', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-250 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 text-sm bg-slate-50 text-slate-800"
                          />
                        </div>
                      )}

                      {/* Informational for subjective questions */}
                      {(q.type === QuestionType.EXPLAIN ||
                        q.type === QuestionType.INTERPRET ||
                        q.type === QuestionType.JUSTIFY ||
                        q.type === QuestionType.LIST_ELEMENTS ||
                        q.type === QuestionType.ESSAY) && (
                        <div className="pt-1.5 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-xl p-2.5 border border-amber-100">
                          <Info className="w-4 h-4 shrink-0" />
                          <span>
                            هذا السؤال من الأسئلة التعبيرية والمقال تطلب تصحيح ومراجعة من قبل المعلم يدوياً في لوحة النتائج مع رصد الدرجات للطالب لاحقاً.
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Question Type Selection Panel */}
        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-6">
          <h3 className="text-sm font-semibold text-slate-500 mb-3 text-center">إضافة سؤال جديد (اختر نوع السؤال)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {[
              { type: QuestionType.MULTIPLE_CHOICE, label: 'خيار من متعدد' },
              { type: QuestionType.TRUE_FALSE, label: 'صح أم خطأ' },
              { type: QuestionType.SHORT_ANSWER, label: 'إجابة نصية قصيرة' },
              { type: QuestionType.ORDER_ELEMENTS, label: 'ترتيب العناصر زمنيًا' },
              { type: QuestionType.EXPLAIN, label: 'اشرح' },
              { type: QuestionType.INTERPRET, label: 'فسر' },
              { type: QuestionType.JUSTIFY, label: 'علل' },
              { type: QuestionType.LIST_ELEMENTS, label: 'عدد' },
              { type: QuestionType.ESSAY, label: 'سؤال مقالي' },
            ].map((btn) => (
              <button
                key={btn.type}
                type="button"
                onClick={() => handleAddQuestion(btn.type)}
                className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 hover:border-slate-300 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5 text-teal-500" />
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form CTA Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 pb-8">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2.5 hover:bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold transition-all"
          >
            إلغاء التراجع
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-2.5 bg-gradient-to-r from-teal-650 to-teal-800 hover:from-teal-700 hover:to-teal-900 text-white rounded-xl text-sm font-bold shadow-md shadow-teal-500/10 active:scale-95 disabled:scale-100 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {loading ? 'جاري حفظ وطرح الاختبار...' : 'حفظ ونشر الاختبار الآن'}
            <ShieldCheck className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
