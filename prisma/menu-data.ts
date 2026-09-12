/**
 * Shared demo menu content.
 *
 * Extracted from seed.ts so the tenant seeder can reuse the same four menus
 * without duplicating ~700 lines. Importing seed.ts directly is not an option:
 * it runs main() on import.
 */

export interface SeedProduct {
  name: string;
  nameEn: string;
  short: string;
  full: string;
  price: number;
  cost: number;
  prep?: number;
  featured?: boolean;
  info: { title: string; content: string; icon: string }[];
}

export interface SeedCategory {
  name: string;
  nameEn: string;
  icon: string;
  products: SeedProduct[];
}

export const CAFE_MENU: SeedCategory[] = [
  {
    name: "قهوه",
    nameEn: "Coffee",
    icon: "coffee",
    products: [
      {
        name: "اسپرسو",
        nameEn: "Espresso",
        short: "تک شات، دانه عربیکا",
        full: "اسپرسوی غلیظ با کرمای طلایی، از ترکیب دانه‌های عربیکای برزیل و اتیوپی با رست متوسط.",
        price: 55_000,
        cost: 18_000,
        prep: 3,
        info: [
          {
            title: "مواد اولیه",
            content: "۱۸ گرم دانه عربیکا، آب فیلترشده",
            icon: "leaf",
          },
          {
            title: "پیشنهاد سرآشپز",
            content: "بدون شکر میل کنید تا نت‌های شکلاتی حس شود.",
            icon: "chefHat",
          },
          { title: "میزان کافئین", content: "حدود ۶۳ میلی‌گرم در هر شات", icon: "flame" },
        ],
      },
      {
        name: "لاته",
        nameEn: "Latte",
        short: "اسپرسو با شیر بخارپز",
        full: "دو شات اسپرسو با شیر تازه بخارپز و لایه‌ای نازک از فوم، همراه با لته‌آرت.",
        price: 88_000,
        cost: 30_000,
        prep: 5,
        featured: true,
        info: [
          { title: "مواد اولیه", content: "اسپرسو، شیر پرچرب محلی", icon: "milk" },
          {
            title: "روش تهیه",
            content: "شیر تا دمای ۶۵ درجه بخارپز می‌شود.",
            icon: "flame",
          },
          {
            title: "گزینه گیاهی",
            content: "با شیر بادام یا جو دوسر قابل سفارش است.",
            icon: "leaf",
          },
        ],
      },
      {
        name: "موکا",
        nameEn: "Mocha",
        short: "قهوه، شکلات و شیر",
        full: "ترکیب اسپرسو، سس شکلات تلخ ۷۰٪ و شیر بخارپز با تاپینگ پودر کاکائو.",
        price: 105_000,
        cost: 38_000,
        prep: 6,
        info: [
          { title: "مواد اولیه", content: "اسپرسو، شکلات تلخ ۷۰٪، شیر", icon: "cookie" },
          {
            title: "پیشنهاد سرآشپز",
            content: "با کروسان بادام عالی است.",
            icon: "chefHat",
          },
          { title: "ارزش غذایی", content: "حدود ۲۹۰ کیلوکالری", icon: "flame" },
        ],
      },
      {
        name: "آیس آمریکانو",
        nameEn: "Iced Americano",
        short: "سرد و سبک",
        full: "اسپرسو روی یخ با آب سرد فیلترشده؛ سبک‌ترین گزینه سرد منو.",
        price: 78_000,
        cost: 22_000,
        prep: 4,
        info: [
          { title: "مواد اولیه", content: "اسپرسو، آب، یخ", icon: "cupSoda" },
          { title: "ارزش غذایی", content: "کمتر از ۱۰ کیلوکالری", icon: "leaf" },
          {
            title: "پیشنهاد سرآشپز",
            content: "با شربت وانیل امتحان کنید.",
            icon: "chefHat",
          },
        ],
      },
    ],
  },
  {
    name: "دسر",
    nameEn: "Desserts",
    icon: "cake",
    products: [
      {
        name: "چیزکیک نیویورکی",
        nameEn: "New York Cheesecake",
        short: "با سس تمشک تازه",
        full: "چیزکیک کلاسیک با بیس بیسکویت کره‌ای و سس تمشک خانگی.",
        price: 145_000,
        cost: 52_000,
        prep: 2,
        featured: true,
        info: [
          {
            title: "مواد اولیه",
            content: "پنیر خامه‌ای، تخم‌مرغ، بیسکویت، تمشک",
            icon: "cherry",
          },
          { title: "حاوی آلرژن", content: "لبنیات، گلوتن، تخم‌مرغ", icon: "nut" },
          { title: "ارزش غذایی", content: "حدود ۴۲۰ کیلوکالری در هر برش", icon: "flame" },
        ],
      },
      {
        name: "براونی شکلاتی",
        nameEn: "Chocolate Brownie",
        short: "گرم، با بستنی وانیل",
        full: "براونی گردویی که گرم سرو می‌شود، همراه یک اسکوپ بستنی وانیل.",
        price: 128_000,
        cost: 44_000,
        prep: 8,
        info: [
          { title: "مواد اولیه", content: "شکلات تلخ، گردو، کره", icon: "nut" },
          { title: "روش سرو", content: "گرم، ۸ دقیقه پس از سفارش", icon: "flame" },
          { title: "حاوی آلرژن", content: "آجیل، لبنیات، گلوتن", icon: "leaf" },
        ],
      },
      {
        name: "کروسان بادام",
        nameEn: "Almond Croissant",
        short: "تازه پخت روزانه",
        full: "کروسان کره‌ای با مغز کرم بادام و ورقه‌های بادام برشته.",
        price: 96_000,
        cost: 33_000,
        info: [
          { title: "مواد اولیه", content: "آرد، کره فرانسوی، بادام", icon: "croissant" },
          { title: "زمان پخت", content: "هر روز صبح ساعت ۶", icon: "wheat" },
          { title: "حاوی آلرژن", content: "آجیل، گلوتن، لبنیات", icon: "nut" },
        ],
      },
    ],
  },
  {
    name: "نوشیدنی سرد",
    nameEn: "Cold Drinks",
    icon: "cupSoda",
    products: [
      {
        name: "لیموناد نعناع",
        nameEn: "Mint Lemonade",
        short: "خنک و تازه",
        full: "لیموی تازه، نعناع کوبیده و آب گازدار.",
        price: 82_000,
        cost: 24_000,
        info: [
          {
            title: "مواد اولیه",
            content: "لیمو ترش تازه، نعناع، آب گازدار",
            icon: "citrus",
          },
          {
            title: "بدون شکر افزوده",
            content: "با شیرین‌کننده طبیعی استویا",
            icon: "leaf",
          },
          { title: "ارزش غذایی", content: "حدود ۹۰ کیلوکالری", icon: "flame" },
        ],
      },
      {
        name: "اسموتی انبه",
        nameEn: "Mango Smoothie",
        short: "انبه و ماست",
        full: "انبه تازه با ماست یونانی و کمی عسل.",
        price: 118_000,
        cost: 42_000,
        info: [
          { title: "مواد اولیه", content: "انبه، ماست یونانی، عسل", icon: "apple" },
          { title: "منشأ مواد", content: "انبه وارداتی درجه یک", icon: "leaf" },
          { title: "ارزش غذایی", content: "حدود ۲۲۰ کیلوکالری", icon: "flame" },
        ],
      },
    ],
  },
];

