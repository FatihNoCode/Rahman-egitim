import { useState, useEffect, useMemo } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import faviconUrl from '../../imports/books__1_.png';
import { ChevronDown, Plus, X, Mail, Info } from 'lucide-react';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-6679cacd`;

type Language = 'nl' | 'tr';

const T = {
  nl: {
    title: 'Inschrijving Kind',
    subtitle: 'Schrijf uw kind in voor onze lessen',
    lessonType: 'Soort les',
    lessonTypeInfo: 'Meer informatie over de soorten lessen',
    sex: 'Geslacht kind',
    boy: 'Jongen',
    girl: 'Meisje',
    firstName: 'Voornaam kind',
    lastName: 'Achternaam kind',
    age: 'Leeftijd na de zomervakantie',
    agePlaceholder: 'bijv. 8',
    contactSection: 'Contactgegevens',
    contactFirstName: 'Voornaam ouder',
    contactLastName: 'Achternaam ouder',
    contactName: 'Naam contactpersoon',
    contactPhone: 'Telefoonnummer',
    contactEmail: 'E-mailadres',
    addSecondContact: 'Tweede contactpersoon toevoegen',
    removeSecondContact: 'Tweede contactpersoon verwijderen',
    secondContact: 'Tweede contactpersoon',
    remarks: 'Opmerkingen / bijzonderheden (optioneel)',
    remarksPlaceholder: 'Heeft uw kind bijzonderheden, allergieën of andere informatie die wij moeten weten?',
    submit: 'Inschrijving versturen',
    submitting: 'Versturen...',
    required: 'Dit veld is verplicht',
    successTitle: 'Inschrijving ontvangen!',
    successMsg: 'Uw gegevens zijn opgeslagen. Rond de zomervakantie doen we ons best om u verder te informeren over de inschrijving van uw kind.',
    successSub: 'Bedankt voor uw interesse!',
    newForm: 'Nog een kind inschrijven',
    close: 'Sluiten',
    errorMsg: 'Er is iets misgegaan. Probeer het opnieuw.',
    allRequired: 'Vul alle verplichte velden in.',
    faqTitle: 'Veelgestelde vragen',
    faqSubtitle: 'Alles wat u moet weten over onze lessen',
    hasQuestion: 'Heb je vragen rondom de inschrijving of andere gerelateerde vragen?',
    questionPlaceholder: 'Stel hier je vraag...',
    faqNudge: 'Grote kans dat je antwoord al hieronder staat — bekijk eerst even de veelgestelde vragen.',
    viewFaqs: 'Bekijk de veelgestelde vragen',
    questionReceived: 'We hebben ook je vraag ontvangen en reageren zo snel mogelijk per e-mail.',
  },
  tr: {
    title: 'Çocuk Kayıt Formu',
    subtitle: 'Çocuğunuzu derslerimize kayıt ettirin',
    lessonType: 'Ders Türü',
    lessonTypeInfo: 'Ders türleri hakkında daha fazla bilgi',
    sex: 'Çocuğun cinsiyeti',
    boy: 'Erkek',
    girl: 'Kız',
    firstName: 'Çocuğun adı',
    lastName: 'Çocuğun soyadı',
    age: 'Yaz tatilinden sonraki yaş',
    agePlaceholder: 'örn. 8',
    contactSection: 'İletişim Bilgileri',
    contactFirstName: 'Velinin adı',
    contactLastName: 'Velinin soyadı',
    contactName: 'İletişim kişisinin adı',
    contactPhone: 'Telefon numarası',
    contactEmail: 'E-posta adresi',
    addSecondContact: 'İkinci kişi ekle',
    removeSecondContact: 'İkinci kişiyi kaldır',
    secondContact: 'İkinci iletişim kişisi',
    remarks: 'Notlar / önemli bilgiler (opsiyonel)',
    remarksPlaceholder: 'Çocuğunuzun özel bir durumu, alerjisi veya bilmemiz gereken başka bir şey var mı?',
    submit: 'Formu Gönder',
    submitting: 'Gönderiliyor...',
    required: 'Bu alan zorunludur',
    successTitle: 'Kayıt Alındı!',
    successMsg: 'Bilgileriniz kaydedildi. Yaz tatili civarında çocuğunuzun kaydı hakkında sizi bilgilendirmeye çalışacağız.',
    successSub: 'İlginiz için teşekkür ederiz!',
    newForm: 'Başka bir çocuk kayıt ettir',
    close: 'Kapat',
    errorMsg: 'Bir hata oluştu. Lütfen tekrar deneyin.',
    allRequired: 'Lütfen tüm zorunlu alanları doldurun.',
    faqTitle: 'Sıkça Sorulan Sorular',
    faqSubtitle: 'Derslerimiz hakkında bilmeniz gereken her şey',
    hasQuestion: 'Kayıt veya ilgili konularda bir sorunuz mu var?',
    questionPlaceholder: 'Sorunuzu buraya yazın...',
    faqNudge: 'Cevabınız büyük olasılıkla aşağıda — önce sıkça sorulan sorulara göz atın.',
    viewFaqs: 'Sıkça sorulan sorulara bak',
    questionReceived: 'Sorunuzu da aldık ve en kısa sürede e-posta ile size geri döneceğiz.',
  },
};

// The first FAQ entry in each language ("which lesson types are there") is
// generated dynamically from the live schools list further down, so its `a`
// here is just a fallback while schools are still loading.
const FAQS = {
  nl: [
    {
      q: 'Welke soorten lessen zijn er?',
      a: 'Een moment geduld...',
    },
    {
      q: 'Wat is het verschil tussen Darul Furkan en Haftasonu Eğitim?',
      a: 'Qua inhoud is er geen verschil — de lessen zijn identiek. Het onderscheid zit in de tijden. <strong>Darul Furkan</strong> vindt plaats op maandag van 16:00–18:45 uur en op dinsdag, donderdag en vrijdag van 16:00–17:45 uur. <strong>Haftasonu Eğitim</strong> vindt plaats op zaterdag en zondag om 10:00 uur en om 13:30 uur, en is ideaal voor gezinnen die doordeweeks minder flexibel zijn.',
    },
    {
      q: 'Hoe hoog zijn de kosten voor de lessen?',
      a: `De contributie voor het schooljaar bedraagt:
