import { useState } from 'react';
import type { Language } from '../App';
import logo from '../../imports/logo.svg';
import { isAppLayout } from '../../lib/native';
import { useForceLightTheme } from '../../lib/theme';
import SiteHeader from './SiteHeader';

/**
 * Public "how do I delete my account" page.
 *
 * Google Play requires a URL on the store listing that anyone — including
 * someone who has already uninstalled the app — can open without logging in,
 * and it has to do three specific things: name the app as it appears on the
 * listing, spell out the steps, and say exactly which data is deleted, which
 * data is kept, and for how long.
 *
 * Deletion itself already works in two places (UserMenu on the website,
 * AccountPanel in the app), both calling DELETE /me. This page documents that
 * route and offers e-mail as the fallback for people who can no longer sign
 * in. What it describes must stay in step with purgeUser() on the server:
 * the account record and the login are destroyed, and a parent's children are
 * unlinked rather than deleted, because a child's attendance and grades belong
 * to the school's own records, not to the parent's account.
 */

const CONTROLLER = {
  legalName: 'Stichting Milli Görüş Amersfoort Rahman',
  email: 'onderwijs.rahman@gmail.com',
};
const LAST_UPDATED = '2026-08-01';

// How long a deleted account can still exist inside the hosting provider's
// encrypted backups before those are rotated out. Google asks for this number
// explicitly; keep it at or above the retention window Supabase is configured
// with, never below it.
const BACKUP_DAYS = 30;

const t = {
  nl: {
    langLabel: 'TR',
    title: 'Account verwijderen',
    appLine: `Rahman Eğitim — ${CONTROLLER.legalName}`,
    updated: `Laatst bijgewerkt: ${LAST_UPDATED}`,
    back: '← Terug',
    intro:
      'Op deze pagina leest u hoe u uw account voor de app Rahman Eğitim verwijdert, en welke gegevens daarbij ' +
      'wel en niet worden gewist. U kunt dit zelf doen; er komt geen goedkeuring van de school aan te pas.',
    inAppTitle: 'Zelf verwijderen, in de app of op de website',
    inAppSteps: [
      'Log in op rahmanegitim.com of open de app Rahman Eğitim.',
      'Open uw account: in de app via het tabblad Account, op de website via uw naam rechtsboven.',
      'Kies "Account verwijderen".',
      'Typ ter bevestiging het woord VERWIJDER en bevestig.',
    ],
    inAppAfter:
      'Uw account is daarna direct verwijderd en u wordt uitgelogd. U kunt niet meer inloggen en de app zal u niet herkennen.',
    mailTitle: 'Geen toegang meer tot uw account?',
    mailBody:
      `Bent u de app kwijt of kunt u niet meer inloggen, mail dan vanaf het e-mailadres waarmee u het account heeft ` +
      `aangemaakt naar ${CONTROLLER.email} met als onderwerp "Account verwijderen". Wij verifiëren de aanvraag en ` +
      `verwijderen het account binnen 30 dagen. U krijgt bericht zodra dit is gebeurd.`,
    deletedTitle: 'Wat wordt verwijderd',
    deleted: [
      'Uw inloggegevens: e-mailadres, wachtwoord en een eventuele koppeling met Google. Inloggen is daarna niet meer mogelijk.',
      'Uw accountgegevens: naam, e-mailadres, telefoonnummer, rol en de koppeling met uw school.',
      'De koppeling tussen u en uw kind(eren), of — bij een leerkracht — tussen u en uw klassen.',
      'Voor leerkrachten: uw geüploade handtekening.',
      'Uw meldingen en voorkeuren in de app.',
    ],
    keptTitle: 'Wat blijft bewaard, en hoelang',
    kept: [
      'De onderwijsgegevens van uw kind (naam, klas, aanwezigheid, beoordelingen, huiswerk, toetsen, diploma’s en de financiële administratie) horen bij de leerlingadministratie van de school en blijven daar bewaard. Ze worden wel losgekoppeld van uw verwijderde account.',
      'Wilt u ook de gegevens van uw kind laten verwijderen, dan kan dat: mail dat verzoek naar ' + CONTROLLER.email + '. De school kan wettelijk verplicht zijn een deel van de administratie nog te bewaren en laat u in dat geval weten wat en hoelang.',
      'Verstuurde e-mails (zoals een bevestiging of een herinnering) blijven bij onze e-mailverzender bewaard zolang dat voor de verzendadministratie nodig is.',
      `Versleutelde back-ups van onze hostingprovider kunnen uw gegevens nog maximaal ${BACKUP_DAYS} dagen bevatten. Daarna worden die back-ups overschreven.`,
    ],
    contactTitle: 'Vragen',
    contactBody: `Neem contact op via ${CONTROLLER.email}. Zie ook ons `,
    privacyLink: 'privacybeleid',
  },
  tr: {
    langLabel: 'NL',
    title: 'Hesabı silme',
    appLine: `Rahman Eğitim — ${CONTROLLER.legalName}`,
    updated: `Son güncelleme: ${LAST_UPDATED}`,
    back: '← Geri',
    intro:
      'Bu sayfada, Rahman Eğitim uygulamasındaki hesabınızı nasıl sileceğinizi ve bu sırada hangi verilerin silinip ' +
      'hangilerinin saklandığını bulacaksınız. Bunu kendiniz yapabilirsiniz; okulun onayı gerekmez.',
    inAppTitle: 'Uygulamada veya web sitesinde kendiniz silme',
    inAppSteps: [
      'rahmanegitim.com adresine giriş yapın veya Rahman Eğitim uygulamasını açın.',
      'Hesabınızı açın: uygulamada Hesap sekmesinden, web sitesinde sağ üstteki adınızdan.',
      '"Hesabı sil" seçeneğini seçin.',
      'Onaylamak için SİL kelimesini yazın ve onaylayın.',
    ],
    inAppAfter:
      'Hesabınız hemen silinir ve oturumunuz kapatılır. Artık giriş yapamazsınız ve uygulama sizi tanımaz.',
    mailTitle: 'Hesabınıza artık erişemiyor musunuz?',
    mailBody:
      `Uygulamaya veya hesabınıza erişemiyorsanız, hesabı oluştururken kullandığınız e-posta adresinden ` +
      `${CONTROLLER.email} adresine "Hesabı silme" konulu bir e-posta gönderin. Talebi doğrular ve hesabı 30 gün ` +
      `içinde sileriz. İşlem tamamlandığında size haber veririz.`,
    deletedTitle: 'Silinen veriler',
    deleted: [
      'Giriş bilgileriniz: e-posta adresi, parola ve varsa Google bağlantısı. Bundan sonra giriş yapılamaz.',
      'Hesap bilgileriniz: ad, e-posta, telefon numarası, rol ve okul bağlantınız.',
      'Sizinle çocuklarınız arasındaki bağlantı veya — öğretmenseniz — sizinle sınıflarınız arasındaki bağlantı.',
      'Öğretmenler için: yüklediğiniz imza.',
      'Uygulamadaki bildirimleriniz ve tercihleriniz.',
    ],
    keptTitle: 'Saklanan veriler ve süresi',
    kept: [
      'Çocuğunuzun eğitim verileri (ad, sınıf, devam durumu, değerlendirmeler, ödevler, sınavlar, diplomalar ve mali kayıtlar) okulun öğrenci yönetimine aittir ve orada saklanmaya devam eder. Ancak silinen hesabınızla bağlantısı kesilir.',
      'Çocuğunuzun verilerinin de silinmesini isterseniz bu mümkündür: talebinizi ' + CONTROLLER.email + ' adresine gönderin. Okul, kayıtların bir kısmını yasal olarak saklamak zorunda olabilir; bu durumda neyin ne kadar süreyle saklanacağını size bildirir.',
      'Gönderilen e-postalar (onay veya hatırlatma gibi) gönderim kayıtları için gerekli olduğu sürece e-posta sağlayıcımızda saklanır.',
      `Barındırma sağlayıcımızın şifreli yedeklerinde verileriniz en fazla ${BACKUP_DAYS} gün daha bulunabilir. Sonrasında bu yedeklerin üzerine yazılır.`,
    ],
    contactTitle: 'Sorular',
    contactBody: `${CONTROLLER.email} adresinden bize ulaşabilirsiniz. Ayrıca `,
    privacyLink: 'gizlilik politikamıza',
  },
};