export const RESTAURANT_MENU: SeedCategory[] = [
  {
    name: "برگرها",
    nameEn: "Burgers",
    icon: "beef",
    products: [
      {
        name: "چیزبرگر ویژه",
        nameEn: "Special Cheeseburger",
        short: "۲۰۰ گرم گوشت گوساله، چدار دوبل",
        full: "برگر دست‌ساز از گوشت راسته گوساله، پنیر چدار دوبل، کاهو، گوجه و سس مخصوص سرآشپز در نان بریوش.",
        price: 385_000,
        cost: 165_000,
        prep: 18,
        featured: true,
        info: [
          {
            title: "مواد اولیه",
            content: "گوشت راسته گوساله، پنیر چدار، نان بریوش",
            icon: "beef",
          },
          {
            title: "پیشنهاد سرآشپز",
            content: "با درجه پخت متوسط سفارش دهید.",
            icon: "chefHat",
          },
          {
            title: "منشأ گوشت",
            content: "گوشت تازه روزانه از دامداری محلی",
            icon: "leaf",
          },
        ],
      },
      {
        name: "برگر مرغ سوخاری",
        nameEn: "Crispy Chicken Burger",
        short: "فیله مرغ سوخاری با سس تند",
        full: "فیله مرغ مرینیت‌شده در دوغ، سوخاری‌شده تا کاملاً ترد، با سس تند و کلم‌سالاد.",
        price: 325_000,
        cost: 128_000,
        prep: 15,
        info: [
          {
            title: "مواد اولیه",
            content: "فیله مرغ، آرد ادویه‌دار، سس تند",
            icon: "drumstick",
          },
          { title: "میزان تندی", content: "متوسط — قابل تنظیم", icon: "flame" },
          {
            title: "روش پخت",
            content: "سرخ‌شده در روغن آفتابگردان تازه",
            icon: "chefHat",
          },
        ],
      },
      {
        name: "برگر گیاهی",
        nameEn: "Veggie Burger",
        short: "نخود، لوبیا و قارچ",
        full: "پتی خانگی از نخود، لوبیا و قارچ پورتوبلو با سس تاهینی.",
        price: 285_000,
        cost: 95_000,
        prep: 14,
        info: [
          {
            title: "مواد اولیه",
            content: "نخود، لوبیا قرمز، قارچ پورتوبلو",
            icon: "carrot",
          },
          { title: "مناسب برای", content: "گیاه‌خواران و وگان‌ها", icon: "leaf" },
          { title: "ارزش غذایی", content: "۲۴ گرم پروتئین گیاهی", icon: "salad" },
        ],
      },
    ],
  },
  {
    name: "پیتزا",
    nameEn: "Pizza",
    icon: "pizza",
    products: [
      {
        name: "پیتزا مارگاریتا",
        nameEn: "Margherita Pizza",
        short: "خمیر تخمیر ۴۸ ساعته",
        full: "سس گوجه سان‌مارتزانو، موزارلای بوفالو و ریحان تازه روی خمیر تخمیر طولانی.",
        price: 420_000,
        cost: 155_000,
        prep: 20,
        featured: true,
        info: [
          {
            title: "مواد اولیه",
            content: "موزارلای بوفالو، گوجه سان‌مارتزانو، ریحان",
            icon: "pizza",
          },
          { title: "روش پخت", content: "فر سنگی، ۴۵۰ درجه، ۹۰ ثانیه", icon: "flame" },
          { title: "خمیر", content: "تخمیر آهسته ۴۸ ساعته", icon: "wheat" },
        ],
      },
      {
        name: "پیتزا پپرونی",
        nameEn: "Pepperoni Pizza",
        short: "پپرونی گوساله، پنیر دوبل",
        full: "پپرونی گوساله تند با موزارلا و کمی پنیر پارمزان.",
        price: 465_000,
        cost: 182_000,
        prep: 20,
        info: [
          {
            title: "مواد اولیه",
            content: "پپرونی گوساله، موزارلا، پارمزان",
            icon: "pizza",
          },
          { title: "میزان تندی", content: "ملایم", icon: "flame" },
          { title: "اندازه", content: "۳۰ سانتی‌متر، ۸ برش", icon: "utensils" },
        ],
      },
    ],
  },
  {
    name: "پیش‌غذا",
    nameEn: "Starters",
    icon: "salad",
    products: [
      {
        name: "سیب‌زمینی سرخ‌کرده",
        nameEn: "French Fries",
        short: "با سس چدار",
        full: "سیب‌زمینی تازه برش‌خورده با نمک دریایی و سس چدار گرم.",
        price: 165_000,
        cost: 48_000,
        prep: 10,
        info: [
          { title: "مواد اولیه", content: "سیب‌زمینی تازه، نمک دریایی", icon: "carrot" },
          { title: "روش پخت", content: "دوبار سرخ‌شده برای تردی بیشتر", icon: "flame" },
          { title: "سس همراه", content: "چدار، کچاپ یا سیر", icon: "chefHat" },
        ],
      },
      {
        name: "سالاد سزار",
        nameEn: "Caesar Salad",
        short: "کاهو رومی، مرغ گریل",
        full: "کاهو رومی تازه، مرغ گریل‌شده، نان تست و سس سزار خانگی با پارمزان رنده‌شده.",
        price: 245_000,
        cost: 88_000,
        prep: 8,
        info: [
          { title: "مواد اولیه", content: "کاهو رومی، سینه مرغ، پارمزان", icon: "salad" },
          { title: "سس", content: "خانگی، بدون نگهدارنده", icon: "leaf" },
          { title: "ارزش غذایی", content: "۳۲ گرم پروتئین", icon: "flame" },
        ],
      },
    ],
  },
  {
    name: "نوشیدنی",
    nameEn: "Drinks",
    icon: "cupSoda",
    products: [
      {
        name: "دوغ سنتی",
        nameEn: "Traditional Doogh",
        short: "با نعناع کوهی",
        full: "دوغ گازدار سنتی با نعناع کوهی خشک.",
        price: 65_000,
        cost: 18_000,
        info: [
          { title: "مواد اولیه", content: "ماست محلی، نعناع کوهی، نمک", icon: "milk" },
          { title: "منشأ", content: "ماست از دامداری‌های محلی", icon: "leaf" },
          { title: "حجم", content: "۳۰۰ میلی‌لیتر", icon: "cupSoda" },
        ],
      },
      {
        name: "نوشابه",
        nameEn: "Soda",
        short: "قوطی ۳۳۰ میلی‌لیتر",
        full: "انواع نوشابه گازدار در قوطی ۳۳۰ میلی‌لیتری.",
        price: 45_000,
        cost: 22_000,
        info: [
          { title: "طعم‌ها", content: "کولا، پرتقال، لیمو", icon: "cupSoda" },
          { title: "حجم", content: "۳۳۰ میلی‌لیتر", icon: "utensils" },
          { title: "سرو", content: "کاملاً خنک", icon: "flame" },
        ],
      },
    ],
  },
];

