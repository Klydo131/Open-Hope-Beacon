'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// -------------------------------------------------------------------------
// Beacon i18n + display settings.
//
// A lightweight, dependency-free translation layer. t(key) returns the string
// for the active language, falling back to English for anything not translated
// yet — so the app is always usable while more of it is localized over time.
// Also holds the text-size scale (applied to the root font size) and RTL.
//
// English is the authoritative, complete source. Other languages are overlays:
// they may translate any subset of keys and fall back to English for the rest.
// This keeps the app fully usable while coverage grows language by language.
//
// NOTE FOR LAUNCH: the translations below cover the app's core vocabulary and
// the structural UI (titles, tabs, buttons, labels). They should be reviewed by
// a native speaker per language before going live. Long helper sentences are
// intentionally left in English until reviewed.
// -------------------------------------------------------------------------

export const LANGUAGES: { code: string; name: string; native: string; rtl?: boolean }[] =
  [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'pt', name: 'Portuguese', native: 'Português' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'it', name: 'Italian', native: 'Italiano' },
    { code: 'tl', name: 'Tagalog', native: 'Tagalog' },
    { code: 'ceb', name: 'Cebuano', native: 'Cebuano' },
    { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
    { code: 'zh', name: 'Chinese (Simplified)', native: '简体中文' },
    { code: 'ko', name: 'Korean', native: '한국어' },
    { code: 'ja', name: 'Japanese', native: '日本語' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
    { code: 'ru', name: 'Russian', native: 'Русский' },
    { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  ];

export type MsgKey =
  // Core vocabulary
  | 'signIn'
  | 'continue'
  | 'settings'
  | 'church'
  | 'language'
  | 'textSize'
  | 'save'
  | 'send'
  | 'takeTutorial'
  | 'welcome'
  | 'seekers'
  | 'missionaries'
  | 'members'
  | 'appTagline'
  | 'small'
  | 'normal'
  | 'large'
  | 'xlarge'
  // Settings
  | 'churchName'
  | 'churchData'
  // Admin
  | 'admin'
  | 'approvals'
  | 'peoplePairing'
  | 'materials'
  | 'analytics'
  | 'approve'
  | 'allCaughtUp'
  | 'createPairing'
  | 'activePairings'
  | 'pairThem'
  | 'missionary'
  | 'seeker'
  | 'track'
  | 'addMaterial'
  | 'library'
  | 'addToLibrary'
  | 'title'
  | 'recentActivity'
  | 'mostActive'
  | 'seekersByStage'
  | 'actionsByType'
  | 'localScope'
  | 'globalScope';

// English is complete and authoritative; every other language is a partial
// overlay (t() falls back to English for any missing key).
const EN: Record<MsgKey, string> = {
  signIn: 'Sign in',
  continue: 'Continue',
  settings: 'Settings',
  church: 'Church',
  language: 'Language',
  textSize: 'Text size',
  save: 'Save',
  send: 'Send',
  takeTutorial: 'Take the tutorial',
  welcome: 'Welcome',
  seekers: 'Explorers',
  missionaries: 'Missionaries',
  members: 'Members',
  appTagline: 'A church that walks with you, one step at a time.',
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
  xlarge: 'Extra large',
  churchName: 'Church name',
  churchData: 'Church data',
  admin: 'Admin',
  approvals: 'Approvals',
  peoplePairing: 'People & Pairing',
  materials: 'Materials',
  analytics: 'Analytics',
  approve: 'Approve',
  allCaughtUp: 'All caught up',
  createPairing: 'Create a pairing',
  activePairings: 'Active pairings',
  pairThem: 'Pair them',
  missionary: 'Missionary',
  seeker: 'Explorer',
  track: 'Track',
  addMaterial: 'Add material',
  library: 'Library',
  addToLibrary: 'Add to library',
  title: 'Title',
  recentActivity: 'Recent activity',
  mostActive: 'Most active people',
  seekersByStage: 'Explorers by stage',
  actionsByType: 'Actions by type',
  localScope: 'Local (this device)',
  globalScope: 'Global (aggregate)',
  };

const M: Record<string, Partial<Record<MsgKey, string>>> = {
  en: EN,
  es: {
    signIn: 'Iniciar sesión', continue: 'Continuar', settings: 'Ajustes', church: 'Iglesia', language: 'Idioma', textSize: 'Tamaño del texto', save: 'Guardar', send: 'Enviar', takeTutorial: 'Hacer el tutorial', welcome: 'Bienvenido', seekers: 'Buscadores', missionaries: 'Misioneros', members: 'Miembros', appTagline: 'Una iglesia que te acompaña, paso a paso.', small: 'Pequeño', normal: 'Normal', large: 'Grande', xlarge: 'Muy grande',
    churchName: 'Nombre de la iglesia', churchData: 'Datos de la iglesia', admin: 'Administración', approvals: 'Aprobaciones', peoplePairing: 'Personas y emparejamiento', materials: 'Materiales', analytics: 'Analíticas', approve: 'Aprobar', allCaughtUp: 'Todo al día', createPairing: 'Crear un emparejamiento', activePairings: 'Emparejamientos activos', pairThem: 'Emparejarlos', missionary: 'Misionero', seeker: 'Buscador', track: 'Vía', addMaterial: 'Añadir material', library: 'Biblioteca', addToLibrary: 'Añadir a la biblioteca', title: 'Título', recentActivity: 'Actividad reciente', mostActive: 'Personas más activas', seekersByStage: 'Buscadores por etapa', actionsByType: 'Acciones por tipo', localScope: 'Local (este dispositivo)', globalScope: 'Global (agregado)', },
  pt: {
    signIn: 'Entrar', continue: 'Continuar', settings: 'Configurações', church: 'Igreja', language: 'Idioma', textSize: 'Tamanho do texto', save: 'Salvar', send: 'Enviar', takeTutorial: 'Fazer o tutorial', welcome: 'Bem-vindo', seekers: 'Buscadores', missionaries: 'Missionários', members: 'Membros', appTagline: 'Uma igreja que caminha com você, um passo de cada vez.', small: 'Pequeno', normal: 'Normal', large: 'Grande', xlarge: 'Muito grande',
    churchName: 'Nome da igreja', churchData: 'Dados da igreja', admin: 'Administração', approvals: 'Aprovações', peoplePairing: 'Pessoas e pareamento', materials: 'Materiais', analytics: 'Análises', approve: 'Aprovar', allCaughtUp: 'Tudo em dia', createPairing: 'Criar um pareamento', activePairings: 'Pareamentos ativos', pairThem: 'Parear', missionary: 'Missionário', seeker: 'Buscador', track: 'Trilha', addMaterial: 'Adicionar material', library: 'Biblioteca', addToLibrary: 'Adicionar à biblioteca', title: 'Título', recentActivity: 'Atividade recente', mostActive: 'Pessoas mais ativas', seekersByStage: 'Buscadores por etapa', actionsByType: 'Ações por tipo', localScope: 'Local (este dispositivo)', globalScope: 'Global (agregado)', },
  fr: {
    signIn: 'Se connecter', continue: 'Continuer', settings: 'Paramètres', church: 'Église', language: 'Langue', textSize: 'Taille du texte', save: 'Enregistrer', send: 'Envoyer', takeTutorial: 'Suivre le tutoriel', welcome: 'Bienvenue', seekers: 'Chercheurs', missionaries: 'Missionnaires', members: 'Membres', appTagline: 'Une église qui marche avec vous, pas à pas.', small: 'Petit', normal: 'Normal', large: 'Grand', xlarge: 'Très grand',
    churchName: "Nom de l'église", churchData: "Données de l'église", admin: 'Administration', approvals: 'Approbations', peoplePairing: 'Personnes et jumelage', materials: 'Ressources', analytics: 'Statistiques', approve: 'Approuver', allCaughtUp: 'Tout est à jour', createPairing: 'Créer un jumelage', activePairings: 'Jumelages actifs', pairThem: 'Les jumeler', missionary: 'Missionnaire', seeker: 'Chercheur', track: 'Parcours', addMaterial: 'Ajouter une ressource', library: 'Bibliothèque', addToLibrary: 'Ajouter à la bibliothèque', title: 'Titre', recentActivity: 'Activité récente', mostActive: 'Personnes les plus actives', seekersByStage: 'Chercheurs par étape', actionsByType: 'Actions par type', localScope: 'Local (cet appareil)', globalScope: 'Global (agrégé)', },
  de: {
    signIn: 'Anmelden', continue: 'Weiter', settings: 'Einstellungen', church: 'Kirche', language: 'Sprache', textSize: 'Textgröße', save: 'Speichern', send: 'Senden', takeTutorial: 'Zum Tutorial', welcome: 'Willkommen', seekers: 'Suchende', missionaries: 'Missionare', members: 'Mitglieder', appTagline: 'Eine Kirche, die mit dir geht, Schritt für Schritt.', small: 'Klein', normal: 'Normal', large: 'Groß', xlarge: 'Sehr groß',
    churchName: 'Name der Gemeinde', churchData: 'Gemeindedaten', admin: 'Verwaltung', approvals: 'Freigaben', peoplePairing: 'Personen & Zuordnung', materials: 'Materialien', analytics: 'Analysen', approve: 'Freigeben', allCaughtUp: 'Alles erledigt', createPairing: 'Zuordnung erstellen', activePairings: 'Aktive Zuordnungen', pairThem: 'Zuordnen', missionary: 'Missionar', seeker: 'Suchender', track: 'Weg', addMaterial: 'Material hinzufügen', library: 'Bibliothek', addToLibrary: 'Zur Bibliothek hinzufügen', title: 'Titel', recentActivity: 'Letzte Aktivität', mostActive: 'Aktivste Personen', seekersByStage: 'Suchende nach Phase', actionsByType: 'Aktionen nach Typ', localScope: 'Lokal (dieses Gerät)', globalScope: 'Global (aggregiert)', },
  it: {
    signIn: 'Accedi', continue: 'Continua', settings: 'Impostazioni', church: 'Chiesa', language: 'Lingua', textSize: 'Dimensione del testo', save: 'Salva', send: 'Invia', takeTutorial: 'Fai il tutorial', welcome: 'Benvenuto', seekers: 'Cercatori', missionaries: 'Missionari', members: 'Membri', appTagline: 'Una chiesa che cammina con te, un passo alla volta.', small: 'Piccolo', normal: 'Normale', large: 'Grande', xlarge: 'Molto grande',
    churchName: 'Nome della chiesa', churchData: 'Dati della chiesa', admin: 'Amministrazione', approvals: 'Approvazioni', peoplePairing: 'Persone e abbinamento', materials: 'Materiali', analytics: 'Analisi', approve: 'Approva', allCaughtUp: 'Tutto in ordine', createPairing: 'Crea un abbinamento', activePairings: 'Abbinamenti attivi', pairThem: 'Abbinali', missionary: 'Missionario', seeker: 'Cercatore', track: 'Percorso', addMaterial: 'Aggiungi materiale', library: 'Biblioteca', addToLibrary: 'Aggiungi alla biblioteca', title: 'Titolo', recentActivity: 'Attività recente', mostActive: 'Persone più attive', seekersByStage: 'Cercatori per fase', actionsByType: 'Azioni per tipo', localScope: 'Locale (questo dispositivo)', globalScope: 'Globale (aggregato)', },
  tl: {
    signIn: 'Mag-sign in', continue: 'Magpatuloy', settings: 'Mga Setting', church: 'Simbahan', language: 'Wika', textSize: 'Laki ng teksto', save: 'I-save', send: 'Ipadala', takeTutorial: 'Gawin ang tutorial', welcome: 'Maligayang pagdating', seekers: 'Mga naghahanap', missionaries: 'Mga misyonero', members: 'Mga miyembro', appTagline: 'Isang simbahang kasama mo sa bawat hakbang.', small: 'Maliit', normal: 'Karaniwan', large: 'Malaki', xlarge: 'Napakalaki',
    churchName: 'Pangalan ng simbahan', churchData: 'Datos ng simbahan', admin: 'Admin', approvals: 'Mga pag-apruba', peoplePairing: 'Mga tao at pagpares', materials: 'Mga materyales', analytics: 'Analytics', approve: 'Aprubahan', allCaughtUp: 'Wala nang naghihintay', createPairing: 'Gumawa ng pares', activePairings: 'Mga aktibong pares', pairThem: 'Ipares sila', missionary: 'Misyonero', seeker: 'Naghahanap', track: 'Track', addMaterial: 'Magdagdag ng materyal', library: 'Aklatan', addToLibrary: 'Idagdag sa aklatan', title: 'Pamagat', recentActivity: 'Kamakailang aktibidad', mostActive: 'Pinakaaktibong mga tao', seekersByStage: 'Mga naghahanap ayon sa yugto', actionsByType: 'Mga aksyon ayon sa uri', localScope: 'Lokal (device na ito)', globalScope: 'Global (pinagsama-sama)', },
  ceb: {
    signIn: 'Mag-sign in', continue: 'Padayon', settings: 'Mga Setting', church: 'Simbahan', language: 'Pinulongan', textSize: 'Gidak-on sa teksto', save: 'I-save', send: 'Ipadala', takeTutorial: 'Buhata ang tutorial', welcome: 'Maayong pag-abot', seekers: 'Mga nangita', missionaries: 'Mga misyonaryo', members: 'Mga miyembro', appTagline: 'Usa ka simbahan nga mokuyog kanimo, matag lakang.', small: 'Gamay', normal: 'Naandan', large: 'Dako', xlarge: 'Dako kaayo',
    churchName: 'Ngalan sa simbahan', churchData: 'Datos sa simbahan', admin: 'Admin', approvals: 'Mga pag-aprobar', peoplePairing: 'Mga tawo ug pagpares', materials: 'Mga materyales', analytics: 'Analytics', approve: 'Aprobahi', allCaughtUp: 'Wala nay naghulat', createPairing: 'Paghimo ug pares', activePairings: 'Mga aktibong pares', pairThem: 'Ipares sila', missionary: 'Misyonaryo', seeker: 'Nangita', track: 'Track', addMaterial: 'Pagdugang ug materyal', library: 'Librarya', addToLibrary: 'Idugang sa librarya', title: 'Titulo', recentActivity: 'Bag-ong kalihokan', mostActive: 'Labing aktibo nga mga tawo', seekersByStage: 'Mga nangita matag hugna', actionsByType: 'Mga aksyon matag matang', localScope: 'Lokal (kini nga device)', globalScope: 'Global (gitingob)', },
  id: {
    signIn: 'Masuk', continue: 'Lanjutkan', settings: 'Pengaturan', church: 'Gereja', language: 'Bahasa', textSize: 'Ukuran teks', save: 'Simpan', send: 'Kirim', takeTutorial: 'Ikuti tutorial', welcome: 'Selamat datang', seekers: 'Pencari', missionaries: 'Misionaris', members: 'Anggota', appTagline: 'Gereja yang berjalan bersamamu, langkah demi langkah.', small: 'Kecil', normal: 'Normal', large: 'Besar', xlarge: 'Sangat besar',
    churchName: 'Nama gereja', churchData: 'Data gereja', admin: 'Admin', approvals: 'Persetujuan', peoplePairing: 'Orang & Pasangan', materials: 'Materi', analytics: 'Analitik', approve: 'Setujui', allCaughtUp: 'Semua beres', createPairing: 'Buat pasangan', activePairings: 'Pasangan aktif', pairThem: 'Pasangkan', missionary: 'Misionaris', seeker: 'Pencari', track: 'Jalur', addMaterial: 'Tambah materi', library: 'Perpustakaan', addToLibrary: 'Tambahkan ke perpustakaan', title: 'Judul', recentActivity: 'Aktivitas terbaru', mostActive: 'Orang paling aktif', seekersByStage: 'Pencari per tahap', actionsByType: 'Tindakan per jenis', localScope: 'Lokal (perangkat ini)', globalScope: 'Global (agregat)', },
  zh: {
    signIn: '登录', continue: '继续', settings: '设置', church: '教会', language: '语言', textSize: '文字大小', save: '保存', send: '发送', takeTutorial: '观看教程', welcome: '欢迎', seekers: '寻道者', missionaries: '宣教士', members: '成员', appTagline: '一间与你同行的教会，一步一步。', small: '小', normal: '正常', large: '大', xlarge: '特大',
    churchName: '教会名称', churchData: '教会数据', admin: '管理', approvals: '审批', peoplePairing: '人员与配对', materials: '材料', analytics: '分析', approve: '批准', allCaughtUp: '全部处理完毕', createPairing: '创建配对', activePairings: '活跃配对', pairThem: '配对', missionary: '宣教士', seeker: '寻道者', track: '路线', addMaterial: '添加材料', library: '资料库', addToLibrary: '添加到资料库', title: '标题', recentActivity: '近期活动', mostActive: '最活跃的人', seekersByStage: '按阶段的寻道者', actionsByType: '按类型的操作', localScope: '本地（此设备）', globalScope: '全局（汇总）', },
  ko: {
    signIn: '로그인', continue: '계속', settings: '설정', church: '교회', language: '언어', textSize: '글자 크기', save: '저장', send: '보내기', takeTutorial: '튜토리얼 시작', welcome: '환영합니다', seekers: '구도자', missionaries: '선교사', members: '회원', appTagline: '한 걸음씩 당신과 함께 걷는 교회.', small: '작게', normal: '보통', large: '크게', xlarge: '아주 크게',
    churchName: '교회 이름', churchData: '교회 데이터', admin: '관리', approvals: '승인', peoplePairing: '사람 및 연결', materials: '자료', analytics: '분석', approve: '승인', allCaughtUp: '모두 완료됨', createPairing: '연결 만들기', activePairings: '활성 연결', pairThem: '연결하기', missionary: '선교사', seeker: '구도자', track: '트랙', addMaterial: '자료 추가', library: '자료실', addToLibrary: '자료실에 추가', title: '제목', recentActivity: '최근 활동', mostActive: '가장 활발한 사람', seekersByStage: '단계별 구도자', actionsByType: '유형별 활동', localScope: '로컬 (이 기기)', globalScope: '전체 (집계)', },
  ja: {
    signIn: 'ログイン', continue: '続ける', settings: '設定', church: '教会', language: '言語', textSize: '文字サイズ', save: '保存', send: '送信', takeTutorial: 'チュートリアルを見る', welcome: 'ようこそ', seekers: '求道者', missionaries: '宣教師', members: 'メンバー', appTagline: '一歩ずつあなたと歩む教会。', small: '小', normal: '標準', large: '大', xlarge: '特大',
    churchName: '教会名', churchData: '教会データ', admin: '管理', approvals: '承認', peoplePairing: 'メンバーとペア', materials: '教材', analytics: '分析', approve: '承認', allCaughtUp: 'すべて完了', createPairing: 'ペアを作成', activePairings: 'アクティブなペア', pairThem: 'ペアにする', missionary: '宣教師', seeker: '求道者', track: 'トラック', addMaterial: '教材を追加', library: 'ライブラリ', addToLibrary: 'ライブラリに追加', title: 'タイトル', recentActivity: '最近の活動', mostActive: '最も活発なメンバー', seekersByStage: '段階別の求道者', actionsByType: 'タイプ別の操作', localScope: 'ローカル（この端末）', globalScope: 'グローバル（集計）', },
  hi: {
    signIn: 'साइन इन करें', continue: 'जारी रखें', settings: 'सेटिंग्स', church: 'चर्च', language: 'भाषा', textSize: 'टेक्स्ट का आकार', save: 'सहेजें', send: 'भेजें', takeTutorial: 'ट्यूटोरियल देखें', welcome: 'स्वागत है', seekers: 'खोजी', missionaries: 'मिशनरी', members: 'सदस्य', appTagline: 'एक चर्च जो हर कदम पर आपके साथ चलता है।', small: 'छोटा', normal: 'सामान्य', large: 'बड़ा', xlarge: 'बहुत बड़ा',
    churchName: 'चर्च का नाम', churchData: 'चर्च डेटा', admin: 'प्रशासन', approvals: 'अनुमोदन', peoplePairing: 'लोग और जोड़ी', materials: 'सामग्री', analytics: 'विश्लेषण', approve: 'स्वीकृत करें', allCaughtUp: 'सब पूरा हुआ', createPairing: 'जोड़ी बनाएं', activePairings: 'सक्रिय जोड़ियां', pairThem: 'जोड़ी बनाएं', missionary: 'मिशनरी', seeker: 'खोजी', track: 'मार्ग', addMaterial: 'सामग्री जोड़ें', library: 'पुस्तकालय', addToLibrary: 'पुस्तकालय में जोड़ें', title: 'शीर्षक', recentActivity: 'हाल की गतिविधि', mostActive: 'सबसे सक्रिय लोग', seekersByStage: 'चरण के अनुसार खोजी', actionsByType: 'प्रकार के अनुसार क्रियाएं', localScope: 'स्थानीय (यह डिवाइस)', globalScope: 'वैश्विक (कुल)', },
  ar: {
    signIn: 'تسجيل الدخول', continue: 'متابعة', settings: 'الإعدادات', church: 'الكنيسة', language: 'اللغة', textSize: 'حجم النص', save: 'حفظ', send: 'إرسال', takeTutorial: 'بدء الجولة التعليمية', welcome: 'أهلاً بك', seekers: 'الباحثون', missionaries: 'المرسلون', members: 'الأعضاء', appTagline: 'كنيسة تسير معك، خطوة بخطوة.', small: 'صغير', normal: 'عادي', large: 'كبير', xlarge: 'كبير جداً',
    churchName: 'اسم الكنيسة', churchData: 'بيانات الكنيسة', admin: 'الإدارة', approvals: 'الموافقات', peoplePairing: 'الأشخاص والإقران', materials: 'المواد', analytics: 'التحليلات', approve: 'الموافقة', allCaughtUp: 'كل شيء منجز', createPairing: 'إنشاء إقران', activePairings: 'الاقترانات النشطة', pairThem: 'إقرانهم', missionary: 'مرسل', seeker: 'باحث', track: 'المسار', addMaterial: 'إضافة مادة', library: 'المكتبة', addToLibrary: 'إضافة إلى المكتبة', title: 'العنوان', recentActivity: 'النشاط الأخير', mostActive: 'الأشخاص الأكثر نشاطاً', seekersByStage: 'الباحثون حسب المرحلة', actionsByType: 'الإجراءات حسب النوع', localScope: 'محلي (هذا الجهاز)', globalScope: 'عالمي (إجمالي)', },
  ru: {
    signIn: 'Войти', continue: 'Продолжить', settings: 'Настройки', church: 'Церковь', language: 'Язык', textSize: 'Размер текста', save: 'Сохранить', send: 'Отправить', takeTutorial: 'Пройти обучение', welcome: 'Добро пожаловать', seekers: 'Ищущие', missionaries: 'Миссионеры', members: 'Участники', appTagline: 'Церковь, которая идёт с тобой, шаг за шагом.', small: 'Маленький', normal: 'Обычный', large: 'Большой', xlarge: 'Очень большой',
    churchName: 'Название церкви', churchData: 'Данные церкви', admin: 'Администрирование', approvals: 'Одобрения', peoplePairing: 'Люди и пары', materials: 'Материалы', analytics: 'Аналитика', approve: 'Одобрить', allCaughtUp: 'Всё сделано', createPairing: 'Создать пару', activePairings: 'Активные пары', pairThem: 'Создать пару', missionary: 'Миссионер', seeker: 'Ищущий', track: 'Путь', addMaterial: 'Добавить материал', library: 'Библиотека', addToLibrary: 'Добавить в библиотеку', title: 'Заголовок', recentActivity: 'Недавняя активность', mostActive: 'Самые активные', seekersByStage: 'Ищущие по этапам', actionsByType: 'Действия по типу', localScope: 'Локально (это устройство)', globalScope: 'Глобально (сводно)', },
  sw: {
    signIn: 'Ingia', continue: 'Endelea', settings: 'Mipangilio', church: 'Kanisa', language: 'Lugha', textSize: 'Ukubwa wa maandishi', save: 'Hifadhi', send: 'Tuma', takeTutorial: 'Fanya mafunzo', welcome: 'Karibu', seekers: 'Watafutaji', missionaries: 'Wamisionari', members: 'Wanachama', appTagline: 'Kanisa linalotembea nawe, hatua kwa hatua.', small: 'Ndogo', normal: 'Kawaida', large: 'Kubwa', xlarge: 'Kubwa sana',
    churchName: 'Jina la kanisa', churchData: 'Data ya kanisa', admin: 'Usimamizi', approvals: 'Idhini', peoplePairing: 'Watu na Kuunganisha', materials: 'Nyenzo', analytics: 'Uchambuzi', approve: 'Idhinisha', allCaughtUp: 'Kila kitu kimekamilika', createPairing: 'Unda uunganisho', activePairings: 'Miunganisho hai', pairThem: 'Waunganishe', missionary: 'Mmisionari', seeker: 'Mtafutaji', track: 'Njia', addMaterial: 'Ongeza nyenzo', library: 'Maktaba', addToLibrary: 'Ongeza kwenye maktaba', title: 'Kichwa', recentActivity: 'Shughuli za hivi karibuni', mostActive: 'Watu hai zaidi', seekersByStage: 'Watafutaji kwa hatua', actionsByType: 'Vitendo kwa aina', localScope: 'Ndani (kifaa hiki)', globalScope: 'Kimataifa (jumla)', },
};

const LANG_KEY = 'beacon-lang';
const SCALE_KEY = 'beacon-scale';

interface Ctx {
  lang: string;
  setLang: (l: string) => void;
  t: (key: MsgKey) => string;
  scale: number;
  setScale: (s: number) => void;
}
const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(LANG_KEY) || 'en' : 'en',
  );
  const [scale, setScaleState] = useState<number>(() =>
    typeof window !== 'undefined'
      ? Number(localStorage.getItem(SCALE_KEY)) || 1
      : 1,
  );

  // Apply language direction + document lang.
  useEffect(() => {
    const rtl = LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Apply the text-size scale to the root font size (base is 18px).
  useEffect(() => {
    document.documentElement.style.fontSize = `${18 * scale}px`;
  }, [scale]);

  const setLang = useCallback((l: string) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  }, []);
  const setScale = useCallback((s: number) => {
    setScaleState(s);
    try {
      localStorage.setItem(SCALE_KEY, String(s));
    } catch {}
  }, []);

  // Look up the active language, then fall back to English, then the key itself.
  const t = useCallback(
    (key: MsgKey) => M[lang]?.[key] ?? EN[key] ?? key,
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, t, scale, setScale }),
    [lang, setLang, t, scale, setScale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Ctx {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
