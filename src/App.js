import React, { useState, useEffect } from 'react';
import {
  Users,
  FileText,
  BarChart,
  LogOut,
  CheckCircle,
  Upload,
  Plus,
  FileCheck,
  X,
  Settings,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Clock,
  Loader
} from 'lucide-react';

// --- Firebase 클라우드 연동 임포트 ---
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,   // ✅ 이 줄 추가
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  query,
  where,
  getDocs
} from "firebase/firestore";

// --- 환경 감지 및 Firebase 설정 ---
// Canvas(미리보기) 환경에서는 window.__firebase_config(JSON 문자열)가 주입될 수 있습니다.
const canvasConfigStr =
  typeof window !== 'undefined' ? window.__firebase_config : undefined;

let canvasConfig = null;
if (typeof canvasConfigStr === 'string') {
  try {
    canvasConfig = JSON.parse(canvasConfigStr);
  } catch (e) {
    console.warn('window.__firebase_config JSON 파싱 실패:', e);
  }
}


// CRA(Create React App) + Vercel/로컬 실행에서는 REACT_APP_로 시작하는 환경변수를 사용합니다.
const envConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Canvas 설정이 있으면 우선 사용, 없으면 환경변수 설정 사용
const firebaseConfig = canvasConfig || envConfig;

