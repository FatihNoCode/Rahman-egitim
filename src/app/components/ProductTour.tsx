import { useState } from 'react';
import {
  X, ArrowRight, ArrowLeft, CheckCircle2, CalendarCheck, BookOpen, MessageSquare,
  Users as UsersIcon, ClipboardList, GraduationCap, Wallet, UserCheck, Bell, Sparkles,
} from 'lucide-react';
import type { Language } from '../App';

type TourRole = 'parent' | 'teacher' | 'admin';

interface TourStep {
  icon: React.ComponentType<{ className?: string }>;
  title: { nl: string; tr: string };
  body: { nl: string; tr: string };
  // A small, realistic dummy preview shown inside the step card.
  preview: React.ReactNode;
}

// Persist per-role so switching roles (e.g. a superadmin who is also a parent
// elsewhere) each get their own first-run tour.
const storageKey = (role: TourRole) => `ilimyolu_tour_seen_${role}`;

export function hasSeenTour(role: string): boolean {
  if (role !== 'parent' && role !== 'teacher' && role !== 'admin') return true;
  try {
    return localStorage.getItem(storageKey(role)) === '1';
  } catch {
    return true;
  }
}

// ---- Small presentational helpers for the dummy previews ------------------

function MockCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 text-left">
      {children}
    </div>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      {children}
    </span>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-b-0 border-gray-100 text-sm">
      <span className="text-gray-700">{left}</span>
      <span>{right}</span>
    </div>
  );
}

// ---- Step definitions per role --------------------------------------------