/** Traditional Iranian menu — shows the Linen template with a long, familiar list. */
export const PERSIAN_MENU: SeedCategory[] = [
  {
    name: "کباب",
    nameEn: "Kebab",
    icon: "flame",
    products: [
      {
        name: "چلوکباب کوبیده",
        nameEn: "Chelo Kabab Koobideh",
        short: "دو سیخ، برنج ایرانی",
        full: "گوشت گوسفندی تازه چرخ‌شده با پیاز رنده و ادویه، روی زغال کبابی. با برنج دم‌کشیده و کره سرو می‌شود.",
        price: 385_000,
        cost: 168_000,
        prep: 20,
        featured: true,
        info: [
          {
            title: "مواد اولیه",
            content: "گوشت گوسفندی، پیاز، نمک و فلفل",
            icon: "leaf",
          },
          {
            title: "پیشنهاد سرآشپز",
            content: "با دوغ محلی و سبزی‌خوردن میل کنید.",
            icon: "chefHat",
          },
          { title: "روش پخت", content: "روی زغال بلوط، حدود ۸ دقیقه", icon: "flame" },
        ],
      },
      {
        name: "جوجه‌کباب زعفرانی",
        nameEn: "Saffron Chicken Kebab",
        short: "سینه مرغ، زعفران قائنات",
        full: "سینه مرغ مرینیت‌شده در ماست، زعفران و آبلیمو به مدت ۱۲ ساعت، سپس روی زغال.",
        price: 345_000,
        cost: 142_000,
        prep: 18,
        info: [
          {
            title: "مواد اولیه",
            content: "سینه مرغ، زعفران، ماست، آبلیمو",
            icon: "leaf",
          },
          { title: "زمان مرینیت", content: "۱۲ ساعت", icon: "clock" },
          { title: "خاستگاه زعفران", content: "قائنات خراسان جنوبی", icon: "mapPin" },
        ],
      },
      {
        name: "کباب برگ",
        nameEn: "Kabab Barg",
        short: "فیله گوساله",
        full: "فیله گوساله نازک برش‌خورده، مرینیت با پیاز و زعفران، کبابی روی آتش ملایم.",
        price: 495_000,
        cost: 235_000,
        prep: 22,
        info: [
          { title: "مواد اولیه", content: "فیله گوساله، زعفران، پیاز", icon: "leaf" },
          { title: "درجه پخت", content: "مغزپخت اما آبدار", icon: "flame" },
          { title: "همراه", content: "برنج، گوجه کبابی، کره", icon: "utensils" },
        ],
      },
    ],
  },
  {
    name: "خورشت",
    nameEn: "Stews",
    icon: "utensils",
    products: [
      {
        name: "قورمه‌سبزی",
        nameEn: "Ghormeh Sabzi",
        short: "سبزی سرخ‌شده، لیمو عمانی",
        full: "خورشت سنتی با سبزی معطر، لوبیا قرمز، گوشت گوسفندی و لیمو عمانی؛ آرام‌پز چهار ساعته.",
        price: 298_000,
        cost: 118_000,
        prep: 10,
        featured: true,
        info: [
          {
            title: "مواد اولیه",
            content: "تره، جعفری، شنبلیله، لوبیا قرمز، گوشت",
            icon: "leaf",
          },
          { title: "زمان پخت", content: "۴ ساعت روی حرارت ملایم", icon: "clock" },
          {
            title: "پیشنهاد سرآشپز",
            content: "با ترشی سیر هفت‌ساله عالی است.",
            icon: "chefHat",
          },
        ],
      },
      {
        name: "فسنجان",
        nameEn: "Fesenjan",
        short: "گردو و رب انار",
        full: "خورشت گردوی ساییده با رب انار طبیعی و مرغ محلی؛ طعمی ملس و غلیظ.",
        price: 325_000,
        cost: 138_000,
        prep: 12,
        info: [
          { title: "مواد اولیه", content: "گردوی تازه، رب انار، مرغ محلی", icon: "leaf" },
          { title: "خاستگاه", content: "رب انار از ساری", icon: "mapPin" },
          { title: "طعم", content: "ملس — نه شیرین، نه ترش", icon: "utensils" },
        ],
      },
    ],
  },
  {
    name: "پیش‌غذا",
    nameEn: "Starters",
    icon: "salad",
    products: [
      {
        name: "کشک بادمجان",
        nameEn: "Kashk Bademjan",
        short: "بادمجان دودی، نعناع داغ",
        full: "بادمجان کبابی و له‌شده با کشک محلی، پیاز داغ، نعناع داغ و مغز گردو.",
        price: 148_000,
        cost: 52_000,
        prep: 8,
        info: [
          {
            title: "مواد اولیه",
            content: "بادمجان، کشک، پیاز، نعناع، گردو",
            icon: "leaf",
          },
          { title: "سرو", content: "گرم، با نان سنگک تازه", icon: "utensils" },
          { title: "گیاهی", content: "بدون گوشت", icon: "leaf" },
        ],
      },
      {
        name: "ماست و خیار",
        nameEn: "Mast-o Khiar",
        short: "خیار، نعناع، گل سرخ",
        full: "ماست چکیده محلی با خیار خردشده، نعناع خشک، گل محمدی و کشمش.",
        price: 96_000,
        cost: 32_000,
        prep: 5,
        info: [
          {
            title: "مواد اولیه",
            content: "ماست چکیده، خیار، نعناع، گل محمدی",
            icon: "leaf",
          },
          { title: "سرو", content: "خنک", icon: "flame" },
          { title: "گیاهی", content: "بدون گوشت", icon: "leaf" },
        ],
      },
    ],
  },
];