// firebase 설정이 충분한지 체크 (설정이 없으면 initializeApp 자체가 실패하므로 미리 막습니다)
const firebaseEnabled = Boolean(
  firebaseConfig &&
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

// 중복 실행 방지 및 초기화(설정이 있을 때만)
const app = firebaseEnabled
  ? !getApps().length
    ? initializeApp(firebaseConfig)
    : getApp()
  : null;

const auth = firebaseEnabled && app ? getAuth(app) : null;
const db = firebaseEnabled && app ? getFirestore(app) : null;

const currentAppId =
  typeof window !== "undefined" && typeof window.__app_id !== "undefined"
    ? window.__app_id
    : "default";

// --- 유틸리티: 날짜 포맷 함수 ---
const formatSubmitDate = () => {
  const dateObj = new Date();
  const yy = String(dateObj.getFullYear()).slice(-2);
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const day = days[dateObj.getDay()];
  let h = dateObj.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h ? h : 12;
  const min = String(dateObj.getMinutes()).padStart(2, '0');

  return `${yy}.${mm}.${dd}(${day}) ${ampm} ${h}:${min}`;
};

export default function App() {
  // --- 앱 상태 관리 ---
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [configError, setConfigError] = useState(false);
  const [authErrorMsg, setAuthErrorMsg] = useState(''); // 통신 장애 에러 메시지 상태 추가
  const [view, setView] = useState('login'); // 'login', 'admin', 'student', 'test'
  const [currentUser, setCurrentUser] = useState(null);

  const [teacherStatus, setTeacherStatus] = useState("none");
  // "none" | "pending" | "approved"
  const [teacherEmail, setTeacherEmail] = useState("");
  // --- 클라우드 실시간 데이터 저장소 ---
  const [tenantId, setTenantId] = useState(null);      // 교사 UID가 들어감
  const [teacherCode, setTeacherCode] = useState("");  // 학생이 입력할 “교사코드”
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [classActiveSettings, setClassActiveSettings] = useState({});

  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // --- 1. Firebase 인증 및 실시간 리스너 연결 ---
  useEffect(() => {
    const initAuth = async () => {
      // firebase 설정이 없으면(특히 Vercel/로컬에서 환경변수 미설정) 초기화 자체가 불가능하므로 안내 화면 표시
      if (!firebaseEnabled || !auth || !db) {
        setConfigError(true);
        return;
      }

      try {
        const initialAuthToken =
          typeof window !== "undefined" && typeof window.__initial_auth_token !== "undefined"
            ? window.__initial_auth_token
            : null;

        // 이미 이메일/비번 등으로 로그인된 경우(교사)에는 익명 로그인으로 덮어쓰지 않습니다.
        if (auth.currentUser && !auth.currentUser.isAnonymous) {
          return;
        }

        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('인증 오류:', error);
        // 네트워크 차단 오류 발생 시 구체적인 안내 메시지 제공
        if (error.code === 'auth/network-request-failed') {
          setAuthErrorMsg(
            '네트워크 연결이 차단되었습니다. 학교/관공서 방화벽이거나 브라우저의 광고 차단 프로그램(AdBlock)이 원인일 수 있습니다.'
          );
        } else {
          setAuthErrorMsg(`데이터베이스 인증에 실패했습니다: ${error.message}`);
        }
      }
    };

    initAuth();

    // auth가 없는 환경(환경변수 미설정 등)에서는 구독을 만들지 않습니다.
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) setFirebaseUser(user);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!firebaseUser || !db) return;

      // 익명 로그인(학생용)인 경우는 교사 체크 안 함
      if (firebaseUser.isAnonymous) {
        setTeacherStatus("none");
        setTenantId(null);
        setTeacherCode("");
        return;
      }

      const email = firebaseUser.email || "";
      setTeacherEmail(email);

      const tRef = doc(db, "artifacts", currentAppId, "private", "data", "teachers", firebaseUser.uid);
      const snap = await getDoc(tRef);

      // teachers 문서가 없으면: 자동으로 pending 생성(승인요청)
      if (!snap.exists()) {
        await setDoc(tRef, { email, status: "pending", createdAt: Date.now() });
        setTeacherStatus("pending");
        setView("teacherPending");
        return;
      }

      const status = snap.data()?.status || "pending";

      if (status === "approved") {
        const tid = firebaseUser.uid;
        const code = tid.slice(0, 8).toUpperCase(); // 학생 로그인용 교사코드

        setTeacherStatus("approved");
        setTenantId(tid);
        setTeacherCode(code);

        // teacherCode -> tenantId 매핑(학생 로그인에서 사용)
        await setDoc(
          doc(db, "artifacts", currentAppId, "public", "data", "teacherIndex", code),
          { tenantId: tid, email, updatedAt: Date.now() },
          { merge: true }
        );

        setCurrentUser({ role: "admin", uid: tid, email });
        setView("admin");
      } else {
        setTeacherStatus("pending");
        setTenantId(null);
        setTeacherCode("");
        setView("teacherPending");
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db || !tenantId) return;

    // 테넌트 바뀌면 로딩 다시
    setIsDbReady(false);
    setStudents([]);
    setSessions([]);
    setClassActiveSettings({});

    const studentsRef = collection(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "students");
    const sessionsRef = collection(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "sessions");
    const settingsRef = collection(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "settings");

    const unsubStudents = onSnapshot(studentsRef, (snap) => setStudents(snap.docs.map((d) => d.data())));
    const unsubSessions = onSnapshot(sessionsRef, (snap) => setSessions(snap.docs.map((d) => d.data())));
    const unsubSettings = onSnapshot(settingsRef, (snap) => {
      const docSnap = snap.docs.find((d) => d.id === "classActiveSettings");
      if (docSnap) setClassActiveSettings(docSnap.data());
      setIsDbReady(true);
    });

    return () => { unsubStudents(); unsubSessions(); unsubSettings(); };
  }, [firebaseUser, tenantId]);

  const teacherSignup = async (email, password) => {
    if (!auth || !db) return;

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // teachers/{uid} 문서 생성 (승인대기)
    const tRef = doc(db, "artifacts", currentAppId, "private", "data", "teachers", cred.user.uid);
    await setDoc(tRef, {
      email,
      status: "pending",
      createdAt: Date.now(),
    });

    setTeacherEmail(email);
    setTeacherStatus("pending");
    setView("teacherPending");
  };

  const teacherLogin = async (email, password) => {
    if (!auth) return;
    await signInWithEmailAndPassword(auth, email, password);
    // 로그인 후 권한 체크는 onAuthStateChanged에서 자동 처리
  };

  const teacherLogout = async () => {
    if (!auth) return;

    await signOut(auth);

    // 학생 기능 유지하려면 익명 로그인으로 복귀 (실패해도 앱은 login으로 이동)
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.warn("익명 로그인 복귀 실패:", e);
    }

    setTeacherStatus("none");
    setTeacherEmail("");
    setCurrentUser(null);

    // 테넌트/데이터 초기화
    setTenantId(null);
    setTeacherCode("");
    setStudents([]);
    setSessions([]);
    setClassActiveSettings({});
    setIsDbReady(false);

    setView("login");
  };

  // --- 2. 클라우드 데이터베이스 쓰기 함수 묶음 ---
  const dbOps = {
    addStudents: async (newStudents) => {
      if (!db || !tenantId) return;
      for (const student of newStudents) {
        await setDoc(doc(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "students", student.id), student);
      }
    },

    deleteStudent: async (id) => {
      if (!db || !tenantId) return;
      await deleteDoc(doc(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "students", id));
    },

    saveSession: async (session) => {
      if (!db || !tenantId) return;
      await setDoc(doc(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "sessions", session.id), session);
    },

    deleteSession: async (id) => {
      if (!db || !tenantId) return;
      await deleteDoc(doc(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "sessions", id));
    },

    // ✅ 반×학습지 제출 설정 저장 (v2 구조로 정규화해서 저장)
    updateClassSettings: async (rawSettings) => {
      if (!db || !tenantId) return;

      const reserved = new Set(["version", "defaultByClass", "bySession", "updatedAt"]);
      const input = rawSettings && typeof rawSettings === "object" ? rawSettings : {};

      const hasV2 = input.defaultByClass || input.bySession;

      // old 형태( { "경제A": true, "경제B": false } )면 v2로 변환
      if (!hasV2) {
        const normalized = {
          version: 2,
          defaultByClass: { ...input },
          bySession: {},
          updatedAt: Date.now(),
        };
        await setDoc(
          doc(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "settings", "classActiveSettings"),
          normalized
        );
        return;
      }

      // v2 형태인데, 실수로 top-level에 반키가 들어온 경우 흡수
      const defaultByClass = { ...(input.defaultByClass || {}) };
      Object.keys(input).forEach((k) => {
        if (!reserved.has(k) && typeof input[k] === "boolean") {
          defaultByClass[k] = input[k];
        }
      });

      const normalized = {
        version: 2,
        defaultByClass,
        bySession: { ...(input.bySession || {}) },
        updatedAt: Date.now(),
      };

      await setDoc(
        doc(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "settings", "classActiveSettings"),
        normalized
      );
    },

    // ✅ 학생 제출 저장 (scoreData에 answers도 포함 가능)
    submitTest: async (studentId, sessionId, scoreData) => {
      if (!db || !tenantId) return;
      const student = students.find((s) => s.id === studentId);
      if (!student) return;
      const updatedStudent = { ...student, scores: { ...student.scores, [sessionId]: scoreData } };
      await setDoc(
        doc(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "students", studentId),
        updatedStudent,
        { merge: true }
      );
    },

    // ✅ 제출 초기화(삭제) = 다시 제출 가능
    resetSubmission: async (studentId, sessionId) => {
      if (!db || !tenantId) return;
      await updateDoc(doc(db, "artifacts", currentAppId, "tenants", tenantId, "public", "data", "students", studentId), {
        [`scores.${sessionId}`]: deleteField(),
      });
    },
  };

  const handleStudentLogin = async (teacherCodeInput, codeInput) => {
    if (!db) return false;

    const tcode = (teacherCodeInput || "").trim().toUpperCase();
    const code = (codeInput || "").trim().toUpperCase();
    if (!tcode || !code) return false;

    try {
      // 1) teacherCode -> tenantId
      const idxRef = doc(db, "artifacts", currentAppId, "public", "data", "teacherIndex", tcode);
      const idxSnap = await getDoc(idxRef);
      if (!idxSnap.exists()) return false;

      const tid = idxSnap.data()?.tenantId;
      if (!tid) return false;

      setTenantId(tid);
      setTeacherCode(tcode);

      // 2) 해당 테넌트에서 학생코드 검색
      const studentsCol = collection(db, "artifacts", currentAppId, "tenants", tid, "public", "data", "students");
      const q = query(studentsCol, where("code", "==", code));
      const res = await getDocs(q);
      if (res.empty) return false;

      const student = res.docs[0].data();
      setCurrentUser({ role: "student", ...student });
      setView("student");
      return true;
    } catch (e) {
      console.error("학생 로그인 조회 실패:", e);
      return false;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setView("login");
    setTenantId(null);
    setTeacherCode("");
    setStudents([]);
    setSessions([]);
    setClassActiveSettings({});
    setIsDbReady(false);
  };

  const getUpdatedCurrentUser = () => {
    if (currentUser?.role === 'student') {
      return students.find((s) => s.id === currentUser.id) || currentUser;
    }
    return currentUser;
  };

  // 1. 코드 초기화 에러 처리 화면
  if (configError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
        <AlertCircle className="text-red-500 mb-4" size={48} />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">파이어베이스 연결 정보가 필요합니다</h2>
        <p className="text-gray-600 max-w-md">
          Firebase 연결 정보가 없습니다. <strong className="text-gray-900">Vercel 환경변수</strong> 또는 로컬{' '}
          <strong className="text-gray-900">.env</strong>에 아래 값을 넣어주세요: <br />
          <span className="font-mono">REACT_APP_FIREBASE_API_KEY</span>,{' '}
          <span className="font-mono">REACT_APP_FIREBASE_AUTH_DOMAIN</span>,{' '}
          <span className="font-mono">REACT_APP_FIREBASE_PROJECT_ID</span>,{' '}
          <span className="font-mono">REACT_APP_FIREBASE_STORAGE_BUCKET</span>,{' '}
          <span className="font-mono">REACT_APP_FIREBASE_MESSAGING_SENDER_ID</span>,{' '}
          <span className="font-mono">REACT_APP_FIREBASE_APP_ID</span>.
        </p>
      </div>
    );
  }

  // 2. 네트워크 및 인증 통신 에러 처리 화면
  if (authErrorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
        <AlertCircle className="text-red-500 mb-4" size={48} />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">접속 오류 발생</h2>
        <p className="text-gray-600 max-w-md mb-6 leading-relaxed">{authErrorMsg}</p>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-left text-sm text-gray-700 max-w-md w-full">
          <strong className="block text-gray-900 mb-2">해결 방법:</strong>
          <ul className="list-disc pl-5 space-y-1">
            <li>스마트폰 모바일 데이터(LTE/5G)로 연결하여 테스트해 보세요.</li>
            <li>브라우저에 설치된 광고 차단 프로그램(AdBlock 등)을 잠시 꺼주세요.</li>
            <li>Brave 브라우저의 경우 주소창 우측의 방패(실드) 아이콘을 눌러 해제해 주세요.</li>
          </ul>
        </div>
      </div>
    );
  }

  // 3. 정상 로딩 중 화면
  const needsData = view === "admin" || view === "student" || view === "test";
  if (needsData && !isDbReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader className="animate-spin text-blue-600 mb-4" size={48} />
        <h2 className="text-xl font-bold text-gray-700">클라우드 데이터베이스 연결 중...</h2>
        <p className="text-gray-500 mt-2">잠시만 기다려주세요.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      {view === "login" && (
        <LoginScreen
          onTeacherLogin={teacherLogin}
          onTeacherSignup={teacherSignup}
          onStudentLogin={handleStudentLogin}
        />
      )}
      {view === "teacherPending" && (
        <TeacherPendingScreen email={teacherEmail} status={teacherStatus} onLogout={teacherLogout} />
      )}
      {view === 'admin' && (
        <AdminDashboard
          students={students}
          dbOps={dbOps}
          sessions={sessions}
          classActiveSettings={classActiveSettings}
          logout={teacherLogout}
          teacherCode={teacherCode}
        />
      )}
      {view === 'student' && (
        <StudentDashboard
          currentUser={getUpdatedCurrentUser()}
          sessions={sessions}
          setView={setView}
          setCurrentSessionId={setCurrentSessionId}
          logout={logout}
          classActiveSettings={classActiveSettings}
        />
      )}
      {view === 'test' && (
        <TestScreen
          currentUser={getUpdatedCurrentUser()}
          sessionId={currentSessionId}
          sessions={sessions}
          dbOps={dbOps}
          setView={setView}
          testResult={testResult}
          setTestResult={setTestResult}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// UI 컴포넌트들 (LoginScreen, AdminDashboard 등)
// ---------------------------------------------------------

function LoginScreen({ onTeacherLogin, onTeacherSignup, onStudentLogin }) {
  const [mode, setMode] = useState(null); // null | "student" | "teacher"
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [teacherCodeInput, setTeacherCodeInput] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");

  const submitTeacher = async () => {
    setError("");
    try {
      if (isSignup) await onTeacherSignup(email, pw);
      else await onTeacherLogin(email, pw);
    } catch (e) {
      setError(e?.message || "로그인/회원가입 실패");
    }
  };

  const submitStudent = async (e) => {
    e.preventDefault();
    setError("");
    const ok = await onStudentLogin(teacherCodeInput, studentCode);
    if (!ok) setError("교사코드 또는 개인코드(학생코드)가 올바르지 않습니다.");
  };

  if (!mode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">수학 평가 시스템</h1>

          <div className="space-y-4 mt-8">
            <button
              onClick={() => setMode("student")}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-lg"
            >
              학생 로그인
            </button>

            <button
              onClick={() => setMode("teacher")}
              className="w-full py-4 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl font-semibold text-lg"
            >
              교사 로그인
            </button>
          </div>

          <div className="mt-8 pt-4 border-t text-xs text-gray-500">
            © {new Date().getFullYear()} 제작: 수학교사 이수연
          </div>
        </div>
      </div>
    );
  }

  if (mode === "teacher") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md">
          <button onClick={() => setMode(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-6">
            ← 뒤로 가기
          </button>

          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">
            {isSignup ? "교사 회원가입(승인요청)" : "교사 로그인"}
          </h2>

          <div className="flex gap-2 mb-4">
            <button
              className={`flex-1 py-2 rounded-lg font-bold ${!isSignup ? "bg-blue-600 text-white" : "bg-gray-100"}`}
              onClick={() => setIsSignup(false)}
            >
              로그인
            </button>
            <button
              className={`flex-1 py-2 rounded-lg font-bold ${isSignup ? "bg-blue-600 text-white" : "bg-gray-100"}`}
              onClick={() => setIsSignup(true)}
            >
              회원가입
            </button>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-3"
            placeholder="teacher@email.com"
          />

          <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4"
            placeholder="비밀번호"
          />

          {error && <div className="text-red-500 text-sm mb-3">{error}</div>}

          <button
            onClick={submitTeacher}
            className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-lg font-bold"
          >
            {isSignup ? "가입하고 승인요청" : "로그인"}
          </button>

          <p className="text-xs text-gray-500 mt-3">
            회원가입 후에는 관리자가 승인해야 교사 화면을 사용할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  // 학생
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md">
        <button onClick={() => setMode(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-6">
          ← 뒤로 가기
        </button>

        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">학생 로그인</h2>

        <form onSubmit={submitStudent} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">교사코드</label>
            <input
              value={teacherCodeInput}
              onChange={(e) => setTeacherCodeInput(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none uppercase mb-3"
              placeholder="예: 1A2B3C4D"
            />
            <label className="block text-sm font-medium text-gray-700 mb-1">개인코드</label>
            <input
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg outline-none uppercase"
              placeholder="예: A001"
              autoFocus
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard({ students, dbOps, sessions, classActiveSettings, logout, teacherCode }) {
  const [activeTab, setActiveTab] = useState('students');

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-64 bg-slate-800 text-white flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileCheck className="text-blue-400" /> 수학 평가 관리
          </h1>
          {teacherCode ? (
            <div className="mt-2 text-xs text-slate-300">
              교사코드: <span className="font-mono font-bold text-white">{teacherCode}</span>
              <div className="text-[10px] text-slate-400 mt-1">학생 로그인 시 교사코드 + 개인코드 입력</div>
            </div>
          ) : null}
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <button
            onClick={() => setActiveTab('students')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'students' ? 'bg-blue-600' : 'hover:bg-slate-700'
              }`}
          >
            <Users size={20} /> 학생 명렬표 관리
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'sessions' ? 'bg-blue-600' : 'hover:bg-slate-700'
              }`}
          >
            <FileText size={20} /> 학습지(차시) 관리
          </button>
          <button
            onClick={() => setActiveTab('controls')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'controls' ? 'bg-blue-600' : 'hover:bg-slate-700'
              }`}
          >
            <Settings size={20} /> 반별 제출 관리
          </button>
          <button
            onClick={() => setActiveTab('scores')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'scores' ? 'bg-blue-600' : 'hover:bg-slate-700'
              }`}
          >
            <BarChart size={20} /> 실시간 성적 확인
          </button>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2 text-slate-300 hover:text-white transition-colors"
          >
            <LogOut size={20} /> 로그아웃
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 relative">
        {activeTab === 'students' && (
          <AdminStudents students={students} dbOps={dbOps} classActiveSettings={classActiveSettings} />
        )}
        {activeTab === 'sessions' && <AdminSessions sessions={sessions} dbOps={dbOps} />}
        {activeTab === 'controls' && (
          <AdminControls students={students} sessions={sessions} classActiveSettings={classActiveSettings} dbOps={dbOps} />
        )}
        {activeTab === 'scores' && <AdminScores students={students} sessions={sessions} dbOps={dbOps} />}
      </div>
    </div>
  );
}

function AdminStudents({ students, dbOps, classActiveSettings }) {
  const [bulkText, setBulkText] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBulkAdd = async () => {
    if (!bulkText.trim()) return;
    setIsProcessing(true);

    const lines = bulkText.split('\n');
    const newStudents = [];
    const newClassGroups = new Set();

    lines.forEach((line) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const classGroup = parts[0];
        const hakbun = parts[1];
        const name = parts[2];
        const code = parts[3];

        newClassGroups.add(classGroup);

        newStudents.push({
          id: Math.random().toString(36).substring(2, 9),
          classGroup,
          hakbun,
          name,
          code,
          scores: {}
        });
      }
    });

    if (newStudents.length > 0) {
      const existingIds = students.map((s) => s.hakbun);
      const filteredNew = newStudents.filter((n) => !existingIds.includes(n.hakbun));

      await dbOps.addStudents(filteredNew);

      const updatedSettings = { ...classActiveSettings };
      let settingsChanged = false;
      newClassGroups.forEach((cg) => {
        if (updatedSettings[cg] === undefined) {
          updatedSettings[cg] = true;
          settingsChanged = true;
        }
      });
      if (settingsChanged) {
        await dbOps.updateClassSettings(updatedSettings);
      }

      setBulkText('');
    }
    setIsProcessing(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold mb-6">학생 명렬표 클라우드 등록</h2>

      <div className="mb-8 bg-blue-50 p-4 rounded-lg border border-blue-100">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-blue-800 flex items-center gap-2">
            <Upload size={18} /> 명렬표 붙여넣기
          </h3>
          <button onClick={() => setShowGuide(!showGuide)} className="text-sm text-blue-600 underline">
            작성 방법 안내
          </button>
        </div>
        {showGuide && (
          <p className="text-sm text-gray-600 mb-3 bg-white p-3 rounded border border-blue-200">
            엑셀 파일에서 <strong>[반] [학번] [이름] [개인코드]</strong> 4개의 열을 복사하여 아래 빈칸에
            붙여넣기 하세요.
            <br />
            예시:
            <br />
            경제A 30101 경다현 A001
            <br />
            경제B 30106 김혜인 A006
          </p>
        )}
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder="경제A 30101 경다현 A001&#10;경제B 30106 김혜인 A006&#10;과 같이 입력하세요."
          className="w-full h-32 p-3 border border-gray-300 rounded-lg mb-3 resize-none outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
        <button
          onClick={handleBulkAdd}
          disabled={isProcessing}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isProcessing ? '클라우드 등록 중...' : '학생 일괄 등록'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-100 text-gray-700 border-b-2 border-gray-200">
              <th className="p-3 w-28">반</th>
              <th className="p-3 w-32">학번</th>
              <th className="p-3">이름</th>
              <th className="p-3">개인코드 (로그인용)</th>
              <th className="p-3 w-20">관리</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-8 text-center text-gray-500">
                  등록된 학생이 없습니다.
                </td>
              </tr>
            ) : (
              students
                .sort((a, b) => a.classGroup.localeCompare(b.classGroup) || a.hakbun.localeCompare(b.hakbun))
                .map((student) => (
                  <tr key={student.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium text-blue-800">{student.classGroup}</td>
                    <td className="p-3 font-mono">{student.hakbun}</td>
                    <td className="p-3 font-medium">{student.name}</td>
                    <td className="p-3">
                      <span className="bg-green-100 text-green-800 px-3 py-1 rounded font-mono font-bold tracking-wider">
                        {student.code}
                      </span>
                    </td>
                    <td className="p-3">
                      <button onClick={() => dbOps.deleteStudent(student.id)} className="text-red-500 hover:text-red-700 text-sm">
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminSessions({ sessions, dbOps }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newSession, setNewSession] = useState({ title: '', answers: ['', '', '', '', ''], pdfUrl: null });
  const [uploadError, setUploadError] = useState('');

  const handlePdfUpload = (e) => {
    const file = e.target.files[0];
    setUploadError('');
    if (file && file.type === 'application/pdf') {
      if (file.size > 800 * 1024) {
        setUploadError('PDF 용량이 너무 큽니다 (최대 800KB). 용량을 줄이거나 PDF 없이 문제만 등록해 주세요.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setNewSession({ ...newSession, pdfUrl: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSession = async () => {
    if (!newSession.title) return;
    const sessionData = { ...newSession, id: 's' + Date.now() };
    await dbOps.saveSession(sessionData);
    setIsAdding(false);
    setNewSession({ title: '', answers: ['', '', '', '', ''], pdfUrl: null });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">학습지(차시) 관리</h2>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus size={18} /> 새 차시 등록
        </button>
      </div>

      {isAdding && (
        <div className="bg-gray-50 p-6 rounded-xl mb-8 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">새 학습지 정보 입력</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">차시 제목</label>
              <input
                type="text"
                value={newSession.title}
                onChange={(e) => setNewSession({ ...newSession, title: e.target.value })}
                placeholder="예: 2차시: 나머지 정리와 인수분해"
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PDF 학습지 업로드 (선택, 최대 800KB)</label>
              <input type="file" accept=".pdf" onChange={handlePdfUpload} className="w-full p-2 border rounded bg-white" />
              {uploadError && <p className="text-sm text-red-600 mt-1">{uploadError}</p>}
              {newSession.pdfUrl && !uploadError && <p className="text-sm text-green-600 mt-1">PDF가 첨부되었습니다.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">정답 입력 (5문항, 각 20점)</label>
              <div className="flex gap-4">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <div key={idx} className="flex-1">
                    <span className="block text-xs text-gray-500 mb-1">{idx + 1}번 정답</span>
                    <input
                      type="text"
                      value={newSession.answers[idx]}
                      onChange={(e) => {
                        const newAnswers = [...newSession.answers];
                        newAnswers[idx] = e.target.value;
                        setNewSession({ ...newSession, answers: newAnswers });
                      }}
                      className="w-full p-2 border rounded text-center"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-gray-600 bg-gray-200 rounded hover:bg-gray-300">
                취소
              </button>
              <button onClick={handleSaveSession} className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sessions.map((session) => (
          <div key={session.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow relative bg-white">
            <button onClick={() => dbOps.deleteSession(session.id)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500">
              <X size={20} />
            </button>
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mb-4">
              <FileText size={20} />
            </div>
            <h3 className="font-bold text-lg mb-2">{session.title}</h3>
            <p className="text-sm text-gray-500 mb-4">{session.pdfUrl ? 'PDF 첨부됨' : 'PDF 미첨부'} • 5문항 (100점 만점)</p>
            <div className="bg-gray-50 p-2 rounded text-sm text-gray-700">
              <span className="font-semibold">정답:</span> {session.answers.join(', ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminControls({ students, sessions, classActiveSettings, dbOps }) {
  const classes = [...new Set(students.map((s) => s.classGroup))].sort((a, b) => a.localeCompare(b));
  const [selectedSessionId, setSelectedSessionId] = useState("__default__"); // 기본(전체) or 특정 sessionId

  // settings 읽기: old/v2 모두 대응
  const getEnabled = (cls, sessionId) => {
    const s = classActiveSettings || {};
    const isV2 = s?.defaultByClass || s?.bySession;

    if (!isV2) {
      // old: { "경제A": true }
      const v = s?.[cls];
      return typeof v === "boolean" ? v : true;
    }

    const bySession = s.bySession?.[sessionId];
    if (bySession && typeof bySession[cls] === "boolean") return bySession[cls];

    const def = s.defaultByClass?.[cls];
    if (typeof def === "boolean") return def;

    return true;
  };

  const toggle = async (cls) => {
    const current = getEnabled(cls, selectedSessionId);
    const next = !current;

    const s = classActiveSettings || {};
    const isV2 = s?.defaultByClass || s?.bySession;

    // v2로 맞춰서 업데이트할 객체 만들기
    const nextSettings = isV2
      ? { ...s, defaultByClass: { ...(s.defaultByClass || {}) }, bySession: { ...(s.bySession || {}) } }
      : { version: 2, defaultByClass: { ...s }, bySession: {} };

    if (selectedSessionId === "__default__") {
      // 기본(전체) 반 스위치
      nextSettings.defaultByClass[cls] = next;
    } else {
      // 특정 학습지(차시) 반 스위치
      nextSettings.bySession[selectedSessionId] = {
        ...(nextSettings.bySession[selectedSessionId] || {}),
        [cls]: next,
      };
    }

    await dbOps.updateClassSettings(nextSettings);
  };

  const setAll = async (value) => {
    const s = classActiveSettings || {};
    const isV2 = s?.defaultByClass || s?.bySession;

    const nextSettings = isV2
      ? { ...s, defaultByClass: { ...(s.defaultByClass || {}) }, bySession: { ...(s.bySession || {}) } }
      : { version: 2, defaultByClass: { ...s }, bySession: {} };

    if (selectedSessionId === "__default__") {
      classes.forEach((cls) => (nextSettings.defaultByClass[cls] = value));
    } else {
      const map = { ...(nextSettings.bySession[selectedSessionId] || {}) };
      classes.forEach((cls) => (map[cls] = value));
      nextSettings.bySession[selectedSessionId] = map;
    }

    await dbOps.updateClassSettings(nextSettings);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-2xl font-bold">반 × 학습지별 제출 ON/OFF</h2>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAll(true)}
            className="px-3 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
          >
            모두 ON
          </button>
          <button
            onClick={() => setAll(false)}
            className="px-3 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
          >
            모두 OFF
          </button>
        </div>
      </div>

      <p className="text-gray-500 mb-4">
        “기본(전체)”은 모든 학습지에 적용되는 기본값이고, 특정 학습지를 선택하면 그 학습지에서만 반별로 따로 ON/OFF 할 수 있습니다.
      </p>

      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm font-bold text-gray-700">학습지 선택:</span>
        <select
          value={selectedSessionId}
          onChange={(e) => setSelectedSessionId(e.target.value)}
          className="p-2 border rounded-lg bg-gray-50 outline-none font-medium"
        >
          <option value="__default__">기본(전체)</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      {classes.length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg">등록된 학생이 없어 반 목록이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => {
            const enabled = getEnabled(cls, selectedSessionId);
            return (
              <div
                key={cls}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-lg font-bold text-gray-800">{cls}</span>
                <button
                  onClick={() => toggle(cls)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-colors ${enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                >
                  {enabled ? (
                    <>
                      <ToggleRight size={24} /> 제출 ON
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={24} /> 제출 OFF
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminScores({ students, sessions, dbOps }) {
  const classes = [...new Set(students.map((s) => s.classGroup))].sort((a, b) => a.localeCompare(b));
  const [selectedClass, setSelectedClass] = useState(classes[0] || "");
  const [reviewTarget, setReviewTarget] = useState(null);

  useEffect(() => {
    if (!classes.includes(selectedClass) && classes.length > 0) {
      setSelectedClass(classes[0]);
    }
  }, [classes, selectedClass]);

  const filteredStudents = students
    .filter((s) => s.classGroup === selectedClass)
    .sort((a, b) => a.hakbun.localeCompare(b.hakbun));

  // ✅ CSV(엑셀) 다운로드
  const escapeCSV = (v) => {
    const s = (v ?? "").toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const downloadScoresCSV = () => {
    const headers = ["반", "학번", "이름", "총점", ...sessions.map((s) => s.title)];
    const rows = filteredStudents.map((st) => {
      const total = sessions.reduce((sum, s) => sum + (Number(st.scores?.[s.id]?.score) || 0), 0);
      const perSession = sessions.map((s) => st.scores?.[s.id]?.score ?? "");
      return [st.classGroup, st.hakbun, st.name, total, ...perSession];
    });

    // 엑셀 한글 깨짐 방지 BOM
    const csv = "\ufeff" + [headers, ...rows].map((r) => r.map(escapeCSV).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `성적_${selectedClass || "전체"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ✅ 제출 초기화(재제출 허용)
  const resetOne = async (student, session) => {
    const ok = window.confirm(
      `${student.classGroup} ${student.hakbun} ${student.name} 학생의\n[${session.title}] 제출을 초기화할까요?\n(초기화 후 학생은 다시 제출할 수 있습니다)`
    );
    if (!ok) return;
    await dbOps.resetSubmission(student.id, session.id);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">학급별 실시간 성적 확인</h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadScoresCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
          >
            엑셀 다운로드(CSV)
          </button>

          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="p-2 border rounded-lg bg-gray-50 outline-none font-medium"
          >
            {classes.map((c) => (
              <option key={c} value={c}>
                {c} 성적 보기
              </option>
            ))}
          </select>
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="text-center p-10 text-gray-500 border rounded-lg bg-gray-50">
          등록된 학생 데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-200 text-sm">
                <th className="p-3 w-28">학번</th>
                <th className="p-3 w-32">이름</th>
                <th className="p-3 w-24 font-bold text-blue-700 border-r border-gray-200">총점</th>
                {sessions.map((s) => (
                  <th key={s.id} className="p-3 font-medium text-gray-700 min-w-[170px]">
                    {s.title}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredStudents.map((student) => {
                const totalScore = sessions.reduce(
                  (sum, s) => sum + (Number(student.scores?.[s.id]?.score) || 0),
                  0
                );

                return (
                  <tr key={student.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-500 font-mono">{student.hakbun}</td>
                    <td className="p-3 font-medium">{student.name}</td>
                    <td className="p-3 font-black text-blue-600 border-r border-gray-200">
                      {totalScore}점
                    </td>

                    {sessions.map((s) => {
                      const submission = student.scores?.[s.id];
                      return (
                        <td key={s.id} className="p-3">
                          {submission ? (
                            <div className="flex flex-col items-center gap-1">
                              {/* ✅ 점수 클릭 → 답안/정답/맞틀 모달 */}
                              <button
                                type="button"
                                onClick={() => setReviewTarget({ student, session: s, submission })}
                                className="text-blue-600 font-bold hover:underline"
                              >
                                {submission.score}점
                              </button>

                              <span className="text-xs text-gray-400">{submission.submittedAt}</span>

                              {/* ✅ 초기화 버튼 */}
                              <button
                                type="button"
                                onClick={() => resetOne(student, s)}
                                className="mt-1 text-xs px-2 py-1 rounded bg-red-100 text-red-700 font-bold hover:bg-red-200"
                              >
                                초기화(재제출)
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-sm">미제출</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ✅ 답안 리뷰 모달(이미 파일 아래에 AnswerReviewModal이 있어야 함) */}
      <AnswerReviewModal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        session={reviewTarget?.session}
        submission={reviewTarget?.submission}
        studentLabel={
          reviewTarget?.student
            ? `${reviewTarget.student.classGroup} ${reviewTarget.student.hakbun} ${reviewTarget.student.name}`
            : ""
        }
      />
    </div>
  );
}

function StudentDashboard({ currentUser, sessions, setView, setCurrentSessionId, logout, classActiveSettings }) {
  const [reviewTarget, setReviewTarget] = useState(null);

  // ✅ 총점은 scores 기준으로 안정 계산
  const totalScore = Object.values(currentUser.scores || {}).reduce(
    (sum, v) => sum + (Number(v?.score) || 0),
    0
  );

  // ✅ old/v2 설정 모두 대응: (반, 학습지) 제출 가능 여부
  const canSubmit = (classGroup, sessionId) => {
    const s = classActiveSettings || {};
    const isV2 = s?.defaultByClass || s?.bySession;

    if (!isV2) {
      const v = s?.[classGroup];
      return typeof v === "boolean" ? v : true;
    }

    const bySession = s.bySession?.[sessionId];
    if (bySession && typeof bySession[classGroup] === "boolean") return bySession[classGroup];

    const def = s.defaultByClass?.[classGroup];
    if (typeof def === "boolean") return def;

    return true;
  };

  const handleStartTest = (sessionId) => {
    setCurrentSessionId(sessionId);
    setView("test");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-md flex items-center justify-center font-bold">M</div>
          <span className="font-bold text-lg">나의 수학 학습장</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-700 font-medium hidden sm:inline-block">
            <span className="text-blue-800 font-bold mr-2">{currentUser.classGroup}</span>
            <span className="font-mono text-gray-500 mr-1">{currentUser.hakbun}</span>
            <span className="text-black font-bold">{currentUser.name}</span> 학생
          </span>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1">
            <LogOut size={16} /> 로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto mt-8 px-4">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold opacity-90 mb-1">내 누적 총점</h2>
            <p className="text-blue-100 text-sm">완료한 학습지의 합산 점수입니다.</p>
          </div>
          <div className="text-4xl font-black">
            {totalScore}
            <span className="text-2xl font-bold opacity-80 ml-1">점</span>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-6">학습지 목록</h1>

        <div className="grid gap-4">
          {sessions.length === 0 ? (
            <div className="bg-white p-10 text-center rounded-xl border border-gray-200 text-gray-500">
              등록된 학습지가 없습니다.
            </div>
          ) : (
            sessions.map((session) => {
              const submission = currentUser.scores?.[session.id];
              const isCompleted = submission !== undefined;
              const isOpen = canSubmit(currentUser.classGroup, session.id);

              return (
                <div
                  key={session.id}
                  className={`bg-white p-6 rounded-xl shadow-sm border ${isCompleted ? "border-green-200 bg-green-50/30" : "border-gray-200"
                    } flex flex-col sm:flex-row items-center justify-between gap-4 hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div
                      className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${isCompleted ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                        }`}
                    >
                      {isCompleted ? <CheckCircle size={24} /> : <FileText size={24} />}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">{session.title}</h3>
                      {isCompleted ? (
                        <p className="text-xs text-green-600 font-medium flex items-center gap-1 mt-1">
                          <Clock size={12} /> 제출완료: {submission.submittedAt}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 mt-1">5문항 • 100점 만점</p>
                      )}
                    </div>
                  </div>

                  <div className="w-full sm:w-auto">
                    {isCompleted ? (
                      <div className="text-right sm:text-center w-full">
                        <span className="block text-xs text-gray-500 mb-1">내 점수</span>
                        <button
                          type="button"
                          onClick={() => setReviewTarget({ session, submission })}
                          className="text-2xl font-black text-green-600 hover:underline"
                        >
                          {submission.score}점
                        </button>
                      </div>
                    ) : isOpen ? (
                      <button
                        onClick={() => handleStartTest(session.id)}
                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-sm"
                      >
                        학습지 풀기
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full sm:w-auto bg-gray-300 text-gray-500 px-6 py-3 rounded-lg font-semibold cursor-not-allowed"
                      >
                        제출 기간 아님
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* 답안/정답/맞틀 모달(이전에 추가한 것) */}
      <AnswerReviewModal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        session={reviewTarget?.session}
        submission={reviewTarget?.submission}
        studentLabel="내 제출"
      />
    </div>
  );
}

function TestScreen({ currentUser, sessionId, sessions, dbOps, setView, testResult, setTestResult }) {
  const session = sessions.find((s) => s.id === sessionId);
  const [answers, setAnswers] = useState(['', '', '', '', '']);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) return null;

  const initiateSubmit = () => {
    setShowConfirmModal(true);
  };

  const executeSubmit = async () => {
    setIsSubmitting(true);
    let score = 0;
    session.answers.forEach((ans, idx) => {
      if (ans.trim() === answers[idx].trim()) {
        score += 20;
      }
    });

    const submitTime = formatSubmitDate();

    // ✅ 핵심: 학생이 입력한 답(answers)을 같이 저장
    await dbOps.submitTest(currentUser.id, sessionId, {
      score,
      submittedAt: submitTime,
      answers: [...answers],
    });

    setIsSubmitting(false);
    setShowConfirmModal(false);
    setTestResult(score);
  };

  const handleCloseResultModal = () => {
    setTestResult(null);
    setView('student');
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">최종 제출 확인</h3>
            <p className="text-gray-600 mb-6">
              제출 후에는 <strong className="text-red-500">절대 수정하거나 재제출할 수 없습니다.</strong>
              <br />
              정말 제출하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300"
              >
                취소
              </button>
              <button
                onClick={executeSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? '제출 중...' : '제출하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-0 w-full h-14 bg-white border-b flex items-center justify-between px-4 z-20 shadow-sm">
        <div className="font-bold flex items-center gap-2">
          <FileText className="text-blue-600" size={18} /> {session.title}
        </div>
        <button
          onClick={() => setView('student')}
          className="text-sm text-gray-500 hover:bg-gray-100 px-3 py-1 rounded"
        >
          나가기
        </button>
      </div>

      <div className="flex-1 mt-14 bg-gray-800 relative hidden md:block">
        {session.pdfUrl ? (
          <iframe src={`${session.pdfUrl}#toolbar=0`} className="w-full h-full border-none" title="PDF Viewer" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
            <FileText size={64} className="opacity-50" />
            <p>교사님이 PDF 파일을 업로드하지 않았습니다.</p>
            <p className="text-sm">종이 학습지를 보고 우측에 답을 입력하세요.</p>
          </div>
        )}
      </div>

      <div className="w-full md:w-80 bg-white mt-14 md:border-l shadow-[-4px_0_15px_rgba(0,0,0,0.05)] flex flex-col z-10">
        <div className="p-4 bg-blue-50 border-b">
          <h2 className="font-bold text-blue-900 text-center">답안 제출 (OMR)</h2>
          <p className="text-xs text-center text-blue-600 mt-1">각 문항 20점 / 총 5문항</p>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs font-semibold flex items-start gap-2 leading-tight">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <p>
              한 번 제출하면 <strong>절대 수정 및 재제출</strong>이 불가능합니다. 신중하게 입력하세요.
            </p>
          </div>

          {[0, 1, 2, 3, 4].map((idx) => (
            <div key={idx} className="flex flex-col">
              <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 bg-gray-800 text-white rounded-full flex items-center justify-center text-xs">
                  {idx + 1}
                </span>
                번 문항 정답
              </label>
              <input
                type="text"
                value={answers[idx]}
                onChange={(e) => {
                  const newAnswers = [...answers];
                  newAnswers[idx] = e.target.value;
                  setAnswers(newAnswers);
                }}
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-0 outline-none text-center text-lg font-semibold transition-colors"
                placeholder="답 입력"
              />
            </div>
          ))}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={initiateSubmit}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-lg transition-colors shadow-sm"
          >
            최종 제출하기
          </button>
        </div>
      </div>

      {testResult !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center transform animate-bounce-short">
            <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={40} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">채점 완료!</h2>
            <p className="text-gray-600 mb-6">
              제출이 완료되어 클라우드에 저장되었습니다.
              <br />
              점수는
              <br />
              <span className="text-4xl font-black text-blue-600 mt-2 inline-block">{testResult}점</span> 입니다.
            </p>
            <button
              onClick={handleCloseResultModal}
              className="w-full py-3 bg-gray-800 text-white rounded-lg font-bold hover:bg-gray-900 transition-colors"
            >
              대시보드로 돌아가기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AnswerReviewModal({ open, onClose, session, submission, studentLabel }) {
  if (!open) return null;

  const totalQ = session?.answers?.length || 0;
  const unitScore = totalQ > 0 ? 100 / totalQ : 0;

  const normalize = (v) => (v ?? '').toString().trim();

  const studentAnswers = Array.isArray(submission?.answers) ? submission.answers : null;
  const correctAnswers = Array.isArray(session?.answers) ? session.answers : [];

  const rows = correctAnswers.map((correct, idx) => {
    const my = studentAnswers ? studentAnswers[idx] : '';
    const isCorrect = normalize(my) === normalize(correct);
    return { no: idx + 1, my, correct, isCorrect };
  });

  const computedScore = Math.round(
    rows.reduce((sum, r) => sum + (r.isCorrect ? unitScore : 0), 0)
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{session?.title || '학습지'}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {studentLabel ? <span className="font-medium text-gray-700">{studentLabel} · </span> : null}
              제출: {submission?.submittedAt || '-'} · 점수:{' '}
              <span className="font-bold text-blue-600">{submission?.score ?? computedScore}점</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={22} />
          </button>
        </div>

        <div className="p-6">
          {!studentAnswers ? (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg text-sm">
              이 제출 기록에는 <strong>학생 답안(answers)</strong>이 저장되어 있지 않습니다.
              <br />
              (이 기능 추가 이전에 제출된 기록일 수 있어요.)
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th className="p-3 w-16 text-center">번호</th>
                    <th className="p-3 text-center">학생 답</th>
                    <th className="p-3 text-center">정답</th>
                    <th className="p-3 w-24 text-center">채점</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.no} className="border-b">
                      <td className="p-3 text-center font-mono">{r.no}</td>
                      <td className="p-3 text-center font-semibold">{r.my}</td>
                      <td className="p-3 text-center font-semibold text-gray-700">{r.correct}</td>
                      <td className="p-3 text-center">
                        {r.isCorrect ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-bold">
                            <CheckCircle size={16} /> 정답
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                            <X size={16} /> 오답
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 text-right text-sm text-gray-600">
                자동채점 기준: 문항당 {totalQ ? (100 / totalQ).toFixed(1) : '0'}점 · 재계산 점수:{' '}
                <span className="font-bold">{computedScore}점</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeacherPendingScreen({ email, status, onLogout }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">승인 대기 중</h2>
      <p className="text-gray-500 mb-6">
        상태: {status === "approved" ? "승인됨" : "승인대기"}
      </p>
      <p className="text-gray-600 mb-6">
        교사 계정 <span className="font-mono font-bold">{email || "-"}</span> 은(는) 아직 관리자 승인이 필요합니다.
      </p>
      <button
        onClick={onLogout}
        className="px-6 py-3 bg-gray-900 text-white rounded-lg font-bold hover:bg-black"
      >
        로그아웃
      </button>
    </div>
  );
}