function parentSteps(lang: Language): TourStep[] {
  const present = <Pill color="bg-emerald-100 text-emerald-700">{lang === 'tr' ? 'Var' : 'Aanwezig'}</Pill>;
  const absent = <Pill color="bg-red-100 text-red-700">{lang === 'tr' ? 'Yok' : 'Afwezig'}</Pill>;
  return [
    {
      icon: Sparkles,
      title: { nl: 'Welkom in het ouderportaal', tr: 'Veli portalına hoş geldiniz' },
      body: {
        nl: 'Volg de voortgang van uw kind(eren): aanwezigheid, huiswerk, gedrag en berichten van school — alles op één plek.',
        tr: 'Çocuğunuzun/çocuklarınızın gelişimini takip edin: devam, ödev, davranış ve okuldan mesajlar — hepsi tek yerde.',
      },
      preview: (
        <MockCard>
          <p className="text-xs text-gray-400 mb-1">{lang === 'tr' ? 'Çocuklarım' : 'Mijn kinderen'}</p>
          <Row left={<span className="font-medium">Yusuf</span>} right={<span className="text-xs text-gray-400">Klas 3A</span>} />
          <Row left={<span className="font-medium">Meryem</span>} right={<span className="text-xs text-gray-400">Klas 1B</span>} />
        </MockCard>
      ),
    },
    {
      icon: CalendarCheck,
      title: { nl: 'Aanwezigheid', tr: 'Devam durumu' },
      body: {
        nl: 'Bekijk per lesdag of uw kind aanwezig, te laat of afwezig was. U ontvangt automatisch een melding bij afwezigheid.',
        tr: 'Her ders günü çocuğunuzun var, geç veya yok olduğunu görün. Devamsızlıkta otomatik bildirim alırsınız.',
      },
      preview: (
        <MockCard>
          <p className="text-xs text-gray-400 mb-1">Yusuf — {lang === 'tr' ? 'Son dersler' : 'Recente lessen'}</p>
          <Row left="za 05 jul" right={present} />
          <Row left="za 28 jun" right={present} />
          <Row left="za 21 jun" right={absent} />
        </MockCard>
      ),
    },
    {
      icon: BookOpen,
      title: { nl: 'Huiswerk', tr: 'Ödevler' },
      body: {
        nl: 'Zie welk huiswerk is opgegeven en vink af wat uw kind heeft afgerond.',
        tr: 'Verilen ödevleri görün ve çocuğunuzun tamamladıklarını işaretleyin.',
      },
      preview: (
        <MockCard>
          <Row left={<span>{lang === 'tr' ? 'Fatiha suresini ezberle' : 'Soera Al-Fatiha memoriseren'}</span>} right={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
          <Row left={<span>{lang === 'tr' ? 'Elif-Ba sayfa 12' : 'Elif-Ba pagina 12'}</span>} right={<Pill color="bg-amber-100 text-amber-700">{lang === 'tr' ? 'Açık' : 'Open'}</Pill>} />
        </MockCard>
      ),
    },
    {
      icon: MessageSquare,
      title: { nl: 'Berichten & oudergesprekken', tr: 'Mesajlar & veli görüşmeleri' },
      body: {
        nl: 'Ontvang berichten van de leraar en plan eenvoudig een oudergesprek in op een beschikbaar tijdslot.',
        tr: 'Öğretmenden mesaj alın ve uygun bir sadate kolayca veli görüşmesi planlayın.',
      },
      preview: (
        <MockCard>
          <p className="text-sm text-gray-700 mb-2">{lang === 'tr' ? '“Yusuf bugün çok iyiydi 👏”' : '“Yusuf deed het vandaag geweldig 👏”'}</p>
          <Pill color="bg-emerald-100 text-emerald-700">{lang === 'tr' ? 'Görüşme: 12 tem 10:00' : 'Gesprek: 12 jul 10:00'}</Pill>
        </MockCard>
      ),
    },
  ];
}

function teacherSteps(lang: Language): TourStep[] {
  return [
    {
      icon: Sparkles,
      title: { nl: 'Welkom, leraar', tr: 'Hoş geldiniz, öğretmen' },
      body: {
        nl: 'Beheer uw klassen: neem aanwezigheid op, geef huiswerk, noteer gedrag en stel rapporten op.',
        tr: 'Sınıflarınızı yönetin: yoklama alın, ödev verin, davranış not edin ve karne hazırlayın.',
      },
      preview: (
        <MockCard>
          <p className="text-xs text-gray-400 mb-1">{lang === 'tr' ? 'Sınıflarım' : 'Mijn klassen'}</p>
          <Row left={<span className="font-medium">Klas 3A</span>} right={<span className="text-xs text-gray-400">18 {lang === 'tr' ? 'öğrenci' : 'leerlingen'}</span>} />
          <Row left={<span className="font-medium">Klas 5B</span>} right={<span className="text-xs text-gray-400">14 {lang === 'tr' ? 'öğrenci' : 'leerlingen'}</span>} />
        </MockCard>
      ),
    },
    {
      icon: CalendarCheck,
      title: { nl: 'Aanwezigheid opnemen', tr: 'Yoklama alma' },
      body: {
        nl: 'Tik per leerling op aanwezig, te laat of afwezig. Ouders krijgen automatisch bericht bij afwezigheid.',
        tr: 'Her öğrenci için var, geç veya yok seçin. Devamsızlıkta veliler otomatik bilgilendirilir.',
      },
      preview: (
        <MockCard>
          <Row left="Yusuf K." right={<Pill color="bg-emerald-100 text-emerald-700">{lang === 'tr' ? 'Var' : 'Aanwezig'}</Pill>} />
          <Row left="Aisha D." right={<Pill color="bg-amber-100 text-amber-700">{lang === 'tr' ? 'Geç' : 'Te laat'}</Pill>} />
          <Row left="Omar B." right={<Pill color="bg-red-100 text-red-700">{lang === 'tr' ? 'Yok' : 'Afwezig'}</Pill>} />
        </MockCard>
      ),
    },
    {
      icon: ClipboardList,
      title: { nl: 'Huiswerk & gedrag', tr: 'Ödev & davranış' },
      body: {
        nl: 'Geef huiswerk op voor de hele klas en noteer gedragsnotities die ouders direct kunnen zien.',
        tr: 'Tüm sınıfa ödev verin ve velilerin anında görebileceği davranış notları girin.',
      },
      preview: (
        <MockCard>
          <Row left={<span>{lang === 'tr' ? 'Ödev: Bakara 1–5' : 'Huiswerk: Al-Baqara 1–5'}</span>} right={<Pill color="bg-emerald-100 text-emerald-700">3A</Pill>} />
          <Row left={<span>{lang === 'tr' ? 'Aisha — yardımsever 🌟' : 'Aisha — behulpzaam 🌟'}</span>} right={<Pill color="bg-blue-100 text-blue-700">{lang === 'tr' ? 'Not' : 'Notitie'}</Pill>} />
        </MockCard>
      ),
    },
    {
      icon: GraduationCap,
      title: { nl: 'Rapporten (diploma)', tr: 'Karneler (diploma)' },
      body: {
        nl: 'Vul cijfers in per vak en genereer nette rapporten voor de hele klas in één keer.',
        tr: 'Her ders için notları girin ve tüm sınıfın karnelerini tek seferde oluşturun.',
      },
      preview: (
        <MockCard>
          <Row left={<span>{lang === 'tr' ? 'Kuran' : 'Koran'}</span>} right={<span className="font-semibold text-emerald-700">9 / 10</span>} />
          <Row left={<span>{lang === 'tr' ? 'Ahlak' : 'Ethiek'}</span>} right={<span className="font-semibold text-emerald-700">8 / 10</span>} />
        </MockCard>
      ),
    },
  ];
}

function adminSteps(lang: Language): TourStep[] {
  return [
    {
      icon: Sparkles,
      title: { nl: 'Welkom, beheerder', tr: 'Hoş geldiniz, yönetici' },
      body: {
        nl: 'U beheert de hele school: gebruikers, klassen, leerlingen, inschrijvingen en de boekhouding.',
        tr: 'Tüm okulu yönetirsiniz: kullanıcılar, sınıflar, öğrenciler, kayıtlar ve muhasebe.',
      },
      preview: (
        <MockCard>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-lg font-bold text-emerald-700">124</p><p className="text-[11px] text-gray-400">{lang === 'tr' ? 'Öğrenci' : 'Leerlingen'}</p></div>
            <div><p className="text-lg font-bold text-emerald-700">9</p><p className="text-[11px] text-gray-400">{lang === 'tr' ? 'Sınıf' : 'Klassen'}</p></div>
            <div><p className="text-lg font-bold text-emerald-700">11</p><p className="text-[11px] text-gray-400">{lang === 'tr' ? 'Öğretmen' : 'Leraren'}</p></div>
          </div>
        </MockCard>
      ),
    },
    {
      icon: UserCheck,
      title: { nl: 'Registraties goedkeuren', tr: 'Kayıtları onaylama' },
      body: {
        nl: 'Nieuwe registraties komen eerst bij u binnen. Ken een rol toe en keur goed — pas dan kan de gebruiker inloggen. Ze krijgen automatisch een e-mail.',
        tr: 'Yeni kayıtlar önce size gelir. Bir rol atayıp onaylayın — ancak o zaman kullanıcı giriş yapabilir. Otomatik e-posta gönderilir.',
      },
      preview: (
        <MockCard>
          <p className="text-xs text-amber-700 mb-1">{lang === 'tr' ? 'Onay bekleyenler (1)' : 'In afwachting (1)'}</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Fatima Yıldız</span>
            <span className="flex gap-1">
              <Pill color="bg-emerald-600 text-white">{lang === 'tr' ? 'Onayla' : 'Goedkeuren'}</Pill>
              <Pill color="bg-red-100 text-red-700">{lang === 'tr' ? 'Reddet' : 'Afwijzen'}</Pill>
            </span>
          </div>
        </MockCard>
      ),
    },
    {
      icon: UsersIcon,
      title: { nl: 'Gebruikers & rollen', tr: 'Kullanıcılar & roller' },
      body: {
        nl: 'Beheer alle gebruikers, wijs leerlingen toe aan ouders en leraren aan klassen.',
        tr: 'Tüm kullanıcıları yönetin, öğrencileri velilere ve öğretmenleri sınıflara atayın.',
      },
      preview: (
        <MockCard>
          <Row left="Ahmet Ö." right={<Pill color="bg-blue-100 text-blue-700">{lang === 'tr' ? 'Öğretmen' : 'Leraar'}</Pill>} />
          <Row left="Sara V." right={<Pill color="bg-gray-100 text-gray-600">{lang === 'tr' ? 'Veli' : 'Ouder'}</Pill>} />
        </MockCard>
      ),
    },
    {
      icon: ClipboardList,
      title: { nl: 'Inschrijvingen', tr: 'Kayıtlar' },
      body: {
        nl: 'Bekijk aanmeldingen via het openbare inschrijfformulier, accepteer ze en plaats het kind direct in een klas.',
        tr: 'Herkese açık kayıt formundan gelen başvuruları görün, kabul edin ve çocuğu doğrudan bir sınıfa yerleştirin.',
      },
      preview: (
        <MockCard>
          <Row left={<span>Ibrahim (6 jr)</span>} right={<Pill color="bg-amber-100 text-amber-700">{lang === 'tr' ? 'Yeni' : 'Nieuw'}</Pill>} />
          <Row left={<span>Zeynep (8 jr)</span>} right={<Pill color="bg-emerald-100 text-emerald-700">{lang === 'tr' ? 'Kabul' : 'Geaccepteerd'}</Pill>} />
        </MockCard>
      ),
    },
    {
      icon: Wallet,
      title: { nl: 'Boekhouding', tr: 'Muhasebe' },
      body: {
        nl: 'Houd bijdragen en betalingen bij per gezin, met een overzicht van openstaande bedragen.',
        tr: 'Aile bazında aidat ve ödemeleri takip edin, açık tutarları görün.',
      },
      preview: (
        <MockCard>
          <Row left={<span>{lang === 'tr' ? 'Aile Kaya' : 'Gezin Kaya'}</span>} right={<Pill color="bg-emerald-100 text-emerald-700">{lang === 'tr' ? 'Ödendi' : 'Betaald'}</Pill>} />
          <Row left={<span>{lang === 'tr' ? 'Aile Demir' : 'Gezin Demir'}</span>} right={<span className="text-red-600 font-semibold text-sm">€ 45</span>} />
        </MockCard>
      ),
    },
  ];
}

function stepsFor(role: TourRole, lang: Language): TourStep[] {
  if (role === 'parent') return parentSteps(lang);
  if (role === 'teacher') return teacherSteps(lang);
  return adminSteps(lang);
}

interface ProductTourProps {
  role: TourRole;
  language: Language;
  onClose: () => void;
}

export default function ProductTour({ role, language, onClose }: ProductTourProps) {
  const steps = stepsFor(role, language);
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const Icon = step.icon;

  const finish = () => {
    try {
      localStorage.setItem(storageKey(role), '1');
    } catch {
      // ignore storage failures — worst case the tour shows again
    }
    onClose();
  };

  const t = {
    skip: language === 'tr' ? 'Turu atla' : 'Rondleiding overslaan',
    back: language === 'tr' ? 'Geri' : 'Terug',
    next: language === 'tr' ? 'İleri' : 'Volgende',
    finish: language === 'tr' ? 'Başla 🎉' : 'Aan de slag 🎉',
    stepOf: language === 'tr'
      ? `${index + 1} / ${steps.length}`
      : `${index + 1} / ${steps.length}`,
    dummyNote: language === 'tr'
      ? 'Örnek veriler — gerçek verileriniz giriş yaptığınızda görünür.'
      : 'Voorbeeldgegevens — uw echte gegevens verschijnen na inloggen.',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-6 pt-6 pb-8 text-white relative">
          <button
            onClick={finish}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            aria-label="close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-2xl p-3">
              <Icon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/70">{t.stepOf}</p>
              <h3 className="text-lg font-bold leading-tight">{step.title[language]}</h3>
            </div>
          </div>
        </div>

        <div className="px-6 -mt-4">
          <div className="bg-gray-50 rounded-2xl p-3">{step.preview}</div>
        </div>

        <div className="px-6 pt-4 pb-2">
          <p className="text-sm text-gray-600 leading-relaxed">{step.body[language]}</p>
          <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
            <Bell className="h-3 w-3" /> {t.dummyNote}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-3">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-5 bg-emerald-600' : 'w-1.5 bg-gray-300'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 pb-6">
          {index === 0 ? (
            <button onClick={finish} className="text-sm text-gray-400 hover:text-gray-600 transition">
              {t.skip}
            </button>
          ) : (
            <button
              onClick={() => setIndex((i) => i - 1)}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition"
            >
              <ArrowLeft className="h-4 w-4" /> {t.back}
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl transition"
          >
            {isLast ? t.finish : t.next}
            {!isLast && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