/** Fine-dining menu — shows the Noir template's sparse, typographic list. */
export const FINE_DINING_MENU: SeedCategory[] = [
  {
    // "Starters", not "Entrées": in American English an entrée is the main
    // course, so the fine-dining menu was labelling its openers as its mains.
    // The other three menus already say Starters for the same Persian word.
    name: "پیش‌غذا",
    nameEn: "Starters",
    icon: "salad",
    products: [
      {
        name: "کارپاچیو گوساله",
        nameEn: "Beef Carpaccio",
        short: "فیله خام، پارمزان، روغن ترافل",
        full: "برش‌های نازک فیله گوساله با پارمزان رنده، آروگولا، کیپر و چند قطره روغن ترافل سفید.",
        price: 420_000,
        cost: 185_000,
        prep: 12,
        featured: true,
        info: [
          {
            title: "مواد اولیه",
            content: "فیله گوساله، پارمزان ۲۴ماهه، ترافل سفید",
            icon: "leaf",
          },
          {
            title: "پیشنهاد سرآشپز",
            content: "با یک گیلاس آب انگورِ بدون الکل سرو می‌شود.",
            icon: "chefHat",
          },
          { title: "خاستگاه", content: "ترافل از آلبا، ایتالیا", icon: "mapPin" },
        ],
      },
      {
        name: "سوپ قارچ ترافل",
        nameEn: "Truffle Mushroom Soup",
        short: "قارچ پورتوبلو، خامه",
        full: "سوپ مخملی قارچ پورتوبلو و شامپینیون با خامه غلیظ و روغن ترافل.",
        price: 265_000,
        cost: 88_000,
        prep: 10,
        info: [
          {
            title: "مواد اولیه",
            content: "قارچ پورتوبلو، شامپینیون، خامه، ترافل",
            icon: "leaf",
          },
          { title: "بافت", content: "کاملاً صاف و مخملی", icon: "utensils" },
          { title: "گیاهی", content: "بدون گوشت", icon: "leaf" },
        ],
      },
    ],
  },
  {
    name: "غذای اصلی",
    nameEn: "Mains",
    icon: "utensils",
    products: [
      {
        name: "استیک ریب‌آی",
        nameEn: "Ribeye Steak",
        short: "۳۰۰ گرم، سس فلفل سبز",
        full: "ریب‌آی خشک‌رسیده ۲۸ روزه، سرخ‌شده در تابه چدنی و استراحت‌داده، با سس فلفل سبز و پوره سیب‌زمینی ترافل.",
        price: 890_000,
        cost: 425_000,
        prep: 25,
        featured: true,
        info: [
          {
            title: "مواد اولیه",
            content: "ریب‌آی خشک‌رسیده، کره، آویشن، سیر",
            icon: "leaf",
          },
          { title: "درجه پخت", content: "پیش‌فرض مدیوم‌ریر — قابل تغییر", icon: "flame" },
          { title: "زمان رسیدن گوشت", content: "۲۸ روز خشک‌رسیده", icon: "clock" },
        ],
      },
      {
        name: "فیله ماهی سالمون",
        nameEn: "Salmon Fillet",
        short: "سالمون نروژی، مارچوبه",
        full: "فیله سالمون با پوست ترد، روی پوره نخود سبز و مارچوبه گریل‌شده، با سس کره لیمو.",
        price: 720_000,
        cost: 340_000,
        prep: 20,
        info: [
          {
            title: "مواد اولیه",
            content: "سالمون نروژی، مارچوبه، نخود سبز، کره",
            icon: "leaf",
          },
          { title: "خاستگاه", content: "سالمون از فیوردهای نروژ", icon: "mapPin" },
          { title: "ارزش غذایی", content: "سرشار از امگا-۳", icon: "utensils" },
        ],
      },
    ],
  },
  {
    name: "دسر",
    nameEn: "Desserts",
    icon: "cake",
    products: [
      {
        name: "سوفله شکلات",
        nameEn: "Chocolate Soufflé",
        short: "شکلات ۷۰٪، مغز روان",
        full: "سوفله گرم شکلات تلخ ۷۰ درصد با مغز روان، همراه بستنی وانیل بوربن.",
        price: 245_000,
        cost: 78_000,
        prep: 18,
        info: [
          {
            title: "مواد اولیه",
            content: "شکلات تلخ ۷۰٪، تخم‌مرغ، کره، وانیل",
            icon: "leaf",
          },
          {
            title: "زمان آماده‌سازی",
            content: "۱۸ دقیقه — لطفاً صبور باشید",
            icon: "clock",
          },
          {
            title: "پیشنهاد سرآشپز",
            content: "بلافاصله پس از سرو میل کنید.",
            icon: "chefHat",
          },
        ],
      },
      {
        name: "کرم بروله زعفران",
        nameEn: "Saffron Crème Brûlée",
        short: "زعفران، کارامل ترد",
        full: "کاستارد وانیل و زعفران با لایه کارامل ترد، سرو در ظرف سرامیکی.",
        price: 198_000,
        cost: 62_000,
        prep: 8,
        info: [
          {
            title: "مواد اولیه",
            content: "خامه، زرده تخم‌مرغ، زعفران، شکر",
            icon: "leaf",
          },
          { title: "خاستگاه زعفران", content: "قائنات", icon: "mapPin" },
          { title: "سرو", content: "خنک با روکش گرم", icon: "flame" },
        ],
      },
    ],
  },
];

/**
 * A «سوغاتی» shelf: packaged goods a venue sells alongside the food.
 *
 * Kept as its own export rather than folded into a menu so any demo can append
 * it. The Bazaar template recognises the category by name and lifts it to the
 * foot of the menu; every other template renders it as an ordinary category,
 * which is what makes it safe to attach anywhere.
 */
export const SOUVENIR_MENU: SeedCategory[] = [
  {
    name: "سوغاتی",
    nameEn: "Souvenirs",
    icon: "gift",
    products: [
      {
        name: "گز اصفهان",
        nameEn: "Isfahan Gaz",
        short: "جعبه ۵۰۰ گرمی، مغز پسته",
        full: "گز سنتی اصفهان با ۴۰٪ مغز پسته، پخت روزانه در کارگاه خودمان و بسته‌بندی شده برای سفر.",
        price: 480_000,
        cost: 300_000,
        featured: true,
        info: [
          { title: "وزن", content: "۵۰۰ گرم", icon: "package" },
          { title: "ماندگاری", content: "۶ ماه", icon: "clock" },
        ],
      },
      {
        name: "سوهان قم",
        nameEn: "Qom Sohan",
        short: "بسته ۴۰۰ گرمی با زعفران و هل",
        full: "سوهان کنجدی با زعفران سرگل و هل سبز، در ظرف فلزی مناسب هدیه.",
        price: 390_000,
        cost: 240_000,
        info: [
          { title: "وزن", content: "۴۰۰ گرم", icon: "package" },
          { title: "طعم", content: "زعفران و هل", icon: "flame" },
        ],
      },
      {
        name: "زعفران سرگل",
        nameEn: "Sargol Saffron",
        short: "قوطی یک مثقالی، درجه یک قائنات",
        full: "زعفران سرگل قائنات در قوطی دربسته، همراه برگه اصالت.",
        price: 1_250_000,
        cost: 900_000,
        featured: true,
        info: [
          { title: "خاستگاه", content: "قائنات", icon: "mapPin" },
          { title: "وزن", content: "یک مثقال", icon: "package" },
        ],
      },
      {
        name: "پسته اکبری",
        nameEn: "Akbari Pistachio",
        short: "نیم‌کیلو، خام و تازه",
        full: "پسته اکبری درشت رفسنجان، خام و بدون نمک، در بسته‌بندی وکیوم.",
        price: 890_000,
        cost: 620_000,
        info: [
          { title: "وزن", content: "۵۰۰ گرم", icon: "package" },
          { title: "خاستگاه", content: "رفسنجان", icon: "mapPin" },
        ],
      },
    ],
  },
];