<ul class="mt-2 space-y-1 list-none">
  <li class="flex items-center gap-2"><span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span><strong>€ 520</strong> — Geen lid, geen broer/zus bij ons ingeschreven</li>
  <li class="flex items-center gap-2"><span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span><strong>€ 470</strong> — Geen lid, wel een broer of zus ingeschreven</li>
  <li class="flex items-center gap-2"><span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span><strong>€ 150</strong> — Lid van onze vereniging, geen broer/zus ingeschreven</li>
  <li class="flex items-center gap-2"><span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span><strong>€ 130</strong> — Lid van onze vereniging, met een broer of zus ingeschreven</li>
</ul>`,
    },
    {
      q: 'Hoe zien de klassen en groepen eruit?',
      a: 'Elke klas telt tussen de <strong>10 en 20 leerlingen</strong>, zodat er voldoende persoonlijke aandacht is. De klassen zijn gescheiden: er zijn aparte groepen voor jongens en voor meisjes, waardoor leerlingen zich optimaal kunnen concentreren.',
    },
    {
      q: 'Wat leren de leerlingen?',
      a: 'Leerlingen starten met <strong>Elif-Bâ</strong> (het Arabische alfabet) en basiskennis over de Islaam. Naarmate zij vorderen, groeien de lessen uit tot <strong>Koran-onderwijs</strong>, diepgaandere kennis over de Islaam, ahadith, en verdere islamitische wetenschappen.',
    },
  ],
  tr: [
    {
      q: 'Hangi ders türleri mevcut?',
      a: 'Bir dakika lütfen...',
    },
    {
      q: 'Darul Furkan ile Haftasonu Eğitim arasındaki fark nedir?',
      a: 'İçerik açısından hiçbir fark yoktur — dersler aynıdır. Fark ders saatlerindedir. <strong>Darul Furkan</strong>; Pazartesi 16:00–18:45 ve Salı, Perşembe, Cuma günleri 16:00–17:45 saatleri arasında yapılır. <strong>Haftasonu Eğitim</strong> ise Cumartesi ve Pazar günleri saat 10:00 ve 13:30\'da yapılır; hafta içi müsait olmayan aileler için idealdir.',
    },
    {
      q: 'Ders ücretleri ne kadar?',
      a: `Yıllık ücretler şu şekildedir:
