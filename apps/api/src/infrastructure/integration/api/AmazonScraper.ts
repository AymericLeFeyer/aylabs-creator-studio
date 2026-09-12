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

      await page.fill('#ap_email', credentials.login);
      await page.click('#continue');
      await page.fill('#ap_password', credentials.password);
      await page.click('#signInSubmit');

      if (credentials.otpSecret) {
        // Calculé au dernier moment : un code a trente secondes de vie.
        await page.waitForSelector('#auth-mfa-otpcode', { timeout: 20_000 }).catch(() => {
          throw upstream(
            'Amazon n’a pas demandé le code de double authentification : vérifie que la méthode par défaut est l’application et non le SMS.',
          );
        });
        await page.fill('#auth-mfa-otpcode', totp(credentials.otpSecret));
        await page.click('#auth-signin-button');
      }

      await page
        .waitForSelector('#ac-report-commission-commision-clicks', { timeout: 30_000 })
        .catch(() => {
          throw upstream(
            'Tableau de bord Amazon introuvable après la connexion : identifiants refusés, captcha, ou page modifiée.',
          );
        });

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