/**
 * Extra courses that only the Daftar bistro carries.
 *
 * Keyed by category name and merged into the fine-dining menu below, rather
 * than appended as new categories the way SOUVENIR_MENU is: Daftar needs *more
 * dishes in the courses it already has*, and concatenating a second «پیش‌غذا»
 * entry would create a duplicate category rather than a longer one.
 *
 * Noir keeps the short six-dish list. It is the sparse, one-page fine-dining
 * card and a longer menu would work against the template it exists to show.
 */
const BISTRO_EXTRAS: Record<string, SeedProduct[]> = {
  پیش‌غذا: [
    {
      name: "سالاد چغندر و پنیر بزی",
      nameEn: "Beetroot & Goat Cheese Salad",
      short: "چغندر کبابی، پنیر بزی، گردو",
      full: "چغندر آرام‌پخته در نمک، با پنیر بزی تازه، گردوی برشته و سس بالزامیک.",
      price: 235_000,
      cost: 82_000,
      prep: 10,
      info: [
        { title: "مواد اولیه", content: "چغندر، پنیر بزی، گردو، بالزامیک", icon: "leaf" },
        { title: "گیاهی", content: "بدون گوشت", icon: "leaf" },
        { title: "روش پخت", content: "چغندر ۲ ساعت در پوسته نمک", icon: "flame" },
      ],
    },
  ],
  "غذای اصلی": [
    {
      name: "ریزوتو قارچ پورچینی",
      nameEn: "Porcini Risotto",
      short: "برنج آربوریو، قارچ پورچینی",
      full: "ریزوتوی آربوریو با قارچ پورچینی خشک، کره و پارمزان ۲۴ماهه.",
      price: 480_000,
      cost: 190_000,
      prep: 25,
      info: [
        { title: "مواد اولیه", content: "برنج آربوریو، پورچینی، پارمزان", icon: "leaf" },
        { title: "گیاهی", content: "بدون گوشت", icon: "leaf" },
        { title: "روش پخت", content: "هم‌زدن پیوسته، ۲۵ دقیقه", icon: "flame" },
      ],
    },
    {
      name: "ران اردک کنفی",
      nameEn: "Duck Leg Confit",
      short: "اردک آرام‌پز، پوره سیب‌زمینی",
      full: "ران اردک، ۶ ساعت آرام‌پز در چربی خودش، با پوست ترد و پوره سیب‌زمینی کره‌ای.",
      price: 790_000,
      cost: 355_000,
      prep: 22,
      featured: true,
      info: [
        { title: "مواد اولیه", content: "ران اردک، آویشن، سیر، سیب‌زمینی", icon: "leaf" },
        { title: "زمان پخت", content: "۶ ساعت در دمای پایین", icon: "clock" },
        { title: "پیشنهاد سرآشپز", content: "با سس پرتقال و زعفران", icon: "chefHat" },
      ],
    },
    {
      name: "پاپاردله با راگوی گوساله",
      nameEn: "Pappardelle with Beef Ragù",
      short: "پاستای دست‌ساز، راگوی ۴ ساعته",
      full: "پاپاردله دست‌ساز با راگوی گوساله که چهار ساعت آرام پخته، و پارمزان تازه رنده.",
      price: 545_000,
      cost: 215_000,
      prep: 20,
      info: [
        {
          title: "مواد اولیه",
          content: "آرد سمولینا، تخم‌مرغ، گوشت گوساله",
          icon: "wheat",
        },
        { title: "زمان پخت راگو", content: "۴ ساعت", icon: "clock" },
        { title: "پاستا", content: "هر روز صبح دست‌ساز", icon: "chefHat" },
      ],
    },
  ],
  دسر: [
    {
      name: "تارت لیمو",
      nameEn: "Lemon Tart",
      short: "کرم لیمو، مرنگ سوخته",
      full: "تارت شیرینی‌پزی با کرم لیموی ترش و مرنگ سوخته‌ی سطحی.",
      price: 185_000,
      cost: 58_000,
      prep: 6,
      info: [
        { title: "مواد اولیه", content: "لیمو، کره، تخم‌مرغ، شکر", icon: "citrus" },
        { title: "حاوی آلرژن", content: "گلوتن، تخم‌مرغ، لبنیات", icon: "nut" },
        { title: "سرو", content: "خنک", icon: "flame" },
      ],
    },
  ],
};

/**
 * The Daftar bistro's menu: the fine-dining card plus its own extra dishes.
 *
 * Merged by category name so the extras land inside the existing courses, and
 * placed **first** rather than appended. This template leads every category
 * with its opening dish — wide image, larger name, description in full — so
 * position 0 is the one entry a guest is guaranteed to read. Putting the
 * bistro's own dishes there is what distinguishes it from Noir, which shares
 * the same fine-dining base and would otherwise lead with the identical three.
 */
export const BISTRO_MENU: SeedCategory[] = FINE_DINING_MENU.map((category) => ({
  ...category,
  products: [...(BISTRO_EXTRAS[category.name] ?? []), ...category.products],
}));

/**
 * English descriptions, keyed by the Persian product name.
 *
 * A parallel table rather than two more fields on every literal, for the same
 * reason `src/lib/i18n/en.ts` is a separate file from `fa.ts`: the Persian is
 * the source of truth and the translation mirrors it. `englishCopy()` below
 * enforces that the mirror is complete.
 *
 * Without these, `shortDescriptionEn` and `fullDescriptionEn` stayed null and
 * `localizedText()` fell back to Persian — so an English menu was English
 * headings over Persian copy, which reads worse than no translation at all.
 */