<ul class="mt-2 space-y-1 list-none">
  <li class="flex items-center gap-2"><span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span><strong>€ 520</strong> — Üye değil, kardeş kayıtlı değil</li>
  <li class="flex items-center gap-2"><span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span><strong>€ 470</strong> — Üye değil, kardeş kayıtlı</li>
  <li class="flex items-center gap-2"><span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span><strong>€ 150</strong> — Dernek üyesi, kardeş kayıtlı değil</li>
  <li class="flex items-center gap-2"><span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span><strong>€ 130</strong> — Dernek üyesi, kardeş kayıtlı</li>
</ul>`,
    },
    {
      q: 'Sınıflar ve gruplar nasıl oluşturulur?',
      a: 'Her sınıfta <strong>10 ile 20 öğrenci</strong> bulunur; böylece her öğrenciye yeterli bireysel ilgi gösterilebilir. Sınıflar cinsiyete göre ayrılmıştır: erkek çocuklar ve kız çocuklar için ayrı gruplar mevcuttur.',
    },
    {
      q: 'Öğrenciler ne öğrenir?',
      a: 'Öğrenciler <strong>Elif-Bâ</strong> (Arap alfabesi) ve temel İslam bilgisiyle başlarlar. İlerledikçe dersler <strong>Kur\'an eğitimi</strong>, daha derin İslam bilgisi, hadisler ve diğer İslami ilimler şeklinde gelişir.',
    },
  ],
};

interface FieldProps {
  label: string;
  field: string;
  type?: string;
  placeholder?: string;
  optional?: boolean;
  language: Language;
  value: string;
  error: boolean;
  errorMsg: string;
  onChange: (field: string, value: string) => void;
}

function Field({ label, field, type = 'text', placeholder = '', optional = false, language, value, error, errorMsg, onChange }: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {!optional && <span className="text-red-500">*</span>}
        {optional && <span className="text-gray-400 text-xs ml-1">({language === 'nl' ? 'optioneel' : 'isteğe bağlı'})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(field, e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-300'
        }`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{errorMsg}</p>}
    </div>
  );
}

