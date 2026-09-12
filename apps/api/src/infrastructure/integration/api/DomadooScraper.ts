import type { Page } from 'playwright';
import type {
  DomadooSale,
  DomadooSummary,
} from '../../../domain/integration/entities/ExportData.ts';
import { parseLocaleNumber } from '../../../domain/integration/services/localeNumber.ts';
import { upstream } from '../../../shared/errors.ts';
import { cleanText, launchFirefox } from './browser.ts';

const AFFILIATION_URL = 'https://www.domadoo.fr/fr/affiliation';
const SALES_URL = 'https://www.domadoo.fr/fr/affiliation?t=sales';
const SUMMARY_ROWS = '#myaffiliateaccount-summary .list-group-hover';
const SALES_TABLE = '#myaffiliateaccount-sales-commissions table tbody';
/** Garde-fou : une pagination qui ne s'arrête pas ne doit pas tourner toute la nuit. */
const MAX_SALES_PAGES = 50;

export interface DomadooCredentials {
  login: string;
  password: string;
}

/**
 * L'espace d'affiliation de Domadoo (un module PrestaShop), lu dans un navigateur.
 *
 * Deux lectures, à deux rythmes : le **résumé** toutes les heures, et la liste des
 * **ventes en attente** une fois par jour — elle se pagine, coûte une page par vingt
 * ventes, et ne sert qu'à sommer les commissions pas encore validées, qui ne bougent
 * pas d'une heure à l'autre.
 *
 * Le navigateur est **furtif** : la page de connexion refuse un Firefox trop visiblement
 * automatisé.
 */
export class DomadooScraper {
  async summary(credentials: DomadooCredentials): Promise<DomadooSummary> {
    return this.withSession(credentials, async (page) => {
      const rows = page.locator(SUMMARY_ROWS);
      // Deux colonnes par ligne : la première cellule dit « 30 jours », la seconde « total ».
      const cell = async (row: number, index: number) =>
        parseLocaleNumber(
          cleanText(
            await rows.locator(`div:nth-child(${row}) span.pull-xs-right`).nth(index).innerText(),
          ),
        );

      return {
        last30days: {
          clicks: await cell(1, 0),
          uniquesClicks: await cell(2, 0),
          waitingSales: await cell(3, 0),
          approvedSales: await cell(4, 0),
          earnings: await cell(5, 0),
        },
        total: {
          clicks: await cell(1, 1),
          uniquesClicks: await cell(2, 1),
          approvedSales: await cell(3, 1),
          earnings: await cell(4, 1),
          payments: await cell(5, 1),
          waitingPayments: await cell(6, 0),
          balance: await cell(7, 0),
        },
        lastSales: await this.readSales(page),
      };
    });
  }

  /**
   * Toutes les ventes **non validées**, page après page.
   *
   * L'ancien outil lisait le numéro de la dernière page par un XPath absolu, cassé au
   * premier changement de gabarit. Ici on avance jusqu'à une page vide ou qui répète la
   * précédente (PrestaShop renvoie la dernière page pour un numéro hors limites), ou
   * jusqu'à avoir autant de ventes en attente que le résumé en annonce.
   */
  async waitingSales(credentials: DomadooCredentials): Promise<DomadooSale[]> {
    return this.withSession(credentials, async (page) => {
      const expected = parseLocaleNumber(
        cleanText(
          await page
            .locator(SUMMARY_ROWS)
            .locator('div:nth-child(3) span.pull-xs-right')
            .first()
            .innerText(),
        ),
      );

      const waiting: DomadooSale[] = [];
      let previousFirstId: string | null = null;

      for (let pageNumber = 1; pageNumber <= MAX_SALES_PAGES; pageNumber += 1) {
        await page.goto(pageNumber === 1 ? SALES_URL : `${SALES_URL}&p=${pageNumber}`);
        await page.waitForSelector(SALES_TABLE, { timeout: 30_000 }).catch(() => null);
        const sales = await this.readSales(page);
        if (sales.length === 0 || sales[0]!.id === previousFirstId) break;
        previousFirstId = sales[0]!.id;

        waiting.push(...sales.filter((sale) => !sale.approved));
        if (expected !== null && waiting.length >= expected) break;
      }

      return waiting;
    });
  }

  private async readSales(page: Page): Promise<DomadooSale[]> {
    const rows = page.locator(`${SALES_TABLE} tr`);
    const count = await rows.count();
    const sales: DomadooSale[] = [];
    for (let i = 0; i < count; i += 1) {
      const cells = rows.nth(i).locator('td');
      if ((await cells.count()) < 5) continue;
      const text = async (index: number) => cleanText(await cells.nth(index).innerText());
      const status = (await text(4)).toLowerCase();
      sales.push({
        id: await text(0),
        date: await text(1),
        order: parseLocaleNumber(await text(2)),
        commission: parseLocaleNumber(await text(3)),
        // Le statut « validée » est une icône de coche dont le texte contient « check ».
        approved: status.includes('check'),
      });
    }
    return sales;
  }

  private async withSession<T>(
    credentials: DomadooCredentials,
    work: (page: Page) => Promise<T>,
  ): Promise<T> {
    const browser = await launchFirefox({ stealth: true });
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(AFFILIATION_URL);
      await page.fill('#field-email', credentials.login);
      await page.fill('#field-password', credentials.password);
      await page.click('#submit-login');
      await page.waitForSelector('#my_affiliate_link', { timeout: 60_000 }).catch(() => {
        throw upstream(
          'Espace d’affiliation Domadoo introuvable après la connexion : identifiants refusés, protection anti-robot, ou page modifiée.',
        );
      });
      return await work(page);
    } finally {
      await browser.close();
    }
  }
}