export default function DeleteAccountPage() {
  // Public document, reached from the website's footer and from the Play
  // Store listing, so it follows the rest of the public pages into light
  // mode. Not inside the native app, where dark mode is a user setting.
  useForceLightTheme(!isAppLayout());
  // Dutch by default, like the privacy policy: primary audience and the
  // jurisdiction the wording is written for.
  const [language, setLanguage] = useState<Language>('nl');
  const text = t[language];

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <SiteHeader language={language} setLanguage={setLanguage} />
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-9 my-8 mx-4 sm:mx-auto">
        <div className="flex flex-col items-center text-center mb-6">
          <img src={logo} alt="Rahman Eğitim" className="h-[92px] w-[92px] object-contain mb-3" />
          <h1 className="text-2xl font-bold text-gray-800">{text.title}</h1>
          {/* Google requires the page to name the app and developer exactly as
              they appear on the store listing. */}
          <p className="text-sm font-medium text-gray-600 mt-1">{text.appLine}</p>
          <p className="text-xs text-gray-400 mt-1">{text.updated}</p>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-6">{text.intro}</p>

        {/* The steps come first and are the most prominent thing on the page —
            that is what the review is looking for. */}
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 mb-6">
          <h2 className="text-base font-semibold text-emerald-900 mb-3">{text.inAppTitle}</h2>
          <ol className="space-y-2">
            {text.inAppSteps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-700 leading-relaxed">
                <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-emerald-900 leading-relaxed mt-3">{text.inAppAfter}</p>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">{text.mailTitle}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{text.mailBody}</p>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">{text.deletedTitle}</h2>
          <ul className="space-y-1.5">
            {text.deleted.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600 leading-relaxed">
                <span className="text-emerald-600">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-2">{text.keptTitle}</h2>
          <ul className="space-y-1.5">
            {text.kept.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-600 leading-relaxed">
                <span className="text-gray-400">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-2">{text.contactTitle}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            {text.contactBody}
            <a href="/privacy" className="text-emerald-700 hover:text-emerald-900 underline">
              {text.privacyLink}
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