export default function InschrijvingPage() {
  const [language, setLanguage] = useState<Language>('nl');
  const t = T[language];

  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    schoolId: '',
    geslacht: '',
    voornaam: '',
    achternaam: '',
    leeftijd: '',
    contactVoornaam: '',
    contactAchternaam: '',
    contactTelefoon: '',
    contactEmail: '',
    contact2Naam: '',
    contact2Telefoon: '',
    contact2Email: '',
    opmerkingen: '',
    vraag: '',
  });
  const [showSecond, setShowSecond] = useState(false);
  const [heeftVraag, setHeeftVraag] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Whether the just-submitted registration also included a question — drives
  // the confirmation modal so the "we'll reply by e-mail" line only shows then.
  const [sentQuestion, setSentQuestion] = useState(false);
  const [serverError, setServerError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // The "which lesson types are there" FAQ answer is generated from the live
  // schools list, so a newly created school shows up here automatically.
  const faqs = useMemo(() => {
    const base = FAQS[language];
    // These strings are rendered with dangerouslySetInnerHTML below, so the
    // school name — which comes from the API, not from this file — has to be
    // escaped before it goes into the markup.
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const names = schools.map(s => `<strong>${escape(s.name ?? '')}</strong>`);
    let lessonTypesAnswer: string;
    if (names.length === 0) {
      lessonTypesAnswer = language === 'nl'
        ? 'Binnenkort meer informatie over onze lesprogramma\'s.'
        : 'Ders programlarımız hakkında yakında daha fazla bilgi.';
    } else if (names.length === 1) {
      lessonTypesAnswer = language === 'nl'
        ? `Wij bieden op dit moment één lesprogramma aan: ${names[0]}.`
        : `Şu anda bir ders programı sunuyoruz: ${names[0]}.`;
    } else {
      const and = language === 'nl' ? 'en' : 've';
      const list = `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
      lessonTypesAnswer = language === 'nl'
        ? `Wij bieden verschillende lesprogramma's aan: ${list}. Alle programma's zijn inhoudelijk gelijkwaardig en bieden uw kind een stevige islamitische opvoeding.`
        : `Farklı ders programları sunuyoruz: ${list}. Tüm programlar içerik olarak eşdeğerdir ve çocuğunuza sağlam bir İslami eğitim sunar.`;
    }
    return base.map((faq, i) => i === 0 ? { ...faq, a: lessonTypesAnswer } : faq);
  }, [language, schools]);

  useEffect(() => {
    fetch(`${API_BASE}/schools/public`, {
      headers: { 'Authorization': `Bearer ${publicAnonKey}` },
    })
      .then(res => res.json())
      .then(data => setSchools(data.schools || []))
      .catch(err => console.error('Error loading schools:', err));
  }, []);

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: false }));
  };

  const validate = () => {
    const required = ['schoolId', 'geslacht', 'voornaam', 'achternaam', 'leeftijd', 'contactVoornaam', 'contactAchternaam', 'contactTelefoon', 'contactEmail'];
    const newErrors: Record<string, boolean> = {};
    let ok = true;
    for (const f of required) {
      if (!form[f as keyof typeof form].trim()) { newErrors[f] = true; ok = false; }
    }
    setErrors(newErrors);
    return ok;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError('');
    try {
      const payload = { ...form };
      if (!showSecond) {
        payload.contact2Naam = '';
        payload.contact2Telefoon = '';
        payload.contact2Email = '';
      }
      // Only attach a question if the user opened the box and actually typed one.
      const question = heeftVraag ? form.vraag.trim() : '';
      payload.vraag = question;
      const res = await fetch(`${API_BASE}/inschrijvingen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setSentQuestion(question.length > 0);
      setSubmitted(true);
    } catch (err) {
      console.error('Submit error:', err);
      setServerError(t.errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setForm({ schoolId: '', geslacht: '', voornaam: '', achternaam: '', leeftijd: '', contactVoornaam: '', contactAchternaam: '', contactTelefoon: '', contactEmail: '', contact2Naam: '', contact2Telefoon: '', contact2Email: '', opmerkingen: '', vraag: '' });
    setErrors({});
    setSubmitted(false);
    setSentQuestion(false);
    setServerError('');
    setShowSecond(false);
    setHeeftVraag(false);
  };

  const scrollToFaq = () => {
    document.getElementById('inschrijven-faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openLessonTypeFaq = () => {
    setOpenFaq(0);
    scrollToFaq();
  };

  // NOTE: this is a render helper that must be CALLED — e.g. {renderField({...})}
  // — never used as a JSX component (<renderField />). Using it as a component
  // would make it a new component type each render, remounting the <input> and
  // dropping focus on every keystroke.
  const renderField = (props: Omit<FieldProps, 'language' | 'value' | 'error' | 'errorMsg' | 'onChange'>) => (
    <Field
      {...props}
      key={props.field}
      language={language}
      value={form[props.field as keyof typeof form]}
      error={!!errors[props.field]}
      errorMsg={t.required}
      onChange={set}
    />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => { window.location.href = '/'; }}
            className="flex items-center gap-3 cursor-pointer"
          >
            <img src={faviconUrl} alt="Logo" className="h-9 w-9 object-contain" />
            <span className="font-bold text-emerald-800 text-lg">Rahman Eğitim</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-3 py-1 rounded text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >
              {language === 'tr' ? 'Giriş Yap' : 'Inloggen'}
            </button>
            <button
              onClick={() => setLanguage('nl')}
              className={`px-3 py-1 rounded text-sm font-medium transition ${language === 'nl' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >NL</button>
            <button
              onClick={() => setLanguage('tr')}
              className={`px-3 py-1 rounded text-sm font-medium transition ${language === 'tr' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >TR</button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-6">
          <>
              {/* Registration form */}
              <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
                <div className="mb-7 text-center">
                  <h1 className="text-2xl sm:text-3xl font-bold text-emerald-800 mb-1">{t.title}</h1>
                  <p className="text-gray-500 text-sm">{t.subtitle}</p>
                </div>

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  {/* Lesson type / school */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t.lessonType} <span className="text-red-500">*</span>
                      <sup>
                        <button
                          type="button"
                          onClick={openLessonTypeFaq}
                          aria-label={t.lessonTypeInfo}
                          className="ml-0.5 inline-flex align-top translate-y-1 text-emerald-600 hover:text-emerald-800"
                        >
                          <Info className="w-3 h-3" />
                        </button>
                      </sup>
                    </label>
                    <select
                      value={form.schoolId}
                      onChange={e => set('schoolId', e.target.value)}
                      className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition bg-white ${
                        errors.schoolId ? 'border-red-400 bg-red-50' : 'border-gray-300'
                      }`}
                    >
                      <option value="">{language === 'nl' ? 'Selecteer...' : 'Seçiniz...'}</option>
                      {schools.map(school => (
                        <option key={school.id} value={school.id}>{school.name}</option>
                      ))}
                    </select>
                    {errors.schoolId && <p className="text-red-500 text-xs mt-1">{t.required}</p>}
                  </div>

                  {/* Sex */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t.sex} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-3">
                      {[{ val: 'jongen', label: t.boy }, { val: 'meisje', label: t.girl }].map(({ val, label }) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => set('geslacht', val)}
                          className={`flex-1 py-2.5 rounded-lg border-2 font-semibold text-sm transition ${
                            form.geslacht === val
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : errors.geslacht
                              ? 'border-red-300 bg-red-50 text-gray-600'
                              : 'border-gray-200 text-gray-600 hover:border-emerald-300'
                          }`}
                        >
                          {val === 'jongen' ? '👦' : '👧'} {label}
                        </button>
                      ))}
                    </div>
                    {errors.geslacht && <p className="text-red-500 text-xs mt-1">{t.required}</p>}
                  </div>

                  {/* Name row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderField({ label: t.firstName, field: 'voornaam' })}
                    {renderField({ label: t.lastName, field: 'achternaam' })}
                  </div>

                  {/* Age */}
                  {renderField({ label: t.age, field: 'leeftijd', type: 'number', placeholder: t.agePlaceholder })}

                  {/* Primary contact */}
                  <div className="border-t border-gray-100 pt-5">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-4">
                      {t.contactSection}
                    </p>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {renderField({ label: t.contactFirstName, field: 'contactVoornaam' })}
                        {renderField({ label: t.contactLastName, field: 'contactAchternaam' })}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {renderField({ label: t.contactPhone, field: 'contactTelefoon', type: 'tel', placeholder: '+31 6 00000000' })}
                        {renderField({ label: t.contactEmail, field: 'contactEmail', type: 'email', placeholder: 'naam@email.com' })}
                      </div>
                    </div>

                    {/* Second contact toggle */}
                    {!showSecond ? (
                      <button
                        type="button"
                        onClick={() => setShowSecond(true)}
                        className="mt-4 flex items-center gap-2 text-emerald-700 hover:text-emerald-800 text-sm font-medium transition group"
                      >
                        <span className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-emerald-500 group-hover:bg-emerald-50 transition">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                        {t.addSecondContact}
                      </button>
                    ) : (
                      <div className="mt-5 pt-5 border-t border-dashed border-emerald-200">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs text-emerald-700 uppercase tracking-wide font-semibold">
                            {t.secondContact}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSecond(false);
                              set('contact2Naam', '');
                              set('contact2Telefoon', '');
                              set('contact2Email', '');
                            }}
                            className="flex items-center gap-1 text-gray-400 hover:text-red-500 text-xs transition"
                          >
                            <X className="w-3.5 h-3.5" />
                            {t.removeSecondContact}
                          </button>
                        </div>
                        <div className="space-y-4">
                          {renderField({ label: t.contactName, field: 'contact2Naam', placeholder: language === 'nl' ? 'Voor- en achternaam' : 'Ad ve soyad', optional: true })}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {renderField({ label: t.contactPhone, field: 'contact2Telefoon', type: 'tel', placeholder: '+31 6 00000000', optional: true })}
                            {renderField({ label: t.contactEmail, field: 'contact2Email', type: 'email', placeholder: 'naam@email.com', optional: true })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Remarks (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.remarks}</label>
                    <textarea
                      value={form.opmerkingen}
                      onChange={e => set('opmerkingen', e.target.value)}
                      rows={3}
                      placeholder={t.remarksPlaceholder}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  </div>

                  {/* Question (optional) */}
                  <div className="border-t border-gray-100 pt-5">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={heeftVraag}
                        onChange={e => {
                          setHeeftVraag(e.target.checked);
                          if (!e.target.checked) set('vraag', '');
                        }}
                        className="mt-0.5 h-4 w-4 accent-emerald-600 cursor-pointer flex-shrink-0"
                      />
                      <span className="text-sm font-medium text-gray-700">{t.hasQuestion}</span>
                    </label>

                    {heeftVraag && (
                      <div className="mt-3 space-y-3">
                        {/* Clever nudge toward the FAQ before they ask */}
                        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
                          <span className="text-base leading-none mt-0.5">💡</span>
                          <div className="text-xs text-emerald-800">
                            <p>{t.faqNudge}</p>
                            <button
                              type="button"
                              onClick={scrollToFaq}
                              className="mt-1 font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2"
                            >
                              {t.viewFaqs} ↓
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={form.vraag}
                          onChange={e => set('vraag', e.target.value)}
                          rows={3}
                          placeholder={t.questionPlaceholder}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        />
                      </div>
                    )}
                  </div>

                  {serverError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                      {serverError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? t.submitting : t.submit}
                  </button>
                </form>
              </div>

              {/* FAQ section */}
              <div id="inschrijven-faq" className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 scroll-mt-4">
                <div className="mb-6 text-center">
                  <h2 className="text-xl sm:text-2xl font-bold text-emerald-800 mb-1">{t.faqTitle}</h2>
                  <p className="text-gray-500 text-sm">{t.faqSubtitle}</p>
                </div>
                <div className="space-y-2">
                  {faqs.map((faq, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-emerald-50 transition"
                      >
                        <span className="font-semibold text-gray-800 text-sm pr-4">{faq.q}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-emerald-600 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {openFaq === i && (
                        <div
                          className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4"
                          dangerouslySetInnerHTML={{ __html: faq.a }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
        </div>
      </div>

      {/* Confirmation modal */}
      {submitted && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          style={{ animation: 'iy-overlay-in 0.2s ease-out' }}
          onClick={reset}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center"
            style={{ animation: 'iy-modal-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={reset}
              aria-label={t.close}
              className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex justify-center mb-5">
              <div className="bg-emerald-100 rounded-full p-4">
                <svg className="h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-emerald-800 mb-3">{t.successTitle}</h2>
            <p className="text-gray-600 text-base leading-relaxed mb-2">{t.successMsg}</p>

            {sentQuestion && (
              <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
                <p className="text-sm text-emerald-800 flex items-start gap-2">
                  <Mail className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{t.questionReceived}</span>
                </p>
              </div>
            )}

            <p className="text-emerald-600 font-semibold text-lg mt-5">{t.successSub}</p>

            <button
              onClick={reset}
              className="mt-7 w-full px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition text-sm"
            >
              {t.newForm}
            </button>
          </div>

          <style>{`
            @keyframes iy-overlay-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes iy-modal-in {
              from { opacity: 0; transform: translateY(12px) scale(0.96); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
