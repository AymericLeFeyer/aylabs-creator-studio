import type { AmazonExport } from '../../../domain/integration/entities/ExportData.ts';
import { parseLocaleNumber } from '../../../domain/integration/services/localeNumber.ts';
import { upstream } from '../../../shared/errors.ts';
import { cleanText, launchFirefox } from './browser.ts';
import { totp } from './totp.ts';

const REPORTING_URL = 'https://partenaires.amazon.fr/p/reporting/earnings';
const PAYMENTS_URL = 'https://partenaires.amazon.fr/home/account/paymentHistory';

export interface AmazonCredentials {
  login: string;
  password: string;
  otpSecret: string | null;
}

/**
 * Un numéro de téléphone s'écrit de mille façons (« 06 12 34 56 78 », « +33.6… ») ; le
 * champ unifié d'Amazon attend des chiffres, avec ou sans indicatif. Une adresse e-mail
 * passe telle quelle.
 */
const normalizeLogin = (login: string): string =>
  login.includes('@') ? login : login.replace(/[\s.\-()]/g, '');

/**
 * « l•••••r@gmail.com, 22 caractères » — assez pour reconnaître une adresse ou y voir des
 * guillemets parasites, sans l'écrire en clair dans le dernier statut de la source.
 */
const describeLogin = (login: string): string => {
  const at = login.lastIndexOf('@');
  const local = at > 0 ? login.slice(0, at) : login;
  const masked =
    local.length <= 2 ? local : `${local[0]}${'•'.repeat(local.length - 2)}${local.at(-1)}`;
  const quoted = /^["'`]|["'`]$/.test(login) ? ', entouré de guillemets' : '';
  return `« ${masked}${at > 0 ? login.slice(at) : ''} », ${login.length} caractères${quoted}`;
};

/**
 * Le tableau de bord d'Amazon Partenaires, lu dans un navigateur.
 *
 * Amazon n'expose **aucune API** pour les gains d'un compte Partenaires (PA-API ne parle
 * que du catalogue) : il n'y a pas d'autre chemin que la page elle-même. C'est fragile
 * par nature — un identifiant de balise renommé suffit à tout casser —, d'où des
 * erreurs qui disent à quelle étape on s'est arrêté, et un échec qui ne remplace jamais
 * la dernière valeur connue.
 *
 * Les sélecteurs sont repris tels quels de YouTube-Money-Exporter, qui tournait avec.
 */
export class AmazonScraper {
  async fetch(credentials: AmazonCredentials): Promise<AmazonExport> {
    const browser = await launchFirefox({ stealth: false });
    try {
      const page = await browser.newPage();
      await page.goto(REPORTING_URL);

      /**
       * Attend un champ visible, sinon lève une erreur qui dit **où** on s'est arrêté :
       * l'adresse et le titre de la page suffisent presque toujours à distinguer un
       * captcha, un mot de passe refusé ou une page remaniée.
       */
      const visible = async (selector: string, step: string, timeout = 20_000) => {
        const locator = page.locator(selector).first();
        try {
          await locator.waitFor({ state: 'visible', timeout });
        } catch {
          const where = `${new URL(page.url()).pathname} — « ${await page.title().catch(() => '?')} »`;
          throw upstream(`Amazon : ${step} (page ${where}).`);
        }
        return locator;
      };

      // Depuis septembre 2026, la connexion « unifiée » d'Amazon nomme le champ
      // `#ap_email_login` et son bouton n'a plus d'identifiant. L'ancien `#ap_email`
      // reste accepté, et chaque étape se valide par Entrée plutôt que par un bouton
      // dont l'identifiant peut encore changer.
      const email = await visible('#ap_email_login, #ap_email', 'champ e-mail introuvable');
      await email.fill(normalizeLogin(credentials.login));
      await email.press('Enter');

      // `/ax/claim/intent` = « Cet e-mail est nouveau pour nous » : Amazon ne connaît pas
      // l'identifiant envoyé et propose d'ouvrir un compte. L'erreur montre ce qui a été
      // réellement envoyé (masqué) : des guillemets recopiés dans une variable
      // d'environnement ou une autre adresse que celle du compte Partenaires ne se voient
      // pas autrement.
      await Promise.race([
        page.locator('#ap_password').waitFor({ state: 'visible', timeout: 20_000 }),
        page.waitForURL(/\/ax\/claim\/intent/, { timeout: 20_000 }),
      ]).catch(() => undefined);
      if (page.url().includes('/ax/claim/intent')) {
        throw upstream(
          `Amazon ne connaît pas l’identifiant envoyé (${describeLogin(credentials.login)}) et propose de créer un compte. Vérifie AMAZON_LOGIN : l’e-mail ou le numéro de téléphone réellement rattaché au compte Partenaires, sans guillemets.`,
        );
      }

      // `#ap_password` et non `input[name=password]` : la page de l'e-mail porte déjà un
      // champ mot de passe caché (indice d'autoremplissage).
      const password = await visible(
        '#ap_password',
        `page du mot de passe introuvable pour ${describeLogin(credentials.login)} — adresse refusée, ou captcha`,
      );
      await password.fill(credentials.password);
      await password.press('Enter');

      if (credentials.otpSecret) {
        const otp = await visible(
          '#auth-mfa-otpcode',
          'le code de double authentification n’a pas été demandé — mot de passe refusé, captcha, ou méthode par défaut sur SMS au lieu de l’application',
        );
        // Calculé au dernier moment : un code a trente secondes de vie.
        await otp.fill(totp(credentials.otpSecret));
        await otp.press('Enter');
      }

      await visible(
        '#ac-report-commission-commision-clicks',
        'tableau de bord introuvable après la connexion — identifiants ou code refusés, captcha, ou page modifiée',
        30_000,
      );

      const read = async (selector: string) =>
        parseLocaleNumber(cleanText(await page.textContent(selector)));

      const thisMonth = {
        clicks: await read('#ac-report-commission-commision-clicks'),
        itemsOrdered: await read('#ac-report-commission-commision-ordered'),
        itemsShipped: await read('#ac-report-commission-commision-shipped'),
        itemsReturned: await read('#ac-report-commission-commision-returned'),
        conversionRate: await read('#ac-report-commission-commision-conversion'),
        sumItemsShipped: await read('#ac-report-commission-commision-shipped-revenue'),
        earnings: await read('#ac-report-commission-commision-total'),
      };

      await page.goto(PAYMENTS_URL);
      // Facultatif : un compte sans paiement en cours n'affiche pas la carte.
      const waiting = await page
        .textContent('#payment-cards-section div div:nth-child(2) a span span', {
          timeout: 15_000,
        })
        .catch(() => null);

      return { thisMonth, waitingPayments: parseLocaleNumber(cleanText(waiting)) };
    } finally {
      await browser.close();
    }
  }
}
