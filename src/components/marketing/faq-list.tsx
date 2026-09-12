"use client";

import { ChevronDown } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Native <details> accordion — keyboard support, find-in-page and the
 * open/closed state all come from the platform rather than from JS.
 */
const FAQ_FA = [
  {
    q: "برای استفاده از منولند به اپلیکیشن نیاز دارم؟",
    a: "خیر. مشتری فقط بارکد روی میز را با دوربین گوشی اسکن می‌کند و منو بلافاصله در مرورگر باز می‌شود. شما هم پنل مدیریت را از هر مرورگری باز می‌کنید.",
  },
  {
    q: "راه‌اندازی چقدر طول می‌کشد؟",
    a: "معمولاً کمتر از ۱۵ دقیقه. کافی است دسته‌بندی‌ها و محصولات را وارد کنید، یک قالب انتخاب کنید و بارکد میزها را چاپ کنید. تیم پشتیبانی هم در راه‌اندازی اولیه رایگان کمک می‌کند.",
  },
  {
    q: "آیا می‌توانم قیمت‌ها را هر روز تغییر دهم؟",
    a: "بله. هر تغییری در پنل، بلافاصله روی منوی عمومی اعمال می‌شود و نیازی به چاپ دوباره بارکد نیست.",
  },
  {
    q: "اگر قالب را عوض کنم، اطلاعات منو پاک می‌شود؟",
    a: "خیر. دسته‌بندی‌ها و محصولات مستقل از قالب ذخیره می‌شوند. با تغییر قالب فقط ظاهر منو عوض می‌شود. همچنین وقتی ما قالبی را بهبود می‌دهیم، منوی شما خودکار به‌روز می‌شود.",
  },
  {
    q: "پرداخت آنلاین چطور کار می‌کند؟",
    a: "با اتصال درگاه زرین‌پال، مشتری می‌تواند هنگام ثبت سفارش پرداخت کند. اگر ترجیح می‌دهید، می‌توانید فقط گزینه «پرداخت در محل» را فعال بگذارید.",
  },
  {
    q: "اطلاعات فروش من برای رستوران‌های دیگر قابل مشاهده است؟",
    a: "خیر. هر مجموعه فضای داده کاملاً جداگانه دارد و دسترسی به اطلاعات فقط از طریق حساب کاربری خود شما ممکن است.",
  },
  {
    q: "امکان لغو اشتراک وجود دارد؟",
    a: "بله. اشتراک را هر زمان می‌توانید تمدید نکنید. تا پایان دوره پرداخت‌شده، منو و پنل شما فعال می‌ماند.",
  },
];

const FAQ_EN = [
  {
    q: "Do guests need to install an app?",
    a: "No. Guests scan the QR code on the table with their phone camera and the menu opens in the browser. You manage everything from any browser too.",
  },
  {
    q: "How long does setup take?",
    a: "Usually under 15 minutes: add your categories and products, pick a template, print the table codes. Our team will also help with the initial setup for free.",
  },
  {
    q: "Can I change prices daily?",
    a: "Yes. Every change in the dashboard appears on the public menu immediately — no need to reprint anything.",
  },
  {
    q: "Will switching templates erase my menu?",
    a: "No. Categories and products are stored independently of the template, so switching only changes the look. When we improve a template, your menu picks it up automatically.",
  },
  {
    q: "How does online payment work?",
    a: "Connect a Zarinpal merchant account and guests can pay while ordering. If you prefer, you can leave only 'pay at the restaurant' enabled.",
  },
  {
    q: "Can other restaurants see my sales data?",
    a: "No. Each venue has fully isolated data, reachable only through your own account.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Yes. Simply don't renew — your menu and dashboard stay active until the end of the paid period.",
  },
];

export function FaqList({ className }: { className?: string }) {
  const { locale } = useI18n();
  const items = locale === "en" ? FAQ_EN : FAQ_FA;

  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-[var(--radius-md)] border border-ink-200 bg-ink-50/60 transition-colors open:bg-surface open:shadow-[var(--shadow-soft)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-sm font-bold text-ink-900 marker:content-none">
            {item.q}
            <ChevronDown className="size-4.5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
          </summary>
          <p className="px-4 pb-4 text-sm leading-8 text-ink-600">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
