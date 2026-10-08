/**
 * Persian is the source-of-truth dictionary: its shape defines the
 * `Dictionary` type, so every other locale is compile-time checked for
 * completeness. Add a key here first.
 */
export const fa = {
  common: {
    appName: "رستوکار",
    tagline: "منوی دیجیتال، سفارش‌گیری و گزارش سود برای رستوران و کافه",
    save: "ذخیره",
    saving: "در حال ذخیره…",
    saved: "ذخیره شد",
    cancel: "انصراف",
    delete: "حذف",
    edit: "ویرایش",
    add: "افزودن",
    create: "ایجاد",
    back: "بازگشت",
    next: "بعدی",
    previous: "قبلی",
    close: "بستن",
    confirm: "تأیید",
    search: "جستجو",
    loading: "در حال بارگذاری…",
    empty: "چیزی برای نمایش نیست",
    error: "خطایی رخ داد",
    retry: "تلاش دوباره",
    optional: "اختیاری",
    of: "از",
    appearance: "ظاهر",
    required: "الزامی",
    yes: "بله",
    no: "خیر",
    all: "همه",
    toman: "تومان",
    active: "فعال",
    inactive: "غیرفعال",
    preview: "پیش‌نمایش",
    copy: "کپی",
    copied: "کپی شد",
    download: "دانلود",
    print: "چاپ",
    today: "امروز",
    language: "زبان",
  },
  appearance: {
    title: "ظاهر پنل",
    system: "هماهنگ با سیستم",
    light: "روشن",
    dark: "تیره",
  },
  nav: {
    features: "امکانات",
    howItWorks: "چطور کار می‌کند",
    pricing: "تعرفه‌ها",
    demo: "نمونه منو",
    faq: "سؤالات متداول",
    contact: "تماس",
    login: "ورود",
    register: "شروع رایگان",
    dashboard: "پیشخوان",
    logout: "خروج",
    about: "درباره ما",
    contactUs: "تماس با ما",
    terms: "قوانین و مقررات",
    privacy: "حریم خصوصی",
    refund: "شرایط بازگشت وجه",
    legal: "اطلاعات",
    social: "ما را دنبال کنید",
    trustSeal: "نماد اعتماد الکترونیکی",
  },
  landing: {
    heroBadge: "بدون نصب اپلیکیشن، بدون سخت‌افزار خاص",
    heroTitle: "همهٔ کارِ رستورانتان،",
    heroTitleAccent: "از منو تا سود",
    heroSubtitle:
      "مشتری با بارکد روی میز سفارش می‌دهد، سفارش همان لحظه روی صفحهٔ آشپزخانه می‌نشیند، و شما فروش، سود و هزینه‌ها را دقیق می‌بینید.",
    heroCtaPrimary: "۱۴ روز رایگان امتحان کنید",
    /** Replaces the signup CTA while self-service registration is closed. */
    ctaContactSupport: "تماس با پشتیبانی",
    paymentsPausedTitle: "پرداخت آنلاین موقتاً غیرفعال است",
    paymentsPausedBody:
      "برای تمدید یا تغییر پلن، با پشتیبانی تماس بگیرید. اشتراک شما به‌صورت دستی تنظیم می‌شود.",
    heroCtaSecondary: "دیدن نمونه منو",
    heroNote: "بدون نیاز به کارت بانکی",
    statsRestaurants: "رستوران و کافه",
    statsOrders: "سفارش ثبت‌شده",
    /**
     * The third figure used to be a hard-coded «٪۹۹.۹» uptime sitting between
     * two counts read from the database. An invented statistic beside two real
     * ones costs more trust than it buys, so it now reports the template
     * catalogue — a number the page can actually prove.
     */
    statsTemplates: "قالب آمادهٔ منو",
    featuresTitle: "هر چیزی که برای ادارهٔ رستوران لازم دارید",
    featuresSubtitle:
      "از ساخت منو تا صفحهٔ آشپزخانه و گزارش سود — همه در یک پنل، بدون نرم‌افزار جداگانه.",
    howTitle: "در سه قدم راه‌اندازی کنید",
    howSubtitle: "کمتر از ۱۵ دقیقه تا اولین سفارش دیجیتال",
    step1Title: "منو را بسازید",
    step1Text: "دسته‌بندی‌ها و محصولات را با عکس، قیمت و توضیح کوتاه وارد کنید.",
    step2Title: "قالب و برند را انتخاب کنید",
    step2Text:
      "یکی از قالب‌های آماده را بردارید و رنگ، فونت و لوگو را مطابق برندتان تنظیم کنید.",
    step3Title: "بارکد میزها را چاپ کنید",
    step3Text:
      "هر میز بارکد خودش را دارد؛ مشتری اسکن می‌کند و سفارش مستقیم به آشپزخانه می‌رسد.",
    demoTitle: "نمونه منوهای واقعی",
    demoSubtitle: "قالب‌ها را روی یک منوی واقعی ببینید",
    benefitsTitle: "چرا رستوران‌ها رستوکار را انتخاب می‌کنند",
    ctaTitle: "آماده‌اید کارِ رستوران را ساده‌تر کنید؟",
    ctaSubtitle: "همین حالا شروع کنید؛ ۱۴ روز اول رایگان است.",
    faqTitle: "سؤالات متداول",
    contactTitle: "با ما در تماس باشید",
    contactSubtitle: "تیم ما آماده پاسخگویی و راه‌اندازی رایگان منوی شماست.",
    footerRights: "تمامی حقوق محفوظ است.",
  },
  features: {
    menuTitle: "منوی دیجیتال زیبا",
    menuText: "قالب‌های متنوع و موبایل‌محور که برند شما را حرفه‌ای نشان می‌دهد.",
    qrTitle: "بارکد اختصاصی هر میز",
    qrText: "شماره میز روی بارکد چاپ می‌شود و سفارش‌ها خودکار به همان میز وصل می‌شوند.",
    orderTitle: "سفارش‌گیری سریع",
    orderText: "مشتری بدون نصب اپلیکیشن سفارش می‌دهد و وضعیت آن را لحظه‌ای می‌بیند.",
    kitchenTitle: "پنل آشپزخانه",
    kitchenText: "سفارش‌ها لحظه‌ای روی صفحه آشپزخانه می‌آیند و وضعیتشان به‌روز می‌شود.",
    analyticsTitle: "گزارش فروش",
    analyticsText: "فروش روزانه، هفتگی و ماهانه و پرفروش‌ترین محصولات.",
    financeTitle: "مدیریت مالی",
    financeText: "بهای تمام‌شده، سود هر محصول، هزینه‌ها و سود خالص را دقیق ببینید.",
    paymentTitle: "پرداخت آنلاین",
    paymentText: "مشتری در محل یا آنلاین پرداخت می‌کند؛ انتخاب با شماست.",
    brandTitle: "برند حرفه‌ای",
    brandText: "لوگو، رنگ و فونت اختصاصی؛ منویی که شبیه برند شماست.",
  },
  auth: {
    loginTitle: "ورود به پنل",
    loginSubtitle: "با شمارهٔ موبایل و رمز عبور وارد پیشخوان رستوران شوید",
    registerTitle: "ساخت حساب کاربری",
    registerSubtitle: "رستوران خود را ثبت کنید و منوی دیجیتال بسازید",
    name: "نام و نام خانوادگی",
    phone: "شمارهٔ موبایل",
    phonePlaceholder: "۰۹۱۲۱۲۳۴۵۶۷",
    restaurantName: "نام رستوران یا کافه",
    restaurantSlug: "آدرس منو",
    slugHint: "آدرس منوی شما پس از ثبت‌نام:",
    sendCode: "دریافت کد تأیید",
    code: "کد تأیید",
    /** {length} and {phone} are filled in; the phone is shown left-to-right. */
    codeSent: "کد {length} رقمی به شمارهٔ {phone} فرستاده شد.",
    /** Said on every sign-in, so it reveals nothing about any one number. */
    loginCodeHint: "کد فقط برای شماره‌ای فرستاده می‌شود که در رستوکار حساب دارد.",
    registerCodeHint:
      "اگر قبلاً با این شماره ثبت‌نام کرده‌اید، کدی نمی‌رسد؛ از صفحهٔ ورود وارد شوید.",
    editPhone: "ویرایش شماره",
    resendCode: "ارسال دوبارهٔ کد",
    resendIn: "ارسال دوباره تا {seconds} ثانیهٔ دیگر",
    submitLogin: "ورود",
    submitRegister: "ساخت حساب و شروع",
    noAccount: "حساب کاربری ندارید؟",
    hasAccount: "قبلاً ثبت‌نام کرده‌اید؟",
    registerLink: "ثبت‌نام کنید",
    loginLink: "وارد شوید",
    slugTaken: "این آدرس قبلاً انتخاب شده است",
    password: "رمز عبور",
    passwordNew: "رمز عبور تازه",
    passwordConfirm: "تکرار رمز عبور",
    passwordRules: "دست‌کم ۸ نویسه، شامل حرف و عدد",
    passwordsDiffer: "دو رمز عبور یکی نیستند",
    showPassword: "نمایش رمز",
    hidePassword: "پنهان کردن رمز",
    loginFailed: "شماره موبایل یا رمز عبور درست نیست",
    loginLocked:
      "به دلیل چند تلاش ناموفق، ورود با این شماره برای {minutes} دقیقه متوقف شد.",
    noPasswordYet: "حسابتان را مدیر مجموعه یا پشتیبانی ساخته و هنوز رمز ندارید؟",
    activateLink: "فعال‌سازی حساب",
    activateTitle: "فعال‌سازی حساب",
    activateSubtitle:
      "یک بار شمارهٔ موبایلتان را با کد پیامکی تأیید کنید و رمز عبورتان را انتخاب کنید. از این به بعد با همین رمز وارد می‌شوید.",
    activateCodeHint:
      "کد فقط برای حسابی فرستاده می‌شود که هنوز رمز عبور ندارد. اگر رمز دارید، از صفحهٔ ورود وارد شوید.",
    submitActivate: "فعال‌سازی و ورود",
    initialPassword: "رمز عبور اولیه (اختیاری)",
    initialPasswordHint:
      "اگر وارد کنید، حضوری به خودش بدهید تا فوراً وارد شود و بعد از «حساب کاربری من» عوضش کند. اگر خالی بماند، خودش با یک کد پیامکی حساب را فعال و رمز انتخاب می‌کند.",
    forgotPassword: "رمز عبور را فراموش کرده‌اید؟",
    forgotPasswordHint:
      "کارکنان و مدیران شعبه با مالک مجموعه، و مالکان با پشتیبانی رستوکار تماس بگیرند.",
    registerPasswordHint: "از این به بعد با شمارهٔ موبایل و همین رمز وارد می‌شوید.",
    registrationClosedTitle: "ثبت‌نام از طریق پشتیبانی",
    registrationClosedBody:
      "در حال حاضر ثبت‌نام آنلاین در دسترس نیست. برای ساخت حساب و راه‌اندازی منوی رستوران خود، با پشتیبانی تماس بگیرید؛ حساب شما را با شمارهٔ موبایل خودتان می‌سازیم و با همان شماره وارد می‌شوید.",
  },
  /** The signed-in person's own account, for every role. */
  account: {
    title: "حساب کاربری من",
    subtitle: "رمز عبور و شمارهٔ موبایل ورود",
    changePassword: "تغییر رمز عبور",
    currentPassword: "رمز عبور فعلی",
    savePassword: "ذخیرهٔ رمز تازه",
    passwordChanged: "رمز عبور تغییر کرد. از دستگاه‌های دیگر خارج شدید.",
    signedInAs: "وارد شده با",
  },
  dashboard: {
    firstStepsTitle: "قدم‌های اول",
    firstStepsSubtitle: "پنج کار کوتاه تا منوی شما آمادهٔ مهمان‌ها شود.",
    firstStepsProgress: "{done} از {total} انجام شده",
    firstSteps: {
      details: "نام، لوگو، تلفن و نشانی مجموعه را کامل کنید",
      menu: "دسته‌بندی‌ها و غذاها را با قیمت وارد کنید",
      design: "ظاهر منو را انتخاب کنید",
      tables: "میزها را بسازید و بارکدها را چاپ کنید",
      order: "با گوشی خودتان یک سفارش آزمایشی بدهید",
    },
    overview: "پیشخوان",
    menu: "مدیریت منو",
    categories: "دسته‌بندی‌ها",
    products: "محصولات",
    design: "طراحی منو",
    orders: "سفارش‌ها",
    kitchen: "آشپزخانه",
    analytics: "گزارش فروش",
    finance: "مدیریت مالی",
    inventory: "انبار",
    expenses: "هزینه‌ها",
    qr: "بارکد میزها",
    tables: "میزها",
    settings: "تنظیمات",
    subscription: "اشتراک",
    admin: "مدیریت پلتفرم",
    viewMenu: "مشاهده منو",
    welcome: "خوش آمدید",
    todayRevenue: "فروش امروز",
    todayOrders: "سفارش‌های امروز",
    pendingOrders: "سفارش‌های در جریان",
    avgOrder: "میانگین هر سفارش",
    recentOrders: "آخرین سفارش‌ها",
    vsLastWeek: "نسبت به هفته گذشته",
    pendingStaffCalls: "درخواست‌های بی‌پاسخ مهمانان",
    peakHours: "شلوغ‌ترین ساعت‌ها",
    peakHoursRange: "۴ هفته گذشته",
    menuHealth: "وضعیت منو",
    healthMissingCost: "بدون بهای تمام‌شده",
    healthMissingImage: "بدون عکس",
    healthMissingDescription: "بدون توضیح کوتاه",
    healthUnavailable: "ناموجود",
    /** Owner-side label. The guest-facing «نام شما» belongs to the menu, not here. */
    customer: "مشتری",
    topProducts: "پرفروش‌ترین محصولات",
    noOrdersYet: "هنوز سفارشی ثبت نشده است",
    quickActions: "دسترسی سریع",
    moreOptions: "تنظیمات بیشتر",
  },
  inventory: {
    title: "موجودی انبار",
    hint: "مواد اولیه را با واحد و قیمت خرید ثبت کنید؛ با هر سفارش، به اندازهٔ نسخهٔ هر غذا از موجودی کم می‌شود و بهای تمام‌شدهٔ غذا از روی همین قیمت‌ها محاسبه می‌شود.",
    itemName: "نام ماده",
    itemUnit: "واحد",
    unitHint:
      "واحدی که موجودی با آن شمرده می‌شود. در نسخه می‌توانید زیرواحدها را هم به کار ببرید؛ مثلاً ۲۳۰ گرم از ماده‌ای که به کیلوگرم ثبت شده.",
    quantity: "موجودی فعلی",
    lowStock: "هشدار در",
    lowStockHint:
      "وقتی موجودی به این عدد یا کمتر برسد هشدار داده می‌شود. صفر یعنی هشدار ندهد.",
    addItem: "افزودن ماده",
    noItems: "هنوز ماده‌ای ثبت نشده است",
    deleteConfirm: "این ماده و نسخه‌های مرتبط با آن حذف شود؟",
    lowBadge: "رو به اتمام",
    recipeTitle: "نسخه‌ی غذاها",
    recipeHint: "برای هر غذا مشخص کنید یک پرس آن چه مقدار از هر ماده مصرف می‌کند.",
    pickProduct: "انتخاب غذا",
    perUnit: "مصرف هر پرس",
    saveRecipe: "ذخیره نسخه",
    recipeSaved: "نسخه ذخیره شد",
    noItemsForRecipe: "اول چند ماده اولیه ثبت کنید",
    dashboardTitle: "مواد رو به اتمام",
    dashboardBody: "این مواد به مرز هشدار رسیده‌اند و بهتر است تأمین شوند.",
    manageLink: "مدیریت موجودی",
  },

  costing: {
    units: {
      g: "گرم",
      kg: "کیلوگرم",
      ml: "میلی‌لیتر",
      l: "لیتر",
      tsp: "قاشق چای‌خوری",
      tbsp: "قاشق غذاخوری",
      piece: "عدد",
      dozen: "دوجین",
    },
    dimensions: {
      weight: "وزن",
      volume: "حجم",
      count: "تعداد",
    },

    settingsTitle: "قیمت‌گذاری منو",
    settingsHint:
      "قیمت دقیق هر غذا نگه داشته می‌شود و فقط برای نمایش رُند می‌شود؛ هر افزایش بعدی — دستی، گروهی یا از تغییر قیمت مواد — از همان قیمت دقیق حساب می‌شود.",
    menuPriceStep: "رُند کردن قیمت‌های منو",
    menuPriceStepHint:
      "قیمت‌ها در منو به نزدیک‌ترین مضرب این عدد نمایش داده و از مشتری دریافت می‌شوند.",
    noRounding: "بدون رُند (دقیق به تومان)",
    autoReprice: "به‌روزرسانی خودکار قیمت با تغییر قیمت مواد اولیه",
    autoRepriceHint:
      "وقتی قیمت خرید یک ماده تغییر کند، قیمت هر غذا به همان اندازه‌ای که بهای مواد آن تغییر کرده بالا یا پایین می‌رود.",
    lowMargin: "هشدار حاشیهٔ سود کم (درصد)",
    lowMarginHint:
      "اگر سود یک غذا نسبت به قیمتش از این درصد کمتر شود، هنگام قیمت‌گذاری هشدار داده می‌شود. صفر یعنی هشدار ندهد.",
    save: "ذخیره",
    saved: "تنظیمات قیمت‌گذاری ذخیره شد",
    reRounded: "قیمت نمایشی {n} محصول با گام جدید به‌روز شد",
    confirmStepTitle: "گام رُند تغییر کند؟",
    confirmStepBody:
      "قیمت نمایش‌داده‌شدهٔ همهٔ محصولات با گام جدید دوباره حساب می‌شود. قیمت‌های دقیق تغییری نمی‌کنند و با برگرداندن گام، قیمت‌ها به حالت قبل برمی‌گردند.",
    confirmStep: "تغییر گام",

    bulkStepNote:
      "درصد روی قیمت دقیق اعمال می‌شود و قیمت در منو با گام {step} رُند می‌شود. گام را از «قیمت‌گذاری منو» تغییر دهید.",
    bulkStepNone:
      "درصد روی قیمت دقیق اعمال می‌شود و قیمت در منو بدون رُند، دقیق به تومان نمایش داده می‌شود.",
    bulkBelowCost: "{n} محصول پس از این تغییر زیر بهای مواد اولیه فروخته می‌شود",
    bulkLowMargin: "{n} محصول پس از این تغییر حاشیهٔ سود کمی خواهد داشت",

    belowCost:
      "بهای مواد اولیه ({cost}) از قیمت این غذا بیشتر است؛ با هر فروش ضرر می‌کنید.",
    lowMarginWarn:
      "حاشیهٔ سود این غذا {margin}٪ است که از حد هشدار شما ({floor}٪) کمتر است.",
    marginOk: "حاشیهٔ سود: {margin}٪",
    costFromRecipe: "از روی نسخه محاسبه می‌شود",
    costFromRecipeHint:
      "بهای تمام‌شدهٔ این غذا از نسخه و قیمت خرید مواد اولیه، بدون سود، خودکار محاسبه می‌شود.",
    shownAs: "در منو: {price}",
    exactPrice: "قیمت دقیق: {price}",

    purchasePrice: "قیمت خرید (تومان)",
    per: "به ازای هر",
    purchasePriceHint:
      "قیمتی که برای این ماده می‌پردازید. با هر تغییر، قیمت غذاهایی که از آن استفاده می‌کنند به همان اندازه تغییر می‌کند.",
    unitCost: "هر {unit}: {cost}",
    notPriced: "بدون قیمت خرید",
    repriced: "قیمت {n} محصول خودکار به‌روز شد",
    repricedRow: "{name}: از {before} به {after}",
    repriceOff: "به‌روزرسانی خودکار قیمت خاموش است؛ قیمت محصولات تغییری نکرد.",
    alertsTitle: "این محصولات را بررسی کنید:",
    alertBelowCost: "{name} — زیر بهای مواد اولیه",
    alertLowMargin: "{name} — حاشیهٔ سود {margin}٪",
    recipeUnit: "واحد",
    recipeCost: "بهای مواد اولیه هر پرس: {cost}",
    recipeIncomplete: "برای محاسبهٔ کامل، قیمت خرید این مواد را وارد کنید: {items}",
    recipeAmountInvalid:
      "مقدار «{name}» در واحد انبار آن ثبت‌شدنی نیست؛ مقدار بیشتر یا واحد انبار کوچک‌تری انتخاب کنید.",
  },
  manualOrder: {
    navLabel: "سفارش دستی",
    title: "ثبت سفارش دستی",
    hint: "برای مشتری‌ای که تلفنی سفارش داده یا نمی‌تواند خودش از منو استفاده کند.",
    customerName: "نام مشتری",
    customerPhone: "شماره تماس (اختیاری)",
    tableNumber: "میز",
    tableHint: "برای سفارش تلفنی می‌توانید «تلفنی» بنویسید.",
    note: "توضیحات (اختیاری)",
    products: "غذاها",
    basket: "سبد سفارش",
    emptyBasket: "هنوز غذایی اضافه نشده است",
    paymentMethod: "نحوه پرداخت",
    cash: "پرداخت در محل",
    online: "پرداخت آنلاین",
    place: "ثبت سفارش",
    placed: "سفارش ثبت شد",
    total: "مبلغ قابل پرداخت",
    /**
     * Kept although nothing renders it any more: the pad can now ask for
     * options, so no dish is unaddable. Removing the key is a separate tidy-up
     * — `fa.ts` defines the Dictionary type, so deleting it here is a compile
     * error anywhere it is still referenced, which is what makes it safe to do
     * on its own rather than folded into this change.
     */
    optionsUnsupported: "این غذا انتخاب اجباری دارد و باید از منو ثبت شود.",
    browseMode: "نحوهٔ نمایش",
    modeList: "فهرست",
    modeMenu: "منو",
    chooseOptions: "انتخاب گزینه‌ها برای",
    chooseRequired: "یک گزینه انتخاب کنید:",
    addToOrder: "افزودن به سفارش",
    required: "اجباری",
    optional: "اختیاری",
    upTo: "حداکثر",
  },
  branches: {
    navLabel: "شعبه‌ها",
    title: "مدیریت شعبه‌ها",
    subtitle:
      "منو یکی است و از همین‌جا ویرایش می‌شود؛ هر شعبه آدرس و بارکد خودش را دارد و سفارش‌ها و درآمدش جدا ثبت می‌شود.",
    addTitle: "افزودن شعبه",
    addHint:
      "برای هر شعبه یک حساب ساخته می‌شود. مدیر شعبه می‌تواند سفارش‌ها، میزها و هزینه‌های همان شعبه را ببیند، اما منو را نمی‌تواند تغییر دهد.",
    branchName: "نام شعبه",
    branchNameHint: "مثلاً: رستوران کریمی — شعبه ۲",
    branchSlug: "آدرس منو",
    branchSlugHint: "آدرس منوی این شعبه:",
    managerName: "نام مدیر شعبه",
    managerPhone: "شمارهٔ موبایل مدیر شعبه",
    managerPhoneHint: "مدیر شعبه با همین شماره و رمز عبور وارد می‌شود.",
    create: "ساخت شعبه",
    created: "شعبه ساخته شد",
    empty: "هنوز شعبه‌ای ثبت نشده است",
    colBranch: "شعبه",
    colLink: "لینک منو",
    colOrders: "سفارش‌ها",
    colRevenue: "فروش",
    colExpenses: "هزینه‌ها",
    colNet: "سود خالص",
    totalRow: "مجموع همه شعبه‌ها",
    rangeMonth: "۳۰ روز گذشته",
    branchBadge: "شعبه",
    menuReadOnly: "منوی این شعبه از دفتر مرکزی می‌آید و از اینجا قابل تغییر نیست.",
    slugTaken: "این آدرس قبلاً استفاده شده است",
    phoneTaken: "این شماره قابل استفاده نیست",
  },
  options: {
    title: "تنظیمات بیشتر",
    subtitle: "مالیات، حق سرویس، انعام و گرد کردن مبلغ نهایی",
    saved: "تنظیمات ذخیره شد",

    // ---- More Options tabs ----
    pricingTab: "قیمت و پرداخت",
    discountsTab: "کدهای تخفیف",
    discountsTitle: "کدهای تخفیف",
    discountsHint:
      "کد تخفیف روی جمع سبد خرید اعمال می‌شود؛ حتی روی محصولاتی که از قبل تخفیف دارند.",
    enableAtCheckout: "دریافت کد تخفیف هنگام پرداخت",
    enableAtCheckoutHint:
      "با خاموش بودن این گزینه، فیلد کد تخفیف در پرداخت نمایش داده نمی‌شود.",
    showOrderDiscount: "نمایش مبلغ تخفیف در سفارش ثبت‌شده",
    showOrderDiscountHint:
      "مبلغ تخفیف روی سفارش ذخیره می‌شود؛ این گزینه فقط تعیین می‌کند که در صفحهٔ سفارش به مشتری نشان داده شود یا نه.",
    codeLabel: "کد",
    codeType: "نوع",
    codePercent: "درصدی",
    codeFixed: "مبلغ ثابت",
    codeValue: "مقدار",
    codeActive: "فعال",
    codeInactive: "غیرفعال",
    codeCreate: "ساخت کد",
    codeMaxDiscount: "حداکثر تخفیف (اختیاری)",
    codeMaxHint: "مثلاً ۱۵٪ تخفیف، اما حداکثر ۱۵۰٬۰۰۰ تومان کم شود.",
    codeUpTo: "تا سقف",
    codeInvalid: "کد و مقدار تخفیف را وارد کنید",
    noCodes: "هنوز کد تخفیفی ساخته نشده است",
    codeDeleteConfirm: "این کد تخفیف حذف شود؟",

    // ---- staff ----
    staffTab: "کارکنان",
    staffTitle: "حساب کارکنان",
    staffHint:
      "برای هر نفر یک حساب بسازید و مشخص کنید به کدام بخش‌ها دسترسی داشته باشد. بخش «سفارش‌ها» فقط به یک نفر داده می‌شود تا دو نفر هم‌زمان وضعیت یک سفارش را عوض نکنند.",
    staffName: "نام",
    staffPhone: "شمارهٔ موبایل",
    staffPhoneHint: "کارمند با همین شماره و رمز عبور وارد می‌شود.",
    staffAccess: "دسترسی‌ها",
    staffSite: "محل کار",
    staffSiteHint:
      "کارمند شعبه فقط سفارش‌ها، صندوق، انبار و گزارش‌های همان شعبه را می‌بیند؛ منو و طراحی مال دفتر مرکزی است.",
    staffAdd: "ساخت حساب",
    noStaff: "هنوز حسابی برای کارکنان ساخته نشده است",
    staffRemoveConfirm: "این حساب حذف شود؟",
    staffNoAccess: "بدون دسترسی",
    noAccessHint:
      "هنوز به هیچ بخشی دسترسی ندارید. از مدیر رستوران بخواهید دسترسی‌های حساب شما را مشخص کند.",

    // ---- support ----
    inventoryTab: "موجودی انبار",
    supportTab: "پشتیبانی",
    reviewsTab: "نظرها",
    supportTitle: "ارتباط با پشتیبانی",
    supportHint:
      "سؤال یا مشکلتان را بنویسید؛ تیم پشتیبانی پاسخ را همین‌جا برایتان می‌گذارد.",
    supportSubject: "موضوع",
    supportMessage: "توضیحات",
    supportSend: "ارسال تیکت",
    supportSent: "تیکت شما ثبت شد",
    noTickets: "هنوز تیکتی ثبت نکرده‌اید",
    ticketOpen: "در انتظار پاسخ",
    ticketAnswered: "پاسخ داده شد",
    ticketClosed: "بسته شده",
    ticketReply: "پاسخ پشتیبانی",
    bulkTitle: "افزایش گروهی قیمت‌ها",
    bulkHint:
      "قیمت همه‌ی محصولات منو را یکجا کم یا زیاد کنید و نتیجه را به مضربی که می‌خواهید رُند کنید. پیش از اعمال، پیش‌نمایش را ببینید — این کار برگشت‌پذیر نیست.",
    bulkPercent: "درصد تغییر",
    bulkPercentHint:
      "می‌تواند منفی یا مثبت باشد — مثلاً ۱۵ برای گران‌تر شدن، ۱۰- برای ارزان‌تر شدن",
    bulkRoundTo: "رُند کردن به",
    bulkNoRounding: "بدون رُند کردن",
    bulkRange: "درصد خارج از محدوده مجاز است",
    bulkPreview: "پیش‌نمایش",
    bulkApply: "اعمال روی همه",
    bulkApplied: "قیمت محصول به‌روزرسانی شد",
    bulkWillChange: "قیمت تغییر می‌کند",
    bulkWasPrice: "قیمت پیش از تخفیف",
    bulkTotalItems: "محصول در منو",
    bulkNoChanges: "با این تنظیمات هیچ قیمتی تغییر نمی‌کند.",
    bulkAndMore: "و {n} مورد دیگر",
    bulkConfirmTitle: "قیمت همه‌ی محصولات تغییر کند؟",
    bulkConfirmBody:
      "این کار قیمت همه‌ی محصولات منو را بازنویسی می‌کند و برگشت‌پذیر نیست. سفارش‌های ثبت‌شده تغییر نمی‌کنند.",

    taxTitle: "مالیات بر ارزش افزوده",
    taxHint:
      "درصد مالیات به مبلغ سبد خرید اضافه می‌شود و در فاکتور مشتری جداگانه نمایش داده می‌شود.",
    taxEnable: "افزودن مالیات به قیمت‌ها",
    taxPercent: "درصد مالیات",

    serviceTitle: "حق سرویس",
    serviceHint:
      "درصدی که پیش از مالیات به سبد خرید اضافه می‌شود؛ مالیات روی مبلغ شامل حق سرویس حساب می‌شود.",
    serviceEnable: "دریافت حق سرویس",
    servicePercent: "درصد حق سرویس",

    tipTitle: "انعام",
    tipHint:
      "اگر فعال باشد، مشتری هنگام ثبت سفارش می‌تواند انعام اختیاری اضافه کند. انعام مشمول مالیات نمی‌شود.",
    tipEnable: "امکان افزودن انعام",
    tipPercents: "درصدهای پیشنهادی",
    tipPercentsHint: "با ویرگول جدا کنید، مثلاً ۵،۱۰،۱۵",

    roundingTitle: "گرد کردن مبلغ",
    roundingHint:
      "مبلغ نهایی به نزدیک‌ترین مضرب انتخابی گرد می‌شود؛ برای حذف خردهٔ ریالی که دیگر رایج نیست.",
    roundingIncrement: "گرد کردن به",
    roundingOff: "بدون گرد کردن",
    roundingDirection: "جهت گرد کردن",
    roundUp: "به بالا",
    roundDown: "به پایین",
    roundNearest: "نزدیک‌ترین",

    minimumTitle: "حداقل مبلغ سفارش",
    minimumHint:
      "سفارش‌های کمتر از این مبلغ ثبت نمی‌شوند. برای غیرفعال کردن، عدد صفر بگذارید.",
    minimumAmount: "حداقل مبلغ (تومان)",

    previewTitle: "پیش‌نمایش فاکتور",
    previewHint: "با یک سبد خرید نمونه، تأثیر این تنظیمات را ببینید.",
    previewSubtotal: "جمع سبد خرید",
    previewService: "حق سرویس",
    previewTax: "مالیات",
    previewRounding: "گرد کردن",
    previewTotal: "مبلغ قابل پرداخت",

    /** Guest phone collection at checkout. */
    phoneCollectionTitle: "شماره تماس مشتری",
    phoneCollectionHint:
      "اگر روشن باشد، هنگام ثبت سفارش یک فیلد اختیاری شماره تماس به مشتری نشان داده می‌شود. با این شماره، مشتری‌های همیشگی شناخته می‌شوند و در بخش «مشتریان» دیده می‌شوند.",
    phoneCollectionEnable: "پرسیدن شماره تماس هنگام سفارش",
    phoneCollectionDescription:
      "وارد کردنش برای مشتری اجباری نیست. تا وقتی خاموش است، هیچ شماره‌ای پرسیده و ذخیره نمی‌شود.",
    takeawayEnable: "مهمان‌ها بتوانند بیرون‌بر سفارش دهند",
    takeawayDescription:
      "در صفحهٔ پرداخت، اگر مهمان از بارکد میز نیامده باشد، می‌پرسد «سرو در سالن یا بیرون‌بر؟». سفارش بیرون‌بر شماره میز نمی‌خواهد و با شمارهٔ سفارش تحویل داده می‌شود.",

    staffCallTitle: "صدا زدن پرسنل",
    staffCallHint:
      "با فعال کردن این گزینه، دکمه‌ای در پایین منو نمایش داده می‌شود. مشتری شماره میز خود را وارد می‌کند و درخواست بلافاصله در صفحهٔ سفارش‌ها به شما نشان داده می‌شود.",
    staffCallEnable: "نمایش دکمهٔ صدا زدن پرسنل",
    staffCallLabel: "متن دکمه",
    staffCallLabelHint: "مثلاً «صدا زدن گارسون» یا «درخواست پیشخدمت»",
    staffCallLabelEn: "متن انگلیسی دکمه",

    bilingualTitle: "زبان منو",
    bilingualHint:
      "منوی شما علاوه بر فارسی به انگلیسی هم نمایش داده می‌شود. مهمان روی منو دکمه‌ی تغییر زبان می‌بیند؛ زبان پنل مدیریت شما جداست و تغییری نمی‌کند.",
    bilingualEnable: "نمایش منو به انگلیسی",
    bilingualOn: "مهمان می‌تواند بین فارسی و انگلیسی جابه‌جا شود.",
    bilingualOff:
      "منو فقط به زبان پیش‌فرضی که در صفحه تنظیمات انتخاب کرده‌اید نمایش داده می‌شود.",
    bilingualCoverage: "میزان ترجمه‌شده",
    bilingualComplete: "همه محصولات و دسته‌بندی‌ها نسخه انگلیسی دارند.",
    bilingualIncomplete:
      "هر موردی که نسخه انگلیسی نداشته باشد، به فارسی نمایش داده می‌شود. ترجمه‌ها را از بخش ساخت منو اضافه کنید.",
  },
  menuBuilder: {
    hideWhenUnavailable: "این محصول فعلاً در منو نمایش داده نشود",
    hiddenFromMenu: "پنهان از منو",
    hideWhenUnavailableOn: "محصول تا زمانی که موجود نشود، در منو دیده نمی‌شود.",
    hideWhenUnavailableOff:
      "محصول در منو می‌ماند و با برچسب «ناموجود» نمایش داده می‌شود.",
    customIcon: "آیکون اختصاصی",
    customIconHint:
      "اگر آیکون دلخواهتان در فهرست پایین نیست، تصویر خودتان را بارگذاری کنید. تصویر بارگذاری‌شده جای آیکون انتخابی را می‌گیرد.",
    addCategory: "افزودن دسته‌بندی",
    editCategory: "ویرایش دسته‌بندی",
    categoryName: "نام دسته‌بندی",
    categoryNameEn: "نام انگلیسی",
    categoryIcon: "آیکون",
    noCategories: "هنوز دسته‌بندی نساخته‌اید",
    noCategoriesHint: "برای افزودن محصول، اول یک دسته‌بندی بسازید.",
    addProduct: "افزودن محصول",
    editProduct: "ویرایش محصول",
    productName: "نام محصول",
    productNameEn: "نام انگلیسی",
    shortDescription: "توضیح کوتاه",
    shortDescriptionHint: "یک خط، روی کارت محصول نمایش داده می‌شود",
    shortDescriptionEn: "توضیح کوتاه انگلیسی",
    fullDescription: "توضیح کامل",
    fullDescriptionHint: "در صفحه جزئیات محصول نمایش داده می‌شود",
    fullDescriptionEn: "توضیح کامل انگلیسی",
    price: "قیمت",
    compareAtPrice: "قیمت قبل از تخفیف",
    costPrice: "بهای تمام‌شده",
    costPriceHint: "برای محاسبه سود؛ فقط شما می‌بینید",
    image: "تصویر محصول",
    uploadImage: "آپلود تصویر",
    changeImage: "تغییر تصویر",
    removeImage: "حذف تصویر",
    prepTime: "زمان آماده‌سازی (دقیقه)",
    available: "موجود",
    featured: "ویژه",
    category: "دسته‌بندی",
    infoSections: "بخش‌های اطلاعات",
    shortOnlyNotice:
      "قالب فعلی شما فقط توضیح کوتاه محصول را نشان می‌دهد؛ در این قالب هر غذا تمام صفحه را می‌گیرد و جای توضیح بلند، بخش‌های اطلاعات و گزینه‌های محصول وجود ندارد. برای استفاده از آن‌ها قالب دیگری انتخاب کنید.",
    infoSectionsHint:
      "تا سه بخش دلخواه تعریف کنید؛ مثلاً «مواد اولیه»، «پیشنهاد سرآشپز» یا «ارزش غذایی».",
    infoTitle: "عنوان بخش",
    infoContent: "متن",
    infoTitleEn: "عنوان انگلیسی",
    infoContentEn: "متن انگلیسی",

    optionGroups: "انتخاب‌ها و افزودنی‌ها",
    optionGroupsHint:
      "برای غذاهایی که مشتری باید چیزی را انتخاب کند؛ مثلاً «انتخاب گوشت: مرغ یا گوساله». اختلاف قیمت می‌تواند صفر یا حتی منفی باشد.",
    optionGroupName: "نام گروه",
    optionGroupNamePlaceholder: "مثلاً انتخاب گوشت",
    optionGroupNameEn: "نام انگلیسی گروه",
    optionRequired: "انتخاب الزامی است",
    optionMaxSelect: "حداکثر انتخاب",
    /** Marks a single-select group as the dish's size ladder. */
    optionIsUpgrade: "گروه ارتقا",
    optionIsUpgradeHint:
      "گزینه‌های گران‌تر این گروه، بالای صفحه‌ی محصول به‌صورت «بزرگ + ۴۰٬۰۰۰ تومان» به مشتری پیشنهاد می‌شود.",
    optionChoiceName: "نام گزینه",
    optionChoiceNamePlaceholder: "مثلاً مرغ",
    optionChoiceNameEn: "نام انگلیسی گزینه",
    optionPriceDelta: "اختلاف قیمت (تومان)",
    optionalGroupAdvice:
      "توصیه می‌شود محصولات را جداگانه ثبت کنید تا روند خرید برای مشتری ساده‌تر شود.",
    addOptionGroup: "افزودن گروه انتخاب",
    addOptionChoice: "افزودن گزینه",
    addInfoSection: "افزودن بخش",
    noProducts: "محصولی در این دسته نیست",
    moveUp: "انتقال به بالا",
    moveDown: "انتقال به پایین",
    profitPreview: "سود هر واحد",
    marginPreview: "حاشیه سود",
    deleteProductConfirm: "این محصول حذف شود؟",
    deleteCategoryConfirm: "این دسته‌بندی و همه محصولات آن حذف شوند؟",
  },
  /**
   * Opening hours.
   *
   * `days` is indexed by the stored `dayOfWeek`, so Sunday is first here even
   * though the editor lists the week from Saturday — the display order lives in
   * `WEEK_ORDER`, not in this array.
   */
  schedule: {
    title: "ساعات ارائه",
    productHint: "مشخص کنید این محصول در چه ساعت‌هایی سفارش‌پذیر باشد.",
    categoryHint:
      "ساعات این دسته‌بندی روی همه محصولات داخل آن اعمال می‌شود؛ خارج از این ساعت‌ها هیچ‌کدام سفارش‌پذیر نیستند.",
    emptyHint: "بدون بازه زمانی، محصول مثل همیشه در دسترس است.",
    enabled: "اعمال ساعات",
    suspended: "ساعات ارائه موقتاً غیرفعال است",
    openNow: "هم‌اکنون در دسترس است",
    closedNow: "هم‌اکنون خارج از ساعات ارائه است",
    day: "روز",
    start: "از ساعت",
    end: "تا ساعت",
    to: "تا",
    remove: "حذف بازه",
    addWindow: "افزودن بازه",
    everyDay: "همه روزها مثل بازه اول",
    overnightHint:
      "بازه‌ای که ساعت پایان آن کوچک‌تر از ساعت شروع است تا بامداد روز بعد ادامه پیدا می‌کند.",
    days: [
      "یکشنبه",
      "دوشنبه",
      "سه‌شنبه",
      "چهارشنبه",
      "پنجشنبه",
      "جمعه",
      "شنبه",
    ] as readonly string[],
  },
  /**
   * The badges an owner can put on a promoted dish.
   *
   * Keyed by the values in FEATURED_LABELS. `custom` has no entry — an owner
   * choosing it supplies their own wording, which is printed as written.
   */
  featuredLabels: {
    chefsChoice: "پیشنهاد سرآشپز",
    popular: "پرطرفدار",
    isNew: "جدید",
    recommended: "پیشنهاد ما",
    specialToday: "ویژه امروز",
    limitedTime: "زمان محدود",
  },
  /** Business-day hours: which day a sale belongs to. */
  businessDay: {
    title: "ساعت کاری و روز کاری",
    hint: "همهٔ فروش‌ها، صندوق و گزارش‌ها بر اساس «روز کاری» جمع می‌شوند. اگر بعد از نیمه‌شب هم باز هستید، ساعت کاری را وارد کنید تا سفارش‌های دیروقت جزو همان شب حساب شوند.",
    calendarDay: "روز تقویمی (از نیمه‌شب تا نیمه‌شب)",
    sameAsMain: "مثل شعبهٔ اصلی",
    start: "ساعت شروع کار",
    end: "ساعت پایان کار",
    explain:
      "روز کاری از {start} تا {end} است و ساعت {cutoff} (وسط ساعت‌های تعطیلی) عوض می‌شود؛ سفارشی که بعد از نیمه‌شب و پیش از {cutoff} ثبت شود جزو روز کاری قبل حساب می‌شود.",
    explainEarlyClose:
      "روز کاری از {start} تا {end} است و ساعت {cutoff} (وسط ساعت‌های تعطیلی) عوض می‌شود؛ سفارشی که بعد از {cutoff} ثبت شود جزو روز کاری بعد حساب می‌شود.",
    allDayExplain: "شبانه‌روزی: روز کاری هر روز ساعت {cutoff} عوض می‌شود.",
    calendarExplain:
      "روز کاری همان روز تقویم است و ساعت ۰۰:۰۰ عوض می‌شود؛ سفارش‌های بعد از نیمه‌شب جزو روز بعد حساب می‌شوند.",
    pastKept:
      "تغییر ساعت فقط برای سفارش‌های بعد از ذخیره اعمال می‌شود. هر سفارش هنگام ثبت روز کاری‌اش را نگه می‌دارد، پس گزارش روزهای گذشته جابه‌جا نمی‌شود.",
    save: "ذخیرهٔ ساعت کاری",
    saved: "ساعت کاری ذخیره شد",
    branchesTitle: "ساعت کاری شعبه‌ها",
    branchesHint:
      "هر شعبه می‌تواند ساعت کاری خودش را داشته باشد یا از ساعت شعبهٔ اصلی پیروی کند.",
  },
  /** A subscription payment receipt (/print/receipt/[id]). */
  receipt: {
    title: "رسید پرداخت اشتراک",
    number: "شمارهٔ رسید",
    seller: "دریافت‌کننده",
    buyer: "پرداخت‌کننده",
    nationalId: "شناسهٔ ملی",
    economicCode: "کد اقتصادی",
    postalCode: "کد پستی",
    phone: "تلفن",
    description: "شرح",
    amount: "مبلغ",
    subscriptionLine: "اشتراک {plan} — {interval}",
    discount: "تخفیف",
    paid: "مبلغ پرداخت‌شده",
    gateway: "درگاه",
    testGateway: "درگاه آزمایشی",
    zarinpal: "زرین‌پال",
    refId: "شمارهٔ پیگیری",
    card: "کارت",
    notTaxInvoice: "این سند رسید پرداخت است و جایگزین صورتحساب رسمی سامانهٔ مؤدیان نیست.",
    print: "چاپ رسید",
    open: "رسید",
  },
  /** The «انبار» section: per-site stock, purchases, waste and counts. */
  stock: {
    title: "انبار",
    subtitle: "موجودی، خرید، ضایعات و انبارگردانی",
    site: "شعبه",
    views: {
      stock: "موجودی",
      purchases: "خرید",
      waste: "ضایعات",
      count: "انبارگردانی",
      suppliers: "تأمین‌کنندگان",
      history: "گردش کالا",
    },
    stockValue: "ارزش موجودی",
    lowItems: "رو به اتمام",
    negativeItems: "موجودی منفی",
    unpaid: "بدهی خرید",
    item: "ماده",
    quantity: "موجودی",
    unitCost: "بهای هر واحد",
    value: "ارزش",
    category: "گروه",
    supplier: "تأمین‌کننده",
    low: "کم",
    negative: "منفی",
    archived: "بایگانی",
    noCost: "بدون قیمت",
    negativeHint:
      "موجودی منفی یعنی بیش از موجودی ثبت‌شده فروخته‌اید. خرید یا انبارگردانی را ثبت کنید تا درست شود.",
    emptyCatalogue:
      "هنوز ماده‌ای تعریف نشده است. اول مواد اولیه و دستور پخت غذاها را تعریف کنید.",
    manageCatalogue: "تعریف مواد و دستور پخت",
    search: "جستجوی ماده…",
    newPurchase: "ثبت خرید جدید",
    purchaseDate: "تاریخ خرید",
    invoiceNumber: "شماره فاکتور",
    noSupplier: "بدون تأمین‌کننده",
    chooseItem: "ماده را انتخاب کنید",
    addLine: "افزودن قلم",
    removeLine: "حذف قلم",
    amount: "مقدار",
    unit: "واحد",
    lineTotal: "مبلغ کل ردیف",
    total: "جمع فاکتور",
    paid: "پرداخت شده",
    unpaidLabel: "پرداخت نشده (نسیه)",
    markPaid: "پرداخت شد",
    updateReference: "قیمت مرجع این مواد هم به‌روز شود",
    updateReferenceHint:
      "قیمت مرجع، بهای تمام‌شدهٔ غذاها را تعیین می‌کند. اگر قیمت‌گذاری خودکار روشن باشد، قیمت منو هم تغییر می‌کند.",
    purchaseSaved: "خرید ثبت شد و به موجودی اضافه شد",
    recentPurchases: "خریدهای اخیر",
    noPurchases: "هنوز خریدی ثبت نشده است.",
    note: "یادداشت",
    lineCount: "{count} قلم",
    by: "ثبت: {name}",
    recordWaste: "ثبت ضایعات",
    reason: "علت",
    wasteReasons: {
      spoiled: "خراب شده",
      expired: "تاریخ گذشته",
      damaged: "آسیب دیده",
      staffMeal: "غذای پرسنل",
      other: "سایر",
    },
    wasteSaved: "ضایعات ثبت شد",
    recentWaste: "ضایعات اخیر",
    noWaste: "ضایعاتی ثبت نشده است.",
    countHint:
      "فقط اقلامی را که شمردید وارد کنید؛ بقیه دست نمی‌خورند. اختلاف هنگام ثبت با موجودی همان لحظه مقایسه می‌شود.",
    expected: "طبق سیستم",
    counted: "شمارش شده",
    difference: "اختلاف",
    shortage: "کسری",
    surplus: "مازاد",
    postCount: "ثبت انبارگردانی",
    confirmCount:
      "انبارگردانی ثبت شود؟ موجودی اقلام شمرده‌شده با عدد شمارش جایگزین می‌شود.",
    countSaved: "انبارگردانی ثبت شد",
    nothingCounted: "هنوز عددی وارد نکرده‌اید.",
    countedItems: "{count} قلم شمرده شد",
    addSupplier: "افزودن تأمین‌کننده",
    supplierName: "نام تأمین‌کننده",
    phone: "تلفن",
    saved: "ذخیره شد",
    inactive: "غیرفعال",
    activate: "فعال کن",
    deactivate: "غیرفعال کن",
    ownerOnlySuppliers: "فهرست تأمین‌کنندگان را فقط مالک مجموعه تغییر می‌دهد.",
    noSuppliers: "هنوز تأمین‌کننده‌ای ثبت نشده است.",
    reasons: {
      ORDER_PLACED: "سفارش",
      ORDER_CANCELED: "لغو سفارش",
      MANUAL_ADJUSTMENT: "اصلاح دستی",
      OPENING: "موجودی اول",
      PURCHASE: "خرید",
      WASTE: "ضایعات",
      STOCKTAKE: "انبارگردانی",
    },
    allItems: "همه مواد",
    allReasons: "همه انواع",
    loadMore: "موارد قدیمی‌تر",
    when: "زمان",
    change: "تغییر",
    orderRef: "سفارش #{number}",
    noMovements: "گردشی ثبت نشده است.",
    system: "سیستم",
  },
  /** Dietary tags on a dish. Keyed by DISH_TAGS in src/lib/dish-tags.ts. */
  dishTags: {
    title: "ویژگی‌های غذا",
    hint: "به مهمان کمک می‌کند بدون پرسیدن از گارسون انتخاب کند.",
    filterLabel: "فیلتر منو",
    clearFilters: "همه غذاها",
    noMatch: "غذایی با این ویژگی‌ها پیدا نشد.",
    labels: {
      spicy: "تند",
      vegetarian: "گیاهی",
      vegan: "وگان",
      glutenFree: "بدون گلوتن",
      containsNuts: "دارای مغزها",
      containsDairy: "دارای لبنیات",
    },
  },
  /** Merchandising: featured dishes, and how they performed. */
  featured: {
    title: "محصول ویژه",
    hint: "این محصول در بخش «پیشنهاد ویژه» بالای منو نمایش داده می‌شود.",
    markFeatured: "نمایش به‌عنوان محصول ویژه",
    label: "برچسب",
    labelNone: "بدون برچسب",
    labelCustom: "برچسب دلخواه",
    customText: "متن برچسب",
    order: "ترتیب نمایش",
    orderHint: "عدد کوچک‌تر جلوتر نمایش داده می‌شود",
    window: "بازه زمانی (اختیاری)",
    windowHint: "اگر خالی بماند، تا زمانی که خودتان غیرفعال کنید نمایش داده می‌شود.",
    from: "از تاریخ",
    until: "تا تاریخ",
    sectionEnabled: "نمایش بخش «پیشنهاد ویژه» در منو",
    sectionEnabledHint:
      "تا وقتی این گزینه خاموش است، محصولات ویژه در بالای منو نمایش داده نمی‌شوند.",
    activeNow: "هم‌اکنون نمایش داده می‌شود",
    scheduledLater: "هنوز شروع نشده است",
    expired: "بازه نمایش تمام شده است",
    notAvailable: "چون محصول در دسترس نیست، نمایش داده نمی‌شود",
    // Analytics
    analyticsTitle: "عملکرد محصولات ویژه",
    analyticsHint: "بر اساس سفارش‌های ثبت‌شده در این بازه",
    product: "محصول",
    impressions: "نمایش",
    views: "بازدید",
    addedToCart: "افزودن به سبد",
    purchases: "خرید",
    /**
     * Toman earned per guest the dish was shown to.
     *
     * Replaces the old «نرخ تبدیل», which divided order lines by guest sessions
     * — two different populations — and was silently clamped to 100%. See the
     * unit note in src/lib/merchandising.ts.
     */
    revenuePerView: "درآمد به‌ازای نمایش",
    revenue: "درآمد منتسب",
  },
  /** The customer book: who returns, and how often. */
  customers: {
    navLabel: "مشتریان",
    title: "مشتریان",
    subtitle: "مشتریانی که شماره تماس داده‌اند، بر اساس سفارش‌های ثبت‌شده",
    total: "کل مشتریان",
    customer: "مشتری",
    unnamed: "بدون نام",
    segment: "وضعیت",
    allSegments: "همه وضعیت‌ها",
    orders: "سفارش‌ها",
    revenue: "مجموع خرید",
    averageOrder: "میانگین هر سفارش",
    firstOrder: "اولین سفارش",
    lastOrder: "آخرین سفارش",
    daysAgo: "{n} روز پیش",
    search: "جستجو",
    searchHint: "نام یا شماره تماس",
    view: "مشاهده",
    recentOrders: "سفارش‌های اخیر",
    noOrders: "سفارشی ثبت نشده است",
    empty: "هنوز مشتری ثبت‌شده‌ای ندارید",
    emptyHint:
      "وقتی مشتری هنگام سفارش شماره تماس وارد کند، اینجا به‌عنوان مشتری شناخته می‌شود.",
    emptyFiltered: "با این فیلترها مشتری‌ای پیدا نشد.",
    pageOf: "صفحه {page} از {pages}",
    previous: "قبلی",
    next: "بعدی",
    marketingConsent: "رضایت دریافت پیام",
    marketingConsentHint:
      "فقط ثبت می‌شود؛ در حال حاضر هیچ پیامی از سمت رستوکار ارسال نمی‌شود.",

    /** Spending band, relative to this venue's own customers. */
    valueTier: "ارزش مشتری",
    allValueTiers: "همه سطح‌ها",
    valueTiers: {
      unknown: "نامشخص",
      standard: "معمولی",
      high: "پرارزش",
    },
    /** `{amount}` is formatted money — the venue's own high-value line. */
    highValueFrom: "پرارزش: خرید مجموع {amount} به بالا",

    /** The venue-wide retention figures. */
    retention: {
      title: "وضعیت بازگشت مشتری",
      withOrders: "مشتری با سفارش",
      repeatRate: "نرخ بازگشت",
      repeatRateHint: "سهم مشتریانی که بیش از یک بار سفارش داده‌اند",
      averageLifetimeValue: "میانگین ارزش هر مشتری",
      averageOrders: "میانگین سفارش هر مشتری",
    },

    /**
     * The action cards. Each states a group and what is known about it — never
     * an instruction, because what to do about it is the owner's trade, not
     * the software's.
     */
    opportunities: {
      title: "فرصت‌های بازگرداندن مشتری",
      hint: "بر اساس سفارش‌های ثبت‌شده‌ی همین مجموعه.",
      empty: "هنوز داده‌ی کافی برای پیشنهاد وجود ندارد.",
      /** `{count}` customers are in the group. */
      firstToSecond: "{count} مشتری یک بار سفارش داده‌اند و هنوز برنگشته‌اند",
      firstToSecondHint: "اولین تجربه‌شان خوب بوده؛ دومین سفارش معمولاً سخت‌ترین است.",
      highValueAtRisk: "{count} مشتری پرارزش دیرتر از همیشه سفارش داده‌اند",
      highValueAtRiskHint: "بیشترین خرید را داشته‌اند و حالا از ریتم همیشگی‌شان عقب‌اند.",
      winBack: "{count} مشتری قدیمی مدت‌هاست سفارش نداده‌اند",
      winBackHint: "قبلاً چند بار سفارش داده بودند؛ حالا مدت زیادی است خبری نیست.",
      activeRegulars: "{count} مشتری وفادار فعال دارید",
      activeRegularsHint: "مرتب سفارش می‌دهند — ارزش نگه‌داشتن دارند.",
      /** `{amount}` is the group's combined historical spending. */
      revenueAtStake: "مجموع خرید این گروه: {amount}",
      viewCustomers: "دیدن مشتریان",
    },

    /**
     * Why a customer is in the group they are in.
     *
     * Every one states a checkable fact rather than a verdict. `{n}` is days
     * idle, `{interval}` the guest's own typical gap, `{orders}` their order
     * count — the dashboard fills whichever the sentence uses.
     */
    reasons: {
      lapsedLongSilence: "{n} روز است سفارشی ثبت نکرده‌اند.",
      atRiskOverdue:
        "معمولاً هر {interval} روز سفارش می‌دادند، اما {n} روز است خبری نیست.",
      atRiskNoRhythm: "{n} روز است سفارشی ثبت نکرده‌اند.",
      loyalFrequent: "{orders} سفارش ثبت‌شده و همچنان فعال هستند.",
      returningActive: "بیش از یک بار سفارش داده‌اند و فعال هستند.",
      newFirstOrder: "اولین سفارششان را ثبت کرده‌اند.",
      newNoOrders: "هنوز سفارشی ثبت نکرده‌اند.",
    },
    /** Shown where there is too little history to say anything useful. */
    notEnoughHistory: "سابقه‌ی کافی برای تشخیص ریتم سفارش وجود ندارد.",
    typicalInterval: "فاصله‌ی معمول سفارش",
    /** `{n}` days. */
    everyNDays: "هر {n} روز",
    /**
     * Segment names, keyed by CUSTOMER_SEGMENTS. The thresholds behind them
     * live in src/lib/customers.ts, not here.
     */
    segments: {
      new: "تازه‌وارد",
      returning: "بازگشته",
      loyal: "وفادار",
      atRisk: "در معرض ریزش",
      inactive: "غیرفعال",
    },
  },
  /**
   * Campaign planning. Nothing here sends a message, and the copy says so
   * plainly rather than implying a capability the platform does not have.
   */
  reviews: {
    title: "نظرهای مشتریان",
    countSuffix: "نظر",
    filterLabel: "فیلتر بر اساس امتیاز",
    allRatings: "همه",
    noneInBand: "نظری با این امتیاز ثبت نشده است.",
    noComment: "بدون نظر نوشته‌شده",
    emptyTitle: "هنوز نظری ثبت نشده",
    emptyBody:
      "پس از تحویل هر سفارش، از مشتری خواسته می‌شود امتیاز دهد. نظرها اینجا نمایش داده می‌شوند.",
  },
  campaigns: {
    navLabel: "کمپین‌ها",
    title: "کمپین‌ها",
    subtitle: "برنامه‌ریزی برای گروه‌های مشتری، بر اساس سفارش‌های ثبت‌شده",
    noDeliveryNotice:
      "کمپین فقط برنامه‌ریزی و ذخیره می‌شود و خودکار پیامی نمی‌فرستد. برای رساندن پیام به مشتری‌ها «پیامک تبلیغاتی» را بزنید؛ پس از پرداخت، پیامک توسط تیم رستوکار ارسال می‌شود.",
    sendSms: "ارسال پیامک به این گروه",

    create: "کمپین جدید",
    editTitle: "ویرایش کمپین",
    createTitle: "کمپین جدید",
    name: "نام کمپین",
    namePlaceholder: "مثلاً بازگرداندن مشتری‌های قدیمی",
    targetSegment: "گروه هدف",
    product: "محصول",
    category: "دسته‌بندی",
    optional: "اختیاری",
    none: "بدون انتخاب",
    startsAt: "شروع",
    endsAt: "پایان",
    context: "زمینه",
    noContext: "همهٔ مشتریان این گروه",

    status: "وضعیت",
    allStatuses: "همه وضعیت‌ها",
    statuses: {
      DRAFT: "پیش‌نویس",
      SCHEDULED: "زمان‌بندی‌شده",
      ACTIVE: "فعال",
      PAUSED: "متوقف",
      COMPLETED: "پایان‌یافته",
      CANCELED: "لغو شده",
    },
    /** Verbs, not names: these label the button that performs the move. */
    actions: {
      DRAFT: "بازگشت به پیش‌نویس",
      SCHEDULED: "زمان‌بندی",
      ACTIVE: "فعال‌سازی",
      PAUSED: "توقف موقت",
      COMPLETED: "پایان",
      CANCELED: "لغو",
    },

    estimatedAudience: "مخاطب تخمینی",
    eligibleAudience: "قابل ارتباط",
    eligibleHint: "شماره تماس دارند و رضایت دریافت پیام داده‌اند",
    estimateHint: "این عدد تخمینی است و تضمین ارسال نیست.",
    audienceAtCommit: "مخاطب هنگام ثبت",
    audienceAtCommitHint: "تعداد ثبت‌شده در لحظه‌ای که کمپین زمان‌بندی یا فعال شد",
    customerUnit: "مشتری",

    deliveryMetrics: "آمار ارسال و تعامل",
    unavailable: "در دسترس نیست",
    unavailableHint:
      "پیامک‌ها توسط تیم رستوکار ارسال می‌شوند و آمار تحویل و تعامل اندازه‌گیری نمی‌شود؛ این عددها ساختگی نمایش داده نمی‌شوند.",
    metrics: {
      sent: "ارسال‌شده",
      delivered: "تحویل‌شده",
      interactions: "تعامل",
      conversions: "تبدیل",
      attributedOrders: "سفارش منتسب",
      attributedRevenue: "درآمد منتسب",
    },

    saveDraft: "ذخیره پیش‌نویس",
    save: "ذخیره",
    deleteDraft: "حذف پیش‌نویس",
    confirmDelete: "این پیش‌نویس حذف شود؟",
    view: "جزئیات",
    featuredNote: "این محصول هم‌اکنون ویژه است",
    lockedHint: "کمپینی که اجرا شده دیگر قابل ویرایش نیست.",

    created: "کمپین ساخته شد",
    updated: "کمپین به‌روزرسانی شد",
    statusChanged: "وضعیت کمپین تغییر کرد",
    deleted: "پیش‌نویس حذف شد",

    empty: "هنوز کمپینی نساخته‌اید",
    emptyHint: "یک گروه از مشتری‌ها را انتخاب کنید و برنامه‌تان را ذخیره کنید.",
    emptyFiltered: "با این فیلتر کمپینی پیدا نشد.",
    pageOf: "صفحه {page} از {pages}",
    previous: "قبلی",
    next: "بعدی",
  },
  /**
   * Rule-based sales insights.
   *
   * Every sentence here is a description of a measured change. None of them
   * asserts a reason: where the engine can only show that two figures moved
   * together, the copy says «داده‌ها نشان می‌دهد» — the data suggests — rather
   * than claiming a cause it cannot establish.
   */

  smsBroadcast: {
    open: "پیامک تبلیغاتی",
    title: "پیامک تبلیغاتی",
    forCampaign: "برای کمپین «{name}»",
    intro:
      "پیام را بنویسید و گیرنده‌ها را انتخاب کنید. پس از پرداخت، پیامک توسط تیم رستوکار برای مشتری‌هایی ارسال می‌شود که رضایت دریافت پیام داده‌اند.",
    audience: "گیرنده‌ها",
    allCustomers: "همهٔ مشتریان",
    text: "متن پیامک",
    textPlaceholder: "مثلاً: این هفته ۲۰٪ تخفیف روی همهٔ نوشیدنی‌ها",
    optOutNote: "عبارت «{suffix}» برای لغو دریافت، خودکار به انتهای پیام اضافه می‌شود.",
    preview: "پیامکی که ارسال می‌شود",
    recipients: "گیرنده",
    parts: "پیامک برای هر نفر",
    characters: "{count} نویسه",
    pricePerPart: "قیمت هر پیامک",
    total: "مبلغ قابل پرداخت",
    toman: "تومان",
    calculating: "در حال محاسبه…",
    pay: "پرداخت و ثبت درخواست",
    paying: "در حال انتقال به درگاه…",
    checkoutDisabled:
      "پرداخت آنلاین پیامک هنوز فعال نشده است. برای ارسال با پشتیبانی تماس بگیرید.",
    consentNote:
      "فقط مشتری‌هایی شمرده می‌شوند که رضایت دریافت پیام داده‌اند و شمارهٔ موبایل معتبر دارند.",
    issues: {
      EMPTY: "متن پیامک را بنویسید.",
      CONTAINS_LINK: "پیامک تبلیغاتی نمی‌تواند لینک داشته باشد؛ اپراتور آن را رد می‌کند.",
      TOO_LONG: "متن طولانی است. حداکثر {max} پیامک برای هر نفر مجاز است.",
      NO_RECIPIENTS: "در این گروه هیچ مشتری‌ای با رضایت دریافت پیام وجود ندارد.",
    },
    history: "درخواست‌های پیامک",
    historyEmpty: "هنوز درخواستی ثبت نکرده‌اید.",
    date: "تاریخ",
    message: "پیام",
    amount: "مبلغ",
    status: "وضعیت",
    statuses: {
      PENDING_PAYMENT: "در انتظار پرداخت",
      PAID: "در صف ارسال",
      SENT: "ارسال شد",
      CANCELED: "لغو شد",
    },
    paymentSuccess: "پرداخت انجام شد. پیامک شما در صف ارسال قرار گرفت.",
    paymentFailed: "پرداخت انجام نشد و پیامکی در صف قرار نگرفت.",
    admin: {
      title: "صف پیامک‌های تبلیغاتی",
      subtitle:
        "فایل شماره‌ها را دریافت کنید، پیام را با ابزار ارسال بفرستید و سپس «ارسال شد» را بزنید.",
      empty: "درخواستی در این بخش نیست.",
      filterOpen: "در انتظار ارسال",
      filterSent: "ارسال‌شده",
      filterCanceled: "لغوشده",
      venue: "رستوران",
      campaign: "کمپین",
      paidAt: "زمان پرداخت",
      download: "دریافت فایل شماره‌ها",
      copyText: "کپی متن",
      copied: "متن کپی شد",
      markSent: "ارسال شد",
      cancel: "لغو درخواست",
      confirmSent: "این پیامک را با ابزار ارسال فرستاده‌اید؟",
      confirmCancel:
        "این درخواست لغو شود؟ بازگرداندن مبلغ به رستوران باید جداگانه انجام شود.",
      mockPayment: "پرداخت آزمایشی — مبلغی دریافت نشده است. ارسال نکنید.",
      refId: "کد پیگیری",
      markedSent: "به‌عنوان ارسال‌شده ثبت شد",
      canceled: "درخواست لغو شد",
    },
  },
  insights: {
    title: "تحلیل فروش",
    subtitle: "چه چیزی نسبت به بازهٔ قبل تغییر کرده است",
    period: "بازه",
    comparedWith: "در مقایسه با {from} تا {to}",
    currentRange: "{from} تا {to}",
    incompleteNote:
      "این بازه هنوز تمام نشده است؛ بازهٔ مقایسه هم دقیقاً به همان اندازه بریده شده تا مقایسه منصفانه بماند.",
    insufficient: "داده کافی برای مقایسه نیست",
    insufficientHint:
      "بازهٔ قبل سفارش کافی برای نتیجه‌گیری ندارد. با ثبت سفارش‌های بیشتر، تحلیل اینجا ظاهر می‌شود.",
    noChange: "تغییر معناداری دیده نمی‌شود",
    noChangeHint: "هیچ تغییری نسبت به بازهٔ قبل از آستانه‌های معنادار عبور نکرده است.",
    supporting: "عددهای پشتیبان",
    lowConfidence: "بر پایهٔ داده‌های کم",
    suggestion: "پیشنهاد",

    periods: {
      today: "امروز",
      yesterday: "دیروز",
      thisWeek: "این هفته",
      thisMonth: "این ماه",
      last7: "۷ روز کامل گذشته",
      last30: "۳۰ روز کامل گذشته",
      last90: "۹۰ روز کامل گذشته",
    },

    /** Short label above each card, so the list scans without being read. */
    types: {
      revenueChange: "درآمد",
      revenueDriver: "این تغییر از کجا می‌آید؟",
      orderVolumeChange: "تعداد سفارش",
      aovChange: "میانگین سبد خرید",
      topNegativeContributor: "بیشترین اثر منفی",
      topPositiveContributor: "بیشترین اثر مثبت",
      categoryDecline: "افت دسته‌بندی",
      categoryGrowth: "رشد دسته‌بندی",
      customerMixChange: "رفتار مشتریان",
      featuredWeakConversion: "محصول ویژه",
      recommendationWeakConversion: "پیشنهاد همراه",
      tableHighActivity: "میز پرفروش",
      tableActivityDecline: "افت فعالیت میز",
      tableViewsWithoutOrders: "بازدید بیشتر از سفارش",
      tableConcentration: "تمرکز فروش روی چند میز",
    },

    messages: {
      revenueDown: "درآمد {percent} کاهش یافت — {amount} کمتر از بازهٔ قبل.",
      revenueUp: "درآمد {percent} افزایش یافت — {amount} بیشتر از بازهٔ قبل.",
      ordersDown: "تعداد سفارش‌ها {percent} کمتر شد ({count} سفارش کمتر).",
      ordersUp: "تعداد سفارش‌ها {percent} بیشتر شد ({count} سفارش بیشتر).",
      basketDown: "میانگین هر سفارش {percent} کمتر شد ({amount} کمتر).",
      basketUp: "میانگین هر سفارش {percent} بیشتر شد ({amount} بیشتر).",
      driverOrders:
        "داده‌ها نشان می‌دهد این تغییر بیشتر با تعداد سفارش‌ها همراه است تا با اندازهٔ سبد خرید.",
      driverBasket:
        "داده‌ها نشان می‌دهد این تغییر بیشتر با اندازهٔ سبد خرید همراه است تا با تعداد سفارش‌ها.",
      driverBoth:
        "هم تعداد سفارش‌ها و هم اندازهٔ سبد خرید تغییر کرده‌اند؛ هیچ‌کدام به‌تنهایی غالب نیست.",
      productContributedDecline:
        "{amount} کمتر از بازهٔ قبل فروخت — {share} از کل افت فروش محصولات.",
      productContributedGrowth:
        "{amount} بیشتر از بازهٔ قبل فروخت — {share} از کل رشد فروش محصولات.",
      categoryDown: "فروش این دسته‌بندی {percent} کمتر شد ({amount} کمتر).",
      categoryUp: "فروش این دسته‌بندی {percent} بیشتر شد ({amount} بیشتر).",
      returningDown: "سفارش مشتریان بازگشته {percent} کمتر شد ({count} سفارش کمتر).",
      returningUp: "سفارش مشتریان بازگشته {percent} بیشتر شد ({count} سفارش بیشتر).",
      featuredWeakConversion:
        "{impressions} بار دیده شد اما تنها {purchases} بار خریداری شد.",
      recommendationWeakConversion:
        "{impressions} بار پیشنهاد شد، {addedToCart} بار به سبد رفت و {purchases} بار خریداری شد.",

      /*
        Profitability. Every sentence states the two margins side by side, so
        the owner reads a comparison they can check rather than a verdict —
        «۹٪ در برابر میانگین ۲۴٪» is something they can go and verify.
      */
      highSalesLowMargin:
        "فروش خوبی دارد اما حاشیه سود برآوردی آن {margin} است؛ میانگین منو {menuMargin}.",
      lowSalesHighMargin:
        "حاشیه سود برآوردی آن {margin} است — بالاتر از میانگین منو ({menuMargin}) — اما فروش کمی دارد.",
      costDataIncomplete:
        "{products} محصول بهای تمام‌شده ثبت‌نشده دارند؛ حاشیه سود فقط از {coverage} فروش این بازه محاسبه شده است.",
      menuConcentration: "{count} محصول اول {share} از درآمد این بازه را تشکیل داده‌اند.",

      /*
        Table intelligence. Every sentence describes and stops.

        None of them names a cause — not a peeled sticker, not a bad seat, not
        an unhappy guest. The platform cannot tell those apart, and the owner is
        standing in the room that can.
      */
      tableHighActivity:
        "{orders} سفارش ثبت شده و {share} از فروش ثبت‌شدهٔ میزها از این میز بوده است.",
      tableActivityDecline:
        "فروش ثبت‌شدهٔ این میز نسبت به بازهٔ مقایسه {percent} کمتر شده است ({amount} کمتر) — {previousOrders} سفارش در بازهٔ قبل، {orders} سفارش در این بازه.",
      tableViewsWithoutOrders:
        "منوی این میز {views} بار باز شده و {orders} سفارش از آن ثبت شده است؛ نسبت سفارش به بازدید در این میز {ratio} است، در حالی که میانگین میزهای دیگر {venueRatio} است.",
      tableConcentration:
        "{count} میز اول {share} از فروش ثبت‌شدهٔ میزها را تشکیل داده‌اند.",
    },

    /** Suggestions for the owner. Nothing here changes anything by itself. */
    actions: {
      reviewProductPlacement: "جای این محصول در منو را بازبینی کنید.",
      featureProductMore: "می‌توانید این محصول را بیشتر در معرض دید بگذارید.",
      reviewFeaturedDish: "عکس، قیمت یا توضیح این محصول ویژه را بازبینی کنید.",
      reviewSuggestion: "شاید این پیشنهاد با محصول مبدأ هم‌خوان نباشد.",
      /*
        Each points at a screen that already exists — the product editor owns
        price and cost, the merchandising screen owns promotion. Nothing here
        offers to change anything on the owner's behalf.
      */
      reviewProductPricing: "قیمت یا بهای تمام‌شدهٔ این محصول را بررسی کنید.",
      promoteProduct: "می‌توانید این محصول را ویژه کنید یا در پیشنهادها قرار دهید.",
      addProductCosts: "بهای تمام‌شدهٔ محصولات را کامل کنید تا سود دقیق‌تر محاسبه شود.",
    },

    labels: {
      revenue: "درآمد",
      orders: "سفارش‌ها",
      averageOrderValue: "میانگین هر سفارش",
      current: "این بازه",
      previous: "بازهٔ قبل",
      /** Prefixes an insight about a table, so «۱۲» reads as a place. */
      table: "میز",
    },
  },
  /**
   * What is happening through each QR code.
   *
   * Two words carry most of the honesty in this screen. It says **بازدید منو**
   * (menu visit) and never **اسکن** (scan): the platform knows a page was
   * opened, not that a camera was pointed at a sticker, and those differ every
   * time a guest reloads, shares the link, or returns to the tab. And it says
   * **فروش ثبت‌شده** (recorded sales) rather than the venue's takings, because a
   * table's figure only ever covers orders that carried its number.
   */
  tableIntel: {
    navLabel: "عملکرد میزها",
    title: "عملکرد میزها",
    subtitle: "ببینید از هر میز چه اندازه سفارش و فروش ثبت شده است.",
    backToAnalytics: "بازگشت به گزارش فروش",

    columns: {
      table: "میز",
      orders: "سفارش‌ها",
      revenue: "فروش ثبت‌شده",
      averageOrderValue: "میانگین هر سفارش",
      visits: "بازدید منو",
      perVisit: "سفارش به ازای هر بازدید",
      trend: "تغییر فروش",
      activity: "فعالیت",
      lastOrder: "آخرین سفارش",
    },

    tiles: {
      activeTables: "میزهای فعال",
      tableRevenue: "فروش ثبت‌شدهٔ میزها",
      tableOrders: "سفارش‌های ثبت‌شدهٔ میزها",
      busiest: "پرکارترین میز",
    },

    activity: {
      high: "بالا",
      medium: "متوسط",
      low: "پایین",
      none: "بدون سفارش",
      /** Shown in place of a band when the venue is too quiet to compare. */
      unknown: "—",
    },

    /** A number that appears on orders but has no table row of its own. */
    unlisted: "ثبت‌نشده",
    unlistedHint:
      "این شمارهٔ میز روی سفارش‌ها ثبت شده اما در فهرست میزهای شما وجود ندارد — شاید میزی که حذف شده یا شماره‌ای که دستی وارد شده است.",

    seats: "{count} نفره",
    noOrders: "بدون سفارش",
    noOrdersYet: "هنوز سفارشی از این میز ثبت نشده است.",

    empty: "هنوز میزی تعریف نشده است",
    emptyHint:
      "برای دیدن عملکرد هر میز، ابتدا از صفحهٔ بارکد میزها میز اضافه کنید و بارکد اختصاصی هر میز را روی آن بگذارید.",
    emptyAction: "رفتن به بارکد میزها",

    noActivity: "در این بازه سفارشی از میزها ثبت نشده است",
    noActivityHint: "بازهٔ دیگری را انتخاب کنید یا تا ثبت سفارش‌های بیشتر صبر کنید.",

    insufficientBands: "برای مقایسهٔ میزها داده کافی نیست",
    insufficientBandsHint:
      "برچسب «بالا» و «پایین» زمانی نشان داده می‌شود که دست‌کم {orders} سفارش روی {tables} میز ثبت شده باشد. تعداد سفارش و فروش هر میز همچنان در جدول زیر نشان داده می‌شود.",

    /* The visit column's own honesty note. */
    visitsTitle: "بازدید منو",
    visitsMeasured:
      "{attributed} بازدید از بارکد میزها و {unattributed} بازدید از لینک مستقیم ثبت شده است.",
    visitsInsufficient: "داده کافی برای بازدید میزها نیست",
    visitsInsufficientHint:
      "بازدید هر میز از زمانی شمرده می‌شود که مشتری منو را با بارکد همان میز باز کند. اگر بیشتر بازدیدها از لینک مستقیم باشد یا هنوز بازدیدی ثبت نشده باشد، این ستون خالی می‌ماند.",
    visitsNote:
      "«بازدید منو» یعنی باز شدن صفحهٔ منو با بارکد این میز؛ این عدد تعداد اسکن یا تعداد مشتری نیست. یک مشتری ممکن است چند بار منو را باز کند و چند مشتری ممکن است با یک سفارش مشترک باشند.",
    perVisitOver:
      "سفارش‌های این میز از تعداد بازدیدهای بارکدش بیشتر است؛ یعنی بخشی از مشتریان این میز منو را از راه دیگری باز کرده‌اند.",
  },
  /** Upselling: the owner's suggestions, and how they performed. */
  /** Meal deals: what a combo contains, and what it saves. */
  bundles: {
    title: "پیشنهاد ویژه (مِنو کامل)",
    hint: "اگر این محصول یک پیشنهاد ترکیبی است، اجزای آن را اینجا مشخص کنید. قیمت خودِ محصول، قیمت نهایی پیشنهاد است.",
    emptyHint: "این محصول یک پیشنهاد ترکیبی نیست.",
    product: "محصول",
    quantity: "تعداد",
    add: "افزودن جزء",
    remove: "حذف جزء",
    partsTotal: "مجموع قیمت اجزا",
    saving: "صرفه‌جویی مشتری",
    noSaving: "بدون صرفه‌جویی",
    /** Column heading on the merchandising overview. */
    overviewLabel: "پیشنهاد ترکیبی",
  },
  /** The one screen answering "what am I promoting, and where?" */
  merchandising: {
    navLabel: "فروش و پیشنهادها",
    title: "فروش و پیشنهادها",
    subtitle: "ببینید هر محصول کجا به مشتری پیشنهاد می‌شود.",
    empty: "هنوز محصولی برای پیشنهاد تنظیم نشده است.",
    product: "محصول",
    promotions: "پیشنهادها",
    nothing: "—",
    featured: "ویژه",
    pairings: "پیشنهاد همراه",
    bundle: "پیشنهاد ترکیبی",
    upgrade: "ارتقا",
    /** Where a given promotion shows up, so the owner is not guessing. */
    appearsOn: "محل نمایش",
    appearsProductSheet: "صفحه محصول",
    appearsCart: "سبد خرید",
    appearsMenu: "بالای منو",
    /** The history-derived suggestions block. */
    suggestionsTitle: "این‌ها را با هم سفارش می‌دهند",
    suggestionsHint:
      "بر اساس سفارش‌های ثبت‌شده‌ی همین مجموعه. می‌توانید هرکدام را به‌عنوان پیشنهاد همراه ثبت کنید.",
    suggestionsEmpty:
      "هنوز سفارش کافی برای نتیجه‌گیری ثبت نشده است. تا آن زمان فقط پیشنهادهای خودتان نمایش داده می‌شود.",
    /** `{count}` orders contained both dishes. */
    togetherCount: "در {count} سفارش با هم",
    /** `{percent}` of orders with the first dish also had the second. */
    togetherShare: "{percent} از سفارش‌های «{source}»",
    addAsPairing: "ثبت به‌عنوان پیشنهاد",
    added: "ثبت شد",
    computedAt: "آخرین محاسبه",
    never: "هنوز محاسبه نشده",
    recompute: "محاسبه دوباره",
  },
  recommendations: {
    title: "پیشنهاد همراه",
    hint: "وقتی مشتری این محصول را سفارش می‌دهد، این موارد به او پیشنهاد می‌شود.",
    /** The owner's own sentence above the pairings on the public menu. */
    noteLabel: "متن پیشنهاد",
    noteHint:
      "جمله‌ای که بالای این پیشنهادها به مشتری نشان داده می‌شود. خالی بگذارید تا متن پیش‌فرض استفاده شود.",
    noteLabelEn: "متن پیشنهاد (انگلیسی)",
    emptyHint: "هنوز پیشنهادی تعریف نشده است.",
    product: "محصول پیشنهادی",
    active: "فعال",
    remove: "حذف پیشنهاد",
    add: "افزودن پیشنهاد",
    capNotice: "فقط {n} پیشنهاد اول به مشتری نمایش داده می‌شود.",
    // Analytics
    analyticsTitle: "عملکرد پیشنهادها",
    analyticsHint: "بر اساس سفارش‌های ثبت‌شده در این بازه",
    empty: "هنوز داده‌ای برای پیشنهادها ثبت نشده است.",
    pair: "پیشنهاد",
    impressions: "نمایش",
    addedToCart: "افزودن به سبد",
    purchases: "خرید",
    /** See the note on the same key in the `featured` block above. */
    revenuePerView: "درآمد به‌ازای نمایش",
    revenue: "درآمد منتسب",
  },
  design: {
    title: "طراحی منو",
    subtitle: "قالب و ظاهر منوی عمومی رستوران خود را تنظیم کنید",
    template: "قالب",
    templateHint:
      "قالب‌ها توسط تیم ما به‌روزرسانی می‌شوند و بهبودها خودکار روی منوی شما اعمال می‌شود.",
    productPhoto: "عکس غذا",
    productPhotoHint:
      "وقتی مشتری روی نام غذا می‌زند، صفحه‌ی جزئیات باز می‌شود. اگر منوی شما بدون عکس است، می‌توانید نمایش عکس را در این صفحه خاموش کنید.",
    productPhotoEnable: "نمایش عکس در صفحه‌ی جزئیات غذا",
    productPhotoOffNote:
      "صفحه‌ی جزئیات فقط نام، قیمت و توضیحات را نشان می‌دهد و «بدون عکس» دیگر در وضعیت منو به‌عنوان نقص شمرده نمی‌شود.",
    colors: "رنگ‌ها",
    palettes: "پالت‌های آماده",
    palettesHint:
      "یک ترکیب رنگی حرفه‌ای را با یک کلیک اعمال کنید. خوانایی همه پالت‌ها بررسی شده است.",
    primaryColor: "رنگ اصلی",
    secondaryColor: "رنگ فرعی",
    backgroundColor: "رنگ پس‌زمینه",
    surfaceColor: "رنگ کارت‌ها",
    textColor: "رنگ متن",
    backgroundImage: "تصویر پس‌زمینه",
    backgroundOverlay: "شفافیت پوشش پس‌زمینه",
    font: "فونت",
    radius: "گردی گوشه‌ها",
    style: "سبک بصری",
    styleFlat: "ساده",
    styleGlass: "شیشه‌ای",
    styleElevated: "سایه‌دار",
    livePreview: "پیش‌نمایش زنده",
    phone: "موبایل",
    tablet: "تبلت",
    laptop: "لپ‌تاپ",
    resetTheme: "بازگشت به پیش‌فرض قالب",
    applied: "تغییرات روی منوی عمومی اعمال شد",
  },
  publicMenu: {
    metaFallback: "منوی آنلاین، مشاهده قیمت‌ها و ثبت سفارش",
    switchToEnglish: "نمایش منو به انگلیسی",
    switchToPersian: "نمایش منو به فارسی",
    staffCallDefault: "صدا زدن گارسون",
    optionRequired: "الزامی",
    optionChosen: "انتخاب‌ها",
    poweredBy: "ساخته‌شده با",
    optionChooseUpTo: "حداکثر انتخاب:",
    optionPickOne: "لطفاً یک گزینه انتخاب کنید",
    searchPlaceholder: "جستجو در منو…",
    cart: "سبد خرید",
    cartEmpty: "سبد خرید شما خالی است",
    cartEmptyHint: "از منو محصول اضافه کنید",
    addToCart: "افزودن",
    inCart: "در سبد",
    subtotal: "جمع کل",
    total: "مبلغ قابل پرداخت",
    serviceCharge: "حق سرویس",
    tax: "مالیات",
    rounding: "گرد کردن",
    tip: "انعام",
    addTip: "انعام (اختیاری)",
    noTip: "بدون انعام",
    discountCode: "کد تخفیف (اختیاری)",
    discountApply: "اعمال",
    discountChecking: "در حال بررسی…",
    discountRemove: "حذف کد",
    /** The saving, as its own line in the bill breakdown. */
    discountSaving: "تخفیف",
    discountApplied: "کد {code} اعمال شد",
    /*
      One message per reason the schema can actually justify. A missing code and
      a switched-off one share this message on purpose — telling a guest which
      it was would confirm the code exists, one guess at a time.
    */
    discountRejected: {
      DISABLED: "این رستوران در حال حاضر کد تخفیف نمی‌پذیرد.",
      EMPTY: "کد تخفیف را وارد کنید.",
      MALFORMED: "کد تخفیف باید حرف یا عدد داشته باشد.",
      NOT_FOUND: "این کد تخفیف معتبر نیست.",
      NO_BASKET: "سبد خرید شما خالی است.",
      NO_VALUE: "این کد روی سبد فعلی شما تخفیفی ندارد.",
    },
    discountCheckFailed: "بررسی کد ممکن نشد. دوباره تلاش کنید.",
    staffCallSend: "ارسال",
    requestBill: "درخواست صورتحساب",
    serviceQuestion: "سرو در سالن یا بیرون‌بر؟",
    dineIn: "سرو در سالن",
    takeaway: "بیرون‌بر",
    pickupNumber: "شمارهٔ سفارش شما",
    pickupHint: "سفارش با این شماره در پیشخوان تحویل داده می‌شود.",
    billRequested: "درخواست صورتحساب فرستاده شد",
    staffCallSending: "در حال ارسال…",
    staffCallSent: "درخواست شما ثبت شد؛ همکاران ما در راه هستند.",
    staffCallNeedsTable: "شماره میز را وارد کنید",
    staffCallHint: "شماره میز روی بارکد همان میز نوشته شده است.",
    checkout: "ثبت سفارش",
    tableNumber: "شماره میز",
    tableNumberPlaceholder: "مثلاً ۱۲",
    yourName: "نام شما",
    yourNamePlaceholder: "برای صدا زدن سفارش",
    /** Shown only when the venue has switched phone collection on. */
    yourPhone: "شماره تماس (اختیاری)",
    yourPhonePlaceholder: "۰۹۱۲۱۲۳۴۵۶۷",
    yourPhoneHint:
      "برای پیگیری سفارش و شناختن مشتری‌های همیشگی. وارد نکردنش مشکلی ندارد.",
    orderNote: "توضیحات سفارش",
    orderNotePlaceholder: "مثلاً: بدون پیاز، سس اضافه",
    itemNote: "توضیح این محصول",
    paymentMethod: "روش پرداخت",
    payOnSite: "پرداخت در محل",
    payOnSiteHint: "بعد از صرف غذا در رستوران پرداخت می‌کنید",
    payOnline: "پرداخت آنلاین",
    payOnlineHint: "همین حالا از طریق درگاه بانکی",
    placeOrder: "ثبت نهایی سفارش",
    placingOrder: "در حال ثبت…",
    orderPlaced: "سفارش شما ثبت شد",
    unavailable: "ناموجود",
    /** Heading of the suggestions panel in the cart. */
    recommendationsTitle: "سفارشتان را کامل کنید",
    /**
     * Heading of the pairings block on a product, used when the owner has not
     * written their own line for that dish.
     */
    pairingsFallback: "اینها با آن خوب می‌روند",
    /** Heading of the featured strip at the top of the menu. */
    featuredTitle: "پیشنهاد ویژه",
    /**
     * Why a dish is being suggested — one short line under its name.
     *
     * Every suggestion carries one. A guest reading «اغلب با هم سفارش داده
     * می‌شود» is being told something true and checkable, and an owner can see
     * which of their decisions produced it. Kept to a few words because it sits
     * under a product name on a 320px card.
     *
     * `frequentlyTogether` deliberately states an association and never a
     * cause — the same discipline `sales-insights.ts` follows.
     */
    upsellReasons: {
      pairing: "پیشنهاد رستوران",
      bundle: "با هم ارزان‌تر",
      frequentlyTogether: "اغلب با هم سفارش داده می‌شود",
      featured: "انتخاب ویژه",
    },
    /** What a meal deal saves. `{amount}` is already formatted money. */
    bundleSaving: "{amount} صرفه‌جویی",
    /** Heading above what a meal deal contains. */
    bundleIncludes: "شامل",
    /** Heading of the meal-deal block on a product sheet. */
    bundleOffersTitle: "به‌صرفه‌تر سفارش دهید",
    /**
     * The one-tap size upgrade. `{name}` is the choice, `{amount}` the extra
     * cost as formatted money — never the raw `priceDelta`, which would
     * understate the charge on a ladder that starts below zero.
     */
    upgradePrompt: "{name} + {amount}",
    /** Heading above the upgrade offers on a product sheet. */
    upgradeTitle: "بزرگ‌ترش کنید",
    ingredients: "اطلاعات بیشتر",
    minutes: "دقیقه",
    viewDetails: "جزئیات",
    closed: "این منو در حال حاضر در دسترس نیست",
    orderingDisabled: "سفارش‌گیری آنلاین این مجموعه غیرفعال است",
    requiredFields: "لطفاً نام و شماره میز را وارد کنید",
    emptyCart: "سبد خرید شما خالی است",
    trackOrder: "پیگیری سفارش",
  },
  /**
   * The sheet that appears the moment a dish goes into the basket.
   *
   * Phrased as an offer, not a prompt — «اینها را هم اضافه کنم؟» invites a no
   * as easily as a yes, which is the tone a guest mid-order will accept.
   */
  upsell: {
    title: "چیز دیگری هم اضافه کنم؟",
    subtitle: "معمولاً با این سفارش، این‌ها را هم می‌گیرند.",
    dismiss: "نه، ممنون",
  },
  /** The board's detail view: everything about one order, and who placed it. */
  orderDetail: {
    title: "سفارش",
    open: "مشاهدهٔ جزئیات سفارش",
    items: "اقلام سفارش",
    orderNote: "توضیح مشتری",
    totals: "مبالغ",
    subtotal: "جمع اقلام",
    discount: "تخفیف",
    serviceCharge: "هزینه سرویس",
    tax: "مالیات",
    rounding: "گرد کردن",
    tip: "انعام",
    total: "مبلغ قابل پرداخت",
    timeline: "زمان‌ها",
    placedAt: "ثبت سفارش",
    preparingAt: "شروع آماده‌سازی",
    readyAt: "آماده شد",
    deliveredAt: "تحویل شد",
    paidAt: "پرداخت شد",
    canceledAt: "لغو شد",
    refundedAt: "وجه بازگردانده شد",
    payments: "تراکنش‌ها",
    refId: "کد پیگیری",
    paymentStates: { PENDING: "در انتظار پرداخت", FAILED: "ناموفق" },
    table: "میز",
    manual: "ثبت دستی",
    methodOnline: "پرداخت آنلاین",
    methodCash: "پرداخت در محل",
    customer: "مشتری",
    openCustomer: "مشاهده در بخش مشتریان",
    /* Two different absences, said differently — see `customerMissingReason`. */
    customerNoPhone:
      "این سفارش بدون شماره تماس ثبت شده است، بنابراین پروندهٔ مشتری ندارد.",
    customerNotFound:
      "با این شماره تماس مشتری ثبت‌شده‌ای پیدا نشد. ممکن است پرونده حذف شده باشد.",
  },
  cashClose: {
    title: "بستن صندوق",
    subtitle:
      "جمع‌بندی فروش روز کاری و شمارش پول نقد صندوق. روز کاری طبق ساعت کاری مجموعه حساب می‌شود و سفارش‌های بعد از نیمه‌شب جزو همان شب‌اند.",
    open: "بستن صندوق",
    prevDay: "روز قبل",
    nextDay: "روز بعد",
    today: "امروز",
    orders: "سفارش‌ها",
    sales: "فروش کل",
    cashPaid: "دریافت نقدی",
    onlinePaid: "دریافت آنلاین",
    unpaid: "پرداخت‌نشده",
    canceled: "لغو شده",
    refundsDue: "باید بازپرداخت شود",
    discounts: "تخفیف‌ها",
    tips: "انعام‌ها",
    tax: "مالیات",
    serviceCharge: "هزینهٔ سرویس",
    openingCash: "موجودی اول روز صندوق (تومان)",
    openingHint:
      "پول نقدی که روز کاری را با آن شروع کردید (پول خرد). اگر صندوق را هر شب خالی می‌کنید، صفر بگذارید.",
    expectedCash: "پول نقدی که باید در صندوق باشد",
    counted: "مبلغ شمارش‌شده (تومان)",
    countHint: "پول نقد داخل صندوق را بشمارید و مبلغ را وارد کنید.",
    note: "توضیح (اختیاری)",
    submit: "ثبت بستن صندوق",
    resubmit: "ثبت دوبارهٔ شمارش",
    difference: "اختلاف",
    surplus: "اضافه",
    shortage: "کسری",
    balanced: "بدون اختلاف",
    closedBy: "ثبت‌شده توسط {who} — {when}",
    history: "بستن‌های قبلی",
    historyEmpty: "هنوز صندوقی بسته نشده است.",
    print: "چاپ گزارش",
    saved: "بستن صندوق ثبت شد",
    unpaidHint:
      "{n} سفارش امروز هنوز پرداخت نشده است. پیش از بستن صندوق، آن‌ها را تسویه یا لغو کنید.",
    countLine: "{n} سفارش",
  },
  print: {
    bill: "فاکتور",
    ticket: "فیش آشپزخانه",
    printBill: "چاپ فاکتور",
    printTicket: "چاپ فیش آشپزخانه",
    print: "چاپ",
    order: "سفارش",
    paper80: "کاغذ ۸۰ میلی‌متری",
    paper58: "کاغذ ۵۸ میلی‌متری",
    paid: "پرداخت‌شده",
    unpaid: "پرداخت‌نشده",
    canceled: "لغو شده",
    thanks: "از انتخاب شما سپاسگزاریم",
    takeaway: "بیرون‌بر",
    reprint: "نسخهٔ دوباره",
    autoPrint: "چاپ خودکار فیش سفارش‌های تازه",
    autoPrintHint:
      "روی کامپیوتر آشپزخانه روشن بماند. برای چاپ بدون پنجرهٔ تأیید، کروم را با گزینهٔ ‎--kiosk-printing‎ باز کنید.",
    notFound: "این سفارش پیدا نشد.",
  },
  orderStatus: {
    title: "وضعیت سفارش",
    orderNumber: "شماره سفارش",
    RECEIVED: "ثبت شد",
    PREPARING: "در حال آماده‌سازی",
    READY: "آماده تحویل",
    DELIVERED: "تحویل شد",
    CANCELED: "لغو شد",
    receivedHint: "سفارش شما به آشپزخانه رسید",
    preparingHint: "سفارش شما در حال آماده شدن است",
    readyHint: "سفارش شما آماده است",
    deliveredHint: "نوش جان!",
    canceledHint: "این سفارش لغو شده است",
    liveUpdating: "به‌روزرسانی لحظه‌ای",
    reviewTitle: "سفارش شما چطور بود؟",
    reviewHint: "با انتخاب ستاره امتیاز دهید. نوشتن نظر اختیاری است.",
    reviewThanks: "ممنون از امتیاز شما",
    reviewChangeHint: "هر زمان خواستید می‌توانید امتیاز یا نظرتان را تغییر دهید.",
    reviewCommentLabel: "نظر شما (اختیاری)",
    reviewSave: "ثبت نظر",
    reviewSaving: "در حال ثبت…",
    items: "اقلام سفارش",
    placedAt: "زمان ثبت",
    backToMenu: "بازگشت به منو",
  },
  kitchen: {
    // Titled as the owner's own orders screen — there is no separate kitchen
    // page, this is the one place orders are managed from.
    title: "سفارش‌ها",
    soldOutButton: "تمام شد",
    viewOrders: "سفارش‌ها",
    viewTables: "میزها",
    billRequest: "صورتحساب می‌خواهد",
    tablesEmpty: "میزی با سفارشِ پرداخت‌نشده نیست.",
    tablesHint: "سفارش‌های پرداخت‌نشدهٔ هر میز در ۱۲ ساعت گذشته، با هم.",
    tableOrders: "{n} سفارش",
    tablePrint: "چاپ صورتحساب",
    tableSettle: "تسویه نقدی",
    tableSettleTitle: "تسویهٔ میز {table}؟",
    tableSettleMessage:
      "همهٔ سفارش‌های باز این میز ({total} تومان) پرداخت‌شده به‌صورت نقدی ثبت می‌شوند.",
    tableSettled: "میز {table} تسویه شد",
    awaitingPayment: "در انتظار پرداخت آنلاین",
    soldOutTitle: "غذاهای تمام‌شدهٔ امروز",
    soldOutHint:
      "غذایی را که تمام شده علامت بزنید تا مهمان‌ها تا ساعت ۵ صبح فردا نتوانند سفارشش دهند. فردا خودکار برمی‌گردد.",
    soldOutSearch: "جستجوی غذا…",
    soldOutEmpty: "غذایی پیدا نشد.",
    soldOutMark: "تمام شد",
    soldOutBack: "موجود شد",
    soldOutOwnerOff: "در منو غیرفعال",
    soldOutDone: "«{name}» تا فردا صبح از منو برداشته شد",
    soldOutUndone: "«{name}» دوباره قابل سفارش است",
    subtitle: "سفارش‌های زنده",
    staffCalls: "درخواست مشتری",
    refundsDue: "بازگشت وجه",
    refundsHint:
      "این سفارش‌ها لغو شده‌اند ولی مشتری پول را پرداخت کرده است. وجه را به مشتری بازگردانید و سپس این کارت را حذف کنید.",
    refundDone: "وجه بازگردانده شد",
    refundWait: "دقیقه دیگر",
    refundWaitHint: "یک ساعت پس از لغو سفارش می‌توانید این کارت را حذف کنید",
    newOrders: "جدید",
    preparing: "در حال آماده‌سازی",
    ready: "آماده",
    delivered: "تحویل‌شده",
    table: "میز",
    noNote: "بدون توضیح",
    markPreparing: "شروع آماده‌سازی",
    markReady: "آماده شد",
    markDelivered: "تحویل شد",
    cancelOrder: "لغو سفارش",
    cancelConfirm: "این سفارش لغو شود؟",
    soundOn: "صدای اعلان روشن",
    soundOff: "صدای اعلان خاموش",
    connected: "متصل",
    disconnected: "قطع — تلاش برای اتصال",
    ago: "پیش",
    justNow: "همین الان",
    paid: "پرداخت‌شده",
    unpaid: "پرداخت نشده",
    markPaidHint: "برای ثبت پرداخت نقدی کلیک کنید",
    markUnpaidHint: "برای برگرداندن به پرداخت‌نشده کلیک کنید",
    /**
     * The board only reports a tip the guest chose at checkout; staff cannot
     * enter one, so the old add/edit copy is gone with the control.
     */
    tipLabel: "انعام مهمان",
  },
  /**
   * Data export.
   *
   * Column headers carry the *unit* — «درآمد (تومان)» — because the cell itself
   * must stay a bare number for the spreadsheet to add it up. The header is the
   * only place a unit can live without breaking arithmetic.
   */
  exports: {
    action: "خروجی اکسل",
    /** Stored codes, as they read inside an exported file. */
    values: {
      paymentMethod: {
        CASH_ON_SITE: "پرداخت در محل",
        ONLINE: "پرداخت آنلاین",
      },
      paymentStatus: {
        PENDING: "در انتظار پرداخت",
        PAID: "پرداخت‌شده",
        FAILED: "ناموفق",
        REFUNDED: "بازگشت داده‌شده",
      },
    },
    downloading: "در حال آماده‌سازی…",
    /** Shown when the chosen period produced no rows at all. */
    empty: "در این بازه اطلاعاتی برای خروجی وجود ندارد.",
    failed: "تهیهٔ خروجی ممکن نشد.",
    forbidden: "شما اجازهٔ دریافت این خروجی را ندارید.",
    /** The owner is downloading too often; the platform's rate limiter said no. */
    tooMany: "درخواست‌های زیادی ارسال شده است. کمی بعد دوباره تلاش کنید.",
    datasets: {
      sales: "فروش روزانه",
      orders: "سفارش‌ها",
      "order-items": "اقلام سفارش",
      products: "عملکرد محصولات",
      categories: "دسته‌بندی‌ها",
      customers: "مشتریان",
      inventory: "موجودی انبار",
      purchases: "خریدهای انبار",
      pnl: "سود و زیان",
      tables: "عملکرد میزها",
    },
    columns: {
      date: "تاریخ",
      time: "ساعت",
      orderNumber: "شماره سفارش",
      branch: "شعبه",
      table: "میز",
      status: "وضعیت",
      paymentMethod: "روش پرداخت",
      paymentStatus: "وضعیت پرداخت",
      product: "محصول",
      category: "دسته‌بندی",
      options: "انتخاب‌ها",
      note: "توضیح",
      quantity: "تعداد",
      orders: "تعداد سفارش",
      unitPrice: "قیمت واحد (تومان)",
      unitCost: "بهای واحد (تومان)",
      lineTotal: "جمع ردیف (تومان)",
      subtotal: "جمع جزء (تومان)",
      discount: "تخفیف (تومان)",
      serviceCharge: "هزینه سرویس (تومان)",
      tax: "مالیات (تومان)",
      tip: "انعام (تومان)",
      total: "مبلغ کل (تومان)",
      revenue: "درآمد (تومان)",
      cost: "بهای تمام‌شده (تومان)",
      grossProfit: "سود ناخالص (تومان)",
      margin: "حاشیه سود",
      revenueShare: "سهم از درآمد",
      averageOrderValue: "میانگین هر سفارش (تومان)",
      standing: "وضعیت محصول",
      amount: "مبلغ (تومان)",
      item: "عنوان",
      /** Inventory. */
      unit: "واحد",
      inStock: "موجودی",
      lowStockAt: "حد هشدار",
      isLow: "کمبود موجودی",
      stockValue: "ارزش موجودی (تومان)",
      supplier: "تأمین‌کننده",
      invoiceNumber: "شماره فاکتور",
      paid: "پرداخت شده",
      active: "فعال",
      /** Customers. */
      customerName: "نام مشتری",
      phone: "شماره تماس",
      firstOrder: "اولین سفارش",
      lastOrder: "آخرین سفارش",
      daysSinceLastOrder: "روز از آخرین سفارش",
      totalSpend: "مجموع خرید (تومان)",
      typicalInterval: "فاصله معمول سفارش (روز)",
      segment: "وضعیت مشتری",
      valueTier: "ارزش مشتری",
      marketingConsent: "رضایت دریافت پیام",
      /*
        Tables. The visit column says «بازدید منو» and not «اسکن», the same
        distinction the screen draws: the platform knows the page was opened
        through this table's code, not that a camera was pointed at a sticker.
      */
      tableLabel: "نام میز",
      menuVisits: "بازدید منو",
      ordersPerVisit: "سفارش به ازای هر بازدید",
      tableActivity: "فعالیت میز",
    },
  },

  analytics: {
    title: "گزارش فروش",
    subtitle: "عملکرد فروش رستوران شما",

    /** Per-dish realised economics — what each product actually earns. */
    productPerformance: "عملکرد محصولات",
    productPerformanceEmpty:
      "هنوز فروش کافی برای تحلیل عملکرد محصولات در این بازه ثبت نشده است.",
    /** The bar each row is judged against — the median dish, not the weighted mean. */
    typicalProductMargin: "حاشیه سود معمول محصولات",
    product: "محصول",
    /* `grossProfit` already exists further down this block — reused, not redefined. */
    margin: "حاشیه سود",
    /**
     * Where a dish sits on the volume/margin grid.
     *
     * Each names what is interesting about the dish, never what to do with it —
     * «بازبینی قیمت» says the price is worth a look, not that it is wrong.
     */
    quadrants: {
      star: "پرفروش و پرسود",
      reviewPricing: "بازبینی قیمت",
      promote: "فرصت معرفی",
      review: "عادی",
      unknown: "بدون بهای تمام‌شده",
      insufficient: "داده کافی نیست",
    },
    range7: "۷ روز اخیر",
    range30: "۳۰ روز اخیر",
    range90: "۹۰ روز اخیر",
    revenue: "درآمد",
    orders: "تعداد سفارش",
    avgOrderValue: "میانگین ارزش سفارش",
    grossProfit: "سود ناخالص",
    salesTrend: "روند فروش",
    /** Accessible name for the trend chart's SVG. */
    salesTrendChart: "نمودار روند فروش",
    topProducts: "پرفروش‌ترین محصولات",
    categoryBreakdown: "سهم دسته‌بندی‌ها",
    hourlyDistribution: "ساعت‌های پرترافیک",
    kitchenSpeed: "سرعت آشپزخانه",
    kitchenSpeedHint: "از ثبت سفارش تا «آماده شد».",
    prepMedian: "زمان معمول",
    prepP90: "۹ از ۱۰ سفارش تا",
    prepWithinTarget: "آماده در {minutes} دقیقه",
    prepMeasured: "سفارش‌های سنجیده‌شده",
    prepSkipped:
      "{count} سفارش که بیش از ۳ ساعت بعد «آماده» زده شده‌اند حساب نشدند؛ احتمالاً دیر بسته شده‌اند.",
    prepByHour: "زمان معمول آماده‌سازی در هر ساعت (دقیقه)",
    prepByService: "سالن: {dineIn} — بیرون‌بر: {takeaway}",
    prepNone:
      "هنوز سفارشی «آماده» زده نشده است. وقتی آشپزخانه سفارش‌ها را در صفحهٔ سفارش‌ها جلو ببرد، این بخش پر می‌شود.",
    minutes: "دقیقه",
    noData: "برای این بازه داده‌ای وجود ندارد",
    units: "عدد",
    vsPrevious: "نسبت به دوره قبل",
  },
  finance: {
    title: "مدیریت مالی",
    /**
     * Said under the category field. The category used to be called «مواد
     * اولیه», which invited owners to record ingredient purchases here — and
     * those are already in the cost of each dish sold, so they came off the
     * profit twice.
     */
    expenseCategoryHint:
      "خرید مواد اولیهٔ غذاها را اینجا ثبت نکنید؛ بهای آن‌ها در «بهای تمام‌شده» هر غذا حساب می‌شود.",
    subtitle: "درآمد، هزینه و سود خالص",
    totalRevenue: "کل درآمد",
    totalCost: "بهای تمام‌شده",
    grossProfit: "سود ناخالص",
    totalExpenses: "کل هزینه‌ها",
    wasteLine: "ضایعات انبار",
    shortageLine: "کسری انبارگردانی",
    surplusLine: "مازاد انبارگردانی",
    foodCost: "سهم بهای مواد از فروش",
    stockLosses: "ضایعات و کسری انبار",
    netProfit: "سود خالص",
    netLoss: "زیان",
    margin: "حاشیه سود",
    addExpense: "ثبت هزینه",
    editExpense: "ویرایش هزینه",
    expenseTitle: "عنوان",
    expenseAmount: "مبلغ",
    expenseCategory: "نوع هزینه",
    expenseDate: "تاریخ",
    expenseNote: "توضیح",
    recurring: "هزینه ثابت ماهانه",
    noExpenses: "هزینه‌ای ثبت نشده است",
    productProfit: "سود محصولات",
    productProfitHint:
      "برای محاسبه دقیق، بهای تمام‌شده هر محصول را در بخش منو وارد کنید.",
    unitProfit: "سود هر واحد (قیمت فعلی)",
    sold: "فروش‌رفته",
    profitContribution: "سود واقعی فروش",
    realisedPerUnit: "{amount} در هر واحدِ فروخته‌شده",
    missingCost: "بهای تمام‌شده وارد نشده",
    categories: {
      rent: "اجاره",
      salary: "حقوق پرسنل",
      utilities: "قبوض",
      supplies: "ملزومات مصرفی",
      marketing: "تبلیغات",
      other: "سایر",
    },
  },
  report: {
    title: "گزارش مالی",
    generate: "ساخت گزارش مالی",
    subtitle: "گزارش حرفه‌ای از داده‌های همین سامانه بسازید و چاپ یا ذخیره کنید",
    period: "دوره گزارش",
    presetMonth: "ماهانه",
    presetQuarter: "سه‌ماهه",
    presetCustom: "بازه دلخواه",
    from: "از تاریخ",
    to: "تا تاریخ",
    month: "ماه",
    year: "سال",
    preview: "پیش‌نمایش اعداد",
    previewing: "در حال محاسبه…",
    openReport: "باز کردن گزارش",
    print: "چاپ / ذخیره PDF",
    generatedAt: "تاریخ تولید گزارش",
    reportingPeriod: "دوره گزارش",
    days: "روز",
    coverTitle: "گزارش مالی",
    sectionSummary: "خلاصه مالی",
    sectionSales: "گزارش فروش",
    sectionProducts: "فروش محصولات",
    sectionCategories: "گزارش دسته‌بندی‌ها",
    sectionExpenses: "گزارش هزینه‌ها",
    sectionProfitLoss: "سود و زیان",
    sectionPeriodic: "تحلیل دوره‌ای",
    sectionCharts: "نمودارها",
    sectionManagement: "خلاصه مدیریتی",

    startMonth: "ماه شروع",
    startMonthHint: "گزارش از این ماه و دو ماه بعد از آن محاسبه می‌شود",

    /* توضیح‌های ثابت هر بخش — قالب یکسان برای همه رستوران‌ها و همه دوره‌ها. */
    explainSummary:
      "این بخش ارقام کلیدی دوره را نشان می‌دهد. درآمد بدون مالیات بر ارزش افزوده و بدون انعام محاسبه شده است؛ مالیات به نمایندگی از دولت دریافت می‌شود و انعام متعلق به کارکنان است، بنابراین احتساب آن‌ها درآمد را بیشتر از واقع نشان می‌دهد. بهای تمام‌شده، هزینه خرید کالاهای فروخته‌شده است. سود ناخالص یعنی درآمد منهای بهای تمام‌شده، پیش از کسر هزینه‌های عملیاتی. سود خالص، هزینه‌های ثبت‌شده در دوره را نیز کسر می‌کند. سفارش‌های لغوشده در هیچ بخشی محاسبه نشده‌اند.",
    explainInsights:
      "ارقام زیر مرحله‌به‌مرحله محاسبه شده‌اند تا هر عدد تا ورودی‌هایش قابل پیگیری باشد، و پس از آن مشاهدات مکتوب درباره معنای این ارقام آمده است. این مشاهدات تنها از نسبت‌های همین گزارش به دست آمده‌اند و عوامل بیرون از سامانه — مانند فصل، رویدادهای محلی یا تغییر قیمت‌های برنامه‌ریزی‌شده — در آن‌ها لحاظ نشده است.",
    explainSales:
      "فروش بر اساس تاریخ ثبت هر سفارش، به تفکیک روز نمایش داده شده است. همه سفارش‌های لغونشده — صرف‌نظر از اینکه پرداخت شده باشند یا نه — در این ارقام آمده‌اند.",
    explainProducts:
      "محصولات بر اساس درآمدی که ایجاد کرده‌اند مرتب شده‌اند. «تعداد» یعنی شمار واحدهای فروخته‌شده و «سهم» یعنی درصد آن محصول از کل درآمد دوره. سود بر پایه بهای تمام‌شده‌ای محاسبه می‌شود که در لحظه فروش ثبت شده است؛ بنابراین تغییر بعدی قیمت یا بهای یک محصول، سفارش‌های گذشته را تغییر نمی‌دهد.",
    explainCategories:
      "همان فروش، این بار به تفکیک دسته‌بندی منو. این بخش نشان می‌دهد کدام بخش‌های منو بار اصلی کسب‌وکار را بر دوش دارند و معمولاً بهترین راهنما برای تصمیم‌گیری درباره فضای منو و زمان آماده‌سازی است.",
    explainExpenses:
      "هزینه‌های عملیاتی ثبت‌شده در این دوره: اجاره، حقوق، قبض‌ها، ملزومات و موارد مشابه. این هزینه‌ها از بهای تمام‌شده جدا هستند و پس از سود ناخالص کسر می‌شوند. هزینه‌ها در تاریخی که ثبت شده‌اند نمایش داده می‌شوند، بنابراین هزینه‌ای که با تأخیر وارد شود در دوره ثبت خود دیده می‌شود.",
    explainProfitLoss:
      "صورت سود و زیان به شکل متعارف. از بالا به پایین: درآمد، منهای بهای تمام‌شده، سود ناخالص را می‌دهد؛ و پس از کسر هزینه‌های عملیاتی، سود خالص به دست می‌آید. حاشیه سود یعنی نسبت سود خالص به درآمد. عدد منفی به‌صورت زیان نمایش داده می‌شود.",
    explainPeriodic:
      "دوره به بازه‌های کوچک‌تر تقسیم شده تا روند تغییرات دیده شود، نه اینکه از یک عدد کل حدس زده شود. در دوره‌های کوتاه، یا دوره‌ای که یک روز غیرعادی در آن باشد، نوسان بیشتری دیده می‌شود و باید با همین ملاحظه خوانده شود.",
    explainCharts:
      "همان داده‌ها به شکل تصویری. نمودارها رقم تازه‌ای اضافه نمی‌کنند و تنها برای آن آورده شده‌اند که روندها و نسبت‌ها در یک نگاه خوانده شوند.",
    explainManagement:
      "جمع‌بندی عملکرد دوره همراه با نکات نیازمند توجه. این بخش نقطه شروعی برای تصمیم‌گیری است و مشاوره مالی، مالیاتی یا سرمایه‌گذاری محسوب نمی‌شود؛ پیش از استناد بیرونی، ارقام را با دفاتر حسابداری خود مطابقت دهید.",
    product: "محصول",
    quantity: "تعداد",
    revenueCol: "درآمد",
    shareCol: "سهم",
    profitCol: "سود",
    expenseTitle: "عنوان",
    expenseType: "نوع",
    expenseAmount: "مبلغ",
    expenseDate: "تاریخ",
    totalsByCategory: "جمع به تفکیک نوع",
    month_: "ماه",
    netProfitCol: "سود خالص",
    bestDay: "پرفروش‌ترین روز",
    worstDay: "کم‌فروش‌ترین روز",
    bestProduct: "پرفروش‌ترین محصول",
    biggestExpense: "بیشترین هزینه",
    revenueTrend: "روند درآمد",
    noData: "برای این بازه داده‌ای ثبت نشده است",
    noDataHint: "بازه دیگری انتخاب کنید یا ابتدا سفارش و هزینه ثبت کنید.",
    revenueTrendChart: "روند درآمد",
    profitTrendChart: "روند سود خالص",
    categoryChart: "فروش بر اساس دسته‌بندی",
    topProductsChart: "پرفروش‌ترین محصولات",
    page: "صفحه",

    sectionInsights: "تحلیل و پیشنهادها",

    metricsTitle: "شاخص‌های کلیدی این دوره",
    metricsHint:
      "این اعداد از همان ارقام بالا به دست آمده‌اند و مبنای پیشنهادهای زیر هستند.",
    metricOrdersPerDay: "میانگین سفارش در روز",
    metricProfitPerOrder: "سود خالص هر سفارش",
    metricGrossMargin: "حاشیه سود ناخالص",
    metricGrossMarginHint: "سهم سود از فروش، پیش از کسر هزینه‌های جاری",
    metricNetMargin: "حاشیه سود خالص",
    metricNetMarginHint: "سهم سود از فروش، پس از کسر همهٔ هزینه‌ها",
    metricFoodCost: "نسبت بهای مواد اولیه",
    metricFoodCostHint:
      "بهای تمام‌شده تقسیم بر فروش؛ در رستوران‌ها معمولاً ۳۰ تا ۳۵ درصد",
    metricExpenseRatio: "نسبت هزینه‌های جاری",
    metricExpenseRatioHint: "اجاره، حقوق و سایر هزینه‌ها تقسیم بر فروش",
    metricBreakEven: "نقطهٔ سربه‌سر",
    metricBreakEvenHint:
      "با همین حاشیه سود، تا این مبلغ فروش تازه هزینه‌های جاری پوشش داده می‌شود",
    metricBreakEvenOrders: "معادل تعداد سفارش",

    /**
     * Plain-language lead-ins printed above each chart. Any accounting term is
     * glossed on the spot — the reader is a restaurant owner, not an accountant.
     */
    explainSalesTrend:
      "این نمودار درآمد روزانهٔ شما را در طول دوره نشان می‌دهد. هر نقطه مجموع فروش یک روز است، و بالا و پایین شدن آن نشان می‌دهد کدام روزها شلوغ و کدام روزها خلوت بوده‌اند.",
    explainProfitTrend:
      "این نمودار سود خالص را به تفکیک ماه نشان می‌دهد. سود خالص یعنی آنچه در نهایت برای شما باقی می‌ماند: درآمد فروش، منهای بهای تمام‌شده (هزینهٔ مواد اولیهٔ همان غذاهایی که فروخته شده) و منهای هزینه‌های جاری مثل اجاره و حقوق.",
    explainCategoryChart:
      "این نمودار سهم هر دسته‌بندی از درآمد دوره را مقایسه می‌کند. عدد بزرگ‌تر یعنی آن دسته پول بیشتری وارد کرده است، و عدد کنار آن تعداد اقلام فروخته‌شده را نشان می‌دهد.",
    explainTopProductsChart:
      "این نمودار پرفروش‌ترین محصولات را بر اساس درآمد مرتب می‌کند. دقت کنید محصولی که بیشترین تعداد را فروخته، لزوماً سودآورترین محصول نیست؛ ستون سود در جدول فروش محصولات این تفاوت را نشان می‌دهد.",

    /**
     * Sentences composed into the recommendation paragraph. Each is written to
     * stand on its own and to read as advice, never as a calculation.
     */
    advice: {
      demandGrowing:
        "تعداد سفارش‌ها در نیمهٔ دوم این دوره نسبت به نیمهٔ اول بیشتر شده و روند مشتری‌ها رو به رشد است.",
      demandSteady:
        "تعداد سفارش‌ها در طول دوره تقریباً ثابت مانده و نوسان معناداری نداشته است.",
      demandFalling:
        "تعداد سفارش‌ها در نیمهٔ دوم دوره کاهش داشته است؛ برای برگرداندن مشتری‌ها یک کمپین تشویقی یا پیشنهاد ویژه روی اقلام پرطرفدار می‌تواند کمک کند.",
      pricingHeadroom:
        "استقبال مشتری‌ها حفظ شده اما سود به همان نسبت رشد نکرده است، پس جای یک افزایش ملایم قیمت وجود دارد؛ کم‌ریسک‌ترین راه، افزایش پلکانی و محدود به چند قلم پرفروش است تا واکنش مشتری سنجیده شود.",
      pricingReviewCosts:
        "چون هم‌زمان با کم شدن مشتری سود هم پایین است، افزایش قیمت توصیه نمی‌شود؛ بهتر است ابتدا بهای تمام‌شدهٔ اقلام و هزینه‌های جاری بازبینی شود.",
      pricingHold:
        "میانگین مبلغ هر سفارش با حجم فروش فعلی متناسب است و در این دوره نیازی به تغییر قیمت دیده نمی‌شود.",
      profitStrong:
        "سود خالص نسبت به حجم فروش در وضعیت خوبی است؛ همین ترکیب قیمت‌گذاری و کنترل هزینه را حفظ کنید.",
      profitHealthy:
        "سود خالص در محدودهٔ سالم قرار دارد، هرچند هنوز فضای بهبود وجود دارد.",
      profitThin:
        "سود خالص نسبت به این حجم فروش کم است؛ با این تعداد سفارش انتظار سود بیشتری می‌رود و بازبینی قیمت یا بهای تمام‌شده لازم است.",
      profitLoss:
        "در این دوره مجموع هزینه‌ها از درآمد بیشتر شده و کسب‌وکار زیان‌ده بوده است؛ این وضعیت نیاز به اقدام فوری روی قیمت‌ها و هزینه‌های اصلی دارد.",
      expenseHeavy:
        "سهم هزینه‌های جاری از درآمد بالاست؛ مرور بزرگ‌ترین اقلام هزینه معمولاً سریع‌ترین راه برای بهبود سود است.",
    },
  },
  qr: {
    title: "بارکد میزها",
    subtitle: "برای هر میز یک بارکد اختصاصی بسازید و چاپ کنید",
    addTable: "افزودن میز",
    tableNumber: "شماره میز",
    tableLabel: "برچسب",
    tableLabelHint: "مثلاً «تراس» یا «طبقه دوم»",
    seats: "تعداد صندلی",
    generalQr: "بارکد عمومی منو",
    generalQrHint: "بدون شماره میز؛ مناسب ویترین و شبکه‌های اجتماعی",
    downloadPng: "دانلود PNG",
    downloadSvg: "دانلود SVG",
    printAll: "چاپ همه بارکدها",
    printSheet: "برگه چاپ",
    scanHint: "برای دیدن منو اسکن کنید",
    noTables: "هنوز میزی تعریف نشده است",
    deleteTableConfirm: "این میز حذف شود؟",
    menuUrl: "آدرس منوی شما",
    localUrlWarning: "این بارکدها فقط روی همین رایانه کار می‌کنند — هنوز چاپ نکنید.",
    localUrlHint:
      "آدرس سایت هنوز روی localhost تنظیم است و همین آدرس داخل بارکد ذخیره می‌شود. پس از انتشار سایت روی دامنه اصلی، NEXT_PUBLIC_APP_URL را تنظیم کنید و بارکدها را دوباره بسازید؛ بارکد چاپ‌شده بعداً قابل اصلاح نیست.",
  },
  settings: {
    title: "تنظیمات",
    restaurantInfo: "اطلاعات رستوران",
    restaurantName: "نام رستوران",
    restaurantNameEn: "نام انگلیسی",
    tagline: "شعار",
    description: "درباره ما",
    logo: "لوگو",
    cover: "تصویر کاور",
    phone: "تلفن",
    phoneSecondary: "تلفن دوم",
    address: "آدرس",
    instagram: "اینستاگرام",
    socialLinks: "شبکه‌های اجتماعی",
    socialLinksHint:
      "تا سه مورد می‌توانید اضافه کنید. این‌ها به‌صورت آیکون در پایین منو نمایش داده می‌شوند. می‌توانید آدرس کامل یا فقط نام کاربری را وارد کنید.",
    addSocialLink: "افزودن شبکه اجتماعی",
    slug: "آدرس منو",
    slugLocked: "برای تغییر آدرس با پشتیبانی تماس بگیرید",
    ordering: "سفارش‌گیری",
    enableOrdering: "سفارش‌گیری آنلاین فعال باشد",
    enableOnlinePayment: "پرداخت آنلاین فعال باشد",
    onlinePaymentOff: "پرداخت آنلاین — فعلاً غیرفعال",
    onlinePaymentOffHint:
      "پرداخت آنلاین در کل سامانه غیرفعال است تا زمانی که درگاه پرداخت وصل شود. مشتریان فعلاً فقط می‌توانند در محل پرداخت کنند.",
    showPrices: "نمایش قیمت‌ها در منو",
    published: "منو منتشر شود",
    defaultLocale: "زبان پیش‌فرض منو",
    account: "حساب کاربری",
    changePhone: "تغییر شمارهٔ موبایل",
    changePhoneHint:
      "کد تأیید به شمارهٔ جدید پیامک می‌شود و تا آن را وارد نکنید، شماره تغییر نمی‌کند.",
    currentPhone: "شمارهٔ فعلی",
    newPhone: "شمارهٔ جدید",
    phoneChanged: "شمارهٔ موبایل تغییر کرد",
    team: "کاربران",
    addStaff: "افزودن کاربر آشپزخانه",
    staffHint: "کاربران آشپزخانه فقط به صفحه سفارش‌ها دسترسی دارند",
  },
  subscription: {
    title: "اشتراک",
    subtitle: "وضعیت اشتراک و صورتحساب",
    currentPlan: "پلن فعلی",
    status: "وضعیت",
    renewsOn: "تمدید در",
    expiresOn: "پایان اعتبار",
    daysLeft: "روز باقی‌مانده",
    upgrade: "ارتقای پلن",
    renew: "تمدید اشتراک",
    changePlan: "تغییر پلن",
    monthly: "ماهانه",
    yearly: "سالانه",
    yearlyDiscount: "۲ ماه رایگان",
    perMonth: "ماهانه",
    perYear: "سالانه",
    choosePlan: "انتخاب پلن",
    currentBadge: "پلن فعلی",
    popular: "پیشنهاد ما",
    expiredWarning: "اشتراک شما به پایان رسیده و منوی عمومی غیرفعال شده است.",
    expiringWarning: "اشتراک شما به‌زودی تمام می‌شود.",
    trialBadge: "دوره آزمایشی",
    paymentHistory: "تاریخچه پرداخت",
    noPayments: "پرداختی ثبت نشده است",
    limitProducts: "محصول",
    limitCategories: "دسته‌بندی",
    limitTables: "میز",
    limitDailyViews: "بازدید منو در روز",
    menuViews: "بازدید منو",
    viewsToday: "بازدید امروز",
    noViewsYet: "هنوز بازدیدی ثبت نشده است.",
    viewsHint:
      "هر بار باز شدن صفحهٔ منو شمرده می‌شود (نه بازدیدکنندهٔ یکتا). این عدد فعلاً فقط ثبت می‌شود و سقف پلن اعمال نمی‌شود.",
    /** Prefix for a quoted tier: the listed figure is a floor, not the price. */
    priceFrom: "شروع از",
    contractNote:
      "قیمت پایه برای دو شعبه است و با تعداد شعبه‌ها بالاتر می‌رود؛ رقم نهایی را با پشتیبانی تعیین می‌کنید.",
    unlimitedBranches: "شعبه نامحدود",
    /** Per-tier feature bullets. */
    includesPrevious: "همه‌ی امکانات پلن قبلی",
    unlimitedMenu: "محصول و دسته‌بندی نامحدود",
    bilingualMenu: "منوی دوزبانه، فارسی و انگلیسی",
    bulkPricing: "تغییر گروهی قیمت‌ها با یک کلیک",
    staffAccounts: "حساب جداگانه برای آشپزخانه و کارکنان",
    prioritySupport: "پشتیبانی اولویت‌دار",
    customDomain: "دامنه اختصاصی",
    branchAccounts: "حساب و پنل جدا برای هر شعبه",
    sharedMenu: "یک منو برای همه‌ی شعبه‌ها",
    perBranchRevenue: "گزارش فروش تفکیک‌شده‌ی هر شعبه",
    unlimited: "نامحدود",
    statusTRIALING: "دوره آزمایشی",
    statusACTIVE: "فعال",
    statusPAST_DUE: "معوق",
    statusCANCELED: "لغو شده",
    statusEXPIRED: "منقضی",
  },
  payment: {
    redirecting: "در حال انتقال به درگاه بانکی…",
    success: "پرداخت با موفقیت انجام شد",
    failed: "پرداخت ناموفق بود",
    canceled: "پرداخت لغو شد",
    refId: "کد پیگیری",
    amount: "مبلغ",
    tryAgain: "تلاش دوباره",
    backToOrder: "مشاهده سفارش",
    verifying: "در حال بررسی پرداخت…",
  },
  admin: {
    title: "مدیریت پلتفرم",
    siteContent: "محتوای سایت",
    siteSettings: "تنظیمات سایت",
    auditLog: "گزارش تغییرات",
    errorLog: "خطاها",
    errorLogHint:
      "خطاهای سرور و مرورگر مهمانان، گروه‌بندی‌شده. اطلاعات شخصی و توکن‌ها پیش از ذخیره حذف می‌شوند. موارد بیش از ۳۰ روز پاک می‌شوند.",
    errorOpen: "باز",
    errorResolved: "رفع‌شده",
    errorAll: "همه",
    errorResolve: "رفع شد",
    errorReopen: "باز کن",
    errorCount: "{count} بار",
    errorFirstSeen: "اولین بار",
    errorLastSeen: "آخرین بار",
    errorServer: "سرور",
    errorClient: "مرورگر",
    errorNone: "خطایی ثبت نشده است.",
    errorStack: "جزئیات فنی",
    restaurants: "رستوران‌ها",
    users: "کاربران",
    plans: "پلن‌ها",
    revenue: "درآمد پلتفرم",
    totalRestaurants: "کل رستوران‌ها",
    activeSubscriptions: "اشتراک فعال",
    totalOrders: "کل سفارش‌ها",
    mrr: "درآمد ماهانه",
    owner: "مالک",
    plan: "پلن",
    products: "محصولات",
    joinedAt: "تاریخ عضویت",
    toggleActive: "فعال/غیرفعال",
    impersonateHint: "برای پشتیبانی، منوی عمومی رستوران را باز کنید",
    overview: "نمای کلی",
    activeRestaurants: "رستوران‌های فعال",
    expiringSoon: "در آستانه انقضا",
    support: "پشتیبانی",
    supportInboxEmpty: "تیکتی ثبت نشده است",
    smsQueue: "پیامک‌ها",
    supportReplyPlaceholder: "پاسخ خود را بنویسید…",
    supportSendReply: "ثبت پاسخ",
    supportClose: "بستن تیکت",
    settings: "تنظیمات",
    backupTitle: "پشتیبان‌گیری خودکار",
    backupHint:
      "هر ۱۲ ساعت از داده‌های مشتریان (پایگاه داده و تصاویر) یک نسخه پشتیبان ساخته و به این نشانی ایمیل می‌شود.",
    backupEmail: "ایمیل دریافت پشتیبان",
    backupEmailHint: "خالی بگذارید تا ارسال ایمیل غیرفعال شود",
    backupSaved: "نشانی ذخیره شد",
    backupLastRun: "آخرین اجرا",
    backupNeverRun: "هنوز اجرا نشده است",
    backupStatusOk: "موفق",
    backupStatusFailed: "ناموفق",
    backupStatusNotConfigured: "نشانی ایمیل تنظیم نشده",
    backupStatusTooLarge: "حجم فایل بیش از حد مجاز",
    newAccount: "ساخت حساب مشتری",
    newAccountHint:
      "تا زمانی که درگاه پرداخت وصل نشده، حساب مشتری را از اینجا بسازید: شمارهٔ موبایل مالک و مدت اشتراک را وارد کنید. مالک با همان شماره و رمز عبور وارد می‌شود.",
    accountCreated: "حساب ساخته شد",
    ownerPhoneHint: "مالک با همین شماره و رمز عبور وارد می‌شود.",
    durationDays: "مدت اشتراک (روز)",
    monthlyRevenue: "درآمد این ماه",
    totalPlatformRevenue: "کل درآمد پلتفرم",
    search: "جستجوی نام، مالک یا ایمیل",
    filterStatus: "وضعیت اشتراک",
    filterPlan: "پلن",
    sortBy: "مرتب‌سازی",
    sortName: "نام",
    sortCreatedAt: "تاریخ عضویت",
    sortExpiresAt: "تاریخ انقضا",
    sortRevenue: "درآمد",
    sortStatus: "وضعیت",
    allStatuses: "همه وضعیت‌ها",
    allPlans: "همه پلن‌ها",
    noResults: "رستورانی با این مشخصات پیدا نشد",
    expiresAt: "انقضا",
    daysRemaining: "روز باقی‌مانده",
    expired: "منقضی شده",
    platformRevenueCol: "درآمد پلتفرم",
    restaurantDetails: "جزئیات رستوران",
    accountInfo: "اطلاعات حساب",
    subscriptionDetails: "اشتراک",
    subscriptionHistory: "تاریخچه تمدید",
    paymentHistory: "تاریخچه پرداخت",
    ownRevenue: "فروش رستوران",
    orderCount: "تعداد سفارش",
    backToList: "بازگشت به فهرست",
    extendSubscription: "تمدید اشتراک",
    extensionDays: "مدت (روز)",
    extensionType: "نوع تمدید",
    extensionManual: "دستی (پرداخت‌شده)",
    extensionGift: "هدیه (رایگان)",
    extensionReason: "دلیل",
    extensionReasonHint: "برای پیگیری و حسابرسی ثبت می‌شود",
    extend: "اعمال تمدید",
    extending: "در حال اعمال…",
    extended: "اشتراک تمدید شد",
    noExtensions: "تمدید دستی ثبت نشده است",
    previousExpiration: "انقضای قبلی",
    newExpiration: "انقضای جدید",
    performedBy: "توسط",
    giftBadge: "هدیه",
    manualBadge: "دستی",
    revenueTitle: "درآمد پلتفرم",
    lastThreeMonths: "سه ماه اخیر",
    thisYear: "امسال",
    payingRestaurants: "رستوران‌های پرداخت‌کننده",
    avgRevenuePerRestaurant: "میانگین درآمد هر رستوران",
    expiredSubscriptions: "اشتراک‌های منقضی",
    revenueOverTime: "روند درآمد",
    expiringTitle: "اشتراک‌های در آستانه انقضا",
    noExpiring: "اشتراکی در آستانه انقضا نیست",
    demoBadge: "نمونه",
  },
  errors: {
    notFound: "صفحه پیدا نشد",
    notFoundHint: "آدرسی که وارد کرده‌اید وجود ندارد.",
    restaurantNotFound: "رستوران پیدا نشد",
    restaurantNotFoundHint: "این آدرس منو معتبر نیست یا غیرفعال شده است.",
    /** {name} is the venue's own name. */
    menuPaused: "منوی «{name}» موقتاً در دسترس نیست",
    menuPausedHint:
      "لطفاً سفارش خود را از کارکنان مجموعه بپرسید. به‌زودی دوباره در خدمت شما هستیم.",
    serverError: "خطای سرور",
    serverErrorHint: "مشکلی پیش آمد. لطفاً دوباره تلاش کنید.",
    unauthorized: "دسترسی ندارید",
    goHome: "بازگشت به صفحه اصلی",
    limitReached: "به سقف پلن فعلی رسیده‌اید",
    limitReachedHint: "برای افزودن بیشتر، پلن خود را ارتقا دهید.",
    /**
     * API routes answer with a stable `code`; the client renders the text.
     * That keeps server responses locale-independent, so the same endpoint
     * serves a Persian and an English user correctly.
     */
    fixErrors: "لطفاً موارد مشخص‌شده را اصلاح کنید",
    required: "این فیلد الزامی است",
    network: "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.",
    badResponse: "پاسخ نامعتبر از سرور",
    codes: {
      LOGIN_FAILED: "شماره موبایل یا رمز عبور درست نیست",
      LOGIN_LOCKED: "به دلیل چند تلاش ناموفق، ورود با این شماره چند دقیقه متوقف شد",
      // Order errors a guest can meet. "{name}" is the dish or choice.
      ITEM_NOT_FOUND: "یکی از غذاهای سبد دیگر در منو نیست. سبد را بررسی کنید.",
      ITEM_UNAVAILABLE: "«{name}» الان موجود نیست. آن را از سبد بردارید.",
      ITEM_SOLD_OUT: "«{name}» امروز تمام شده است. آن را از سبد بردارید.",
      ITEM_NOT_SCHEDULED: "«{name}» در این ساعت سرو نمی‌شود.",
      OPTIONS_NOT_ALLOWED: "این غذا گزینهٔ انتخابی ندارد. دوباره به سبد اضافه‌اش کنید.",
      OPTION_REQUIRED: "برای «{name}» یک گزینه را انتخاب کنید.",
      OPTION_LIMIT_EXCEEDED: "برای «{name}» گزینه‌های بیش از حد انتخاب شده است.",
      OPTION_UNAVAILABLE: "گزینهٔ «{name}» الان موجود نیست.",
      OPTION_NOT_FOUND: "یکی از گزینه‌های انتخابی دیگر وجود ندارد. دوباره انتخاب کنید.",
      ORDERING_DISABLED: "این مجموعه الان سفارش آنلاین نمی‌پذیرد.",
      ONLINE_PAYMENT_DISABLED:
        "پرداخت آنلاین الان فعال نیست؛ «پرداخت در محل» را انتخاب کنید.",
      DISCOUNT_CODE_INVALID: "کد تخفیف معتبر نیست.",
      DISCOUNT_CODES_DISABLED: "این مجموعه کد تخفیف نمی‌پذیرد.",
      ORDER_TOTAL_TOO_LARGE: "مبلغ سفارش بیش از حد بزرگ است.",
      RESTAURANT_NOT_FOUND: "این منو پیدا نشد.",
      ORDER_KEY_REUSED: "این سفارش قبلاً ثبت شده است.",
      PRODUCT_NOT_FOUND: "این غذا پیدا نشد.",
      STAFF_CALL_DISABLED: "صدا زدن گارسون در این مجموعه فعال نیست.",
      TABLE_NOT_OPEN: "این میز سفارش پرداخت‌نشده‌ای ندارد.",
      TABLE_REQUIRED: "شماره میز را وارد کنید.",
      TAKEAWAY_DISABLED: "این مجموعه سفارش بیرون‌بر نمی‌پذیرد.",
      OTP_INVALID: "کد واردشده درست نیست یا منقضی شده است.",
      OTP_EXPIRED: "کد منقضی شده است. کد جدید بگیرید.",
      OTP_LOCKED: "تعداد تلاش‌های نادرست زیاد بود. کد جدید بگیرید.",
      OTP_COOLDOWN: "برای دریافت کد جدید کمی صبر کنید.",
      SMS_UNAVAILABLE: "ارسال پیامک در حال حاضر ممکن نیست. کمی بعد دوباره تلاش کنید.",
      PHONE_TAKEN: "این شماره قابل استفاده نیست.",
      REGISTRATION_CLOSED: "ثبت‌نام آنلاین فعلاً بسته است. با پشتیبانی تماس بگیرید.",
      SLUG_TAKEN: "این آدرس قبلاً انتخاب شده است",
      RATE_LIMITED: "تعداد تلاش‌ها زیاد است. چند دقیقه دیگر دوباره تلاش کنید.",
      VALIDATION_ERROR: "لطفاً موارد مشخص‌شده را اصلاح کنید",
      UNAUTHENTICATED: "برای ادامه وارد حساب خود شوید",
      FORBIDDEN: "به این بخش دسترسی ندارید",
      NO_TENANT: "رستورانی به این حساب متصل نیست",
      LIMIT_REACHED: "به سقف پلن فعلی رسیده‌اید",
      NOT_FOUND: "مورد درخواستی پیدا نشد",
      TABLE_EXISTS: "این شماره میز قبلاً ثبت شده است",
      CATEGORY_NOT_FOUND: "دسته‌بندی پیدا نشد",
      UNKNOWN_TEMPLATE: "قالب انتخاب‌شده معتبر نیست",
      BELOW_MINIMUM_ORDER: "مبلغ سبد خرید از حداقل سفارش این رستوران کمتر است",
      CAMPAIGN_NOT_FOUND: "کمپین پیدا نشد",
      CAMPAIGN_NOT_EDITABLE: "این کمپین دیگر قابل ویرایش نیست",
      CAMPAIGN_INVALID_TRANSITION: "این تغییر وضعیت مجاز نیست",
      CAMPAIGN_PRODUCT_NOT_FOUND: "محصول انتخاب‌شده پیدا نشد",
      CAMPAIGN_CATEGORY_NOT_FOUND: "دسته‌بندی انتخاب‌شده پیدا نشد",
      CAMPAIGN_END_BEFORE_START: "تاریخ پایان باید بعد از تاریخ شروع باشد",
      CAMPAIGN_MISSING_START: "برای زمان‌بندی، تاریخ شروع لازم است",
      CAMPAIGN_ENDS_IN_PAST: "بازهٔ این کمپین گذشته است",
      SMS_CHECKOUT_DISABLED: "پرداخت آنلاین پیامک هنوز فعال نشده است",
      SMS_TEXT_EMPTY: "متن پیامک را بنویسید",
      SMS_TEXT_CONTAINS_LINK: "پیامک تبلیغاتی نمی‌تواند لینک داشته باشد",
      SMS_TEXT_TOO_LONG: "متن پیامک طولانی است",
      SMS_NO_RECIPIENTS: "در این گروه هیچ مشتری‌ای با رضایت دریافت پیام وجود ندارد",
      SMS_BROADCAST_NOT_FOUND: "درخواست پیامک پیدا نشد",
      SMS_BROADCAST_INVALID_TRANSITION: "وضعیت این درخواست قبلاً تغییر کرده است",
      SMS_BROADCAST_UNPAID: "این درخواست هنوز پرداخت نشده است",
      INVENTORY_PRICE_UNIT_MISMATCH: "واحد قیمت خرید باید از همان نوع واحد موجودی باشد",
      INVENTORY_UNIT_KIND_CHANGE:
        "واحد ماده‌ای که در نسخه یا موجودی استفاده شده نمی‌تواند به نوع دیگری (مثلاً از وزن به عدد) تغییر کند",
      INVENTORY_UNIT_TOO_COARSE:
        "با این واحد، مقدار مصرف یکی از غذاها کمتر از حد قابل ثبت می‌شود",
      INVENTORY_UNIT_OVERFLOW: "با این واحد، مقدار موجودی بیش از حد بزرگ می‌شود",
      RECIPE_AMOUNT_UNREPRESENTABLE:
        "مقدار یکی از مواد در واحد انبار آن ثبت‌شدنی نیست؛ مقدار یا واحد را بررسی کنید",
      INTERNAL_ERROR: "خطای غیرمنتظره‌ای رخ داد. دوباره تلاش کنید.",
    },
  },
} as const;

/**
 * `fa` is `as const`, so its inferred type is made of string *literals*.
 * Widening them back to `string` lets other locales supply their own text
 * while still being checked for the exact same set of keys.
 */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type Dictionary = Widen<typeof fa>;
