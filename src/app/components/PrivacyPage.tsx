import { useState } from 'react';
import type { Language } from '../App';
import logo from '../../imports/logo.svg';

// ─────────────────────────────────────────────────────────────────────────────
// FILL THESE IN before publishing. They are the only details the code can't
// derive — the legal entity behind the app and how people reach it. Everything
// else in this policy describes what the system actually does.
const CONTROLLER = {
  legalName: 'Stichting Milli Görüş Amersfoort Rahman',
  address: 'Juliëttestraat 44, Amersfoort',
  email: 'onderwijs.rahman@gmail.com',
  kvk: '41188879',
};
const LAST_UPDATED = '2026-07-17';
// ─────────────────────────────────────────────────────────────────────────────

const t = {
  nl: {
    langLabel: 'TR',
    title: 'Privacybeleid',
    updated: `Laatst bijgewerkt: ${LAST_UPDATED}`,
    back: '← Terug',
    intro:
      `Dit privacybeleid legt uit welke persoonsgegevens Rahman Eğitim verwerkt, waarom, en welke rechten u heeft. ` +
      `Rahman Eğitim is een leerlingadministratie voor islamitisch onderwijs, gebruikt door ouders, leerkrachten en beheerders.`,
    sections: [
      {
        h: '1. Wie is verantwoordelijk',
        b: [
          `De verwerkingsverantwoordelijke voor uw gegevens is:`,
          `${CONTROLLER.legalName}`,
          `${CONTROLLER.address}`,
          `E-mail: ${CONTROLLER.email}`,
          `KvK: ${CONTROLLER.kvk}`,
        ],
      },
      {
        h: '2. Welke gegevens wij verwerken',
        b: [
          `Accountgegevens (ouders, leerkrachten, beheerders): naam, e-mailadres, telefoonnummer en een versleuteld wachtwoord. Wie met Google inlogt, deelt naam en e-mailadres via Google.`,
          `Voor leerkrachten: een geüploade handtekening (afbeelding), gebruikt op diploma's.`,
          `Inschrijfgegevens van kinderen (via het openbare inschrijfformulier): voornaam, achternaam, geslacht en leeftijd van het kind, plus naam, telefoonnummer en e-mailadres van één of twee contactpersonen, en eventuele opmerkingen.`,
          `Onderwijsgegevens van leerlingen: aanwezigheid, beoordelingen/cijfers, huiswerk, afwezigheidsredenen en diploma's.`,
          `Schoolgegevens: naam, plaats, adres en locatie (op een kaart) van leslocaties.`,
          `Wij verzamelen geen locatie van uw apparaat, en gebruiken geen advertentie- of trackingtechnologie.`,
        ],
      },
      {
        h: '3. Waarom en op welke grondslag',
        b: [
          `Wij verwerken deze gegevens om het onderwijs te organiseren: inschrijvingen, aanwezigheid, voortgang, communicatie en diploma's. De grondslag is de uitvoering van de onderwijsovereenkomst en het gerechtvaardigd belang van een goede leerlingadministratie.`,
          `Gegevens van kinderen worden uitsluitend door een ouder/voogd of door de school ingevoerd, ten behoeve van het onderwijs.`,
        ],
      },
      {
        h: '4. Met wie wij gegevens delen (verwerkers)',
        b: [
          `Wij verkopen uw gegevens nooit. Wij gebruiken de volgende verwerkers om de dienst te laten werken:`,
          `Supabase — database, authenticatie en serverfuncties (hosting van gegevens).`,
          `Resend — verzending van transactionele e-mails (bijv. goedkeuring, wachtwoordherstel).`,
          `Google — uitsluitend als u kiest voor inloggen met Google.`,
          `OpenStreetMap — kaartweergave van leslocaties.`,
          `GitHub Pages — hosting van de website (statische bestanden).`,
        ],
      },
      {
        h: '5. Hoe lang wij gegevens bewaren',
        b: [
          `Wij bewaren gegevens zolang uw account actief is of zolang nodig voor het onderwijs. Onderwijsgegevens van een leerling (aanwezigheid, cijfers, diploma's) horen bij de administratie van de school en blijven bij de school bewaard, ook als een ouderaccount wordt verwijderd; ze worden dan losgekoppeld van dat account.`,
        ],
      },
      {
        h: '6. Uw account verwijderen',
        b: [
          `U kunt uw eigen account verwijderen in de app: open het menu rechtsboven (uw naam) en kies "Account verwijderen". Uw account en persoonlijke gegevens worden dan definitief verwijderd.`,
          `Wilt u dit liever schriftelijk doen, of de gegevens van uw kind laten verwijderen, mail dan ${CONTROLLER.email}. Wij reageren binnen een redelijke termijn.`,
        ],
      },
      {
        h: '7. Uw rechten',
        b: [
          `U heeft het recht op inzage, correctie, verwijdering en beperking van uw gegevens, en het recht om bezwaar te maken. Neem hiervoor contact op via ${CONTROLLER.email}.`,
          `U kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).`,
        ],
      },
      {
        h: '8. Beveiliging',
        b: [
          `Toegang tot gegevens is beperkt op basis van rol (ouder, leerkracht, beheerder). Wachtwoorden worden versleuteld opgeslagen en verbindingen verlopen via HTTPS. Op mobiele apparaten worden inloggegevens niet meegenomen in de systeemback-up.`,
        ],
      },
      {
        h: '9. Wijzigingen',
        b: [
          `Wij kunnen dit beleid bijwerken. De datum bovenaan geeft de laatste wijziging aan. Bij belangrijke wijzigingen informeren wij u via de app of per e-mail.`,
        ],
      },
    ],
  },
  tr: {
    langLabel: 'NL',
    title: 'Gizlilik Politikası',
    updated: `Son güncelleme: ${LAST_UPDATED}`,
    back: '← Geri',
    intro:
      `Bu gizlilik politikası, Rahman Eğitim'in hangi kişisel verileri neden işlediğini ve haklarınızın neler olduğunu açıklar. ` +
      `Rahman Eğitim; veliler, öğretmenler ve yöneticiler tarafından kullanılan bir öğrenci yönetim uygulamasıdır.`,
    sections: [
      {
        h: '1. Sorumlu kişi',
        b: [
          `Verilerinizden sorumlu olan taraf:`,
          `${CONTROLLER.legalName}`,
          `${CONTROLLER.address}`,
          `E-posta: ${CONTROLLER.email}`,
          `KvK: ${CONTROLLER.kvk}`,
        ],
      },
      {
        h: '2. İşlediğimiz veriler',
        b: [
          `Hesap bilgileri (veli, öğretmen, yönetici): ad, e-posta, telefon numarası ve şifrelenmiş bir parola. Google ile giriş yapanlar adını ve e-postasını Google üzerinden paylaşır.`,
          `Öğretmenler için: diplomalarda kullanılan, yüklenen bir imza (resim).`,
          `Çocukların kayıt bilgileri (herkese açık kayıt formu ile): çocuğun adı, soyadı, cinsiyeti ve yaşı; bir veya iki irtibat kişisinin adı, telefonu ve e-postası; varsa notlar.`,
          `Öğrencilerin eğitim verileri: devam durumu, değerlendirme/notlar, ödevler, devamsızlık nedenleri ve diplomalar.`,
          `Okul bilgileri: ders mekânlarının adı, şehri, adresi ve harita konumu.`,
          `Cihazınızın konumunu toplamıyoruz ve reklam veya takip teknolojisi kullanmıyoruz.`,
        ],
      },
      {
        h: '3. Neden ve hangi hukuki dayanakla',
        b: [
          `Bu verileri eğitimi düzenlemek için işleriz: kayıtlar, devam, ilerleme, iletişim ve diplomalar. Dayanak, eğitim sözleşmesinin yerine getirilmesi ve düzgün bir öğrenci yönetiminin meşru menfaatidir.`,
          `Çocuklara ait veriler yalnızca bir veli/vasi veya okul tarafından, eğitim amacıyla girilir.`,
        ],
      },
      {
        h: '4. Verileri kimlerle paylaşırız (işleyenler)',
        b: [
          `Verilerinizi asla satmayız. Hizmetin çalışması için şu işleyenleri kullanırız:`,
          `Supabase — veritabanı, kimlik doğrulama ve sunucu işlevleri (veri barındırma).`,
          `Resend — işlemsel e-postaların gönderimi (ör. onay, parola sıfırlama).`,
          `Google — yalnızca Google ile giriş yapmayı seçerseniz.`,
          `OpenStreetMap — ders mekânlarının harita görünümü.`,
          `GitHub Pages — web sitesinin barındırılması (statik dosyalar).`,
        ],
      },
      {
        h: '5. Verileri ne kadar saklarız',
        b: [
          `Verileri, hesabınız etkin olduğu veya eğitim için gerekli olduğu sürece saklarız. Bir öğrencinin eğitim verileri (devam, notlar, diplomalar) okulun kayıtlarına aittir ve bir veli hesabı silinse bile okulda saklanmaya devam eder; bu durumda söz konusu hesapla bağlantısı kesilir.`,
        ],
      },
      {
        h: '6. Hesabınızı silme',
        b: [
          `Kendi hesabınızı uygulama içinde silebilirsiniz: sağ üstteki menüyü (adınız) açın ve "Hesabı sil" seçeneğini seçin. Hesabınız ve kişisel verileriniz kalıcı olarak silinir.`,
          `Bunu yazılı olarak yapmayı veya çocuğunuzun verilerinin silinmesini tercih ederseniz ${CONTROLLER.email} adresine e-posta gönderin. Makul bir süre içinde yanıt veririz.`,
        ],
      },
      {
        h: '7. Haklarınız',
        b: [
          `Verilerinize erişme, düzeltme, silme ve işlenmesini kısıtlama ile itiraz etme hakkına sahipsiniz. Bunun için ${CONTROLLER.email} ile iletişime geçin.`,
          `Ayrıca Hollanda Veri Koruma Kurumu'na (autoriteitpersoonsgegevens.nl) şikâyette bulunabilirsiniz.`,
        ],
      },
      {
        h: '8. Güvenlik',
        b: [
          `Verilere erişim role göre sınırlandırılmıştır (veli, öğretmen, yönetici). Parolalar şifreli saklanır ve bağlantılar HTTPS üzerinden yapılır. Mobil cihazlarda giriş bilgileri sistem yedeğine dahil edilmez.`,
        ],
      },
      {
        h: '9. Değişiklikler',
        b: [
          `Bu politikayı güncelleyebiliriz. Yukarıdaki tarih son değişikliği gösterir. Önemli değişikliklerde sizi uygulama üzerinden veya e-posta ile bilgilendiririz.`,
        ],
      },
    ],
  },
};

export default function PrivacyPage() {
  // Default to Dutch (primary audience, GDPR jurisdiction); toggle to Turkish.
  const [language, setLanguage] = useState<Language>('nl');
  const text = t[language];

  return (
    <div className="min-h-screen w-full bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-9">
        <div className="flex items-center justify-between mb-6">
          <a href="/" className="text-emerald-700 hover:text-emerald-900 text-sm font-medium">
            {text.back}
          </a>
          <button
            onClick={() => setLanguage(language === 'nl' ? 'tr' : 'nl')}
            className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold hover:bg-emerald-200 transition"
          >
            {text.langLabel}
          </button>
        </div>

        <div className="flex flex-col items-center text-center mb-6">
          <img src={logo} alt="Rahman Eğitim" className="h-[92px] w-[92px] object-contain mb-3" />
          <h1 className="text-2xl font-bold text-gray-800">{text.title}</h1>
          <p className="text-xs text-gray-400 mt-1">{text.updated}</p>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-6">{text.intro}</p>

        <div className="space-y-6">
          {text.sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-base font-semibold text-gray-800 mb-2">{s.h}</h2>
              {s.b.map((p, j) => (
                <p key={j} className="text-sm text-gray-600 leading-relaxed mb-1.5">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