export const EN_COPY: Record<string, { short: string; full: string }> = {
  // --- café ---
  اسپرسو: {
    short: "Single shot, Arabica beans",
    full: "A dense espresso under golden crema, from a medium roast of Brazilian and Ethiopian Arabica.",
  },
  لاته: {
    short: "Espresso with steamed milk",
    full: "Two shots of espresso with freshly steamed milk and a thin layer of foam, finished with latte art.",
  },
  موکا: {
    short: "Coffee, chocolate and milk",
    full: "Espresso, 70% dark chocolate sauce and steamed milk, dusted with cocoa.",
  },
  "آیس آمریکانو": {
    short: "Cold and light",
    full: "Espresso over ice with chilled filtered water — the lightest cold drink on the menu.",
  },
  "چیزکیک نیویورکی": {
    short: "With fresh raspberry sauce",
    full: "A classic baked cheesecake on a buttery biscuit base, with house-made raspberry sauce.",
  },
  "براونی شکلاتی": {
    short: "Warm, with vanilla ice cream",
    full: "A walnut brownie served warm with a scoop of vanilla ice cream.",
  },
  "کروسان بادام": {
    short: "Baked fresh each morning",
    full: "A butter croissant filled with almond cream and topped with toasted flaked almonds.",
  },
  "لیموناد نعناع": {
    short: "Cool and fresh",
    full: "Fresh lemon, muddled mint and sparkling water.",
  },
  "اسموتی انبه": {
    short: "Mango and yoghurt",
    full: "Fresh mango blended with Greek yoghurt and a little honey.",
  },

  // --- burgers, pizza, sides ---
  "چیزبرگر ویژه": {
    short: "200g beef patty, double cheddar",
    full: "A hand-pressed beef sirloin patty with double cheddar, lettuce, tomato and the chef's own sauce in a brioche bun.",
  },
  "برگر مرغ سوخاری": {
    short: "Crispy chicken fillet, hot sauce",
    full: "Chicken fillet marinated in buttermilk and fried until fully crisp, with hot sauce and coleslaw.",
  },
  "برگر گیاهی": {
    short: "Chickpea, bean and mushroom",
    full: "A house-made patty of chickpeas, beans and portobello mushroom with tahini sauce.",
  },
  "پیتزا مارگاریتا": {
    short: "48-hour fermented dough",
    full: "San Marzano tomato sauce, buffalo mozzarella and fresh basil on long-fermented dough.",
  },
  "پیتزا پپرونی": {
    short: "Beef pepperoni, double cheese",
    full: "Spicy beef pepperoni with mozzarella and a little parmesan.",
  },
  "سیب‌زمینی سرخ‌کرده": {
    short: "With cheddar sauce",
    full: "Freshly cut potatoes with sea salt and warm cheddar sauce.",
  },
  "سالاد سزار": {
    short: "Romaine lettuce, grilled chicken",
    full: "Crisp romaine, grilled chicken, croutons and house Caesar dressing with grated parmesan.",
  },
  "دوغ سنتی": {
    short: "With wild mint",
    full: "Traditional sparkling doogh with dried wild mint.",
  },
  نوشابه: {
    short: "330ml can",
    full: "Assorted carbonated soft drinks in 330ml cans.",
  },

  // --- Persian ---
  "چلوکباب کوبیده": {
    short: "Two skewers, Iranian rice",
    full: "Freshly minced lamb with grated onion and spice, grilled over charcoal. Served with steamed rice and butter.",
  },
  "جوجه‌کباب زعفرانی": {
    short: "Chicken breast, Qaen saffron",
    full: "Chicken breast marinated twelve hours in yoghurt, saffron and lemon juice, then grilled over charcoal.",
  },
  "کباب برگ": {
    short: "Beef fillet",
    full: "Thinly sliced beef fillet marinated with onion and saffron, grilled over a gentle fire.",
  },
  قورمه‌سبزی: {
    short: "Fried herbs, dried lime",
    full: "The traditional stew of fragrant herbs, red beans, lamb and dried lime, slow-cooked for four hours.",
  },
  فسنجان: {
    short: "Walnut and pomegranate",
    full: "A stew of ground walnuts and natural pomegranate molasses with free-range chicken; rich and gently tart.",
  },
  "کشک بادمجان": {
    short: "Smoked aubergine, mint oil",
    full: "Grilled and mashed aubergine with local kashk, fried onion, mint oil and walnuts.",
  },
  "ماست و خیار": {
    short: "Cucumber, mint, rose petals",
    full: "Local strained yoghurt with diced cucumber, dried mint, rose petals and raisins.",
  },

  // --- souvenirs ---
  "گز اصفهان": {
    short: "500g box, pistachio",
    full: "Traditional Isfahan gaz with 40% pistachio, made daily in our own workshop and boxed for travel.",
  },
  "سوهان قم": {
    short: "400g tin with saffron and cardamom",
    full: "Sesame sohan with sargol saffron and green cardamom, in a gift-ready metal tin.",
  },
  "زعفران سرگل": {
    short: "One mesghal tin, first-grade Qaen",
    full: "Sargol saffron from Qaen in a sealed tin, with a certificate of origin.",
  },
  "پسته اکبری": {
    short: "Half a kilo, raw and fresh",
    full: "Large Akbari pistachios from Rafsanjan, raw and unsalted, vacuum packed.",
  },

  // --- fine dining ---
  "کارپاچیو گوساله": {
    short: "Raw fillet, parmesan, truffle oil",
    full: "Thin slices of beef fillet with grated parmesan, rocket, capers and a few drops of white truffle oil.",
  },
  "سوپ قارچ ترافل": {
    short: "Portobello mushroom, cream",
    full: "A velvety soup of portobello and button mushrooms with thick cream and truffle oil.",
  },
  "استیک ریب‌آی": {
    short: "300g, green peppercorn sauce",
    full: "28-day dry-aged ribeye, seared in a cast-iron pan and rested, with green peppercorn sauce and truffle mash.",
  },
  "فیله ماهی سالمون": {
    short: "Norwegian salmon, asparagus",
    full: "Crisp-skinned salmon fillet on pea purée with grilled asparagus and a lemon butter sauce.",
  },
  "سوفله شکلات": {
    short: "70% chocolate, molten centre",
    full: "A warm 70% dark chocolate soufflé with a molten centre, served with bourbon vanilla ice cream.",
  },
  "کرم بروله زعفران": {
    short: "Saffron, crisp caramel",
    full: "Vanilla and saffron custard under a crisp caramel top, served in a ceramic dish.",
  },

  // --- bistro extras (Daftar only) ---
  "سالاد چغندر و پنیر بزی": {
    short: "Roast beetroot, goat cheese, walnut",
    full: "Beetroot baked slowly in a salt crust with fresh goat cheese, toasted walnuts and balsamic.",
  },
  "ریزوتو قارچ پورچینی": {
    short: "Arborio rice, porcini mushroom",
    full: "Arborio risotto with dried porcini, butter and 24-month parmesan.",
  },
  "ران اردک کنفی": {
    short: "Slow-cooked duck, potato purée",
    full: "Duck leg confited six hours in its own fat, with crisp skin and buttered potato purée.",
  },
  "پاپاردله با راگوی گوساله": {
    short: "Hand-made pasta, 4-hour ragù",
    full: "Hand-cut pappardelle with a beef ragù simmered four hours, and freshly grated parmesan.",
  },
  "تارت لیمو": {
    short: "Lemon curd, torched meringue",
    full: "A pâtisserie tart of sharp lemon curd under lightly torched meringue.",
  },
};

