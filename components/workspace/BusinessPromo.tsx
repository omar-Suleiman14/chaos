"use client";

import { planCatalog } from "@/lib/planCatalog";
import { useCopy } from "@/lib/i18n";

const copy = {
  en: { unit: "EGP / active seat / month", label: "Limited time · 100% off", note: "Create a Business team for free. No checkout or charges." },
  ar: { unit: "جنيه / مقعد نشط / شهر", label: "لفترة محدودة · خصم ١٠٠٪", note: "أنشئ فريق أعمال مجانًا. لا دفع ولا رسوم." },
};
export default function BusinessPromo() {
  const t = useCopy(copy), plan = planCatalog.pro;
  return <div className="ws-business-promo"><div><s>{plan.priceEgp}</s> <strong>{plan.promotion.priceEgp}</strong> <span>{t.unit}</span></div><span className="ws-business-promo__label">{t.label}</span><p>{t.note}</p></div>;
}