/**
 * The English copy for one dish, or a loud failure.
 *
 * Throwing rather than falling back to null is deliberate: a silent null is
 * exactly how every product ended up with a Persian description on the English
 * menu in the first place. A missing translation should stop the seed, not ship.
 */
export function englishCopy(name: string): { short: string; full: string } {
  const copy = EN_COPY[name];
  if (!copy) {
    throw new Error(
      `No English copy for product "${name}". Add it to EN_COPY in prisma/menu-data.ts.`,
    );
  }
  return copy;
}

/**
 * English for the product info panels, keyed by the Persian string.
 *
 * These are the labelled facts inside a product sheet — ingredients, allergens,
 * cooking method — and they were the last thing on an English menu still
 * rendering in Persian, because `ProductInfoSection.titleEn`/`contentEn` existed
 * but were never populated.
 *
 * One flat map for both titles and contents: they are the same problem (a short
 * Persian string that needs an English twin) and keeping them apart would mean
 * two lookups and two ways to be incomplete. Titles repeat heavily across
 * dishes — 37 distinct labels across 116 sections — so the map is far smaller
 * than the data it covers.
 */
export const EN_INFO: Record<string, string> = {
  // ---- labels ----
  "ارزش غذایی": "Nutrition",
  اندازه: "Size",
  بافت: "Texture",
  "بدون شکر افزوده": "No added sugar",
  پاستا: "Pasta",
  "پیشنهاد سرآشپز": "Chef's suggestion",
  "حاوی آلرژن": "Allergens",
  حجم: "Volume",
  خاستگاه: "Origin",
  "خاستگاه زعفران": "Saffron origin",
  خمیر: "Dough",
  "درجه پخت": "Doneness",
  "روش پخت": "Cooking method",
  "روش تهیه": "Preparation",
  "روش سرو": "Serving",
  "زمان آماده‌سازی": "Preparation time",
  "زمان پخت": "Cooking time",
  "زمان پخت راگو": "Ragù cooking time",
  "زمان رسیدن گوشت": "Ageing",
  "زمان مرینیت": "Marinating time",
  سرو: "Served",
  سس: "Sauce",
  "سس همراه": "Dipping sauce",
  طعم: "Flavour",
  طعم‌ها: "Flavours",
  "گزینه گیاهی": "Plant-based option",
  گیاهی: "Vegetarian",
  ماندگاری: "Shelf life",
  "مناسب برای": "Suitable for",
  منشأ: "Source",
  "منشأ گوشت": "Meat source",
  "منشأ مواد": "Ingredient source",
  "مواد اولیه": "Ingredients",
  "میزان تندی": "Heat level",
  "میزان کافئین": "Caffeine",
  همراه: "Served with",
  وزن: "Weight",

  // ---- values ----
  "۱۲ ساعت": "12 hours",
  "۱۸ دقیقه — لطفاً صبور باشید": "18 minutes — please be patient",
  "۱۸ گرم دانه عربیکا، آب فیلترشده": "18g Arabica beans, filtered water",
  "۲۴ گرم پروتئین گیاهی": "24g plant protein",
  "۲۸ روز خشک‌رسیده": "28 days dry-aged",
  "۳۰ سانتی‌متر، ۸ برش": "30cm, 8 slices",
  "۳۰۰ میلی‌لیتر": "300ml",
  "۳۲ گرم پروتئین": "32g protein",
  "۳۳۰ میلی‌لیتر": "330ml",
  "۴ ساعت": "4 hours",
  "۴ ساعت روی حرارت ملایم": "4 hours over a low heat",
  "۴۰۰ گرم": "400g",
  "۵۰۰ گرم": "500g",
  "۶ ساعت در دمای پایین": "6 hours at a low temperature",
  "۶ ماه": "6 months",
  "آجیل، گلوتن، لبنیات": "Nuts, gluten, dairy",
  "آجیل، لبنیات، گلوتن": "Nuts, dairy, gluten",
  "آرد سمولینا، تخم‌مرغ، گوشت گوساله": "Semolina flour, egg, beef",
  "آرد، کره فرانسوی، بادام": "Flour, French butter, almonds",
  "اسپرسو، آب، یخ": "Espresso, water, ice",
  "اسپرسو، شکلات تلخ ۷۰٪، شیر": "Espresso, 70% dark chocolate, milk",
  "اسپرسو، شیر پرچرب محلی": "Espresso, local whole milk",
  "انبه وارداتی درجه یک": "Premium imported mango",
  "انبه، ماست یونانی، عسل": "Mango, Greek yoghurt, honey",
  "با ترشی سیر هفت‌ساله عالی است.": "Excellent with seven-year pickled garlic.",
  "با درجه پخت متوسط سفارش دهید.": "Order it cooked medium.",
  "با دوغ محلی و سبزی‌خوردن میل کنید.": "Have it with local doogh and fresh herbs.",
  "با سس پرتقال و زعفران": "With an orange and saffron sauce",
  "با شربت وانیل امتحان کنید.": "Try it with vanilla syrup.",
  "با شیر بادام یا جو دوسر قابل سفارش است.": "Available with almond or oat milk.",
  "با شیرین‌کننده طبیعی استویا": "Sweetened naturally with stevia",
  "با کروسان بادام عالی است.": "Excellent with the almond croissant.",
  "با یک گیلاس آب انگورِ بدون الکل سرو می‌شود.":
    "Served with a glass of alcohol-free grape juice.",
  "بادمجان، کشک، پیاز، نعناع، گردو": "Aubergine, kashk, onion, mint, walnuts",
  "بدون شکر میل کنید تا نت‌های شکلاتی حس شود.":
    "Drink it without sugar to taste the chocolate notes.",
  "بدون گوشت": "No meat",
  "برنج آربوریو، پورچینی، پارمزان": "Arborio rice, porcini, parmesan",
  "برنج، گوجه کبابی، کره": "Rice, grilled tomato, butter",
  "بلافاصله پس از سرو میل کنید.": "Eat it as soon as it arrives.",
  "پپرونی گوساله، موزارلا، پارمزان": "Beef pepperoni, mozzarella, parmesan",
  "پنیر خامه‌ای، تخم‌مرغ، بیسکویت، تمشک": "Cream cheese, egg, biscuit, raspberry",
  "پیش‌فرض مدیوم‌ریر — قابل تغییر": "Medium-rare by default — changeable",
  "تخمیر آهسته ۴۸ ساعته": "48-hour slow fermentation",
  "ترافل از آلبا، ایتالیا": "Truffle from Alba, Italy",
  "تره، جعفری، شنبلیله، لوبیا قرمز، گوشت": "Leek, parsley, fenugreek, red beans, lamb",
  "چدار، کچاپ یا سیر": "Cheddar, ketchup or garlic",
  "چغندر ۲ ساعت در پوسته نمک": "Beetroot, two hours in a salt crust",
  "چغندر، پنیر بزی، گردو، بالزامیک": "Beetroot, goat cheese, walnuts, balsamic",
  "حدود ۲۲۰ کیلوکالری": "About 220 kcal",
  "حدود ۲۹۰ کیلوکالری": "About 290 kcal",
  "حدود ۴۲۰ کیلوکالری در هر برش": "About 420 kcal per slice",
  "حدود ۶۳ میلی‌گرم در هر شات": "About 63mg per shot",
  "حدود ۹۰ کیلوکالری": "About 90 kcal",
  "خامه، زرده تخم‌مرغ، زعفران، شکر": "Cream, egg yolk, saffron, sugar",
  "خانگی، بدون نگهدارنده": "House-made, no preservatives",
  خنک: "Chilled",
  "خنک با روکش گرم": "Chilled, under a warm crust",
  "دوبار سرخ‌شده برای تردی بیشتر": "Twice fried, for extra crispness",
  "ران اردک، آویشن، سیر، سیب‌زمینی": "Duck leg, thyme, garlic, potato",
  "رب انار از ساری": "Pomegranate molasses from Sari",
  رفسنجان: "Rafsanjan",
  "روی زغال بلوط، حدود ۸ دقیقه": "Over oak charcoal, about 8 minutes",
  "ریب‌آی خشک‌رسیده، کره، آویشن، سیر": "Dry-aged ribeye, butter, thyme, garlic",
  "زعفران و هل": "Saffron and cardamom",
  "سالمون از فیوردهای نروژ": "Salmon from the Norwegian fjords",
  "سالمون نروژی، مارچوبه، نخود سبز، کره": "Norwegian salmon, asparagus, peas, butter",
  "سرخ‌شده در روغن آفتابگردان تازه": "Fried in fresh sunflower oil",
  "سرشار از امگا-۳": "Rich in omega-3",
  "سیب‌زمینی تازه، نمک دریایی": "Fresh potatoes, sea salt",
  "سینه مرغ، زعفران، ماست، آبلیمو": "Chicken breast, saffron, yoghurt, lemon juice",
  "شکلات تلخ ۷۰٪، تخم‌مرغ، کره، وانیل": "70% dark chocolate, egg, butter, vanilla",
  "شکلات تلخ، گردو، کره": "Dark chocolate, walnuts, butter",
  "شیر تا دمای ۶۵ درجه بخارپز می‌شود.": "The milk is steamed to 65°C.",
  "فر سنگی، ۴۵۰ درجه، ۹۰ ثانیه": "Stone oven, 450°C, 90 seconds",
  "فیله گوساله، پارمزان ۲۴ماهه، ترافل سفید":
    "Beef fillet, 24-month parmesan, white truffle",
  "فیله گوساله، زعفران، پیاز": "Beef fillet, saffron, onion",
  "فیله مرغ، آرد ادویه‌دار، سس تند": "Chicken fillet, spiced flour, hot sauce",
  "قارچ پورتوبلو، شامپینیون، خامه، ترافل":
    "Portobello and button mushrooms, cream, truffle",
  قائنات: "Qaen",
  "قائنات خراسان جنوبی": "Qaen, South Khorasan",
  "کاملاً خنک": "Well chilled",
  "کاملاً صاف و مخملی": "Completely smooth and velvety",
  "کاهو رومی، سینه مرغ، پارمزان": "Romaine lettuce, chicken breast, parmesan",
  "کمتر از ۱۰ کیلوکالری": "Under 10 kcal",
  "کولا، پرتقال، لیمو": "Cola, orange, lemon",
  "گردوی تازه، رب انار، مرغ محلی":
    "Fresh walnuts, pomegranate molasses, free-range chicken",
  "گرم، ۸ دقیقه پس از سفارش": "Warm, 8 minutes after ordering",
  "گرم، با نان سنگک تازه": "Warm, with fresh sangak bread",
  "گلوتن، تخم‌مرغ، لبنیات": "Gluten, egg, dairy",
  "گوشت تازه روزانه از دامداری محلی": "Fresh meat daily from a local farm",
  "گوشت راسته گوساله، پنیر چدار، نان بریوش": "Beef sirloin, cheddar, brioche bun",
  "گوشت گوسفندی، پیاز، نمک و فلفل": "Lamb, onion, salt and pepper",
  "گیاه‌خواران و وگان‌ها": "Vegetarians and vegans",
  "لبنیات، گلوتن، تخم‌مرغ": "Dairy, gluten, egg",
  "لیمو ترش تازه، نعناع، آب گازدار": "Fresh lemon, mint, sparkling water",
  "لیمو، کره، تخم‌مرغ، شکر": "Lemon, butter, egg, sugar",
  "ماست از دامداری‌های محلی": "Yoghurt from local dairies",
  "ماست چکیده، خیار، نعناع، گل محمدی": "Strained yoghurt, cucumber, mint, rose petals",
  "ماست محلی، نعناع کوهی، نمک": "Local yoghurt, wild mint, salt",
  "متوسط — قابل تنظیم": "Medium — adjustable",
  "مغزپخت اما آبدار": "Cooked through but juicy",
  ملایم: "Mild",
  "ملس — نه شیرین، نه ترش": "Gently tart — neither sweet nor sour",
  "موزارلای بوفالو، گوجه سان‌مارتزانو، ریحان":
    "Buffalo mozzarella, San Marzano tomatoes, basil",
  "نخود، لوبیا قرمز، قارچ پورتوبلو": "Chickpeas, red beans, portobello mushroom",
  "هر روز صبح دست‌ساز": "Hand-made every morning",
  "هر روز صبح ساعت ۶": "Every morning at 6am",
  "هم‌زدن پیوسته، ۲۵ دقیقه": "Constant stirring, 25 minutes",
  "یک مثقال": "One mesghal (4.6g)",
};

/**
 * English for one info-panel string, or a loud failure.
 *
 * Throws for the same reason `englishCopy` does: a silent null here is exactly
 * how these panels stayed Persian on the English menu in the first place.
 */
export function englishInfo(value: string): string {
  const translated = EN_INFO[value];
  if (!translated) {
    throw new Error(
      `No English for info string "${value}". Add it to EN_INFO in prisma/menu-data.ts.`,
    );
  }
  return translated;
}

export const CUSTOMER_NAMES = [
  "سارا محمدی",
  "علی رضایی",
  "مریم حسینی",
  "امیر کریمی",
  "نگین احمدی",
  "رضا موسوی",
  "فاطمه نوری",
  "حسین صادقی",
  "زهرا قاسمی",
  "محمد جعفری",
];
